// -----------------------------------------------------------------------------
// The monitor: which stations are followed, their readings and the states
// published to Gladys. Everything the SDK handlers, the action and the widget
// need goes through it (src/app.js wires it).
//
// Followed stations: the "Stations" field and "around my house" of the
// configuration (MAX_STATIONS at most), plus every station whose device the
// user created (deleting the device stops following it).
//
// Scheduling: the devices are published with should_poll: false (the core does
// not poll external devices reliably, GladysAssistant/Gladys#3198). The monitor
// runs a cycle every hour, the pace of the SNOTEL data: ONE AWDB request for the
// hourly values of every followed station, plus, every 6 hours, one for the
// daily snow water equivalent and its median, and once a day one for the
// metadata (name, time zone, measured elements). The list of every SNOTEL
// station, needed to resolve names and ids and to find the stations around the
// house, is downloaded only when needed and kept a week in memory.
//
// Nothing is written to disk: a restart asks AWDB again (the last 30 hours).
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours. A reading older than 12 hours is never sent again as if it were
// fresh: the values stop, the "Last reading" feature says since when.
//
// Logs: at info, only the lifecycle (start, stations followed, a station going
// silent or coming back). A failure that repeats at every cycle is logged once,
// then at debug until it recovers, with one line at recovery. LOG_LEVEL=debug
// shows every cycle. The coordinates of the house are never logged nor sent:
// the stations around it are chosen locally.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HOME_STATIONS, MAX_STATIONS, normalizeName } from './config.js';
import { ELEMENTS, Awdb, newSnow24h } from './awdb.js';
import {
  FEATURE_UNITS,
  buildDevice,
  capabilities,
  convert,
  stationIds,
  tripletOfId,
} from './devices.js';
import { distanceKm } from './geo.js';
import { READINGS, STATUS, formatDate, join, render } from './messages.js';

const logger = createLogger({ name: 'snotel' });

