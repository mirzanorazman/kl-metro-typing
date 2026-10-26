import type { LineCode, Point } from '../data/types';
import type { Layout } from '../geo/layout';
import type { NetworkIndex } from '../engine/network';

export interface LineRange {
  line: LineCode;
  from: number;
  to: number;
}

export interface DirectedRange extends LineRange {
  reverse: boolean;
}

export type TrackLanes = ReadonlyMap<LineCode, readonly Point[]> | null;

/** Station ids in one inclusive, ascending line range. */
export function rangeIds(net: NetworkIndex, range: LineRange): string[] {
  return net.lines.get(range.line)!.stations.slice(range.from, range.to + 1);
}

/** The unique Station ids served by any of these ranges. */
export function rangeStations(net: NetworkIndex, ranges: readonly LineRange[]): Set<string> {
  const stations = new Set<string>();
  for (const range of ranges) for (const id of rangeIds(net, range)) stations.add(id);
  return stations;
}

/** Points for requested ids, retaining their order and each Line's full-track offsets. */
export function trackPoints(
  net: NetworkIndex, layout: Layout, tracks: TrackLanes, line: LineCode, ids: readonly string[],
): Point[] {
  const lane = tracks?.get(line);
  const order = net.order.get(line);
  return ids.map((id) => {
    const index = order?.get(id);
    return index === undefined ? undefined : lane?.[index] ?? layout.get(id);
  }).filter((point): point is Point => point !== undefined);
}

/** SVG polyline points for a requested stretch, using its drawn lane when present. */
export function linePoints(
  net: NetworkIndex, layout: Layout, tracks: TrackLanes, line: LineCode, ids: readonly string[],
): string {
  return trackPoints(net, layout, tracks, line, ids).map(({ x, y }) => `${x},${y}`).join(' ');
}

/** Newly painted portions between two monotonically growing, one-range-per-line states. */
export function rangeAdditions(
  net: NetworkIndex, before: readonly LineRange[], after: readonly LineRange[],
): DirectedRange[] {
  const globallyServed = rangeStations(net, before);
  const previous = new Map(before.map((range) => [range.line, range]));
  const additions: DirectedRange[] = [];
  for (const next of after) {
    const old = previous.get(next.line);
    if (!old) {
      const ids = rangeIds(net, next);
      const lower = ids[0];
      const upper = ids[ids.length - 1];
      const reverse = upper !== undefined && globallyServed.has(upper) && !globallyServed.has(lower!);
      additions.push({ ...next, reverse });
      continue;
    }
    if (next.from < old.from) additions.push({ line: next.line, from: next.from, to: old.from, reverse: true });
    if (next.to > old.to) additions.push({ line: next.line, from: old.to, to: next.to, reverse: false });
  }
  return additions;
}
