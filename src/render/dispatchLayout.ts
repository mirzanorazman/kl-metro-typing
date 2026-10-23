import type { Point } from '../data/types';
import type { EdgePadding } from '../geo/fit';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { trainPosition, type Train } from '../engine/dispatchSim';
import type { Target, TargetRef } from '../engine/dispatchTargets';
import type { SignalMark } from './useSignalMarks';
import { placeLabels } from './labels';

/**
 * Where the Dispatcher overlay puts things, as pure geometry. The overlay
 * renders from these and `measureReadability` measures them, so the two can
 * never drift apart.
 */

/** Monospace advance plus the label letter-spacing, as a fraction of the font size. */
export const CHAR_EM = 0.68;

export interface Box { x0: number; y0: number; x1: number; y1: number }

export const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

export interface Placed { train: Train; at: Point; heading: Point; side: Point }

/**
 * Where a Train is drawn. A Train at its Signal waits short of the Station,
 * back along the track it came in on, and every Train keeps to the right-hand
 * side of its direction of travel: the two directions at one Station never
 * share a spot, and neither do their labels.
 */
export function placeTrain(net: NetworkIndex, layout: Layout, t: Train, m: number): Placed | null {
  const ids = net.lines.get(t.line)!.stations;
  const pos = trainPosition(net, t);
  const from = layout.get(pos.from);
  const to = layout.get(pos.to);
  if (!from || !to) return null;
  let at = { x: from.x + (to.x - from.x) * pos.t, y: from.y + (to.y - from.y) * pos.t };
  let heading: Point;
  if (pos.from !== pos.to) {
    heading = unit(to.x - from.x, to.y - from.y);
  } else {
    const behind = layout.get(ids[t.at - t.dir] ?? '');
    const ahead = layout.get(ids[t.at + t.dir] ?? '');
    heading = behind ? unit(from.x - behind.x, from.y - behind.y)
      : ahead ? unit(ahead.x - from.x, ahead.y - from.y) : { x: 1, y: 0 };
    if ((t.stage === 'signal' || t.stage === 'cleared') && behind) {
      const back = Math.min(16 * m, 0.4 * Math.hypot(from.x - behind.x, from.y - behind.y));
      at = { x: at.x - heading.x * back, y: at.y - heading.y * back };
    }
  }
  // Screen y points down, so (-y, x) is the right-hand side of travel.
  const side = { x: -heading.y, y: heading.x };
  return { train: t, at: { x: at.x + side.x * 8 * m, y: at.y + side.y * 8 * m }, heading, side };
}

export interface ChipWant {
  key: string;
  ref: TargetRef;
  text: string;
  kind: TargetRef['kind'];
  /** What the chip belongs to: its leader line starts here. */
  from: Point;
  /** The side of `from` the chip prefers. */
  side: Point;
}

