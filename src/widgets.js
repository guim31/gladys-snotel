// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `snowpack`.
//
// Without setting, one status line per station whose device exists (10 at
// most): snow depth and the snow of the last 24 hours, in the units of the
// features. A line turns "info" with a snow icon when snow fell; neutral
// otherwise, with a clock while waiting or once the station is silent.
//
// With a station chosen in the settings: its live snow depth, new snow and
// snow water equivalent tiles (bound to the device features), then the
// percentage of the median, the air temperature and the last reading.
//
// Both end with the source and the date of the newest reading.
// Budget: 1 text, 1 status, 3 tiles.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationIds, tripletOfId } from './devices.js';
import { formatDate, formatValue } from './messages.js';
import { WIDGET_KEY } from './monitor.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 600;
const MAX_STATUS_TEXT = 40;

export const TEXT = {
  empty: {
    en: 'No station yet: fill in the configuration of the SNOTEL integration, then create the devices in the Discover tab.',
    fr: "Aucune station pour l'instant : remplissez la configuration de l'intégration SNOTEL, puis créez les appareils dans l'onglet Découverte.",
    de: 'Noch keine Station: Fülle die Konfiguration der Integration SNOTEL aus und lege dann die Geräte im Tab „Entdecken“ an.',
    es: 'Aún no hay estaciones: rellene la configuración de la integración SNOTEL y, después, cree los dispositivos en la pestaña Descubrir.',
  },
  gone: {
    en: 'This station is no longer followed.',
    fr: "Cette station n'est plus suivie.",
    de: 'Diese Station wird nicht mehr verfolgt.',
    es: 'Esta estación ya no se sigue.',
  },
  snowDepth: { en: 'Snow depth', fr: 'Neige au sol', de: 'Schneehöhe', es: 'Espesor' },
  newSnow: { en: 'New snow 24 h', fr: 'Fraîche 24 h', de: 'Neuschnee 24 h', es: 'Nueva 24 h' },
  swe: { en: 'Water equiv.', fr: 'Équiv. en eau', de: 'Wasseräquiv.', es: 'Equiv. en agua' },
  percent: {
    en: '% of median',
    fr: '% de la médiane',
    de: '% des Medians',
    es: '% de la mediana',
  },
  temperature: { en: 'Air', fr: 'Air', de: 'Luft', es: 'Aire' },
  noSnow: { en: 'No snow', fr: 'Pas de neige', de: 'Kein Schnee', es: 'Sin nieve' },
  lastReading: {
    en: 'Last reading',
    fr: 'Dernière mesure',
    de: 'Letzte Messung',
    es: 'Última medición',
  },
  silent: {
    en: 'Silent since ',
    fr: 'Muette depuis le ',
    de: 'Still seit ',
    es: 'Sin datos desde ',
  },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  source: {
    en: 'Source: USDA NRCS SNOTEL',
    fr: 'Source : USDA NRCS SNOTEL',
    de: 'Quelle: USDA NRCS SNOTEL',
    es: 'Fuente: USDA NRCS SNOTEL',
  },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const fellSnow = (view) => (view.values.new_snow_24h.value ?? 0) > 0;

/** The status value of a station, e.g. "152 cm · +18 cm" (40 characters at most). */
export function stationValue(view, language) {
  if (view.lastReadingAt === null) {
    return t(TEXT.waiting, language);
  }
  if (!view.fresh) {
    return clip(`${t(TEXT.silent, language)}${formatDate(view.lastReadingAt, language)}`);
  }
  const { snow_depth: depth, new_snow_24h: fresh, air_temperature: air } = view.values;
  if (depth.value === null) {
    // A station without snow sensor (or with its sensor down): the temperature.
    return air.value === null
      ? t(TEXT.unknown, language)
      : formatValue(air.value, air.unit, language);
  }
  if (depth.value === 0) {
    return t(TEXT.noSnow, language);
  }
  const parts = [formatValue(depth.value, depth.unit, language)];
  if (fresh.value > 0) {
    parts.push(`+${formatValue(fresh.value, fresh.unit, language)}`);
  }
  return clip(parts.join(' · '));
}

function footer(monitor, triplets, language) {
  const updated = monitor.updatedAt(triplets);
  const source = t(TEXT.source, language);
  return [
    {
      type: 'text',
      variant: 'caption',
      text: updated === null ? source : `${source} · ${formatDate(updated, language)}`,
    },
  ];
}

function overview(monitor, triplets, language) {
  const views = triplets.slice(0, MAX_STATUS_ITEMS).map((triplet) => monitor.view(triplet));
  return [
    {
      type: 'status',
      items: views.map((view) => ({
        label: clip(view.name),
        value: stationValue(view, language),
        color: view.fresh && fellSnow(view) ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
        icon: !view.fresh ? 'clock' : fellSnow(view) ? 'cloud-snow' : 'minus',
      })),
    },
    ...footer(monitor, triplets, language),
  ];
}

function detail(monitor, triplet, language) {
  const view = monitor.view(triplet);
  const ids = stationIds(monitor.gladys, triplet);
  const components = [];
  const tile = (key, label) => {
    if (view.has[key]) {
      components.push({ type: 'value', label: t(label, language), device_feature: ids[key] });
    }
  };
  tile('snow_depth', TEXT.snowDepth);
  tile('new_snow_24h', TEXT.newSnow);
  tile('snow_water_equivalent', TEXT.swe);
  const items = [];
  if (view.has.swe_percent_of_median) {
    const pct = view.values.swe_percent_of_median.value;
    items.push({
      label: t(TEXT.percent, language),
      value: pct === null ? t(TEXT.unknown, language) : `${pct} %`,
      color: WIDGET_COLORS.NEUTRAL,
      icon: 'bar-chart-2',
    });
  }
  if (view.has.air_temperature) {
    const air = view.values.air_temperature;
    items.push({
      label: t(TEXT.temperature, language),
      value:
        air.value === null ? t(TEXT.unknown, language) : formatValue(air.value, air.unit, language),
      color: WIDGET_COLORS.NEUTRAL,
      icon: 'thermometer',
    });
  }
  items.push({
    label: t(TEXT.lastReading, language),
    value:
      view.lastReadingAt === null
        ? t(TEXT.waiting, language)
        : formatDate(view.lastReadingAt, language),
    color: view.fresh ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    icon: 'clock',
  });
  components.push({ type: 'status', items });
  return [...components, ...footer(monitor, [triplet], language)];
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en' }) {
      const lang = TEXT.empty[language] ? language : 'en';
      const created = monitor.created();
      const chosen = typeof settings?.station === 'string' ? settings.station : null;
      if (chosen) {
        const triplet = tripletOfId(monitor.gladys, chosen);
        const components =
          triplet && created.includes(triplet)
            ? detail(monitor, triplet, lang)
            : [{ type: 'text', variant: 'body', text: t(TEXT.gone, lang) }];
        return { ttl_seconds: TTL_SECONDS, components };
      }
      if (created.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, lang) }],
        };
      }
      return { ttl_seconds: TTL_SECONDS, components: overview(monitor, created, lang) };
    },
  },
};
