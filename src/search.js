// -----------------------------------------------------------------------------
// The "Find stations" configuration action: lists SNOTEL stations with their
// triplet, state, elevation and distance from the house, so the user can copy
// their triplets into the configuration.
//
// What can be chosen or typed (all optional):
//   - a state: its stations, alphabetically (nearest first with a house);
//   - words: matched against the station and county names ("Snowbird",
//     "Summit"), a station number (1050) or a triplet (1050:CA:SNTL);
//   - nothing: the stations around the house (its location in Gladys).
//
// The search is made on the station list (downloaded once a week): the house
// coordinates never leave Gladys and the container.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeName, parseToken } from './config.js';
import { distanceKm } from './geo.js';
import { SEARCH, formatNumber, render } from './messages.js';
import { Monitor } from './monitor.js';

const logger = createLogger({ name: 'snotel-search' });

// The states (and Alaska) where SNOTEL stations stand.
export const SNOTEL_STATES = [
  'AK',
  'AZ',
  'CA',
  'CO',
  'ID',
  'MT',
  'NM',
  'NV',
  'OR',
  'SD',
  'UT',
  'WA',
  'WY',
];
export const SEARCH_RADII = ['50', '100', '200', '400'];
const DEFAULT_RADIUS_KM = 100;
const MAX_RESULTS = 15;

/** Distance from the house to a station in km, null when one has no location. */
const distanceTo = (house, station) =>
  house && station.latitude !== null && station.longitude !== null
    ? distanceKm(house.latitude, house.longitude, station.latitude, station.longitude)
    : null;

function matches(station, words) {
  const haystack = normalizeName(`${station.name} ${station.county ?? ''}`);
  return words.every((word) => haystack.includes(normalizeName(word)));
}

/** The stations of a query with their distance, nearest first, else by name. */
async function candidates(monitor, { query, state, radiusKm }, stations) {
  const house = await monitor.house();
  let found = state ? stations.filter((station) => station.state === state) : stations;
  if (!query) {
    if (!state) {
      return house ? { list: Monitor.around(stations, house, radiusKm) } : { error: 'noHouse' };
    }
  } else {
    const token = parseToken(query);
    if (token.kind === 'triplet') {
      found = found.filter((station) => station.triplet === token.value);
    } else if (token.kind === 'id') {
      found = found.filter((station) => station.id === token.value);
    } else {
      const words = query.split(/\s+/).filter(Boolean);
      found = found.filter((station) => matches(station, words));
    }
  }
  const list = found.map((station) => ({ station, km: distanceTo(house, station) }));
  list.sort((a, b) =>
    a.km !== null && b.km !== null ? a.km - b.km : a.station.name.localeCompare(b.station.name),
  );
  return { list };
}

/**
 * Handler of the `search_stations` action.
 * @param {Monitor} monitor
 * @param {{ query?: string, state?: string, radius?: string }} fields
 */
export async function searchStations(monitor, fields = {}) {
  const radiusKm = SEARCH_RADII.includes(String(fields.radius))
    ? Number(fields.radius)
    : DEFAULT_RADIUS_KM;
  const state = SNOTEL_STATES.includes(fields.state) ? fields.state : null;
  try {
    const stations = await monitor.stationList();
    if (!stations) {
      return render(SEARCH, 'unavailable');
    }
    const query = String(fields.query ?? '').trim();
    const found = await candidates(monitor, { query, state, radiusKm }, stations);
    if (found.error) {
      return render(SEARCH, found.error);
    }
    const total = found.list.length;
    const listed = found.list.slice(0, MAX_RESULTS);
    logger.info(`Station search: ${total} station(s) found`);
    if (listed.length === 0) {
      return render(SEARCH, 'none');
    }
    return Object.fromEntries(
      Object.keys(SEARCH).map((language) => {
        const lines = listed.map(({ station, km }) => {
          const where = [station.state];
          if (station.elevationFt !== null) {
            where.push(
              `${formatNumber(station.elevationFt, language, 0)} ft / ${formatNumber(station.elevationFt * 0.3048, language, 0)} m`,
            );
          }
          const parts = [`${station.triplet} — ${station.name} (${where.join(', ')})`];
          if (km !== null) {
            parts.push(`${formatNumber(km, language, 0)} km`);
          }
          return parts.join(', ');
        });
        return [
          language,
          `${SEARCH[language].found({ count: listed.length, total })}\n${lines.join('\n')}`,
        ];
      }),
    );
  } catch (err) {
    logger.warn(`Station search failed: ${err.message}`);
    return render(SEARCH, 'unavailable');
  }
}
