// -----------------------------------------------------------------------------
// The AWDB client and the snow arithmetic, on the answers recorded from the
// real API (test/fixtures/awdb): dates in the station's standard time, missing
// hours, a station without snow sensor, an unknown triplet, the median.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Awdb, formatDate, newSnow24h, parseDate, parseStation } from '../src/awdb.js';
import {
  BERTHOUD,
  HORSE_MEADOW,
  INDEPENDENCE,
  SCAN,
  SNOWBIRD,
  START,
  UNKNOWN,
  createApi,
} from './helpers/world.js';

const HOUR = 3600 * 1000;

test('AWDB dates are in the standard time of the station', () => {
  // 23:00 Pacific standard time (UTC-8) is 07:00 UTC the next day.
  assert.equal(parseDate('2026-11-11 23:00', -8), Date.parse('2026-11-12T07:00:00Z'));
  assert.equal(parseDate('2026-11-11 22:00', -9), Date.parse('2026-11-12T07:00:00Z'));
  assert.equal(parseDate('2026-11-10', -8), Date.parse('2026-11-10T08:00:00Z'));
  assert.equal(parseDate('yesterday', -8), null);
  assert.equal(formatDate(Date.parse('2026-11-12T07:00:00Z'), -8), '2026-11-11 23:00');
});

test('the metadata says which elements a station measures; an unknown triplet is absent', async () => {
  const api = createApi();
  const awdb = new Awdb({ fetch: api.fetch });
  const found = await awdb.metadata([HORSE_MEADOW, SCAN, INDEPENDENCE, UNKNOWN], START);
  assert.deepEqual([...found.keys()].sort(), [HORSE_MEADOW, INDEPENDENCE, SCAN].sort());
  assert.deepEqual(found.get(HORSE_MEADOW).elements, { SNWD: true, WTEQ: true, TOBS: true });
  assert.deepEqual(found.get(SCAN).elements, { SNWD: false, WTEQ: false, TOBS: true });
  assert.equal(found.get(INDEPENDENCE).tz, -9);
  assert.equal(found.get(HORSE_MEADOW).name, 'Horse Meadow');
  const url = api.requests[0];
  assert.equal(url.searchParams.get('returnStationElements'), 'true');
  // AWDB's firewall answered 403 to some extra parameters: none is sent.
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'returnStationElements',
    'stationTriplets',
  ]);
});

test('an element closed in the past is not measured any more', () => {
  const station = parseStation(
    {
      stationTriplet: '1:UT:SNTL',
      name: 'Old',
      stationElements: [
        { elementCode: 'SNWD', durationName: 'HOURLY', endDate: '2015-09-30 00:00' },
        { elementCode: 'TOBS', durationName: 'DAILY', endDate: '2100-01-01 00:00' },
      ],
    },
    START,
  );
  assert.deepEqual(station.elements, { SNWD: false, WTEQ: false, TOBS: false });
  assert.equal(parseStation({ stationTriplet: 'nonsense' }), null);
});

test('hourly values: oldest first, in epoch ms, missing hours simply absent', async () => {
  const api = createApi();
  const awdb = new Awdb({ fetch: api.fetch });
  const offsets = new Map([
    [HORSE_MEADOW, -8],
    [BERTHOUD, -8],
    [SNOWBIRD, -8],
    [INDEPENDENCE, -9],
    [SCAN, -6],
  ]);
  const data = await awdb.hourly(offsets, START);
  assert.equal(data.get(HORSE_MEADOW).SNWD, undefined, 'Horse Meadow sends no snow depth');
  assert.equal(data.get(SNOWBIRD).SNWD.at(-1).v, 5);
  assert.equal(data.get(SNOWBIRD).SNWD.at(-1).t, Date.parse('2026-11-12T07:00:00Z'));
  assert.equal(data.get(INDEPENDENCE).WTEQ.at(-1).v, 8.7);
  assert.equal(data.get(INDEPENDENCE).SNWD.at(-1).t, Date.parse('2026-11-12T07:00:00Z'));
  assert.ok(data.get(BERTHOUD).SNWD.length < data.get(BERTHOUD).TOBS.length, 'gaps');
  assert.deepEqual(Object.keys(data.get(SCAN)), ['TOBS']);
  for (const series of Object.values(data.get(SNOWBIRD))) {
    assert.ok(series.every((p, i) => i === 0 || p.t > series[i - 1].t));
  }
  const url = api.requests[0];
  assert.equal(url.searchParams.get('duration'), 'HOURLY');
  assert.equal(url.searchParams.get('elements'), 'SNWD,WTEQ,TOBS');
});

test('the daily snow water equivalent comes with its median when NRCS has one', async () => {
  const api = createApi();
  const awdb = new Awdb({ fetch: api.fetch });
  const daily = await awdb.dailyMedian(
    new Map([
      [SNOWBIRD, -8],
      [INDEPENDENCE, -9],
    ]),
    START,
  );
  assert.deepEqual(daily.get(SNOWBIRD), {
    t: Date.parse('2026-11-10T08:00:00Z'),
    v: 1.8,
    median: 3,
  });
  assert.equal(daily.get(INDEPENDENCE).median, null);
  assert.equal(api.requests[0].searchParams.get('centralTendencyType'), 'MEDIAN');
});

const series = (values, step = HOUR) =>
  values.map((v, i) => ({ t: START - (values.length - 1 - i) * step, v }));

test('new snow: the depth gained over 24 hours', () => {
  const flat = Array(20).fill(30);
  // The newest depth is the median of the last three hours (40), against 30.
  assert.equal(newSnow24h(series([...flat, 31, 34, 38, 40, 41])), 10);
  // Snow fell, then settled: still counted from the lowest depth.
  assert.equal(newSnow24h(series([...flat, 36, 40, 39, 38, 37])), 8);
});

test('new snow: never negative, and one odd reading is not a snowfall', () => {
  assert.equal(newSnow24h(series([40, 39, 38, 37, ...Array(21).fill(36)])), 0);
  assert.equal(newSnow24h(series([...Array(12).fill(30), 45, ...Array(12).fill(30)])), 0);
  assert.equal(newSnow24h(series([...Array(23).fill(30), 30, 42])), 0, 'a spike at the end');
});

test('new snow: null without 20 of the 24 hours', () => {
  assert.equal(newSnow24h(series(Array(15).fill(30))), null);
  assert.equal(newSnow24h(series([30, 31])), null);
  assert.equal(newSnow24h([]), null);
  assert.equal(newSnow24h(series(Array(9).fill(30), 3 * HOUR)), 0, 'every 3 hours is enough');
});

test('HTTP failures are errors with their status, a body that is not JSON too', async () => {
  const api = createApi();
  const awdb = new Awdb({ fetch: api.fetch });
  api.down = 403;
  await assert.rejects(awdb.metadata([SNOWBIRD]), { status: 403 });
  api.down = 'network';
  await assert.rejects(awdb.metadata([SNOWBIRD]), /fetch failed/);
  const html = new Awdb({ fetch: async () => ({ status: 200, text: async () => '<html>' }) });
  await assert.rejects(html.stationList(), /not JSON/);
});
