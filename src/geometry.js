import { linearScale } from './canvas.js';

export function scales(view, width, height) {
  const plot = { left: 18, right: Math.max(40, width - 82), top: 25, bottom: Math.max(50, height - 38) };
  return {
    plot,
    x: linearScale([view.from, view.to], [plot.left, plot.right]),
    y: linearScale([view.low, view.high], [plot.bottom, plot.top]),
    time: linearScale([plot.left, plot.right], [view.from, view.to]),
    price: linearScale([plot.bottom, plot.top], [view.low, view.high]),
  };
}

export function moveView(view, bounds, from, span) {
  span = Math.max(Math.min(10, bounds.to - bounds.from), Math.min(span, bounds.to - bounds.from));
  from = Math.max(bounds.from, Math.min(from, bounds.to - span));
  return { ...view, from, to: from + span };
}

export function bubbleRadius(size, reference) {
  // Area tracks quantity until the explicit minimum/maximum readability caps.
  return Math.max(3, Math.min(18, 18 * Math.sqrt(Number(size) / reference)));
}

export function inside({ plot }, x, y) {
  return x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom;
}