export interface Chip {
  key: string;
  ref: TargetRef;
  text: string;
  kind: TargetRef['kind'];
  from: Point;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const chipBox = (c: Chip): Box => ({ x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h });

/** The room station names leave round a chip: its box and a little clearance. */
export const chipClearance = (c: Chip, m: number): Box =>
  ({ x0: c.x - 2 * m, y0: c.y - 2 * m, x1: c.x + c.w + 2 * m, y1: c.y + c.h + 2 * m });

/** Distances tried for a chip, as multiples of its 15-unit gap, nearest first. */
const CHIP_RINGS = [1, 1.8, 2.8, 4, 5.5, 7.5, 10] as const;

/** Fixes outrank Signals, which outrank express skips, for the nearer spots. */
const CHIP_PRIORITY: Record<TargetRef['kind'], number> = { fix: 2, signal: 1, skip: 0 };

/**
 * Lays chips out with the label placer: each takes the first free corner
 * beside its anchor, preferring its own side, ring by ring outward, clear of
 * every chip already placed and every box to `avoid`. A chip pushed out
 * keeps a leader line back to its anchor. With nowhere free at all it still
 * shows, on its first corner.
 */
export function layoutChips(
  wanted: readonly ChipWant[],
  m: number,
  fontSize: number,
  avoid: readonly Box[] = [],
): Chip[] {
  const h = fontSize * 1.5;
  const pad = fontSize * 0.45;
  const width = (item: ChipWant) => item.text.length * fontSize * CHAR_EM + pad * 2 + (item.kind === 'skip' ? fontSize : 0);
  const byKey = new Map(wanted.map((item) => [item.key, item]));
  const placed = placeLabels(
    wanted.map((item) => ({
      id: item.key, at: item.from, text: item.text, priority: CHIP_PRIORITY[item.kind], required: true,
      size: { w: width(item), h }, prefer: item.side.x >= 0 ? 'right' as const : 'left' as const,
    })),
    { charWidth: fontSize * CHAR_EM, lineHeight: h, offset: 15 * m, boxes: avoid, rings: CHIP_RINGS },
  );
  const chips = new Map(placed.map((label) => {
    const item = byKey.get(label.id)!;
    const w = width(item);
    const chip: Chip = { key: item.key, ref: item.ref, text: item.text, kind: item.kind, from: item.from,
      x: label.textAnchor === 'start' ? label.x : label.x - w, y: label.y - h, w, h };
    return [chip.key, chip] as const;
  }));
  // In the order asked for, so the render order stays stable.
  return wanted.map((item) => chips.get(item.key)!);
}

/** A signal post in nominal units, its foot at the origin and its head up -y: a pole and a footing. */
export const SIGNAL_POST = 'M0,0 V-8 M-2.5,0 H2.5';
export const SIGNAL_HALF_W = 5;
export const SIGNAL_LEN = 24;

export interface MarkPlace { at: Point; angle: number; box: Box }

/**
 * Where a Signal mark stands: at its faced Station, on the side of the track
 * the train approaches on, just clear of the waiting train's nose. The post
 * points away from the track, so it never lies over the train or the rail.
 */
export function placeMark(net: NetworkIndex, layout: Layout, mark: SignalMark, m: number): MarkPlace | null {
  const ids = net.lines.get(mark.line)!.stations;
  const station = layout.get(mark.station);
  if (!station) return null;
  const behind = layout.get(ids[mark.at - mark.dir] ?? '');
  const ahead = layout.get(ids[mark.at + mark.dir] ?? '');
  const heading = behind ? unit(station.x - behind.x, station.y - behind.y)
    : ahead ? unit(ahead.x - station.x, ahead.y - station.y) : { x: 1, y: 0 };
  // Screen y points down, so (-y, x) is the right-hand side of travel.
  const side = { x: -heading.y, y: heading.x };
  const at = { x: station.x + heading.x * m + side.x * 4 * m, y: station.y + heading.y * m + side.y * 4 * m };
  // Rotates the drawing's "up" (0, -1) onto `side`.
  const angle = (Math.atan2(side.x, -side.y) * 180) / Math.PI;
  const corners = [-SIGNAL_HALF_W, SIGNAL_HALF_W].flatMap((across) => [0, SIGNAL_LEN].map((out) => ({
    x: at.x + (heading.x * across + side.x * out) * m,
    y: at.y + (heading.y * across + side.y * out) * m,
  })));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { at, angle, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

/** The Incident badge over its place: centre and radius, in layout units. */
export function incidentBadge(p: Point, m: number): { x: number; y: number; r: number } {
  return { x: p.x, y: p.y - 12 * m, r: 9 * m };
}

export const circleBox = (c: { x: number; y: number; r: number }): Box =>
  ({ x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r });

/** Font size of the overlay's chips, in layout units. */
export const chipFontSize = (m: number) => 13 * m;

export interface OverlayLayout {
  trains: Placed[];
  marks: Map<string, MarkPlace>;
  chips: Chip[];
  fontSize: number;
}

/**
 * The overlay's Trains, Signal marks and chips: one chip per Target, beside
 * its Train (or above its Incident's place), stepped clear of the waiting
 * trains' marks and of `avoid`.
 */
export function overlayLayout(
  net: NetworkIndex,
  layout: Layout,
  career: CareerState,
  targets: readonly Target[],
  marks: readonly SignalMark[],
  m: number,
): OverlayLayout {
  const { sim } = career;
  const fontSize = chipFontSize(m);
  const trains = sim.trains
    .map((t) => placeTrain(net, layout, t, m))
    .filter((p): p is Placed => p !== null);
  const byId = new Map(trains.map((p) => [p.train.id, p]));

  const wanted: ChipWant[] = [];
  for (const target of targets) {
    if (target.ref.kind === 'fix') {
      const id = target.ref.incident;
      const inc = sim.incidents.find((i) => i.id === id);
      const p = inc && layout.get(inc.place);
      if (!p) continue;
      wanted.push({ key: `fix-${id}`, ref: target.ref, text: target.text, kind: 'fix',
        from: p, side: { x: -0.6, y: -0.8 } });
    } else {
      const placed = byId.get(target.ref.train);
      if (!placed) continue;
      wanted.push({ key: `${target.ref.kind}-${target.ref.train}`, ref: target.ref, text: target.text,
        kind: target.ref.kind, from: placed.at, side: placed.side });
    }
  }
  const placed = new Map(marks.map((mark) => [mark.key, placeMark(net, layout, mark, m)] as const)
    .filter((entry): entry is [string, MarkPlace] => entry[1] !== null));
  // Chips keep clear of the waiting trains' marks (a fading mark may pass
  // under one) and of the Incident badges.
  const badges = sim.incidents.filter((inc) => !sim.outOfService[inc.place])
    .flatMap((inc) => {
      const p = layout.get(inc.place);
      return p ? [circleBox(incidentBadge(p, m))] : [];
    });
  const chips = layoutChips(wanted, m, fontSize,
    [...marks.filter((mark) => !mark.cleared).flatMap((mark) => placed.get(mark.key)?.box ?? []), ...badges]);
  return { trains, marks: placed, chips, fontSize };
}

/**
 * Everything on the overlay that station names must keep off, in layout
 * units: chips (with clearance), Trains, waiting Signal marks, Incident
 * badges and Out of service crosses. Names yield to all of it; the chips
 * already name every Station with a train waiting.
 */
export function overlayObstacles(
  net: NetworkIndex,
  layout: Layout,
  career: CareerState,
  targets: readonly Target[],
  marks: readonly SignalMark[],
  m: number,
): Box[] {
  const { trains, marks: placed, chips } = overlayLayout(net, layout, career, targets, marks, m);
  const { sim } = career;
  const around = (p: Point, r: number) => circleBox({ x: p.x, y: p.y, r });
  return [
    ...chips.map((chip) => chipClearance(chip, m)),
    ...trains.map((t) => around(t.at, 12 * m)),
    ...marks.filter((mark) => !mark.cleared).flatMap((mark) => placed.get(mark.key)?.box ?? []),
    ...sim.incidents.flatMap((inc) => {
      const p = layout.get(inc.place);
      return p && !sim.outOfService[inc.place] ? [circleBox(incidentBadge(p, m))] : [];
    }),
    ...Object.keys(sim.outOfService).flatMap((id) => {
      const p = layout.get(id);
      return p ? [around(p, 7 * m)] : [];
    }),
  ];
}

/**
 * The Dispatcher's frame padding, a share of the frame: clear of the top bar,
 * the Incidents panel on the right and the typing panel below.
 */
export const DISPATCH_FIT_PADDING: EdgePadding = { top: 0.12, right: 0.24, bottom: 0.3, left: 0.06 };

/** Smallest Station mark on screen, in pixels across; marks, chips and names scale up to keep it. */
export const DISPATCH_MIN_MARK_PX = 6;

/** Spacing between Lines on shared track, in screen pixels: a 6 px rail and a hairline of paper. */
export const DISPATCH_LANE_PX = 7;

/**
 * Up to this many Served Stations, every one keeps its name; the same count
 * at which the map stops naming even its major interchanges.
 */
export const DISPATCH_ALL_NAMES_MAX = 40;

/**
 * Stations that keep their name whatever the zoom. A small network names
 * every Served Station. A large one, framed whole, names only what matters:
 * Stations with something happening (a waiting train's Signal, an Incident),
 * Served interchanges, and the ends of each Served range. Between Shifts,
 * each offer's far end too. Other names hide.
 */
export function dispatchLabelled(
  net: NetworkIndex,
  career: CareerState,
  served: ReadonlySet<string>,
  targets: readonly Target[],
): Set<string> {
  const { sim } = career;
  const ids = new Set<string>(served.size <= DISPATCH_ALL_NAMES_MAX ? served : []);
  for (const target of targets) {
    if (target.ref.kind === 'fix') continue;
    const id = target.ref.train;
    const train = sim.trains.find((t) => t.id === id);
    const station = train && net.lines.get(train.line)!.stations[train.at];
    if (station) ids.add(station);
  }
  for (const inc of sim.incidents) ids.add(inc.place);
  for (const id of served) {
    const station = net.stations.get(id);
    if (station && linesOf(station).length > 1) ids.add(id);
  }
  for (const range of career.served) {
    const stations = net.lines.get(range.line)!.stations;
    ids.add(stations[range.from]!);
    ids.add(stations[range.to]!);
  }
  if (career.status === 'between') for (const offer of career.offers) ids.add(offer.farEnd);
  return ids;
}
