import type { LineCode, Point, ViewBox } from '../data/types';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import {
  placeLabels, type Box, type LabelCandidate, type Obstacle, type PlaceOptions, type PlacedLabel,
} from './labels';

/**
 * The map's mark and label sizing and its label choice, as pure functions:
 * `MapCanvas` renders from them and the Dispatcher's readability measure
 * measures them, so the two cannot drift apart.
 */

/** View width the station radii were chosen against. */
export const NOMINAL_VIEW_W = 1000;

/**
 * Width of one label character as a fraction of the font size.
 *
 * The labels are set in a monospace face, whose advance is 0.6em, plus the
 * 0.08em of letter-spacing the stylesheet adds. Estimating rather than
 * measuring keeps placement a pure calculation, which is what lets it run
 * during render instead of after a layout pass.
 */
export const LABEL_CHAR_EM = 0.68;

/** Label box height as a fraction of the font size — roughly the cap height. */
export const LABEL_LINE_EM = 0.8;

/** Nominal station radii, before `markScale`. */
export const STATION_R = { active: 8, interchange: 6, stop: 4 } as const;

/** Screen pixels per layout unit for a view letterboxed into `screen` (`xMidYMid meet`). */
export function pxPerUnit(view: ViewBox, screen: { w: number; h: number }): number {
  return Math.min(screen.w / view.w, screen.h / view.h);
}

/** A floor on mark size in screen pixels: the smallest station mark is at least `minPx` across. */
export interface MarkFloor { screen: { w: number; h: number }; minPx: number }

/**
 * Radii are in SVG user units, so they inflate as the view zooms in — a
 * short line like the Monorail frames tightly and the dots ballooned. Scale
 * them against the view so their on-screen size stays constant. Strokes are
 * handled by vector-effect instead, which pins them to CSS pixels.
 *
 * With a `floor`, the scale never lets a plain stop shrink below `minPx`
 * across on screen; every mark, chip and label scales with it.
 */
export function markScaleFor(view: ViewBox, floor?: MarkFloor | null): number {
  const base = Math.max(0.15, Math.min(1.6, view.w / NOMINAL_VIEW_W));
  if (!floor || floor.screen.w <= 0 || floor.screen.h <= 0) return base;
  return Math.max(base, floor.minPx / (2 * STATION_R.stop * pxPerUnit(view, floor.screen)));
}

/** The label tiers that depend only on the network: line ends and major interchanges. */
export interface LabelTiers { termini: ReadonlySet<string>; majorInterchanges: ReadonlySet<string> }

export function labelTiers(net: NetworkIndex): LabelTiers {
  const termini = new Set<string>();
  for (const line of net.lines.values()) {
    const first = line.stations[0];
    const last = line.stations[line.stations.length - 1];
    if (first) termini.add(first);
    if (last) termini.add(last);
  }
  const majorInterchanges = new Set<string>();
  for (const station of net.stations.values()) {
    if (linesOf(station).length >= 3) majorInterchanges.add(station.id);
  }
  return { termini, majorInterchanges };
}

/**
 * How crowded the view actually is. `view.w` alone cannot answer this: it is
 * in user units, so a line run framing one line reads as "zoomed in" while
 * still holding most of the network on screen.
 */
export function countInView(layout: Layout, view: ViewBox): number {
  let n = 0;
  for (const p of layout.values()) {
    if (p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h) n++;
  }
  return n;
}

export interface MapLabelInput {
  net: NetworkIndex;
  layout: Layout;
  view: ViewBox;
  markScale: number;
  activeStation: string | null;
  labelled: ReadonlySet<string> | null;
  tiers: LabelTiers;
  /** Points in view; pass it when already counted. */
  inView?: number;
  /** Furniture the names route around. */
  obstacles?: readonly Obstacle[];
  /** Rectangles the names keep off — an overlay's chips, which outrank them. */
  boxes?: readonly Box[];
}

export interface MapLabels {
  labels: PlacedLabel[];
  fontSize: number;
  opts: PlaceOptions;
  /** Name per labelled Station id. */
  text: ReadonlyMap<string, string>;
}

/**
 * Labelling all 154 at once is noise, so labels come in tiers: the stations
 * that orient you always, then major interchanges once the view is not too
 * crowded, then everything once it is genuinely zoomed in. `labelled` adds
 * Stations that want a name at any zoom.
 */
