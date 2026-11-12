// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action
// messages), in the four languages of the Gladys interface. Entries are
// strings or functions of one parameter object. German says "du", Spanish
// "usted".
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

// Values of the "Last reading" feature.
export const READINGS = {
  en: { staleSince: ({ date }) => `No new reading since ${date}` },
  fr: { staleSince: ({ date }) => `Pas de nouvelle mesure depuis le ${date}` },
  de: { staleSince: ({ date }) => `Keine neue Messung seit ${date}` },
  es: { staleSince: ({ date }) => `Sin nueva medición desde el ${date}` },
};

// Connection status of the Configuration screen.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    down: 'The NRCS service (AWDB) does not answer: the readings will come back with it.',
    unknown: ({ names }) => `Unknown station: ${names}. Use "Find stations".`,
    homeFailed:
      'Around my house: the nearest stations cannot be chosen yet, tried again at the next refresh.',
    noHouse: 'Around my house: give your house a location in Gladys (Settings, Houses).',
    tooMany: ({ max }) => `Only the first ${max} stations are followed.`,
    none: 'No station yet: fill in the configuration, or use "Find stations".',
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    down: 'Le service du NRCS (AWDB) ne répond pas : les mesures reviendront avec lui.',
    unknown: ({ names }) => `Station inconnue : ${names}. Utilisez « Chercher des stations ».`,
    homeFailed:
      'Autour de ma maison : les stations les plus proches ne peuvent pas encore être choisies, nouvel essai à la prochaine mise à jour.',
    noHouse:
      'Autour de ma maison : indiquez la position de votre maison dans Gladys (Paramètres, Maisons).',
    tooMany: ({ max }) => `Seules les ${max} premières stations sont suivies.`,
    none: 'Aucune station : remplissez la configuration, ou utilisez « Chercher des stations ».',
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    down: 'Der Dienst des NRCS (AWDB) antwortet nicht: Die Messwerte kommen mit ihm zurück.',
    unknown: ({ names }) => `Unbekannte Station: ${names}. Nutze „Stationen suchen“.`,
    homeFailed:
      'Rund um mein Haus: Die nächsten Stationen können noch nicht gewählt werden, neuer Versuch bei der nächsten Aktualisierung.',
    noHouse: 'Rund um mein Haus: Gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser).',
    tooMany: ({ max }) => `Nur die ersten ${max} Stationen werden verfolgt.`,
    none: 'Noch keine Station: Fülle die Konfiguration aus oder nutze „Stationen suchen“.',
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    down: 'El servicio del NRCS (AWDB) no responde: las mediciones volverán con él.',
    unknown: ({ names }) => `Estación desconocida: ${names}. Use «Buscar estaciones».`,
    homeFailed:
      'Alrededor de mi casa: aún no se pueden elegir las estaciones más cercanas, nuevo intento en la próxima actualización.',
    noHouse: 'Alrededor de mi casa: indique la ubicación de su casa en Gladys (Ajustes, Casas).',
    tooMany: ({ max }) => `Solo se siguen las ${max} primeras estaciones.`,
    none: 'Aún no hay estaciones: rellene la configuración o use «Buscar estaciones».',
  },
};

// Messages of the "Find stations" action.
export const SEARCH = {
  en: {
    noHouse:
      'Your house has no location in Gladys: pick a state, or type a station name, number or triplet.',
    none: 'No station found.',
    found: ({ count, total }) =>
      `${total > count ? `${count} of ${total}` : count} station(s). Copy the triplets into "Stations", then save:`,
    unavailable: 'The NRCS service does not answer, try again in a few minutes.',
  },
  fr: {
    noHouse:
      "Votre maison n'a pas de position dans Gladys : choisissez un État, ou tapez un nom, un numéro ou un triplet de station.",
    none: 'Aucune station trouvée.',
    found: ({ count, total }) =>
      `${total > count ? `${count} sur ${total}` : count} station(s). Copiez les triplets dans « Stations », puis enregistrez :`,
    unavailable: 'Le service du NRCS ne répond pas, réessayez dans quelques minutes.',
  },
  de: {
    noHouse:
      'Dein Haus hat in Gladys keinen Standort: Wähle einen Bundesstaat oder gib einen Stationsnamen, eine Nummer oder ein Triplet ein.',
    none: 'Keine Station gefunden.',
    found: ({ count, total }) =>
      `${total > count ? `${count} von ${total}` : count} Station(en). Kopiere die Triplets in „Stationen“ und speichere:`,
    unavailable: 'Der Dienst des NRCS antwortet nicht, versuche es in ein paar Minuten erneut.',
  },
  es: {
    noHouse:
      'Su casa no tiene ubicación en Gladys: elija un estado, o escriba el nombre, el número o el triplete de una estación.',
    none: 'No se ha encontrado ninguna estación.',
    found: ({ count, total }) =>
      `${total > count ? `${count} de ${total}` : count} estación(es). Copie los tripletes en «Estaciones» y guarde:`,
    unavailable: 'El servicio del NRCS no responde, inténtelo de nuevo en unos minutos.',
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

const locale = (language) => (language === 'en' ? 'en-US' : language);

/** A date in the user's time zone (TZ, set by the Gladys supervisor), e.g. "12/11 08:00". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "2,5" in French. */
export function formatNumber(value, language, digits = 1) {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);
}

// Short unit symbols of the Gladys units used here.
export const UNIT_SYMBOLS = {
  cm: 'cm',
  mm: 'mm',
  inch: 'in',
  celsius: '°C',
  fahrenheit: '°F',
  percent: '%',
};

/** A value with its unit symbol, e.g. "152 cm" or "-3,5 °C". */
export function formatValue(value, unit, language) {
  const symbol = UNIT_SYMBOLS[unit] ?? '';
  return `${formatNumber(value, language)}${symbol === '%' ? ' %' : ` ${symbol}`}`.trim();
}
