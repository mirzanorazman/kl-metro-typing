import type { Point, ViewBox } from '../data/types';

/** Fallback box when there is nothing to frame. */
const EMPTY: ViewBox = { x: 0, y: 0, w: 1000, h: 800 };

/** Minimum span, so a single point still yields a usable box. */
const MIN_SPAN = 200;

/** Padding per side, each a fraction of the larger span. */
export interface EdgePadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

function sides(padding: number | EdgePadding): Required<EdgePadding> {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  return {
    top: padding.top ?? 0,
    right: padding.right ?? 0,
    bottom: padding.bottom ?? 0,
    left: padding.left ?? 0,
  };
}

/**
 * Smallest viewBox containing every point, plus padding.
 *
 * The SVG keeps the browser default `preserveAspectRatio="xMidYMid meet"`, so
 * whatever the container's shape, everything in this box stays visible — it is
 * letterboxed rather than cropped. That is what guarantees no station can ever
 * sit off-screen, which is exactly how the shipped build went wrong.
 *
 * @param padding fraction of the larger span to add on every side (0.08 = 8%)
 */
export function fitViewBox(
  points: readonly Point[],
  padding: number | EdgePadding,
): ViewBox {
  if (points.length === 0) return { ...EMPTY };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const w = Math.max(maxX - minX, MIN_SPAN);
  const h = Math.max(maxY - minY, MIN_SPAN);

  // Padding is asymmetric because panels cover part of the viewport: the line
  // picker sits over the right, the typing panel over the bottom. Padding that
  // side pushes the content clear of it instead of hiding it underneath.
  const base = Math.max(w, h);
  const e = sides(padding);

  // Re-centre on the true midpoint so a clamped span stays centred.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: cx - w / 2 - base * e.left,
    y: cy - h / 2 - base * e.top,
    w: w + base * (e.left + e.right),
    h: h + base * (e.top + e.bottom),
  };
}
