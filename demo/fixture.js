// Deterministic synthetic example: never used as a fallback for failed imports.
export function createFixture() {
  const start = Date.UTC(2026, 0, 15, 9, 30);
  const snapshots = [], trades = [];
  for (let i = 0; i < 120; i++) {
    const mid = 100 + Math.sin(i / 14) * 0.2 + Math.sin(i / 5) * 0.04 + i * 0.0015;
    if (i < 48 || i > 58) {
      const levels = direction => Array.from({ length: 12 }, (_, j) => ({
        price: (Math.round(mid * 100) / 100 + direction * (j + 1) * 0.01).toFixed(2),
        size: String(Math.round(12 + (Math.sin(i / 11 + j) + 1) * 30 + (j === 5 ? 180 : 0))),
      }));
      snapshots.push({ sequence: i + 1, timestamp_ms: start + i * 1000, bids: levels(-1), asks: levels(1) });
    }
    const side = i % 11 === 0 ? 'unknown' : i % 3 === 0 ? 'sell' : 'buy';
    trades.push({
      id: `demo-${String(i + 1).padStart(3, '0')}`, timestamp_ms: start + i * 1000 + 250,
      price: (mid + (side === 'buy' ? 0.012 : -0.012)).toFixed(3),
      size: String(4 + (i * 37) % 110 + (i % 17 === 0 ? 200 : 0)), side,
    });
  }
  return { schema_version: 1, instrument: 'DEMO / USD', description: 'Synthetic two-minute recording. An intentional book-data gap occurs from 09:30:48.5 to 09:30:59 UTC; trades continue independently.', snapshots, trades };
}
