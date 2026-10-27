import { setupCanvas, formatPrice } from './canvas.js';
import { scales, inside, moveView } from './geometry.js';
import { validateData, dataBounds, snapshotIndex, timestamp } from './model.js';
import { drawAxes, drawHeatmap, drawCandles, drawTrades, drawCrosshair } from './layers.js';
export { fromReplayReport } from './model.js';

/** Rendering only. The host supplies normalized data and owns replay time. */
export class OrderflowChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = { priceStep: 0.01, holdMs: 1500, candleMs: 5000, ...options };
    for (const key of ['priceStep', 'holdMs', 'candleMs']) {
      if (!Number.isFinite(this.options[key]) || this.options[key] <= 0) throw new Error(`${key} must be positive.`);
    }
    if (!Number.isSafeInteger(this.options.holdMs) || !Number.isSafeInteger(this.options.candleMs)) {
      throw new Error('Hold and candle intervals must be integer milliseconds.');
    }
    this.layers = { heatmap: true, trades: true, candles: true };
    this.cursor = Infinity; this.point = null; this.hits = []; this.pending = 0;
    this.listeners = new AbortController();
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Liquidity and trade chart. Arrow keys pan, plus and minus zoom, Home fits the recording.');
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(canvas);
    this.bind();
  }

  setData(input) {
    const data = validateData(input);
    const bounds = dataBounds(data, this.options.holdMs, this.options.priceStep);
    if (bounds.to <= bounds.from || !Number.isFinite(bounds.high - bounds.low)) throw new Error('Recording has an unsupported display range.');
    let liquidityReference = 1, tradeReference = 1;
    for (const row of data.snapshots) {
      for (const level of [...row.bids, ...row.asks]) liquidityReference = Math.max(liquidityReference, Number(level.size));
    }
    for (const trade of data.trades) tradeReference = Math.max(tradeReference, Number(trade.size));
    this.data = data; this.bounds = bounds;
    this.options.liquidityReference = liquidityReference; this.options.tradeReference = tradeReference;
    this.cursor = Infinity; this.point = null; this.hits = [];
    this.fit();
  }

  setCursor(time = null) {
    if (time !== null) timestamp(time, 'Replay cursor');
    this.cursor = time ?? Infinity; this.point = null; this.schedule();
  }

  setLayers(layers) {
    for (const [key, value] of Object.entries(layers)) {
      if (!(key in this.layers) || typeof value !== 'boolean') throw new Error('Unknown layer or invalid visibility.');
    }
    Object.assign(this.layers, layers); this.point = null; this.schedule();
  }

  fit() {
    if (!this.bounds) return;
    this.view = { ...this.bounds }; this.changed();
  }

  getViewport() { return this.view ? { ...this.view } : null; }

  zoom(factor, anchor = (this.view.from + this.view.to) / 2) {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('Zoom factor must be positive.');
    const span = this.view.to - this.view.from;
    const nextSpan = span * factor;
    this.view = moveView(this.view, this.bounds, anchor - (anchor - this.view.from) * factor, nextSpan);
    this.changed();
  }

  pan(fraction) {
    if (!Number.isFinite(fraction)) throw new Error('Pan fraction must be finite.');
    const span = this.view.to - this.view.from;
    this.view = moveView(this.view, this.bounds, this.view.from + span * fraction, span);
    this.changed();
  }

  inspectTrade(id) {
    const trade = this.data?.trades.find(row => row.id === id && row.timestamp_ms <= this.cursor);
    if (!trade) return;
    const span = this.view.to - this.view.from;
    if (trade.timestamp_ms < this.view.from || trade.timestamp_ms > this.view.to) {
      this.view = moveView(this.view, this.bounds, trade.timestamp_ms - span / 2, span);
      this.changed();
    }
    this.point = { time: trade.timestamp_ms, price: Number(trade.price) };
    this.options.onInspect?.({ type: 'trade', ...trade }); this.schedule();
  }

  changed() {
    this.point = null; this.schedule();
    this.options.onViewportChange?.(this.getViewport());
  }

  schedule() {
    if (this.destroyed || this.pending) return;
    this.pending = requestAnimationFrame(() => { this.pending = 0; this.render(); });
  }

  render() {
    if (!this.data) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const ctx = setupCanvas(this.canvas);
    this.geometry = scales(this.view, width, height);
    drawAxes(ctx, this.geometry, this.view, width, height);
    const { plot } = this.geometry;
    ctx.save(); ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top); ctx.clip();
    if (this.layers.heatmap) drawHeatmap(ctx, this.data, this.geometry, this.view, this.options, this.cursor);
    if (this.layers.candles) drawCandles(ctx, this.data, this.geometry, this.view, this.options, this.cursor);
    this.hits = this.layers.trades ? drawTrades(ctx, this.data, this.geometry, this.view, this.options, this.cursor) : [];
    drawCrosshair(ctx, this.geometry, this.point, this.cursor);
    ctx.restore();
  }

  hover(x, y) {
    const g = this.geometry;
    if (!g || !inside(g, x, y)) { this.point = null; this.schedule(); return; }
    const time = Math.round(g.time(x)), price = g.price(y);
    this.point = { time, price };
    let hit = null, distance = Infinity;
    for (const candidate of this.hits) {
      const d = Math.hypot(x - candidate.x, y - candidate.y);
      if (d <= candidate.radius + 3 && d <= distance) { hit = candidate; distance = d; }
    }
    if (hit) this.options.onInspect?.({ type: 'trade', ...hit.trade });
    else {
      const snapshot = this.data.snapshots[snapshotIndex(this.data.snapshots, time)];
      const active = this.layers.heatmap && time <= this.cursor && snapshot && time < snapshot.timestamp_ms + this.options.holdMs;
      let level = null;
      if (active) {
        for (const side of ['bids', 'asks']) {
          const match = snapshot[side].find(row => Number(row.size) > 0 && Math.abs(Number(row.price) - price) <= this.options.priceStep / 2);
          if (match) { level = { ...match, side, sequence: snapshot.sequence, observed_ms: snapshot.timestamp_ms }; break; }
        }
      }
      this.options.onInspect?.({ type: level ? 'liquidity' : 'position', timestamp_ms: time, price: formatPrice(price), ...level, bookAvailable: Boolean(active) });
    }
    this.schedule();
  }

  bind() {
    const on = (name, listener, extra = {}) => this.canvas.addEventListener(name, listener, { signal: this.listeners.signal, ...extra });
    const position = event => {
      const rect = this.canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    on('pointerdown', event => {
      if (event.button !== 0 || !this.geometry || !inside(this.geometry, ...position(event))) return;
      this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: position(event)[0], view: { ...this.view } };
    });
    on('pointermove', event => {
      const [x, y] = position(event);
      if (this.drag) {
        const span = this.drag.view.to - this.drag.view.from;
        const delta = (x - this.drag.x) / (this.geometry.plot.right - this.geometry.plot.left) * span;
        this.view = moveView(this.view, this.bounds, this.drag.view.from - delta, span); this.changed();
      } else this.hover(x, y);
    });
    on('pointerup', () => { this.drag = null; });
    on('pointercancel', () => { this.drag = null; });
    on('lostpointercapture', () => { this.drag = null; });
    on('pointerleave', () => { if (!this.drag) { this.point = null; this.schedule(); } });
    on('wheel', event => {
      if (!this.geometry || !inside(this.geometry, ...position(event))) return;
      event.preventDefault();
      this.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.001))), this.geometry.time(position(event)[0]));
    }, { passive: false });
    on('keydown', event => {
      if (!this.data || event.ctrlKey || event.metaKey || event.altKey) return;
      const actions = { ArrowLeft: () => this.pan(-0.2), ArrowRight: () => this.pan(0.2), '+': () => this.zoom(0.7), '=': () => this.zoom(0.7), '-': () => this.zoom(1.4), Home: () => this.fit() };
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    });
  }

  destroy() {
    this.destroyed = true; this.listeners.abort(); this.observer.disconnect();
    cancelAnimationFrame(this.pending); this.hits = []; this.data = null;
  }
}
