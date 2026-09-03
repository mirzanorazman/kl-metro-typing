import type { Point, Station } from '../data/types';

export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

/** Web Mercator northing. Longitude needs no transform. */
export function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * Projects stations to screen space, fitting the whole network into the
 * padded viewport at a uniform scale so the map is not stretched.
 */
export function projectStations(stations: Station[], vp: Viewport): Map<string, Point> {
  const out = new Map<string, Point>();
  if (stations.length === 0) return out;

  const xs = stations.map((s) => s.geo.lng);
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
      x: offsetX + (s.geo.lng - minX) * scale,
      // Screen y grows downward; mercator y grows northward. Flip it.
      y: offsetY + (maxY - my) * scale,
    });
  }
  return out;
}
