// -----------------------------------------------------------------------------
// Client of the AWDB REST API of the USDA NRCS (Air and Water Database, the
// SNOTEL data): https://wcc.sc.egov.usda.gov/awdbRestApi/swagger-ui/index.html
// Public, keyless. Its firewall answers 403 to bursts of requests: the
// integration sends at most three requests an hour, and a 403 is treated as a
// passing refusal (tried again at the next cycle).
//
// Elements read (values stored in US units by NRCS):
//   SNWD  snow depth, inches (whole)        HOURLY
//   WTEQ  snow water equivalent, inches     HOURLY, and DAILY with its median
//   TOBS  observed air temperature, °F      HOURLY
//
// Dates: AWDB writes them in the station's local STANDARD time
// ("2026-11-11 23:00"), whose UTC offset is the station's `dataTimeZone` in
// hours (-8 for most SNOTEL stations, which report in Pacific standard time;
// -9 in Alaska). They are turned into epoch milliseconds here.
// -----------------------------------------------------------------------------

import { getJson } from './http.js';

export const BASE_URL = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1';
export const SITE_URL =
  'https://www.nrcs.usda.gov/resources/data-and-reports/snow-and-climate-monitoring-snotel';

/** The NRCS page of a station (report generator). */
export const stationPage = (id) => `https://wcc.sc.egov.usda.gov/nwcc/site?sitenum=${id}`;

export const ELEMENTS = ['SNWD', 'WTEQ', 'TOBS'];

const HOUR = 3600 * 1000;

/** "2026-11-11 23:00" (or "2026-11-11") at a UTC offset in hours -> epoch ms; null if invalid. */
export function parseDate(text, offsetHours) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(String(text ?? ''));
  if (!match || !Number.isFinite(offsetHours)) {
    return null;
  }
  const [, y, mo, d, h = '0', mi = '0'] = match;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi) - offsetHours * HOUR;
}

/** Epoch ms -> "2026-11-11 23:00" at a UTC offset in hours. */
export function formatDate(time, offsetHours) {
  return new Date(time + offsetHours * HOUR).toISOString().slice(0, 16).replace('T', ' ');
}

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** A station of the list or of the metadata, reduced to what the integration uses. */
export function parseStation(raw, now = Date.now()) {
  const triplet = String(raw?.stationTriplet ?? '');
  if (!/^\d+:[A-Z]{2}:[A-Z]+$/.test(triplet)) {
    return null;
  }
  const station = {
    triplet,
    id: String(raw.stationId ?? triplet.split(':')[0]),
    state: raw.stateCode ?? triplet.split(':')[1],
    network: raw.networkCode ?? triplet.split(':')[2],
    name: String(raw.name ?? triplet).trim(),
    county: raw.countyName ?? null,
    elevationFt: number(raw.elevation),
    latitude: number(raw.latitude),
    longitude: number(raw.longitude),
    tz: number(raw.dataTimeZone) ?? -8,
  };
  if (Array.isArray(raw.stationElements)) {
    // An element is measured when its hourly series is still open.
    const has = Object.fromEntries(ELEMENTS.map((code) => [code, false]));
    for (const element of raw.stationElements) {
      const end = parseDate(element.endDate, 0);
      if (
        element.durationName === 'HOURLY' &&
        ELEMENTS.includes(element.elementCode) &&
        (end === null || end > now)
      ) {
        has[element.elementCode] = true;
      }
    }
    station.elements = has;
  }
  return station;
}

export class Awdb {
  /** @param {{ fetch?: Function, baseUrl?: string }} [options] */
  constructor({ fetch: fetchImpl, baseUrl = BASE_URL } = {}) {
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.baseUrl = baseUrl;
  }

