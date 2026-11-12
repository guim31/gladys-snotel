// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake AWDB serving the answers
// recorded in test/fixtures/awdb (filtered the way the real API filters), a
// manual clock, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { formatDate } from '../../src/awdb.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/Denver';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The answers were recorded on 12/11/2026 at 08:07 UTC (00:07 in Pacific
// standard time): the clock starts 3 minutes later.
export const START = Date.parse('2026-11-12T08:10:00Z');

// A house in downtown Salt Lake City (public coordinates of the City Hall).
export const HOUSE = {
  id: 'house-1',
  name: 'Home',
  selector: 'home',
  latitude: 40.7608,
  longitude: -111.8863,
};

// California: SNWD declared but silent (no hourly value), WTEQ, TOBS, median.
export const HORSE_MEADOW = '1050:CA:SNTL';
// Colorado: SNWD with gaps, WTEQ, TOBS, median.
export const BERTHOUD = '335:CO:SNTL';
// Utah: 5-6 inches of snow, WTEQ, TOBS, median.
export const SNOWBIRD = '766:UT:SNTL';
// Alaska (UTC-9): 30 inches of snow, no median.
export const INDEPENDENCE = '1091:AK:SNTL';
// Washington: WTEQ melting to 0, median.
export const PARADISE = '679:WA:SNTL';
// Alabama, SCAN network: air temperature only, no snow sensor.
export const SCAN = '2057:AL:SCAN';
// No such station.
export const UNKNOWN = '9999:ZZ:SNTL';

/** Fake AWDB. `api.down`: 'network' (connection refused), a status (403, 503) or false. */
export function createApi() {
  const list = fixture('awdb/stations-sntl-2026-11-12.json');
  const metadata = fixture('awdb/metadata-2026-11-12.json');
  const hourly = fixture('awdb/hourly-2026-11-12.json');
  const daily = fixture('awdb/daily-median-2026-11-12.json');
  const offsetOf = (triplet) => metadata.find((s) => s.stationTriplet === triplet).dataTimeZone;

  const api = {
    list,
    metadata,
    hourly,
    daily,
    down: false,
    requests: [],

    /** A new hourly value of an element (SNWD, WTEQ, TOBS) at `time` (ms). */
    addHourly(triplet, code, time, value) {
      let station = hourly.find((s) => s.stationTriplet === triplet);
      if (!station) {
        station = { stationTriplet: triplet, data: [] };
        hourly.push(station);
      }
      let element = station.data.find((d) => d.stationElement.elementCode === code);
      if (!element) {
        element = { stationElement: { elementCode: code, durationName: 'HOURLY' }, values: [] };
        station.data.push(element);
      }
      element.values.push({ date: formatDate(time, offsetOf(triplet)), value });
      element.values.sort((a, b) => a.date.localeCompare(b.date));
    },

    /** Every hourly value of an element dropped (a broken sensor). */
    clearHourly(triplet, code) {
      const station = hourly.find((s) => s.stationTriplet === triplet);
      if (station) {
        station.data = station.data.filter((d) => d.stationElement.elementCode !== code);
      }
    },

    answer(url) {
      const params = url.searchParams;
      const triplets = (params.get('stationTriplets') ?? '').split(',');
      if (url.pathname.endsWith('/stations')) {
        if (triplets[0] === '*:*:SNTL') {
          return list;
        }
        return triplets
          .map((triplet) => {
            const known = metadata.find((s) => s.stationTriplet === triplet);
            if (known) {
              return known;
            }
            // A station of the list without recorded metadata: the three elements.
            const listed = list.find((s) => s.stationTriplet === triplet);
            return listed
              ? {
                  ...listed,
                  stationElements: ['SNWD', 'WTEQ', 'TOBS'].map((elementCode) => ({
                    elementCode,
                    durationName: 'HOURLY',
                    endDate: '2100-01-01 00:00',
                  })),
                }
              : null;
          })
          .filter(Boolean);
      }
      if (url.pathname.endsWith('/data')) {
        const source = params.get('duration') === 'DAILY' ? daily : hourly;
        const begin = params.get('beginDate');
        const end = params.get('endDate');
        const inRange = (date) =>
          date.slice(0, begin.length) >= begin && date.slice(0, end.length) <= end;
        return source
          .filter((s) => triplets.includes(s.stationTriplet))
          .map((s) => ({
            ...s,
            data: s.data
              .map((d) => ({ ...d, values: d.values.filter((v) => inRange(v.date)) }))
              .filter((d) => d.values.length > 0),
          }));
      }
      return null;
    },

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down) {
        return { status: api.down, text: async () => '<html>Forbidden</html>' };
      }
      const body = api.answer(url);
      if (body === null) {
        return { status: 404, text: async () => 'Not found' };
      }
      return { status: 200, text: async () => JSON.stringify(body) };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const app = registerHandlers(gladys, { fetch: api.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock };
}

/** The device published for a station triplet, from the last discovery list. */
export const discovered = (world, triplet) =>
  world.fake.discoveredDevices.find((device) =>
    device.params.some((p) => p.name === 'STATION_TRIPLET' && p.value === triplet),
  );

/** Create the device of a station in Gladys, as the user would. */
export async function create(world, triplet) {
  const device = discovered(world, triplet);
  if (!device) {
    throw new Error(`${triplet} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 60) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
