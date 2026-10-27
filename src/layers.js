import { COLORS, drawLine, formatPrice, formatTime } from './canvas.js';
import { bubbleRadius } from './geometry.js';
import { candlesFromTrades, snapshotIntervals } from './model.js';

export function drawAxes(ctx, geometry, view, width, height) {
  const { plot, x, y } = geometry;
  ctx.fillStyle = COLORS.background; ctx.fillRect(0, 0, width, height);
  ctx.font = '11px ui-monospace, monospace'; ctx.textBaseline = 'middle';
  const roughStep = (view.high - view.low) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= roughStep) * magnitude;
  const first = Math.ceil(view.low / step) * step;
  for (let i = 0; i < 12 && first + step * i <= view.high; i++) {
    const price = first + step * i;
    drawLine(ctx, [{ x: plot.left, y: y(price) }, { x: plot.right, y: y(price) }], COLORS.grid);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
    ctx.fillText(formatPrice(price), plot.right + 12, y(price));
  }
  const ticks = Math.max(2, Math.min(6, Math.floor((plot.right - plot.left) / 135)));
  for (let i = 0; i <= ticks; i++) {
    const time = view.from + (view.to - view.from) * i / ticks;
    drawLine(ctx, [{ x: x(time), y: plot.top }, { x: x(time), y: plot.bottom }], COLORS.grid);
    ctx.fillStyle = COLORS.text; ctx.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
    ctx.fillText(formatTime(time).slice(0, (view.to - view.from) < 10000 ? 12 : 8), x(time), height - 14);
  }
  ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
  ctx.fillText('PRICE', plot.right + 12, 11);
  ctx.fillText('UTC', plot.left, 11);
}

export function drawHeatmap(ctx, data, geometry, view, options, cursor) {
  const { x, y, plot } = geometry;
  const intervals = snapshotIntervals(data.snapshots, view.from, view.to, options.holdMs, cursor);
  let covered = view.from;
  const gap = (start, end) => {
    if (end <= start) return;
    ctx.fillStyle = '#8e9eae0a'; ctx.fillRect(x(start), plot.top, x(end) - x(start), plot.bottom - plot.top);
    if (x(end) - x(start) > 80) {
      ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
      ctx.fillText('NO BOOK', (x(start) + x(end)) / 2, plot.top + 14);
    }
  };
  for (const interval of intervals) {
    gap(covered, interval.start); covered = interval.end;
    for (const [name, color] of [['bids', COLORS.bid], ['asks', COLORS.ask]]) {
      for (const level of interval.snapshot[name]) {
        const quantity = Number(level.size), price = Number(level.price);
        if (quantity === 0) continue;
        const strength = Math.log1p(quantity) / Math.log1p(options.liquidityReference);
        ctx.fillStyle = `rgba(${color.join(',')},${Math.min(0.9, 0.08 + strength * 0.82)})`;
        const top = y(price + options.priceStep / 2), bottom = y(price - options.priceStep / 2);
        ctx.fillRect(x(interval.start), top, x(interval.end) - x(interval.start), Math.max(1, bottom - top));
      }
    }
  }
  gap(covered, Math.min(view.to, cursor));
}

export function drawCandles(ctx, data, geometry, view, options, cursor) {
  const { x, y } = geometry;
  for (const candle of candlesFromTrades(data.trades, options.candleMs, cursor)) {
    if (candle.end < view.from || candle.start > view.to) continue;
    const center = x((candle.start + Math.min(candle.end, cursor)) / 2);
    const width = Math.max(1, Math.min(20, (x(Math.min(candle.end, cursor)) - x(candle.start)) * 0.5));
    const color = candle.close >= candle.open ? '#dce9e5' : '#92a3ad';
    drawLine(ctx, [{ x: center, y: y(candle.high) }, { x: center, y: y(candle.low) }], color);
    ctx.fillStyle = color;
    ctx.fillRect(center - width / 2, Math.min(y(candle.open), y(candle.close)), width, Math.max(1.5, Math.abs(y(candle.open) - y(candle.close))));
  }
}

export function drawTrades(ctx, data, geometry, view, options, cursor) {
  const hits = [];
  for (const trade of data.trades) {
    if (trade.timestamp_ms > Math.min(cursor, view.to)) break;
    if (trade.timestamp_ms < view.from) continue;
    const x = geometry.x(trade.timestamp_ms), y = geometry.y(Number(trade.price));
    const radius = bubbleRadius(trade.size, options.tradeReference);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `${COLORS[trade.side]}88`; ctx.strokeStyle = COLORS[trade.side];
    ctx.lineWidth = 1.25; ctx.fill(); ctx.stroke();
    if (trade.side === 'unknown') {
      drawLine(ctx, [{ x: x - 3, y }, { x: x + 3, y }], COLORS.ink);
    }
    hits.push({ x, y, radius, trade });
  }
  return hits;
}

export function drawCrosshair(ctx, geometry, point, cursor) {
  const { plot, x, y } = geometry;
  if (Number.isFinite(cursor) && x(cursor) >= plot.left && x(cursor) <= plot.right) {
    drawLine(ctx, [{ x: x(cursor), y: plot.top }, { x: x(cursor), y: plot.bottom }], '#e5cf9b', 1, [5, 4]);
  }
  if (!point) return;
  const px = x(point.time), py = y(point.price);
  drawLine(ctx, [{ x: px, y: plot.top }, { x: px, y: plot.bottom }], COLORS.crosshair, 1, [3, 3]);
  drawLine(ctx, [{ x: plot.left, y: py }, { x: plot.right, y: py }], COLORS.crosshair, 1, [3, 3]);
  ctx.fillStyle = '#e7f0ed'; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
  const text = `${formatTime(point.time)} · ${formatPrice(point.price)}`;
  const left = Math.max(plot.left, Math.min(px + 10, plot.right - ctx.measureText(text).width - 12));
  ctx.fillStyle = '#11191ef0'; ctx.fillRect(left - 5, plot.top + 1, ctx.measureText(text).width + 12, 23);
  ctx.fillStyle = COLORS.ink; ctx.fillText(text, left, plot.top + 13);
}
