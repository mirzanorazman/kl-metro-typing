import type { Point } from '../data/types';

export type LayoutMode = 'geo' | 'schematic';

export type Layout = Map<string, Point>;

/** Smooth ease for the layout morph. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Position-by-position interpolation between two layouts. */
export function lerpLayouts(from: Layout, to: Layout, t: number): Layout {
  const clamped = Math.max(0, Math.min(1, t));
  const out: Layout = new Map();
  for (const [id, a] of from) {
    const b = to.get(id);
    if (!b) continue;
    out.set(id, {
      x: a.x + (b.x - a.x) * clamped,
      y: a.y + (b.y - a.y) * clamped,
    });
  }
  return out;
}
