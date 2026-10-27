import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData, candlesFromTrades, snapshotIntervals, fromReplayReport } from '../src/model.js';
import { moveView, bubbleRadius } from '../src/geometry.js';
import { createFixture } from '../demo/fixture.js';

test('snapshot intervals preserve arrival ties, stop at gaps and never pass the replay cursor', () => {
  const snapshots = [
    { sequence: 1, timestamp_ms: 1000 }, { sequence: 3, timestamp_ms: 2000 },
    { sequence: 4, timestamp_ms: 2000 }, { sequence: 8, timestamp_ms: 6000 },
  ];
  const result = snapshotIntervals(snapshots, 1500, 8000, 1500, 6500);
  assert.deepEqual(result.map(row => [row.start, row.end, row.snapshot.sequence]), [
    [1500, 2000, 1], [2000, 3500, 4], [6000, 6500, 8],
  ]);
  assert.deepEqual(snapshotIntervals(snapshots, 4000, 5000, 1500), []);
});

test('candles use only supplied trades in UTC buckets, preserve ties and do not leak future prices', () => {
  const trades = [
    { timestamp_ms: 1100, price: '100.20' }, { timestamp_ms: 1100, price: '100.10' },
    { timestamp_ms: 1900, price: '999.00' }, { timestamp_ms: 4000, price: '100.30' },
  ];
  assert.deepEqual(candlesFromTrades(trades, 1000, 1500), [
    { start: 1000, end: 2000, open: 100.2, high: 100.2, low: 100.1, close: 100.1, count: 2 },
  ]);
  assert.deepEqual(candlesFromTrades(trades, 1000).map(candle => candle.start), [1000, 4000]);
});

test('chart input keeps unknown directions and decimal text; replay frames do not invent trades', () => {
  const data = validateData(createFixture());
  assert.equal(data.trades[0].side, 'unknown');
  assert.equal(typeof data.snapshots[0].bids[0].price, 'string');
  const report = { schema_version: 1, instrument: 'DEMO', description: 'Synthetic', frames: data.snapshots.slice(0, 3).map(row => ({ ...row, kind: 'update' })) };
  const imported = fromReplayReport(report);
  assert.deepEqual(imported.snapshots, data.snapshots.slice(0, 3));
  assert.deepEqual(imported.trades, []);
  for (const mutate of [
    input => { input.trades[0].side = 'UP'; },
    input => { input.trades[1].id = input.trades[0].id; },
    input => { input.snapshots[1].timestamp_ms = 0; },
    input => { input.trades[0].price = 100.2; },
    input => { input.snapshots[0].bids[0].price = '1e2'; },
  ]) {
    const input = createFixture(); mutate(input); assert.throws(() => validateData(input));
  }
});

test('viewport stays in the recording and bubble area reflects size between explicit caps', () => {
  const bounds = { from: 1000, to: 2000, low: 1, high: 2 };
  assert.deepEqual(moveView(bounds, bounds, 500, 300), { ...bounds, from: 1000, to: 1300 });
  assert.deepEqual(moveView(bounds, bounds, 1900, 300), { ...bounds, from: 1700, to: 2000 });
  assert.equal(bubbleRadius('4', 100) / bubbleRadius('1', 100), 1.2); // 1 unit hits the 3px floor.
  assert.equal(bubbleRadius('100', 100) / bubbleRadius('25', 100), 2);
  assert.equal(bubbleRadius('1000', 100), 18);
});
