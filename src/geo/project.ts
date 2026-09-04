import type { Point, Station, LatLng } from '../data/types';

export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

const RAD = Math.PI / 180;

/**
 * Web Mercator easting. Longitude MUST be converted to radians here.
 *
 * The northing below is `ln(tan(...))`, which is in radian units. Feeding this
 * degrees would make x roughly 57x too large relative to y and squash the whole
 * map into a horizontal sliver — the two axes have to share units.
 */
export function mercatorX(lng: number): number {
  return lng * RAD;
}

/** Web Mercator northing, in the same radian units as {@link mercatorX}. */
export function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
}

export interface Projection {
  project(at: LatLng): Point;
}

/**
 * Builds a projection fitted to `fitTo`, at a uniform scale.
 *
 * Points outside `fitTo` project outside the viewport rather than being
 * clamped — that is deliberate, and it is how the map backdrop extends past
 * the edges of the framed network.
 */
export function makeProjection(fitTo: readonly LatLng[], vp: Viewport): Projection {
  if (fitTo.length === 0) {
    return { project: () => ({ x: vp.width / 2, y: vp.height / 2 }) };
  }

  const xs = fitTo.map((c) => mercatorX(c.lng));
  const ys = fitTo.map((c) => mercatorY(c.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const usableW = vp.width - vp.padding * 2;
  const usableH = vp.height - vp.padding * 2;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = vp.padding + (usableW - spanX * scale) / 2;
  const offsetY = vp.padding + (usableH - spanY * scale) / 2;

  return {
    project: (at: LatLng): Point => ({
      x: offsetX + (mercatorX(at.lng) - minX) * scale,
      // Screen y grows downward; mercator y grows northward. Flip it.
      y: offsetY + (maxY - mercatorY(at.lat)) * scale,
    }),
  };
}

/**
 * Projects stations to screen space, fitting the whole network into the
 * padded viewport at a uniform scale so the map is not stretched.
 */
export function projectStations(stations: Station[], vp: Viewport): Map<string, Point> {
  const proj = makeProjection(stations.map((s) => s.geo), vp);
  return new Map(stations.map((s) => [s.id, proj.project(s.geo)]));
}
