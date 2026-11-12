// -----------------------------------------------------------------------------
// One Gladys device per SNOTEL station.
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js), each only when the station measures it:
//   - snow_depth              level-sensor/liquid-depth, cm or inches (SNWD);
//   - snow_water_equivalent   level-sensor/liquid-depth, mm or inches (WTEQ):
//                             the water the snowpack would give if melted;
//   - swe_percent_of_median   level-sensor/liquid-level-percent, %: today's
//                             snow water equivalent against the median of the
//                             date (1991-2020), when NRCS has a median;
//   - new_snow_24h            level-sensor/liquid-depth, cm or inches: the snow
//                             depth gained in 24 hours (src/awdb.js newSnow24h);
//   - air_temperature         temperature-sensor/decimal, °C or °F (TOBS);
//   - last_reading            text/text: the date of the last measurement, or
//                             "no new reading since…" once the station is silent.
//
// Units are chosen in the configuration and frozen with the feature at its
// creation: states are always sent in the unit of the feature as it exists in
// Gladys (see `unitOf`), so changing the setting never mislabels a value.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The platform id is the station triplet with dashes
// (1050-CA-SNTL): the colon separates the parts of a Gladys external id.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'station';
export const FEATURE_KEYS = {
  SNOW_DEPTH: 'snow_depth',
  SWE: 'snow_water_equivalent',
  SWE_PERCENT: 'swe_percent_of_median',
  NEW_SNOW: 'new_snow_24h',
  AIR_TEMPERATURE: 'air_temperature',
  LAST_READING: 'last_reading',
};

// Unit of each measured feature in each unit system.
export const FEATURE_UNITS = {
  metric: {
    snow_depth: UNITS.CM,
    snow_water_equivalent: UNITS.MM,
    new_snow_24h: UNITS.CM,
    air_temperature: UNITS.CELSIUS,
  },
  imperial: {
    snow_depth: UNITS.INCH,
    snow_water_equivalent: UNITS.INCH,
    new_snow_24h: UNITS.INCH,
    air_temperature: UNITS.FAHRENHEIT,
  },
};

// Display bounds (history chart, gauge), per unit. The deepest SNOTEL
// snowpacks reach about 250 inches of snow and 120 inches of water.
const BOUNDS = {
  snow_depth: { [UNITS.CM]: [0, 800], [UNITS.INCH]: [0, 300] },
  snow_water_equivalent: { [UNITS.MM]: [0, 3500], [UNITS.INCH]: [0, 140] },
  new_snow_24h: { [UNITS.CM]: [0, 200], [UNITS.INCH]: [0, 80] },
  air_temperature: { [UNITS.CELSIUS]: [-50, 45], [UNITS.FAHRENHEIT]: [-60, 115] },
};

/**
 * A value read in NRCS units (inches, °F) converted to a Gladys unit, rounded
 * to what the sensor resolves.
 */
export function convert(value, unit) {
  switch (unit) {
    case UNITS.CM:
      return Math.round(value * 2.54);
    case UNITS.MM:
      return Math.round(value * 25.4);
    case UNITS.CELSIUS:
      return Math.round((((value - 32) * 5) / 9) * 10) / 10;
    case UNITS.INCH:
    case UNITS.FAHRENHEIT:
    default:
      return Math.round(value * 10) / 10;
  }
}

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    snow_depth: 'Snow depth',
    snow_water_equivalent: 'Snow water equivalent',
    swe_percent_of_median: 'Snow water, % of median',
    new_snow_24h: 'New snow (24 h)',
    air_temperature: 'Air temperature',
    last_reading: 'Last reading',
  },
  fr: {
    snow_depth: 'Hauteur de neige',
    snow_water_equivalent: 'Équivalent en eau de la neige',
    swe_percent_of_median: 'Équivalent en eau, % de la médiane',
    new_snow_24h: 'Neige fraîche (24 h)',
    air_temperature: "Température de l'air",
    last_reading: 'Dernière mesure',
  },
  de: {
    snow_depth: 'Schneehöhe',
    snow_water_equivalent: 'Schneewasseräquivalent',
    swe_percent_of_median: 'Schneewasser, % des Medians',
    new_snow_24h: 'Neuschnee (24 h)',
    air_temperature: 'Lufttemperatur',
    last_reading: 'Letzte Messung',
  },
  es: {
    snow_depth: 'Espesor de nieve',
    snow_water_equivalent: 'Equivalente en agua de la nieve',
    swe_percent_of_median: 'Agua de la nieve, % de la mediana',
    new_snow_24h: 'Nieve nueva (24 h)',
    air_temperature: 'Temperatura del aire',
    last_reading: 'Última medición',
  },
};

