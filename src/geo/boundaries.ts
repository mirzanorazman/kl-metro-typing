import type { Point } from '../data/types';
import type { Projection } from './project';
import raw from '../data/boundaries.json';

export interface BoundaryRegion {
  id: string;
  name: string;
  /** Outer rings, each an array of [lng, lat] pairs — GeoJSON order. */
  rings: [number, number][][];
}

export interface BoundaryData {
  attribution: string;
  regions: BoundaryRegion[];
}

export interface BoundaryPath {
  id: string;
  /** SVG path data for the ring. */
  d: string;
  points: Point[];
}

export function loadBoundaries(): BoundaryData {
  return raw as unknown as BoundaryData;
}

/** Projects every ring with the supplied projection, yielding SVG paths. */
export function projectBoundaries(data: BoundaryData, proj: Projection): BoundaryPath[] {
  const out: BoundaryPath[] = [];
  for (const region of data.regions) {
    region.rings.forEach((ring, i) => {
      // Rings are [lng, lat]; the projection takes { lat, lng }.
      const points = ring.map(([lng, lat]) => proj.project({ lat, lng }));
      if (points.length < 3) return;
      const d = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`;
      out.push({ id: `${region.id}-${i}`, d, points });
    });
  }
  return out;
}
