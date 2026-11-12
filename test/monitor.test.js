// -----------------------------------------------------------------------------
// The monitor end to end, against the SDK's fake Gladys and the fake AWDB:
// which stations are followed, the states in the units of the features, the
// new snow, the median, silent stations, the requests made, the connection
// status and the timer that refreshes without any onPoll.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HORSE_MEADOW,
  INDEPENDENCE,
  SCAN,
  SNOWBIRD,
  UNKNOWN,
  create,
  createWorld,
  cycle,
  discovered,
  featureId,
} from './helpers/world.js';

const HOUR = 3600 * 1000;

async function world(t, config, options) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

const last = (w, device, key) => w.fake.lastState(featureId(device, key));

test('stations by triplet, number, name and page address; around the house', async (t) => {
  const w = await world(t, {
    stations: `${HORSE_MEADOW}, 1091, snowbird, https://wcc.sc.egov.usda.gov/nwcc/site?sitenum=679`,
    around_home: '50',
  });
  const triplets = w.fake.discoveredDevices.map(
    (d) => d.params.find((p) => p.name === 'STATION_TRIPLET').value,
  );
  assert.deepEqual(triplets.slice(0, 4), [HORSE_MEADOW, INDEPENDENCE, SNOWBIRD, '679:WA:SNTL']);
  assert.equal(triplets.length, 7, 'plus the 3 stations nearest to the house');
  for (const device of w.fake.discoveredDevices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('states in metric units once the device exists', async (t) => {
  const w = await world(t, { stations: SNOWBIRD, units: 'metric', language: 'en' });
  const device = await create(w, SNOWBIRD);
  assert.equal(last(w, device, 'snow_depth'), 13, '5 in');
  assert.equal(last(w, device, 'snow_water_equivalent'), 48, '1.9 in');
  assert.equal(last(w, device, 'swe_percent_of_median'), 60, '1.8 in against a median of 3.0');
  assert.equal(last(w, device, 'air_temperature'), 7.7, '45.9 °F');
  assert.equal(last(w, device, 'new_snow_24h'), 0);
  assert.equal(featureId(device, 'snow_depth').endsWith(':station:766-UT-SNTL:snow_depth'), true);
  assert.match(String(last(w, device, 'last_reading')), /^11\/12, 12:00 AM$/);
});

test('states in imperial units, as NRCS publishes them', async (t) => {
  const w = await world(t, { stations: SNOWBIRD, units: 'imperial' });
  const device = await create(w, SNOWBIRD);
  assert.deepEqual(device.features.map((f) => f.unit).filter(Boolean), [
    'inch',
    'inch',
    'inch',
    'percent',
    'fahrenheit',
  ]);
  assert.equal(last(w, device, 'snow_depth'), 5);
  assert.equal(last(w, device, 'snow_water_equivalent'), 1.9);
  assert.equal(last(w, device, 'air_temperature'), 45.9);
});

test('a device keeps its units when the setting changes', async (t) => {
  const w = await world(t, { stations: SNOWBIRD, units: 'imperial' });
  const device = await create(w, SNOWBIRD);
  await w.fake.configUpdated({ stations: SNOWBIRD, units: 'metric' });
  w.api.addHourly(SNOWBIRD, 'SNWD', w.clock.now(), 10);
  w.api.addHourly(SNOWBIRD, 'SNWD', w.clock.now() + HOUR, 10);
  await cycle(w);
  await cycle(w);
  assert.equal(last(w, device, 'snow_depth'), 10, 'still in inches');
  assert.equal(discovered(w, SNOWBIRD).features[0].unit, 'cm', 'proposed as an update');
});

test('a snowfall shows as new snow, then fades after 24 hours', async (t) => {
  const w = await world(t, { stations: SNOWBIRD, units: 'imperial' });
  const device = await create(w, SNOWBIRD);
  const depths = [6, 9, 12, 14, 15, 15];
  for (const depth of depths) {
    w.clock.advance(HOUR);
    w.api.addHourly(SNOWBIRD, 'SNWD', w.clock.now(), depth);
    await w.monitor.runCycle();
  }
  assert.equal(last(w, device, 'snow_depth'), 15);
  assert.equal(last(w, device, 'new_snow_24h'), 10, 'from 5 inches');
  for (let i = 0; i < 26; i += 1) {
    w.clock.advance(HOUR);
    w.api.addHourly(SNOWBIRD, 'SNWD', w.clock.now(), 15);
    await w.monitor.runCycle();
  }
  assert.equal(last(w, device, 'new_snow_24h'), 0);
});

test('Alaska: no median, no percentage feature; times at UTC-9', async (t) => {
  const w = await world(t, { stations: INDEPENDENCE, language: 'fr' });
  const device = await create(w, INDEPENDENCE);
  assert.equal(featureId(device, 'swe_percent_of_median'), undefined);
  assert.equal(last(w, device, 'snow_depth'), 74, '29 in');
  assert.deepEqual(
    device.features.map((f) => f.name),
    [
      'Hauteur de neige',
      'Neige fraîche (24 h)',
      'Équivalent en eau de la neige',
      "Température de l'air",
      'Dernière mesure',
    ],
  );
});

test('a station without snow sensor gives its temperature only', async (t) => {
  const w = await world(t, { stations: SCAN });
  const device = await create(w, SCAN);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    ['air_temperature', 'last_reading'],
  );
  assert.equal(last(w, device, 'air_temperature'), 14.8, '58.6 °F');
});

test('a declared but silent snow depth sensor publishes no depth', async (t) => {
  const w = await world(t, { stations: HORSE_MEADOW });
  const device = await create(w, HORSE_MEADOW);
  assert.ok(featureId(device, 'snow_depth'));
  assert.equal(last(w, device, 'snow_depth'), undefined);
  assert.equal(last(w, device, 'snow_water_equivalent'), 5);
});

test('a silent station stops its values and says since when', async (t) => {
  const w = await world(t, { stations: SNOWBIRD, language: 'en' });
  const device = await create(w, SNOWBIRD);
  const count = () =>
    w.fake.states.filter((s) => s.device_feature_external_id === featureId(device, 'snow_depth'))
      .length;
  const before = count();
  for (let i = 0; i < 14; i += 1) {
    await cycle(w);
  }
  assert.equal(count(), before, 'no stale depth sent as fresh');
  assert.match(String(last(w, device, 'last_reading')), /^No new reading since 11\/12/);
});

test('onDeviceCreated publishes everything again and refreshes the widget', async (t) => {
  const w = await world(t, { stations: SNOWBIRD });
  const refresh = t.mock.method(w.gladys, 'requestWidgetRefresh');
  w.clock.advance(HOUR);
  const device = await create(w, SNOWBIRD);
  assert.ok(last(w, device, 'snow_depth') !== undefined);
  assert.ok(refresh.mock.callCount() >= 1);
  assert.equal(refresh.mock.calls[0].arguments[0], 'snowpack');
});

test('requests: one per hour, plus the median every 6 hours and the metadata once a day', async (t) => {
  const w = await world(t, { stations: `${SNOWBIRD}, ${SCAN}` });
  const kind = (url) =>
    url.pathname.endsWith('/stations') ? 'metadata' : url.searchParams.get('duration');
  assert.deepEqual(w.api.requests.map(kind), ['metadata', 'HOURLY', 'DAILY']);
  assert.equal(w.api.requests[2].searchParams.get('stationTriplets'), SNOWBIRD, 'only with WTEQ');
  w.api.requests.length = 0;
  for (let i = 0; i < 24; i += 1) {
    await cycle(w);
  }
  const kinds = w.api.requests.map(kind);
  assert.equal(kinds.filter((k) => k === 'HOURLY').length, 24);
  assert.equal(kinds.filter((k) => k === 'DAILY').length, 4);
  assert.equal(kinds.filter((k) => k === 'metadata').length, 1);
});

test('the container refreshes on its own timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const w = await world(t, { stations: SNOWBIRD }, { timers: true });
  const poll = t.mock.method(w.monitor, 'poll');
  w.api.requests.length = 0;
  w.clock.advance(HOUR);
  t.mock.timers.tick(HOUR);
  await w.monitor.running;
  assert.equal(poll.mock.callCount(), 0);
  assert.ok(w.api.requests.some((url) => url.searchParams.get('duration') === 'HOURLY'));
});

test('onPoll fallback: reads again only when the last cycle is old', async (t) => {
  const w = await world(t, { stations: SNOWBIRD });
  const device = await create(w, SNOWBIRD);
  w.api.requests.length = 0;
  await w.monitor.poll(device);
  assert.equal(w.api.requests.length, 0);
  w.clock.advance(HOUR);
  await w.monitor.poll(device);
  assert.ok(w.api.requests.length > 0);
});

test('connection status: unknown station, AWDB down, no station, no house', async (t) => {
  const w = await world(t, { stations: `${SNOWBIRD}, ${UNKNOWN}, Nowhere` });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.match(w.fake.connectionStatus.message.en, /Unknown station: Nowhere, 9999:ZZ:SNTL/);
  assert.equal(discovered(w, UNKNOWN), undefined);
  w.api.down = 403;
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas/);
  assert.equal(typeof w.fake.connectionStatus.message, 'object');

  const empty = await world(t, {});
  assert.match(empty.fake.connectionStatus.message.en, /No station yet/);

  const homeless = await world(t, { around_home: '100' }, { houses: [] });
  assert.match(homeless.fake.connectionStatus.message.en, /give your house a location/);
});

