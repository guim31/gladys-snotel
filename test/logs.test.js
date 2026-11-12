// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle (a
// station going silent or coming back, the start), never one line per refresh
// cycle; a failure that repeats at every cycle is logged once, plus one line
// when it is over. Never the house coordinates: the configuration holds no
// secret, the location of the home is the sensitive data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, SNOWBIRD, captureLogs, create, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function followed(t, config = {}) {
  const world = await createWorld({ config: { stations: SNOWBIRD, around_home: '50', ...config } });
  t.after(() => world.app.stop());
  await create(world, SNOWBIRD);
  return world;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: SNOWBIRD } });
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [snotel] Started: 1 station(s) followed, refreshed every hour',
  ]);
});

test('a normal refresh cycle writes nothing at info', async (t) => {
  const world = await followed(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 8; i += 1) {
    world.api.addHourly(SNOWBIRD, 'SNWD', world.clock.now(), 6 + i);
    await cycle(world, 60);
  }
  assert.deepEqual(lines, []);
});

test('LOG_LEVEL=debug shows the cycles, never the house coordinates', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await followed(t);
  await cycle(world);
  await cycle(world);
  assert.ok(lines.filter((line) => /Refresh cycle: \d+ station/.test(line.text)).length >= 2);
  const all = lines.map((line) => line.text).join('\n');
  assert.doesNotMatch(all, new RegExp(String(HOUSE.latitude).replace('.', '\\.')));
  assert.doesNotMatch(all, new RegExp(String(HOUSE.longitude).replace('.', '\\.')));
});

test('a station going silent and coming back is one info line each', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 13; i += 1) {
    await cycle(world);
  }
  world.api.addHourly(SNOWBIRD, 'TOBS', world.clock.now(), 20);
  await cycle(world);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [snotel] Snowbird: no new reading for 12 hours',
    '[INFO] [snotel] Snowbird: readings are back',
  ]);
});

test('AWDB refusing at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t);
  const lines = captureLogs(t, 'info');
  world.api.down = 403;
  for (let i = 0; i < 4; i += 1) {
    await cycle(world);
  }
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[snotel] AWDB unreachable: wcc.sc.egov.usda.gov: HTTP 403']],
  );
  world.api.down = false;
  await cycle(world);
  assert.deepEqual(lines.slice(1).map(strip), ['[INFO] [snotel] AWDB answers again']);
});

test('states refused at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    world.api.addHourly(SNOWBIRD, 'TOBS', world.clock.now(), 20 + i);
    await cycle(world);
  }
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[snotel] Publishing the states failed: Gladys unreachable']],
  );
  publish.mock.restore();
  await cycle(world);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});

test('an unknown station is one warning, not one per cycle', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: 'Nowhere, 9999:ZZ:SNTL' } });
  t.after(() => world.app.stop());
  for (let i = 0; i < 30; i += 1) {
    await cycle(world);
  }
  assert.equal(lines.filter((line) => /Unknown station: Nowhere/.test(line.text)).length, 1);
  assert.equal(lines.filter((line) => /Unknown station: 9999:ZZ:SNTL/.test(line.text)).length, 1);
});
