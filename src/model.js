// Input values remain decimal strings. Numbers below are display coordinates only.
const MAX_TIME = 8_640_000_000_000_000;
const MAX_LEVELS = 200_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function decimal(value, label, allowZero = false) {
  assert(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value), `${label} must be a decimal string.`);
  const number = Number(value);
  assert(Number.isFinite(number) && (allowZero ? number >= 0 : number > 0), `${label} is outside the display range.`);
  assert(number !== 0 || !/[1-9]/.test(value), `${label} is too small to display.`);
  return number;
}

export function timestamp(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME, `${label} must be Unix milliseconds.`);
  return value;
}

export function validateData(input) {
  assert(input?.schema_version === 1, 'Expected chart schema_version 1.');
  assert(typeof input.instrument === 'string' && input.instrument.trim(), 'An instrument label is required.');
  assert(typeof input.description === 'string', 'A description is required; label synthetic data explicitly.');
  assert(Array.isArray(input.snapshots) && input.snapshots.length <= 5000, 'Expected at most 5,000 snapshots.');
  assert(Array.isArray(input.trades) && input.trades.length <= 20_000, 'Expected at most 20,000 trades.');
  assert(input.snapshots.length + input.trades.length > 0, 'Supply snapshots or trades.');
  let count = 0, previousTime = -1, previousSequence = -1;
  const snapshots = input.snapshots.map((row, index) => {
    const label = `Snapshot ${index + 1}`;
    const time = timestamp(row.timestamp_ms, label);
    assert(time >= previousTime, `${label}: timestamps must not move backwards.`);
    assert(Number.isSafeInteger(row.sequence) && row.sequence > previousSequence, `${label}: sequences must strictly increase.`);
    previousTime = time; previousSequence = row.sequence;
    const side = name => {
      assert(Array.isArray(row[name]), `${label}: ${name} must be an array.`);
      count += row[name].length;
      assert(count <= MAX_LEVELS, 'Recording exceeds 200,000 total levels.');
      const seen = new Set();
      return row[name].map(level => {
        const price = decimal(level.price, `${label} price`);
        decimal(level.size, `${label} size`, true);
        assert(!seen.has(price), `${label}: duplicate or visually indistinguishable ${name} prices.`);
        seen.add(price);
        return { price: level.price, size: level.size };
      });
    };
    return { sequence: row.sequence, timestamp_ms: time, bids: side('bids'), asks: side('asks') };
  });
  previousTime = -1;
  const ids = new Set();
  const trades = input.trades.map((row, index) => {
    const label = `Trade ${index + 1}`;
    const time = timestamp(row.timestamp_ms, label);
    assert(time >= previousTime, `${label}: timestamps must not move backwards.`);
    assert(typeof row.id === 'string' && row.id && !ids.has(row.id), `${label}: provide a unique string ID.`);
    assert(['buy', 'sell', 'unknown'].includes(row.side), `${label}: side must be buy, sell or unknown.`);
    decimal(row.price, `${label} price`); decimal(row.size, `${label} size`);
    previousTime = time; ids.add(row.id);
    return { id: row.id, timestamp_ms: time, price: row.price, size: row.size, side: row.side };
  });
  return { schema_version: 1, instrument: input.instrument, description: input.description, snapshots, trades };
}

/** A replay frame is already a complete reconstructed book, even for update events. */
export function fromReplayReport(report) {
  assert(report?.schema_version === 1 && Array.isArray(report.frames), 'Expected a Book Replay report containing frames.');
  return validateData({
    schema_version: 1, instrument: report.instrument, description: report.description,
    snapshots: report.frames.map(frame => ({
      sequence: frame.sequence, timestamp_ms: frame.timestamp_ms, bids: frame.bids, asks: frame.asks,
    })),
    trades: [],
  });
}

/** Explicit UTC buckets. Equal-time trades retain input order; empty buckets stay empty. */
export function candlesFromTrades(trades, intervalMs, cursor = Infinity) {
  assert(Number.isSafeInteger(intervalMs) && intervalMs > 0, 'Candle interval must be positive milliseconds.');
  const candles = [];
  for (const trade of trades) {
    if (trade.timestamp_ms > cursor) break;
    const start = Math.floor(trade.timestamp_ms / intervalMs) * intervalMs;
    const price = Number(trade.price);
    let candle = candles.at(-1);
    if (!candle || candle.start !== start) {
      candle = { start, end: start + intervalMs, open: price, high: price, low: price, close: price, count: 0 };
      candles.push(candle);
    }
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price; candle.count++;
  }
  return candles;
}

/** Rightmost snapshot at/before time. Equal-time snapshots use the final arrival. */
export function snapshotIndex(snapshots, time) {
  let low = 0, high = snapshots.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (snapshots[mid].timestamp_ms <= time) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

export function snapshotIntervals(snapshots, from, to, holdMs, cursor = Infinity) {
  const intervals = [];
  const end = Math.min(to, cursor);
  for (let i = Math.max(0, snapshotIndex(snapshots, from)); i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    if (snapshot.timestamp_ms > end) break;
    const start = Math.max(from, snapshot.timestamp_ms);
    const stop = Math.min(end, snapshot.timestamp_ms + holdMs, snapshots[i + 1]?.timestamp_ms ?? Infinity);
    if (stop > start) intervals.push({ start, end: stop, snapshot });
  }
  return intervals;
}

export function dataBounds(data, holdMs, priceStep) {
  let minTime = Infinity, maxTime = -Infinity, low = Infinity, high = -Infinity;
  for (const row of [...data.snapshots, ...data.trades]) {
    minTime = Math.min(minTime, row.timestamp_ms);
    maxTime = Math.max(maxTime, row.timestamp_ms);
    const levels = row.bids ? [...row.bids, ...row.asks] : [row];
    for (const level of levels) {
      if (Number(level.size) === 0) continue;
      low = Math.min(low, Number(level.price)); high = Math.max(high, Number(level.price));
    }
  }
  if (!Number.isFinite(low)) { low = 0; high = priceStep * 10; }
  const pad = Math.max((high - low) * 0.12, priceStep * 2);
  return { from: minTime, to: Math.min(MAX_TIME, Math.max(minTime + 1, maxTime + holdMs)), low: low - pad, high: high + pad };
}
