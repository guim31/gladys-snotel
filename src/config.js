// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Kilometres around the house where the nearest stations are followed; '0' = off.
// SNOTEL stations sit in the mountains, tens of kilometres apart.
export const HOME_RADII = ['0', '50', '100', '200'];

// Units of the features: metric (cm, mm, °C) or imperial (inches, °F, as NRCS
// publishes them).
export const UNIT_SYSTEMS = ['metric', 'imperial'];

// Stations followed "around my house": the nearest ones.
export const HOME_STATIONS = 3;

// Upper bound of the stations taken from the configuration: one AWDB request
// covers them all, and the states stay far below the 300 per minute of the core.
export const MAX_STATIONS = 20;

export const DEFAULT_CONFIG = {
  stations: '',
  around_home: '0',
  units: 'metric',
  language: 'fr',
};

// Station triplet as NRCS writes it: id, state, network (1050:CA:SNTL).
const TRIPLET = /^(\d{1,8}):([a-z]{2}):([a-z]{2,6})$/i;
// A bare station id (1050), looked up among the SNOTEL stations.
const STATION_ID = /^\d{1,8}$/;
// The NRCS page of a station: …/nwcc/site?sitenum=1050
const ID_IN_URL = /[?&]sitenum=(\d{1,8})\b/i;

/**
 * What one token of the "Stations" field designates: a triplet, a station id
 * or a name. Names may hold spaces ("Horse Meadow"): tokens are only separated
 * by commas, semicolons and line breaks.
 */
export function parseToken(token) {
  const text = String(token ?? '').trim();
  const triplet = TRIPLET.exec(text);
  if (triplet) {
    return {
      kind: 'triplet',
      value: `${triplet[1]}:${triplet[2].toUpperCase()}:${triplet[3].toUpperCase()}`,
      text,
    };
  }
  const inUrl = ID_IN_URL.exec(text);
  if (inUrl) {
    return { kind: 'id', value: inUrl[1], text };
  }
  if (STATION_ID.test(text)) {
    return { kind: 'id', value: text, text };
  }
  return { kind: 'name', value: text, text };
}

/** The tokens of the "Stations" field, duplicates removed. */
export function parseStations(text) {
  const seen = new Set();
  const tokens = [];
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    if (!raw.trim()) {
      continue;
    }
    const token = parseToken(raw);
    const key = `${token.kind}:${normalizeName(token.value)}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push(token);
    }
  }
  return tokens;
}

/** A name reduced for comparison: case, accents and punctuation ignored. */
export function normalizeName(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? String(value) : fallback;

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    stations: parseStations(source.stations),
    homeRadiusKm: Number(pick(source.around_home, HOME_RADII, DEFAULT_CONFIG.around_home)),
    units: pick(source.units, UNIT_SYSTEMS, DEFAULT_CONFIG.units),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
