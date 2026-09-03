import type { Point, Station } from '../data/types';

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

/**
 * Projects stations to screen space, fitting the whole network into the
 * padded viewport at a uniform scale so the map is not stretched.
 */
export function projectStations(stations: Station[], vp: Viewport): Map<string, Point> {
  const out = new Map<string, Point>();
  if (stations.length === 0) return out;

  const xs = stations.map((s) => mercatorX(s.geo.lng));
  const ys = stations.map((s) => mercatorY(s.geo.lat));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const usableW = vp.width - vp.padding * 2;
  const usableH = vp.height - vp.padding * 2;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  // Centre whatever the uniform scale leaves over.
  const offsetX = vp.padding + (usableW - spanX * scale) / 2;
  const offsetY = vp.padding + (usableH - spanY * scale) / 2;

  for (const s of stations) {
    const my = mercatorY(s.geo.lat);
    out.set(s.id, {
      x: offsetX + (mercatorX(s.geo.lng) - minX) * scale,
      // Screen y grows downward; mercator y grows northward. Flip it.
      y: offsetY + (maxY - my) * scale,
    });
  }
  return out;
}
