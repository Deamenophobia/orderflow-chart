// Adapted from owner-provided Canvas 2D helpers. Private source mapping is separate.
export function setupCanvas(canvas, width = canvas.clientWidth, height = canvas.clientHeight) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pixelsWide = Math.max(1, Math.round(width * dpr));
  const pixelsHigh = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
  if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return value => r0 + (value - d0) / span * (r1 - r0);
}

export function drawLine(ctx, points, color, width = 1, dash = []) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

export const COLORS = {
  background: '#11191e', grid: '#243137', text: '#91a6af', ink: '#e7f0ed',
  bid: [36, 143, 157], ask: [207, 155, 63], buy: '#68d6ad', sell: '#f08e87',
  unknown: '#a9b3c4', crosshair: '#acb9be',
};

export function formatPrice(value) {
  return value.toLocaleString('en-US', { maximumSignificantDigits: 8 });
}

export function formatTime(value) {
  return new Date(value).toISOString().slice(11, 23);
}
