import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData, candlesFromTrades } from '../src/model.js';

test('Book Replay recorded-trade export renders without losing direction or native price basis', () => {
  const input = JSON.parse(readFileSync(new URL('../examples/recorded-trades.json', import.meta.url), 'utf8'));
  const data = validateData(input);
  assert.equal(data.instrument, 'SYNTHETIC-DEMO DOWN (synthetic-round)');
  assert.equal(data.snapshots.length, 1);
  assert.equal(data.snapshots[0].bids[0].price, '0.5600');
  assert.deepEqual(data.trades.map(trade => trade.side), ['buy', 'unknown', 'sell', 'sell']);
  assert.deepEqual(data.trades.map(trade => trade.id), ['hist_trades:3', 'hist_trades:4', 'hist_trades:7', 'hist_trades:1']);
  assert.equal(data.trades[0].price, '0.58');
  const candles = candlesFromTrades(data.trades, 1000);
  assert.equal(candles.length, 3);
  assert.equal(candles[1].count, 2);
  assert.equal(candles[1].open, 0.59);
  assert.equal(candles[1].close, 0.60);
  assert.deepEqual(Object.keys(data.trades[0]), ['id', 'timestamp_ms', 'price', 'size', 'side']);
});
