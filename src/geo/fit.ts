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

/** How many stations of the route stay in shot either side of the train. */
export interface FollowWindow {
  behind: number;
  ahead: number;
}

/**
 * The stretch of a route that should stay on screen around `index`.
 *
 * Framing a run against the *whole* line is what made long lines unplayable:
 * Putrajaya spans 642 layout units against the Monorail's 95, so the same
 * "fit the line" rule that reads well on one is an overview map on the other.
 * A window keeps the shot the same size in stations rather than in units.
 *
 * The slice is clipped, not wrapped — at either terminus you simply see fewer
 * stations on the short side, which is what a real approach looks like.
 */
export function followPoints(
  points: readonly Point[],
  index: number,
  { behind, ahead }: FollowWindow,
): Point[] {
  if (index < 0 || index >= points.length) return [];
  return points.slice(Math.max(0, index - behind), index + ahead + 1);
}

/**
 * Rescale a box about its centre so its longer side lands within `[min, max]`.
 *
 * Station spacing is wildly uneven — 7 units between two Putrajaya stops, 99
 * between another two — so a fixed-size window swings from a close-up that
 * shows nothing but track to a shot that has given up and gone back to the
 * overview. Clamping the span puts a floor and ceiling on that swing while
 * leaving the well-behaved middle alone.
 */
export function clampSpan(box: ViewBox, min: number, max: number): ViewBox {
  const span = Math.max(box.w, box.h);
  if (span === 0) return { ...box };

  const scale = Math.min(max, Math.max(min, span)) / span;
  if (scale === 1) return { ...box };

  const w = box.w * scale;
  const h = box.h * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

/**
 * Grow a box about its centre until it matches the container's aspect ratio.
 *
 * The SVG keeps `preserveAspectRatio="xMidYMid meet"`, so a box shaped unlike
 * its container is letterboxed — the browser silently reveals extra map on the
 * short axis. For an overview that is a feature: nothing framed can be cropped.
 * For a followed shot it defeats the point, because a tall, narrow box on a
 * wide screen showed roughly three times the intended width. Pre-applying the
 * growth here means the box you ask for is the box you actually see, and any
 * span limit is expressed in what the player really looks at.
 */
export function coverAspect(box: ViewBox, aspect: number): ViewBox {
  if (!Number.isFinite(aspect) || aspect <= 0 || box.w <= 0 || box.h <= 0) {
    return { ...box };
  }

  const w = Math.max(box.w, box.h * aspect);
  const h = Math.max(box.h, box.w / aspect);
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

/**
 * How much a followed shot must open up to hold `must` as well.
 *
 * The span ceiling is a preference, not a promise: on the Putrajaya line's
 * longest hops — 99 units against a 28-unit median — holding the shot at the
 * ceiling pushed the station you had just left off the top of the screen. The
 * segment you are actually typing has to stay visible, so the ceiling yields
 * to it here rather than being loosened for every line to suit the worst one.
 *
 * Returns a single factor rather than per-axis sizes so the shot keeps the
 * shape `coverAspect` gave it. It never returns less than 1.
 *
 * @param biasY where the focus point sits vertically in the shot, 0..1
 * @param margin fraction of the span to keep between a point and the edge
 */
export function scaleToContain(
  size: { w: number; h: number },
  focus: Point,
  biasY: number,
  must: readonly Point[],
  margin: number,
): number {
  if (must.length === 0 || size.w <= 0 || size.h <= 0) return 1;

  // Room from the focus point to each edge, as a fraction of the span. The
  // vertical halves are uneven because the shot is biased upward.
  const room = {
    x: 0.5 - margin,
    up: biasY - margin,
    down: 1 - biasY - margin,
  };
  if (room.x <= 0 || room.up <= 0 || room.down <= 0) return 1;

  let scale = 1;
  for (const p of must) {
    const dy = p.y - focus.y;
    scale = Math.max(
      scale,
      Math.abs(p.x - focus.x) / (size.w * room.x),
      dy < 0 ? -dy / (size.h * room.up) : dy / (size.h * room.down),
    );
  }
  return scale;
}
