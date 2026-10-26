import type { NetworkIndex } from '../engine/network';
import type { Layout } from '../geo/layout';
import { timeToReach } from './entrance';
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
      const arrival = timeToReach(progress) * draw;
      const previous = station.get(id);
      if (previous === undefined || arrival < previous) station.set(id, arrival);
    });
  }

  return { draw, station, total: reveal.duration };
}