export const WIDGET_KEY = 'snowpack';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  cycleMs: HOUR,
  // Without a newer reading, a value is not published again as a fresh one.
  // Stations transmit every hour, some in batches every few hours.
  staleAfterMs: 12 * HOUR,
  // The SNOTEL station list is downloaded again after a week.
  listMaxAgeMs: 7 * DAY,
  // A failed download of the station list is tried again after this delay.
  listRetryMs: HOUR,
  // Metadata (elements measured, time zone) of the followed stations.
  metadataMaxAgeMs: DAY,
  // Daily snow water equivalent and its median: NRCS computes it once a day.
  medianMaxAgeMs: 6 * HOUR,
  // The newest daily value is the day before yesterday's or yesterday's.
  medianStaleAfterMs: 3 * DAY,
  // The stations around the house are chosen again once a day.
  homeMaxAgeMs: DAY,
  heartbeatMs: 12 * HOUR,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {Function} [options.fetch] fetch, for AWDB
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.api = new Awdb({ fetch: fetchImpl });
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    // The SNOTEL station list, in memory only: { stations, fetchedAt }.
    this.list = null;
    this.listFailedAt = -Infinity;
    // AWDB metadata of the followed stations: triplet -> station (+ fetchedAt).
    this.stations = {};
    // Triplets AWDB does not know (asked once a day, like the metadata).
    this.missing = {};
    // Latest values: triplet -> { SNWD, WTEQ, TOBS, newSnow: { t, v }, median: { t, pct } }.
    this.readings = {};
    this.mediansAt = -Infinity;
    this.home = null;
    // Stations of the configuration, in order (field, then house).
    this.configured = [];
    this.problems = { unknown: [], noHouse: false, tooMany: false };
    this.resolved = false;
    this.lastCycleAt = -Infinity;
    this.statusMessage = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.rerun = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    // Scheduled first: a failure below must not leave the integration without cycles.
    this.schedule();
    await this.runCycle();
    await this.publishDiscovered();
    logger.info(`Started: ${this.followed().length} station(s) followed, refreshed every hour`);
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    if (!this.cycleTimer) {
      this.schedule();
    }
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates(this.created());
    this.requestRefresh();
  }

  async reconfigure(config) {
    const before = this.followed().join(',');
    this.config = config;
    this.home = null;
    this.resolved = false;
    // A cycle already running reads the old configuration: run another one after it.
    await this.runCycle({ again: true });
    await this.publishDiscovered();
    const after = this.followed();
    if (after.join(',') !== before) {
      logger.info(`Configuration saved: ${after.length} station(s) followed`);
    }
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.timings.cycleMs);
    this.cycleTimer.unref?.();
  }

  // --- Which stations ----------------------------------------------------------

  /** Station triplets whose device exists in Gladys. */
  created() {
    return [
      ...new Set(
        (this.gladys.devices ?? [])
          .map((device) => tripletOfId(this.gladys, device.external_id))
          .filter(Boolean),
      ),
    ];
  }

  /** The Gladys device of a station, or undefined. */
  deviceOf(triplet) {
    const id = stationIds(this.gladys, triplet).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === id);
  }

  isCreated(triplet) {
    return Boolean(this.deviceOf(triplet));
  }

  /** Every followed station: the configured ones, then the created ones. */
  followed() {
    return [...new Set([...this.configured, ...this.created()])];
  }

  /** What the integration knows of a station, a created device filling the gaps. */
  station(triplet) {
    const known = this.stations[triplet];
    if (known) {
      return known;
    }
    const device = this.deviceOf(triplet);
    if (!device) {
      return null;
    }
    const [id, state, network] = triplet.split(':');
    const features = new Set(
      (device.features ?? []).map((feature) => feature.external_id.split(':').pop()),
    );
    const elevation = Number(device.params?.find((p) => p.name === 'ELEVATION_FT')?.value);
    return {
      triplet,
      id,
      state,
      network,
      name: device.name ?? triplet,
      elevationFt: Number.isFinite(elevation) ? elevation : null,
      latitude: null,
      longitude: null,
      tz: state === 'AK' ? -9 : -8,
      has: Object.fromEntries(Object.keys(capabilities({})).map((key) => [key, features.has(key)])),
    };
  }

  /** The SNOTEL station list, downloaded when missing or a week old; null when unavailable. */
  async stationList() {
    const now = this.now();
    const fresh = this.list && now - this.list.fetchedAt < this.timings.listMaxAgeMs;
    if (fresh || now - this.listFailedAt < this.timings.listRetryMs) {
      return this.list?.stations ?? null;
    }
    try {
      const stations = await this.api.stationList(now);
      this.list = { stations, fetchedAt: now };
      this.recovered('list', 'SNOTEL station list downloaded again');
      logger.debug(`Station list: ${stations.length} stations`);
    } catch (err) {
      this.listFailedAt = now;
      this.failed('list', 'warn', `Cannot download the SNOTEL station list: ${err.message}`);
    }
    return this.list?.stations ?? null;
  }

  /** The station a token of the configuration designates, from the list. */
  static find(stations, token) {
    if (token.kind === 'id') {
      return stations.find((station) => station.id === token.value) ?? null;
    }
    const wanted = normalizeName(token.value);
    return stations.find((station) => normalizeName(station.name) === wanted) ?? null;
  }

  /**
   * Resolve the configuration into station triplets. Triplets are taken as
   * they are (the metadata says whether they exist); names and ids need the
   * station list. Without it, the stations found before are kept.
   */
  async resolve() {
    const problems = { unknown: [], noHouse: false, tooMany: false };
    const triplets = [];
    const add = (triplet) => {
      if (!triplets.includes(triplet)) {
        triplets.push(triplet);
      }
    };
    const needList =
      this.config.homeRadiusKm > 0 ||
      this.config.stations.some((token) => token.kind !== 'triplet');
    const stations = needList ? await this.stationList() : null;
    let complete = !needList || stations !== null;
    for (const token of this.config.stations) {
      if (token.kind === 'triplet') {
        add(token.value);
      } else if (stations) {
        const station = Monitor.find(stations, token);
        if (station) {
          add(station.triplet);
        } else {
          problems.unknown.push(token.text);
        }
      }
    }
    if (this.config.homeRadiusKm > 0 && stations) {
      try {
        const home = await this.homeStations(stations);
        if (home === null) {
          problems.noHouse = true;
        } else {
          home.forEach(add);
        }
        this.recovered('home', 'Stations around the house chosen again');
      } catch (err) {
        complete = false;
        this.failed(
          'home',
          'warn',
          `Cannot choose the stations around the house yet: ${err.message}`,
        );
      }
    }
    if (triplets.length > MAX_STATIONS) {
      problems.tooMany = true;
      triplets.length = MAX_STATIONS;
    }
    // A failed resolution keeps the stations found before it.
    this.configured = complete ? triplets : [...new Set([...this.configured, ...triplets])];
    this.problems = complete
      ? problems
      : { ...problems, unknown: [...new Set([...this.problems.unknown, ...problems.unknown])] };
    this.resolved = complete;
    for (const name of problems.unknown) {
      this.failed(`unknown:${name}`, 'warn', `Unknown station: ${name}`);
    }
  }

  /**
   * The first house of Gladys that has a location, or null. A failure to read
   * the houses throws with `strict` (the stations are chosen again later), and
   * resolves null otherwise (the search then asks for a location).
   */
  async house({ strict = false } = {}) {
    try {
      const houses = await this.gladys.getHouses();
      return (
        houses.find(
          (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
        ) ?? null
      );
    } catch (err) {
      if (strict) {
        throw new Error(`cannot read the houses of Gladys: ${err.message}`, { cause: err });
      }
      this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      return null;
    }
  }

  /** Stations of the list around a point, nearest first, with their distance. */
  static around(stations, origin, radiusKm) {
    return stations
      .filter((station) => station.latitude !== null && station.longitude !== null)
      .map((station) => ({
        station,
        km: distanceKm(origin.latitude, origin.longitude, station.latitude, station.longitude),
      }))
      .filter(({ km }) => km <= radiusKm)
      .sort((a, b) => a.km - b.km);
  }

  /** The nearest stations around the house (HOME_STATIONS at most); null without a located house. */
  async homeStations(stations) {
    const radius = this.config.homeRadiusKm;
    if (
      this.home &&
      this.home.radiusKm === radius &&
      this.now() - this.home.at < this.timings.homeMaxAgeMs
    ) {
      return this.home.triplets;
    }
    const house = await this.house({ strict: true });
    if (!house) {
      return null;
    }
    const triplets = Monitor.around(stations, house, radius)
      .slice(0, HOME_STATIONS)
      .map(({ station }) => station.triplet);
    // The house coordinates are not kept: only the radius and the stations.
    this.home = { radiusKm: radius, triplets, at: this.now() };
    return triplets;
  }

  // --- Discovery and connection status -----------------------------------------

  discoveredDevices() {
    return this.followed()
      .filter((triplet) => !this.missing[triplet])
      .map((triplet) => this.station(triplet))
      .filter(Boolean)
      .map((station) =>
        buildDevice(this.gladys, station, {
          language: this.config.language,
          units: this.config.units,
        }),
      );
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
  }

  async updateConnectionStatus() {
    const { noHouse, tooMany } = this.problems;
    const unknown = [
      ...new Set([
        ...this.problems.unknown,
        ...this.configured.filter((triplet) => this.missing[triplet]),
      ]),
    ];
    const parts = [];
    const down = this.failing.has('awdb') || (this.failing.has('list') && !this.list);
    if (down) {
      parts.push(render(STATUS, 'down'));
    }
    if (this.failing.has('home')) {
      parts.push(render(STATUS, 'homeFailed'));
    }
    if (unknown.length > 0) {
      parts.push(render(STATUS, 'unknown', { names: unknown.join(', ') }));
    }
    if (noHouse) {
      parts.push(render(STATUS, 'noHouse'));
    }
    if (tooMany) {
      parts.push(render(STATUS, 'tooMany', { max: MAX_STATIONS }));
    }
    if (this.resolved && this.followed().length === 0 && unknown.length === 0 && !noHouse) {
      parts.push(render(STATUS, 'none'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = !this.failing.has('awdb') && this.resolved;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  async onDeviceCreated(device) {
    const triplet = tripletOfId(this.gladys, device.external_id);
    if (!triplet) {
      return;
    }
    if (!this.readings[triplet]) {
      await this.runCycle({ again: true });
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates([triplet]);
    this.requestRefresh();
  }

  async onDeviceDeleted() {
    // A station only followed through its device is no longer followed.
    await this.publishDiscovered();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    const triplet = tripletOfId(this.gladys, device.external_id);
    if (!triplet) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= this.timings.cycleMs / 2) {
      await this.runCycle();
    } else {
      await this.publishStates([triplet]);
    }
  }

  // --- Cycles ------------------------------------------------------------------

  /** Run a cycle; `again`: if one is running, run a new one once it is over. */
  runCycle({ again = false } = {}) {
    if (this.stopped) {
      return this.running;
    }
    if (this.running) {
      if (again) {
        this.rerun ??= this.running.then(() => {
          this.rerun = null;
          return this.runCycle();
        });
        return this.rerun;
      }
      return this.running;
    }
    this.running = this.cycle()
      .then(() => this.recovered('cycle', 'Refresh cycles work again'))
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    const before = JSON.stringify(this.discoveredDevices());
    // Cheap when the station list is fresh: it is downloaded once a week.
    await this.resolve();
    const triplets = this.followed();
    const changed = await this.refresh(triplets);
    this.forget(triplets);
    if (JSON.stringify(this.discoveredDevices()) !== before) {
      await this.publishDiscovered();
    }
    await this.publishStates(this.created());
    await this.updateConnectionStatus();
    logger.debug(`Refresh cycle: ${triplets.length} station(s)`);
    if (changed) {
      this.requestRefresh();
    }
  }

  /** Drop what is kept of the stations no longer followed (the house ones change). */
  forget(followed) {
    for (const table of [this.stations, this.readings, this.missing]) {
      for (const triplet of Object.keys(table)) {
        if (!followed.includes(triplet)) {
          delete table[triplet];
        }
      }
    }
  }

  isFresh(time) {
    return typeof time === 'number' && this.now() - time <= this.timings.staleAfterMs;
  }

  /** Metadata, hourly values and medians of the stations; resolves true when a value changed. */
  async refresh(triplets) {
    if (triplets.length === 0) {
      return false;
    }
    const now = this.now();
    try {
      await this.refreshMetadata(triplets, now);
      const offsets = new Map(
        triplets
          .filter((triplet) => !this.missing[triplet])
          .map((triplet) => [triplet, this.station(triplet)?.tz ?? -8]),
      );
      if (offsets.size === 0) {
        this.recovered('awdb', 'AWDB answers again');
        return false;
      }
      const hourly = await this.api.hourly(offsets, now);
      let changed = false;
      for (const triplet of offsets.keys()) {
        changed = this.fold(triplet, hourly.get(triplet) ?? {}) || changed;
      }
      const needMedians =
        now - this.mediansAt >= this.timings.medianMaxAgeMs ||
        [...offsets.keys()].some((triplet) => this.stations[triplet]?.hasMedian === undefined);
      if (needMedians) {
        changed = (await this.refreshMedians(offsets, now)) || changed;
      }
      this.recovered('awdb', 'AWDB answers again');
      for (const triplet of offsets.keys()) {
        changed = this.noteSilence(triplet) || changed;
      }
      return changed;
    } catch (err) {
      this.failed('awdb', 'warn', `AWDB unreachable: ${err.message}`);
      return false;
    }
  }

  /** Metadata of the stations never asked or asked more than a day ago (one request). */
  async refreshMetadata(triplets, now) {
    const expired = (entry) => !entry || now - entry.fetchedAt >= this.timings.metadataMaxAgeMs;
    const due = triplets.filter((triplet) =>
      this.missing[triplet] ? expired(this.missing[triplet]) : expired(this.stations[triplet]),
    );
    if (due.length === 0) {
      return;
    }
    const found = await this.api.metadata(due, now);
    for (const triplet of due) {
      const station = found.get(triplet);
      if (station) {
        delete this.missing[triplet];
        this.stations[triplet] = {
          ...station,
          hasMedian: this.stations[triplet]?.hasMedian,
          fetchedAt: now,
        };
      } else {
        this.missing[triplet] = { fetchedAt: now };
        this.failed(`unknown:${triplet}`, 'warn', `Unknown station: ${triplet}`);
      }
    }
  }

  /** Daily snow water equivalent against its median; resolves true when a percentage changed. */
  async refreshMedians(offsets, now) {
    const withSwe = new Map(
      [...offsets].filter(([triplet]) => capabilities(this.station(triplet)).snow_water_equivalent),
    );
    this.mediansAt = now;
    for (const triplet of offsets.keys()) {
      if (!withSwe.has(triplet) && this.stations[triplet]) {
        this.stations[triplet].hasMedian ??= false;
      }
    }
    if (withSwe.size === 0) {
      return false;
    }
    const daily = await this.api.dailyMedian(withSwe, now);
    let changed = false;
    for (const triplet of withSwe.keys()) {
      const day = daily.get(triplet);
      const station = this.stations[triplet];
      if (station && day) {
        // A station gets the feature as soon as NRCS gives it a median once.
        station.hasMedian = Boolean(station.hasMedian || day.median !== null);
      } else if (station) {
        station.hasMedian ??= false;
      }
      const reading = (this.readings[triplet] ??= {});
      const pct = day && day.median > 0 ? Math.round((day.v / day.median) * 100) : null;
      const next = pct === null ? null : { t: day.t, pct };
      changed ||= JSON.stringify(next) !== JSON.stringify(reading.median ?? null);
      reading.median = next;
    }
    return changed;
  }

  /** Keep the newest hourly values of a station; resolves true when one changed. */
  fold(triplet, series) {
    const reading = (this.readings[triplet] ??= {});
    let changed = false;
    for (const code of ELEMENTS) {
      const latest = series[code]?.at(-1);
      if (!latest || latest.t < (reading[code]?.t ?? -Infinity)) {
        continue;
      }
      changed ||= reading[code]?.t !== latest.t || reading[code]?.v !== latest.v;
      reading[code] = latest;
    }
    if (series.SNWD?.length) {
      const snow = newSnow24h(series.SNWD);
      const next = snow === null ? null : { t: series.SNWD.at(-1).t, v: snow };
      changed ||= JSON.stringify(next) !== JSON.stringify(reading.newSnow ?? null);
      reading.newSnow = next;
    }
    return changed;
  }

  /** One info line when a station goes silent, one when it comes back. */
  noteSilence(triplet) {
    const reading = (this.readings[triplet] ??= {});
    const silent = !this.isFresh(this.lastReadingAt(triplet));
    if (silent === reading.silent) {
      return false;
    }
    const wasKnown = reading.silent !== undefined;
    reading.silent = silent;
    const name = this.station(triplet)?.name ?? triplet;
    if (!wasKnown) {
      logger.debug(`${name}: ${silent ? 'no recent reading' : 'readings are fresh'}`);
    } else if (silent) {
      logger.info(`${name}: no new reading for ${this.timings.staleAfterMs / HOUR} hours`);
    } else {
      logger.info(`${name}: readings are back`);
    }
    return true;
  }

  /** Last reading time of a station (ms), or null. */
  lastReadingAt(triplet) {
    const reading = this.readings[triplet];
    const times = ELEMENTS.map((code) => reading?.[code]?.t).filter((t) => typeof t === 'number');
    return times.length > 0 ? Math.max(...times) : null;
  }

  // --- States ------------------------------------------------------------------

  /**
   * The unit of a feature as it exists in Gladys (frozen at its creation),
   * else the one of the configuration.
   */
  unitOf(triplet, key) {
    const id = stationIds(this.gladys, triplet)[key];
    const feature = this.deviceOf(triplet)?.features?.find((f) => f.external_id === id);
    const units = FEATURE_UNITS[this.config.units] ?? FEATURE_UNITS.metric;
    return feature?.unit && Object.values(FEATURE_UNITS).some((u) => u[key] === feature.unit)
      ? feature.unit
      : units[key];
  }

  /**
   * The current values of a station in the units of its features: null for a
   * value missing or older than `staleAfterMs`.
   */
  values(triplet) {
    const reading = this.readings[triplet] ?? {};
    const fresh = (entry) => (entry && this.isFresh(entry.t) ? entry : null);
    const measured = (entry, key) => {
      const unit = this.unitOf(triplet, key);
      return entry ? { value: convert(entry.v, unit), unit } : { value: null, unit };
    };
    const median =
      reading.median && this.now() - reading.median.t <= this.timings.medianStaleAfterMs
        ? reading.median
        : null;
    return {
      snow_depth: measured(fresh(reading.SNWD), 'snow_depth'),
      new_snow_24h: measured(fresh(reading.newSnow), 'new_snow_24h'),
      snow_water_equivalent: measured(fresh(reading.WTEQ), 'snow_water_equivalent'),
      swe_percent_of_median: { value: median ? median.pct : null, unit: 'percent' },
      air_temperature: measured(fresh(reading.TOBS), 'air_temperature'),
    };
  }

  /** The states of the given stations whose device exists. */
  statesOf(triplets) {
    const states = [];
    const language = this.config.language;
    for (const triplet of triplets) {
      const station = this.station(triplet);
      if (!station || !this.isCreated(triplet)) {
        continue;
      }
      const ids = stationIds(this.gladys, triplet);
      const has = capabilities(station);
      for (const [key, { value }] of Object.entries(this.values(triplet))) {
        if (has[key] && value !== null) {
          states.push({ device_feature_external_id: ids[key], state: value });
        }
      }
      const last = this.lastReadingAt(triplet);
      if (last !== null) {
        const date = formatDate(last, language);
        states.push({
          device_feature_external_id: ids.last_reading,
          text: this.isFresh(last) ? date : READINGS[language].staleSince({ date }),
        });
      }
    }
    return states;
  }

  async publishStates(triplets) {
    const states = this.statesOf(triplets);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }

  /** What the widget shows of one station; `name` is the one given in Gladys. */
  view(triplet) {
    const station = this.station(triplet) ?? { triplet, id: triplet.split(':')[0], name: triplet };
    const last = this.lastReadingAt(triplet);
    return {
      triplet,
      id: station.id,
      name: this.deviceOf(triplet)?.name ?? station.name,
      has: capabilities(station),
      values: this.values(triplet),
      lastReadingAt: last,
      fresh: this.isFresh(last),
    };
  }

  /** The time of the newest reading shown, for the attribution. */
  updatedAt(triplets) {
    const times = triplets.map((triplet) => this.lastReadingAt(triplet)).filter((t) => t !== null);
    return times.length > 0 ? Math.max(...times) : null;
  }
}
