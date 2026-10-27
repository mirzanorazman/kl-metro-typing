import type { NetworkIndex } from '../engine/network';
import type { Layout } from '../geo/layout';
import { timeToReach, type DrawEase } from './entrance';
import { rangeIds, trackPoints, type DirectedRange, type LineRange, type TrackLanes } from './trackRanges';

export interface TrackReveal {
  id: number;
  before: readonly LineRange[];
  segments: readonly DirectedRange[];
  stations: ReadonlySet<string>;
  duration: number;
}

export interface TrackRevealTiming {
  draw: number;
  station: ReadonlyMap<string, number>;
  total: number;
}

const FINAL_STATION_POP_MS = 320;

/**
 * The curve a reveal's stroke travels on. Not `DRAW_EASE`: that eases out hard,
 * which suits seven staggered lines, but a lone line was over half drawn in its
 * first 100 ms and then crawled. This matches the camera's `easeInOut`, so an
 * Expansion's draw and the refit that starts with it speed up and settle together.
 */
export const REVEAL_EASE: DrawEase = {
  control: [0.45, 0, 0.55, 1],
  css: 'cubic-bezier(0.45, 0, 0.55, 1)',
};

/** Times newly reached stations against the distance travelled by each reveal segment. */
export function trackRevealTiming(
  net: NetworkIndex,
  layout: Layout,
  tracks: TrackLanes,
  reveal: TrackReveal,
): TrackRevealTiming {
  const draw = Math.max(0, reveal.duration - FINAL_STATION_POP_MS);
  const station = new Map<string, number>();

  for (const segment of reveal.segments) {
    const ids = rangeIds(net, segment);
    if (segment.reverse) ids.reverse();
    const points = trackPoints(net, layout, tracks, segment.line, ids);
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1]!;
      const current = points[i]!;
      distances.push(distances[i - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y));
    }
    const length = distances[distances.length - 1] ?? 0;

    ids.forEach((id, index) => {
      if (!reveal.stations.has(id)) return;
      const progress = length > 0 ? distances[index]! / length : 0;
      const arrival = timeToReach(progress, REVEAL_EASE) * draw;
      const previous = station.get(id);
      if (previous === undefined || arrival < previous) station.set(id, arrival);
    });
  }

  return { draw, station, total: reveal.duration };
}