/** The platform id of a station triplet: 1050:CA:SNTL -> 1050-CA-SNTL. */
export const platformId = (triplet) => triplet.replace(/:/g, '-');

/** External ids of a station device and of its features. */
export function stationIds(gladys, triplet) {
  const ids = gladys.externalIds(DEVICE_TYPE, platformId(triplet));
  return {
    device: ids.device,
    ...Object.fromEntries(Object.values(FEATURE_KEYS).map((key) => [key, ids.feature(key)])),
  };
}

/** The station triplet of a device or feature external id (null if not ours). */
export function tripletOfId(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length).split(':')[0];
  return /^\d+-[A-Z]{2}-[A-Z]+$/.test(id) ? id.replace(/-/g, ':') : null;
}

/**
 * What a station offers. `station.elements` comes from the AWDB metadata,
 * `station.hasMedian` from its daily data; a station rebuilt from a Gladys
 * device carries `has`.
 */
export function capabilities(station) {
  if (station.has) {
    return station.has;
  }
  const elements = station.elements ?? {};
  return {
    snow_depth: Boolean(elements.SNWD),
    snow_water_equivalent: Boolean(elements.WTEQ),
    swe_percent_of_median: Boolean(elements.WTEQ && station.hasMedian),
    new_snow_24h: Boolean(elements.SNWD),
    air_temperature: Boolean(elements.TOBS),
  };
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

/**
 * The discovery payload of a station.
 * @param {object} gladys
 * @param {object} station see src/awdb.js parseStation
 * @param {{ language?: string, units?: string }} [options]
 */
export function buildDevice(gladys, station, { language = 'fr', units = 'metric' } = {}) {
  const ids = stationIds(gladys, station.triplet);
  const names = NAMES[language] ?? NAMES.fr;
  const unitOf = FEATURE_UNITS[units] ?? FEATURE_UNITS.metric;
  const has = capabilities(station);
  const C = DEVICE_FEATURE_CATEGORIES;
  const features = [];
  const measured = (key, category, type) => {
    const unit = unitOf[key];
    const [min, max] = BOUNDS[key][unit];
    features.push(sensor(names[key], ids[key], category, type, { unit, min, max }));
  };
  if (has.snow_depth) {
    measured('snow_depth', C.LEVEL_SENSOR, TYPES.LEVEL_SENSOR.LIQUID_DEPTH);
  }
  if (has.new_snow_24h) {
    measured('new_snow_24h', C.LEVEL_SENSOR, TYPES.LEVEL_SENSOR.LIQUID_DEPTH);
  }
  if (has.snow_water_equivalent) {
    measured('snow_water_equivalent', C.LEVEL_SENSOR, TYPES.LEVEL_SENSOR.LIQUID_DEPTH);
  }
  if (has.swe_percent_of_median) {
    features.push(
      sensor(
        names.swe_percent_of_median,
        ids.swe_percent_of_median,
        C.LEVEL_SENSOR,
        TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
        { unit: UNITS.PERCENT, min: 0, max: 300 },
      ),
    );
  }
  if (has.air_temperature) {
    measured('air_temperature', C.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL);
  }
  features.push(
    sensor(names.last_reading, ids.last_reading, C.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    }),
  );
  const params = [
    { name: 'STATION_TRIPLET', value: station.triplet },
    { name: 'STATE', value: station.state },
  ];
  if (station.elevationFt !== null && station.elevationFt !== undefined) {
    params.push({ name: 'ELEVATION_FT', value: String(station.elevationFt) });
  }
  return {
    name: station.name,
    external_id: ids.device,
    model: `${station.network === 'SNTL' ? 'SNOTEL' : station.network} · ${station.state}`,
    should_poll: false,
    params,
    features,
  };
}