  url(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** Every active SNOTEL station (about 900): names, states, coordinates. */
  async stationList(now = Date.now()) {
    const body = await getJson(
      this.fetch,
      this.url('/stations', { stationTriplets: '*:*:SNTL', activeOnly: 'true' }),
      { timeoutMs: 60000 },
    );
    if (!Array.isArray(body)) {
      throw new Error('AWDB: unexpected station list');
    }
    return body.map((raw) => parseStation(raw, now)).filter(Boolean);
  }

  /** Metadata and measured elements of some stations (any network): Map triplet -> station. */
  async metadata(triplets, now = Date.now()) {
    const body = await getJson(
      this.fetch,
      this.url('/stations', {
        stationTriplets: triplets.join(','),
        returnStationElements: 'true',
      }),
    );
    if (!Array.isArray(body)) {
      throw new Error('AWDB: unexpected station metadata');
    }
    const found = new Map();
    for (const raw of body) {
      const station = parseStation(raw, now);
      if (station) {
        found.set(station.triplet, station);
      }
    }
    return found;
  }

  /**
   * Hourly SNWD, WTEQ and TOBS of the last 30 hours or so.
   * @param {Map<string, number>} offsets triplet -> dataTimeZone
   * @returns {Promise<Map<string, Record<string, Array<{t: number, v: number}>>>>} oldest first
   */
  async hourly(offsets, now = Date.now()) {
    // Asked in a wide window of local times: from 32 h ago at UTC-10 to now at
    // UTC-4, so every station of the US and Canada gets its last 30 hours.
    const body = await getJson(
      this.fetch,
      this.url('/data', {
        stationTriplets: [...offsets.keys()].join(','),
        elements: ELEMENTS.join(','),
        duration: 'HOURLY',
        beginDate: formatDate(now - 32 * HOUR, -10),
        endDate: formatDate(now + HOUR, -4),
      }),
    );
    return parseData(body, offsets);
  }

  /**
   * Daily WTEQ of the last days with the median of the date (1991-2020
   * normals): Map triplet -> { t, v, median } of the newest day, `median`
   * null when NRCS has no median for the station.
   */
  async dailyMedian(offsets, now = Date.now()) {
    const body = await getJson(
      this.fetch,
      this.url('/data', {
        stationTriplets: [...offsets.keys()].join(','),
        elements: 'WTEQ',
        duration: 'DAILY',
        beginDate: formatDate(now - 5 * 24 * HOUR, -10).slice(0, 10),
        endDate: formatDate(now + HOUR, -4).slice(0, 10),
        centralTendencyType: 'MEDIAN',
      }),
    );
    if (!Array.isArray(body)) {
      throw new Error('AWDB: unexpected data');
    }
    const result = new Map();
    for (const item of body) {
      const offset = offsets.get(item?.stationTriplet);
      if (offset === undefined) {
        continue;
      }
      const element = (item.data ?? []).find((d) => d?.stationElement?.elementCode === 'WTEQ');
      const values = (element?.values ?? [])
        .map((p) => ({
          t: parseDate(p.date, offset),
          v: number(p.value),
          median: number(p.median),
        }))
        .filter((p) => p.t !== null && p.v !== null);
      const latest = values.at(-1);
      if (latest) {
        result.set(item.stationTriplet, latest);
      }
    }
    return result;
  }
}

/** The /data answer of hourly elements: Map triplet -> { SNWD: [{t, v}], ... }, oldest first. */
export function parseData(body, offsets) {
  if (!Array.isArray(body)) {
    throw new Error('AWDB: unexpected data');
  }
  const result = new Map();
  for (const item of body) {
    const offset = offsets.get(item?.stationTriplet);
    if (offset === undefined) {
      continue;
    }
    const series = {};
    for (const element of item.data ?? []) {
      const code = element?.stationElement?.elementCode;
      if (!ELEMENTS.includes(code)) {
        continue;
      }
      series[code] = (element.values ?? [])
        .map((p) => ({ t: parseDate(p.date, offset), v: number(p.value) }))
        .filter((p) => p.t !== null && p.v !== null)
        .sort((a, b) => a.t - b.t);
    }
    result.set(item.stationTriplet, series);
  }
  return result;
}

const median3 = (a, b, c) => [a, b, c].sort((x, y) => x - y)[1];

/**
 * Snow fallen in the last 24 hours, in inches, from the hourly snow depth
 * (oldest first): the depth now minus the lowest depth of the 24 hours before,
 * never below 0. The ultrasonic depth sensor jitters by an inch or so: every
 * point is replaced by the median of itself and its neighbours first, so one
 * odd reading does not count as a snowfall. Settling of the new snow makes this
 * a lower bound. Null when the series does not cover at least 20 of the 24
 * hours.
 */
export function newSnow24h(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return null;
  }
  const smooth = points.map((point, i) => {
    const before = points[Math.max(0, i - 1)].v;
    const after = points[Math.min(points.length - 1, i + 1)].v;
    return { t: point.t, v: median3(before, point.v, after) };
  });
  const latest = points.at(-1);
  // The newest point has no later neighbour: the median of the last three.
  const now = median3(points.at(-3).v, points.at(-2).v, latest.v);
  const window = smooth.filter((point) => point.t >= latest.t - 24 * HOUR);
  if (window.length === 0 || window[0].t > latest.t - 20 * HOUR) {
    return null;
  }
  const lowest = Math.min(...window.map((point) => point.v));
  return Math.max(0, now - lowest);
}
