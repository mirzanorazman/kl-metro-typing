import type { LineCode } from '../data/types';
import { linesOf, type NetworkIndex } from '../engine/network';

/** Gap between one line starting to draw and the next, in milliseconds. */
const LINE_STAGGER = 70;

/** How long a line takes to draw: a fixed cost plus a cost per stop. */
const DRAW_BASE = 360;
const DRAW_PER_STOP = 16;

/**
 * Ceiling on a single line's draw. It binds only on the two outliers, the
 * 37-stop Kelana Jaya and 36-stop Putrajaya lines: without it they run on
 * long after the 11-stop Monorail has finished, and the opening reads as
 * one slow line rather than a network assembling itself.
 */
const DRAW_MAX = 850;

/** How long a station's dot takes to pop and settle. */
const POP_MS = 320;

/**
 * The curve the stroke travels its line on, published in both the form the
 * stylesheet animates with and the control points the timing below inverts.
 *
 * One definition, handed to CSS as `--draw-ease` by the canvas, because the
 * two uses have to agree: the stroke eases out hard, so by the time it is
 * half way through its duration it is most of the way along the line. Dots
 * timed on a straight clock would be left behind by a tip that had already
 * passed them.
 */
export const DRAW_EASE = {
  control: [0.22, 1, 0.36, 1] as const,
  css: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

/** One axis of a cubic Bézier from (0,0) to (1,1), at parameter `t`. */
function axis(a: number, b: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

/**
 * The fraction of a line's draw at which its stroke has covered `progress`
 * of the line — the inverse of `DRAW_EASE`, and so where a station's dot
 * belongs in time.
 */
export function timeToReach(progress: number): number {
  const [x1, y1, x2, y2] = DRAW_EASE.control;
  // The curve is monotonic in t for these control points, so bisection is
  // both correct and short; 30 halvings resolve far finer than a millisecond.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (axis(y1, y2, mid) < progress) lo = mid;
    else hi = mid;
  }
  return axis(x1, x2, (lo + hi) / 2);
}

export interface LineDraw {
  /** When this line starts drawing, in milliseconds from the start. */
  delay: number;
  /** How long its stroke takes to travel terminus to terminus. */
  duration: number;
}

export interface EntranceTiming {
  line: Map<LineCode, LineDraw>;
  /** When each station's dot pops, in milliseconds from the start. */
  station: Map<string, number>;
  /** When the whole entrance has settled. */
  total: number;
}

/**
 * When each part of the map arrives during the opening draw-on.
 *
 * A pure function of the network so the sequence can be tested without a
 * DOM: the canvas only spends these numbers as CSS animation delays.
 */
export function entranceTiming(net: NetworkIndex): EntranceTiming {
  const line = new Map<LineCode, LineDraw>();
  [...net.lines.values()].forEach((l, i) => {
    line.set(l.code, {
      delay: i * LINE_STAGGER,
      duration: Math.min(DRAW_MAX, DRAW_BASE + l.stations.length * DRAW_PER_STOP),
    });
  });

  // A dot lands as the stroke tip reaches it. An interchange is reached by
  // several lines and takes the earliest of them, so it pops once, with
  // whichever line gets there first, rather than twice.
  const station = new Map<string, number>();
  for (const s of net.stations.values()) {
    const arrivals = linesOf(s).map((code) => {
      const l = net.lines.get(code);
      const draw = line.get(code);
      if (!l || !draw) return Infinity;
      const at = l.stations.indexOf(s.id);
      const span = l.stations.length - 1;
      return draw.delay + timeToReach(span > 0 ? at / span : 0) * draw.duration;
    });
    station.set(s.id, Math.min(...arrivals));
  }

  const lastLine = Math.max(...[...line.values()].map((d) => d.delay + d.duration));
  const lastPop = Math.max(...station.values()) + POP_MS;
  return { line, station, total: Math.max(lastLine, lastPop) };
}