test('deleting a device stops following a station only followed through it', async (t) => {
  const w = await world(t, { stations: SNOWBIRD });
  const device = await create(w, SNOWBIRD);
  await w.fake.configUpdated({ stations: '' });
  assert.ok(discovered(w, SNOWBIRD), 'still followed: the device exists');
  await w.fake.deviceDeleted(device);
  assert.equal(discovered(w, SNOWBIRD), undefined);
});

test('medians refused: the hourly values and the status stay, the station waits', async (t) => {
  const w = await createWorld({ connect: false });
  t.after(() => w.app.stop());
  const fetch = w.api.fetch;
  let refuseDaily = true;
  w.api.fetch = async (input) =>
    refuseDaily && new URL(input).searchParams.get('duration') === 'DAILY'
      ? { status: 403, text: async () => 'Forbidden' }
      : fetch(input);
  const v = await world(t, { stations: `${SNOWBIRD}, ${SCAN}` }, { api: w.api });
  assert.equal(v.fake.connectionStatus.connected, true);
  assert.equal(discovered(v, SNOWBIRD), undefined, 'not proposed before its median is known');
  assert.ok(discovered(v, SCAN), 'a station without snow water is proposed at once');
  assert.match(v.fake.connectionStatus.message.en, /medians cannot be read yet/);
  refuseDaily = false;
  await cycle(v);
  const device = await create(v, SNOWBIRD);
  assert.equal(last(v, device, 'swe_percent_of_median'), 60);
});

test('the percentage of the median is capped at the bound of the feature', async (t) => {
  const api = (await import('./helpers/world.js')).createApi();
  const day = api.daily.find((s) => s.stationTriplet === SNOWBIRD).data[0].values.at(-1);
  day.value = 5;
  day.median = 0.1;
  const w = await world(t, { stations: SNOWBIRD }, { api });
  const device = await create(w, SNOWBIRD);
  assert.equal(last(w, device, 'swe_percent_of_median'), 300);
});

test('emptying the configuration clears a past AWDB failure', async (t) => {
  const w = await world(t, { stations: SNOWBIRD });
  w.api.down = 403;
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  w.api.down = false;
  await w.fake.configUpdated({ stations: '' });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.match(w.fake.connectionStatus.message.en, /No station yet/);
});
