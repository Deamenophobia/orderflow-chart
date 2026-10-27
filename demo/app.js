import { OrderflowChart, fromReplayReport } from '../src/chart.js';
import { validateData } from '../src/model.js';
import { formatTime } from '../src/canvas.js';
import { createFixture } from './fixture.js';

const $ = id => document.getElementById(id);
let data, bounds, timer = null, playStart, playTime, recentKey = null;
const chart = new OrderflowChart($('chart'), {
  priceStep: 0.01, holdMs: 1500, candleMs: 5000,
  onInspect: showDetail,
  onViewportChange: view => { $('viewport').textContent = `${formatTime(view.from)} — ${formatTime(view.to)} UTC`; },
});

function stop() { cancelAnimationFrame(timer); timer = null; $('play').textContent = 'Replay'; }
function showDetail(detail) {
  $('detail-title').textContent = detail.type === 'trade' ? `${detail.side[0].toUpperCase()}${detail.side.slice(1)} trade` : detail.type === 'liquidity' ? 'Resting liquidity' : 'Chart position';
  $('detail-hint').textContent = detail.type === 'trade' ? (detail.side === 'unknown' ? 'Trade direction was not supplied. Quantity sizes the bubble.' : 'Reported direction; quantity sizes the bubble.') : detail.type === 'liquidity' ? 'Snapshot quantity, held within the stated time limit.' : detail.bookAvailable ? 'No quoted level at this price.' : 'No known book at this position.';
  const fields = [['UTC', formatTime(detail.timestamp_ms)], ['Price', detail.price]];
  if (detail.size) fields.push(['Quantity', detail.size]);
  if (detail.id) fields.push(['Trade ID', detail.id]);
  if (detail.sequence !== undefined) fields.push(['Book side', detail.side], ['Sequence', detail.sequence], ['Observed UTC', formatTime(detail.observed_ms)]);
  $('details').replaceChildren(...fields.map(([name, value]) => {
    const row = document.createElement('div'), term = document.createElement('dt'), definition = document.createElement('dd');
    term.textContent = name; definition.textContent = String(value); row.append(term, definition); return row;
  }));
}

function listTrades(cursor = Infinity) {
  const rows = data.trades.filter(trade => trade.timestamp_ms <= cursor).slice(-8).reverse();
  const key = rows.map(trade => trade.id).join('\n');
  if (key === recentKey) return;
  recentKey = key;
  $('trade-list').replaceChildren(...rows.map(trade => {
    const button = document.createElement('button'); button.className = trade.side;
    button.textContent = `${formatTime(trade.timestamp_ms).slice(0, 8)}  ${trade.side.toUpperCase()}  ${trade.size}`;
    button.setAttribute('aria-label', `Inspect ${trade.id}, ${trade.side}, quantity ${trade.size}`);
    button.addEventListener('click', () => {
      chart.inspectTrade(trade.id);
      $('chart').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }); return button;
  }));
  if (!rows.length) $('trade-list').textContent = 'No supplied trades at this playback position.';
}

function load(input, label) {
  // Validation is atomic: failed imports leave the current chart and playback intact.
  const next = input.frames ? fromReplayReport(input) : validateData(input);
  chart.setData(next); stop(); data = next; bounds = chart.getViewport(); recentKey = null;
  $('instrument').textContent = data.instrument; $('description').textContent = data.description;
  $('source-label').textContent = label;
  $('counts').textContent = `${data.snapshots.length} snapshots · ${data.trades.length} trades · ${new Date(bounds.from).toISOString().slice(0, 10)} UTC`;
  $('availability').textContent = data.trades.length ? 'Direction missing? Neutral bubbles preserve that uncertainty.' : 'This recording contains no trades. Candles and bubbles remain empty.';
  $('scale-note').textContent = `Band height: 0.01 price units. Intensity uses log quantity / recording maximum (${chart.options.liquidityReference}). Full bubble radius at ${chart.options.tradeReference} units; radius capped at 3–18 px.`;
  $('cursor').value = 1000; $('cursor-label').textContent = 'Full recording';
  $('error').hidden = true; $('details').replaceChildren();
  $('detail-title').textContent = 'Every event has context.';
  $('detail-hint').textContent = 'Hover a bubble or liquidity band, or select a trade below.';
  listTrades();
}

function seek(time) {
  chart.setCursor(time);
  $('cursor').value = Math.round((time - bounds.from) / (bounds.to - bounds.from) * 1000);
  $('cursor-label').textContent = formatTime(time).slice(0, 8);
  listTrades(time);
}

function animate(now) {
  const current = Math.min(bounds.to, Math.round(playTime + (now - playStart) * 5));
  seek(current);
  if (current >= bounds.to) { stop(); $('cursor-label').textContent = 'Replay complete'; }
  else timer = requestAnimationFrame(animate);
}

$('sample').addEventListener('click', () => load(createFixture(), 'SYNTHETIC DEMO'));
$('file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 8 MiB.');
    load(JSON.parse(await file.text()), 'IMPORTED FILE');
  } catch (error) { $('error').textContent = `Import failed: ${error.message}`; $('error').hidden = false; }
  finally { event.target.value = ''; }
});
for (const name of ['heatmap', 'trades', 'candles']) {
  $(name).addEventListener('change', () => chart.setLayers({ [name]: $(name).checked }));
}
$('fit').addEventListener('click', () => chart.fit());
$('zoom-in').addEventListener('click', () => chart.zoom(0.6));
$('zoom-out').addEventListener('click', () => chart.zoom(1.6));
$('left').addEventListener('click', () => chart.pan(-0.2));
$('right').addEventListener('click', () => chart.pan(0.2));
$('cursor').addEventListener('input', () => { stop(); seek(Math.round(bounds.from + Number($('cursor').value) / 1000 * (bounds.to - bounds.from))); });
$('reset').addEventListener('click', () => { stop(); seek(bounds.from); });
$('play').addEventListener('click', () => {
  if (timer !== null) return stop();
  playTime = Number($('cursor').value) >= 1000 ? bounds.from : Math.round(bounds.from + Number($('cursor').value) / 1000 * (bounds.to - bounds.from));
  playStart = performance.now(); $('play').textContent = 'Pause · 5×'; timer = requestAnimationFrame(animate);
});
window.addEventListener('pagehide', () => { stop(); chart.destroy(); });
load(createFixture(), 'SYNTHETIC DEMO');