export function mapLabels({
  net, layout, view, markScale, activeStation, labelled, tiers, inView, obstacles = [], boxes,
}: MapLabelInput): MapLabels {
  const crowd = inView ?? countInView(layout, view);
  const showInterchangeLabels = crowd <= 40;
  const showEveryLabel = crowd <= 12;
  const { termini, majorInterchanges } = tiers;
  const candidates: LabelCandidate[] = [];
  const text = new Map<string, string>();
  for (const station of net.stations.values()) {
    const p = layout.get(station.id);
    if (!p) continue;
    const isActive = station.id === activeStation;
    // A label for a station well off the viewport is invisible work: it
    // renders a text node nobody sees, and it makes the placement pass compare
    // every pair of the network's 154 names on every frame of a pan. Half a
    // view of slack keeps labels from popping in at the edge as the map moves.
    const onScreen =
      p.x >= view.x - view.w / 2 && p.x <= view.x + view.w * 1.5 &&
      p.y >= view.y - view.h / 2 && p.y <= view.y + view.h * 1.5;
    if (
      isActive ||
      (onScreen &&
        (showEveryLabel ||
          labelled?.has(station.id) ||
          termini.has(station.id) ||
          (showInterchangeLabels && majorInterchanges.has(station.id))))
    ) {
      candidates.push({
        id: station.id,
        at: p,
        text: station.name,
        // The station being typed outranks everything, then the marks that
        // orient you; a plain stop yields its corner to both.
        priority: isActive ? 3 : majorInterchanges.has(station.id) ? 2 : termini.has(station.id) ? 1 : 0,
        required: isActive,
      });
      text.set(station.id, station.name);
    }
  }
  const fontSize = 11 * markScale;
  const opts: PlaceOptions = {
    charWidth: fontSize * LABEL_CHAR_EM,
    lineHeight: fontSize * LABEL_LINE_EM,
    offset: 9 * markScale,
    // The live viewport, so a label near the edge the player has panned to
    // turns inward rather than running off it.
    bounds: view,
    obstacles,
    boxes,
  };
  return { labels: placeLabels(candidates, opts), fontSize, opts, text };
}

/** The box a placed label's text covers, in layout units. */
export function labelBox(label: PlacedLabel, text: string, opts: PlaceOptions) {
  const width = text.length * opts.charWidth;
  return {
    x0: label.textAnchor === 'start' ? label.x : label.x - width,
    x1: label.textAnchor === 'start' ? label.x + width : label.x,
    y0: label.y - opts.lineHeight,
    y1: label.y,
  };
}

/** Consecutive Station pairs on two or more Lines: `a|b` (ids sorted) to the Lines on it, sorted. */
export function sharedSegments(net: NetworkIndex): Map<string, LineCode[]> {
  const segs = new Map<string, LineCode[]>();
  for (const line of net.lines.values()) {
    for (let i = 0; i + 1 < line.stations.length; i++) {
      const key = [line.stations[i]!, line.stations[i + 1]!].sort().join('|');
      segs.set(key, [...(segs.get(key) ?? []), line.code]);
    }
  }
  return new Map([...segs].filter(([, lines]) => lines.length > 1).map(([key, lines]) => [key, lines.sort()]));
}

/**
 * Each Line's drawn polyline. With `laneUnits` above 0, Lines sharing
 * consecutive Stations (Ampang and Sri Petaling, Sentul Timur to Chan Sow Lin)
 * are drawn side by side, `laneUnits` apart, instead of on top of each other:
 * each shared Station moves off its point along the track's normal, by its
 * Line's lane. Every Line takes its normals from the same reference Line, so
 * the lanes never cross. Elsewhere a Line runs through its Stations.
 */
export function trackLines(net: NetworkIndex, layout: Layout, laneUnits: number): Map<LineCode, Point[]> {
  // Station id → Line → summed unit normals of its shared segments, and the Line's lane.
  const bends = new Map<string, Map<LineCode, { nx: number; ny: number; lane: number }>>();
  if (laneUnits > 0) {
    for (const [key, lines] of sharedSegments(net)) {
      const [a, b] = key.split('|') as [string, string];
      const ref = net.order.get(lines[0]!)!;
      const [from, to] = ref.get(a)! < ref.get(b)! ? [a, b] : [b, a];
      const p = layout.get(from);
      const q = layout.get(to);
      if (!p || !q) continue;
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      lines.forEach((code, k) => {
        const lane = k - (lines.length - 1) / 2;
        for (const id of [from, to]) {
          const byLine = bends.get(id) ?? new Map();
          const acc = byLine.get(code) ?? { nx: 0, ny: 0, lane };
          acc.nx += n.x;
          acc.ny += n.y;
          byLine.set(code, acc);
          bends.set(id, byLine);
        }
      });
    }
  }
  const out = new Map<LineCode, Point[]>();
  for (const line of net.lines.values()) {
    const pts: Point[] = [];
    for (const id of line.stations) {
      const p = layout.get(id);
      if (!p) continue;
      const bend = bends.get(id)?.get(line.code);
      const len = bend ? Math.hypot(bend.nx, bend.ny) : 0;
      pts.push(bend && len > 0
        ? { x: p.x + (bend.nx / len) * bend.lane * laneUnits, y: p.y + (bend.ny / len) * bend.lane * laneUnits }
        : p);
    }
    out.set(line.code, pts);
  }
  return out;
}
