// -----------------------------------------------------------------------------
// The `snowpack` dashboard widget: the content fits the core vocabulary and
// budget (validateWidgetContent, empty array = rendered as sent), every bound
// feature exists on a published device, the name is the one given in Gladys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { MAX_STATUS_ITEMS } from '../src/widgets.js';
import { INDEPENDENCE, SCAN, SNOWBIRD, create, createWorld } from './helpers/world.js';

const HOUR = 3600 * 1000;

async function worldWith(t, triplets, config = {}) {
  const world = await createWorld({ config: { stations: triplets.join(','), ...config } });
  t.after(() => world.app.stop());
  const devices = [];
  for (const triplet of triplets) {
    devices.push(await create(world, triplet));
  }
  return { world, devices };
}

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true);
  return ack.data.content;
}

const features = (devices) =>
  new Set(devices.flatMap((device) => device.features.map((feature) => feature.external_id)));

function checkBudget(components) {
  assert.ok(components.length <= 8, `${components.length} components`);
  assert.ok(components.filter((c) => c.type === 'text').length <= 2);
}

test('overview: one line per station, valid in every language', async (t) => {
  const { world } = await worldWith(t, [SNOWBIRD, INDEPENDENCE, SCAN]);
  for (const language of LANGUAGES) {
    const { components } = await content(world, {}, language);
    assert.deepEqual(validateWidgetContent({ components }), [], language);
    checkBudget(components);
    const status = components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 3);
    for (const item of status.items) {
      assert.ok(String(item.value).length <= 40);
    }
  }
  const { components } = await content(world, {}, 'en');
  const values = components.find((c) => c.type === 'status').items.map((i) => i.value);
  assert.deepEqual(values, ['13 cm', '74 cm', '14.8 °C']);
  assert.match(components.at(-1).text, /^Source: USDA NRCS SNOTEL · 11\/12/);
});

test('overview: fresh snow turns the line to info, with the new snow', async (t) => {
  const { world } = await worldWith(t, [SNOWBIRD], { units: 'imperial' });
  for (const depth of [8, 11, 13]) {
    world.clock.advance(HOUR);
    world.api.addHourly(SNOWBIRD, 'SNWD', world.clock.now(), depth);
    await world.monitor.runCycle();
  }
  const { components } = await content(world, {}, 'en');
  const [item] = components.find((c) => c.type === 'status').items;
  assert.equal(item.value, '13 in · +6 in');
  assert.equal(item.color, WIDGET_COLORS.INFO);
  assert.equal(item.icon, 'cloud-snow');
});

test('overview: the name given in Gladys, 10 stations at most', async (t) => {
  const { world, devices } = await worldWith(t, [SNOWBIRD]);
  await world.fake.deviceUpdated({ ...devices[0], name: 'Snowbird (ski)' });
  const { components } = await content(world, {}, 'en');
  assert.equal(components.find((c) => c.type === 'status').items[0].label, 'Snowbird (ski)');
  assert.equal(MAX_STATUS_ITEMS, 10);
});

test('detail: tiles bound to existing features, median and temperature', async (t) => {
  const { world, devices } = await worldWith(t, [SNOWBIRD]);
  const { components } = await content(world, { station: devices[0].external_id }, 'en');
  assert.deepEqual(validateWidgetContent({ components }), []);
  checkBudget(components);
  const tiles = components.filter((c) => c.type === 'value');
  assert.equal(tiles.length, 3);
  const known = features(devices);
  for (const tile of tiles) {
    assert.ok(known.has(tile.device_feature), tile.device_feature);
  }
  const items = components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.map((i) => [i.label, i.value]),
    [
      ['% of median', '60 %'],
      ['Air', '7.7 °C'],
      ['Last reading', '11/12, 12:00 AM'],
    ],
  );
});

test('detail of a station without snow sensor; a deleted station; nothing yet', async (t) => {
  const { world, devices } = await worldWith(t, [SCAN]);
  const { components } = await content(world, { station: devices[0].external_id }, 'de');
  assert.equal(components.filter((c) => c.type === 'value').length, 0);
  assert.deepEqual(validateWidgetContent({ components }), []);
  const gone = await content(world, { station: `${devices[0].external_id}x` }, 'es');
  assert.equal(gone.components[0].text, 'Esta estación ya no se sigue.');
  const empty = await createWorld({ config: {} });
  t.after(() => empty.app.stop());
  const nothing = await content(empty, {}, 'fr');
  assert.match(nothing.components[0].text, /Aucune station/);
});
