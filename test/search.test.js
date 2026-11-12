// -----------------------------------------------------------------------------
// The "Find stations" action and the parsing of the "Stations" field, on the
// recorded SNOTEL station list.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseStations } from '../src/config.js';
import { HOUSE, createWorld } from './helpers/world.js';

async function search(t, fields, options = {}) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  const ack = await world.fake.action('search_stations', fields);
  assert.equal(ack.success, true);
  return { message: ack.data.message, world };
}

test('empty: the stations around the house, nearest first, with their distance', async (t) => {
  const { message } = await search(t, {});
  const lines = message.en.split('\n');
  assert.match(
    lines[0],
    /^15 of \d+ station\(s\)\. Copy the triplets into "Stations", then save:$/,
  );
  assert.ok(lines.length > 3);
  const km = lines.slice(1).map((line) => Number(line.match(/, (\d+) km$/)[1]));
  assert.deepEqual(
    km,
    [...km].sort((a, b) => a - b),
  );
  assert.ok(km.every((d) => d <= 100));
  assert.match(lines[1], /^\d+:UT:SNTL — .+ \(UT, [\d,]+ ft \/ [\d,]+ m\), \d+ km$/);
});

test('a state and words; a number; a triplet', async (t) => {
  const { message, world } = await search(t, { state: 'UT', query: 'snowbird' });
  assert.match(message.fr, /^1 station\(s\)\. Copiez les triplets/);
  assert.match(message.fr, /766:UT:SNTL — Snowbird \(UT, 9\s170 ft \/ 2\s795 m\), \d+ km/);
  const byNumber = await world.fake.action('search_stations', { query: '1050' });
  assert.match(byNumber.data.message.en, /1050:CA:SNTL — Horse Meadow/);
  const byTriplet = await world.fake.action('search_stations', { query: '1091:ak:sntl' });
  assert.match(byTriplet.data.message.es, /1091:AK:SNTL — Independence Mine/);
});

test('a whole state lists 15 stations of its total', async (t) => {
  const { message } = await search(t, { state: 'CO' });
  assert.match(message.de, /^15 von 118 Station\(en\)/);
});

test('no house and nothing typed: asks for a location; nothing found', async (t) => {
  const { message, world } = await search(t, {}, { houses: [] });
  assert.match(message.en, /has no location in Gladys/);
  const none = await world.fake.action('search_stations', { query: 'Mont Blanc' });
  assert.equal(none.data.message.en, 'No station found.');
});

test('AWDB down: a clear message', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.api.down = 403;
  await world.gladys.connect();
  await world.app.ready;
  const ack = await world.fake.action('search_stations', { state: 'UT' });
  assert.match(ack.data.message.en, /does not answer/);
  assert.equal(HOUSE.name, 'Home');
});

test('the Stations field: triplets, numbers, page addresses and names, without duplicates', () => {
  assert.deepEqual(
    parseStations(
      '1050:ca:sntl; 766\nhttps://wcc.sc.egov.usda.gov/nwcc/site?sitenum=679, Horse Meadow, 766',
    ).map(({ kind, value }) => [kind, value]),
    [
      ['triplet', '1050:CA:SNTL'],
      ['id', '766'],
      ['id', '679'],
      ['name', 'Horse Meadow'],
    ],
  );
  assert.deepEqual(normalizeConfig({ units: 'kelvin', around_home: '7', language: 'it' }), {
    stations: [],
    homeRadiusKm: 0,
    units: 'metric',
    language: 'fr',
  });
});
