# Chart input, version 1

```json
{
  "schema_version": 1,
  "instrument": "SYNTHETIC / USD",
  "description": "Synthetic example with one full book and one trade.",
  "snapshots": [{
    "sequence": 1,
    "timestamp_ms": 1768479000000,
    "bids": [{ "price": "100.00", "size": "20.000" }],
    "asks": [{ "price": "100.02", "size": "12.000" }]
  }],
  "trades": [{
    "id": "demo-1",
    "timestamp_ms": 1768479000250,
    "price": "100.02",
    "size": "3.000",
    "side": "buy"
  }]
}
```

One dataset represents one instrument and price basis. Both arrays are required;
one may be empty. Every snapshot contains the complete book. Levels are decimal
strings; prices and trade quantities must be positive, book quantities may be
zero. Zero-size levels are not drawn. Values that overflow or underflow JavaScript
display numbers are rejected. Near-identical prices that collapse to the same
display coordinate value within a book side are rejected explicitly.

Times are nonnegative Unix milliseconds in nondecreasing order. Snapshot sequence
numbers are nonnegative safe integers that strictly increase. Equal timestamps
are allowed and are never reordered. Trade IDs must be unique strings; duplicate
rows are not silently dropped. No synthetic trades are generated from book changes.

Trade `side` is `buy`, `sell` or `unknown`. It is distinct from outcome labels such
as UP/DOWN. If a source did not record trade direction, use `unknown`. Before
combining layers, the host must put book prices and trade prices in the same
native instrument basis. This library never complements a price or infers a side.

`priceStep` specifies a heatmap band's price height; it is not inferred from the
instrument label. `holdMs` explicitly bounds how far a captured book is held
forward. The last captured book receives the same bounded hold. The demo uses
0.01 price units and 1,500 milliseconds, so other instruments may require different
embedding options. No heatmap interpolation crosses longer gaps.

Candles use integer UTC buckets: `floor(timestamp_ms / candleMs) * candleMs`.
Open/close follow supplied trade order, including ties. High/low use only trades
at or before the host's cursor. Empty buckets remain absent. Unknown-direction
trades still contribute prices to OHLC because their prices are known.

## Book Replay reports

`fromReplayReport(report)` accepts the version-1 `frames` export, retaining each
frame's sequence, timestamp and complete bids/asks. An update frame is already a
reconstructed snapshot. `metrics`, `kind` and unrelated fields are not needed by
the renderer. The adapter supplies an empty trade array; a report cannot recover
executions that were never recorded.

Raw event input containing `events` is intentionally not replayed in JavaScript.
Run it through Book Replay's existing Rust core, then import its output report.
