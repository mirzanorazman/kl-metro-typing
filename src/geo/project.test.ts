import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { projectStations, makeProjection } from './project';

const vp = { width: 1000, height: 800, padding: 40 };
const pts = projectStations(loadNetworkData().stations, vp);

describe('projectStations', () => {
  it('projects every station', () => {
    expect(pts.size).toBe(loadNetworkData().stations.length);
  });

  it('keeps every point inside the padded viewport', () => {
    for (const p of pts.values()) {
      expect(p.x).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.x).toBeLessThanOrEqual(vp.width - vp.padding + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.y).toBeLessThanOrEqual(vp.height - vp.padding + 0.001);
    }
  });

  it('puts a northern station above a southern one', () => {
    const gombak = pts.get('gombak')!;
    const putrajaya = pts.get('putrajaya-sentral')!;
    expect(gombak.y).toBeLessThan(putrajaya.y);
  });

  it('preserves relative distances, so the map is not squashed', () => {
    // The bug this pins: using degrees for x and radian-scale Mercator for y
    // makes x ~57x too large and flattens the network into a sliver. Both
    // axes must share units, so screen distances stay proportional to real
    // ones regardless of a pair's bearing.
    const data = loadNetworkData();
    const byId = new Map(data.stations.map((s) => [s.id, s]));
    const km = (a: string, b: string) => {
      const p = byId.get(a)!.geo;
      const q = byId.get(b)!.geo;
      const t = Math.PI / 180;
      const dLat = (q.lat - p.lat) * t;
      const dLng = (q.lng - p.lng) * t;
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(p.lat * t) * Math.cos(q.lat * t) * Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(h));
    };
    const px = (a: string, b: string) => {
      const p = pts.get(a)!;
      const q = pts.get(b)!;
      return Math.hypot(q.x - p.x, q.y - p.y);
    };

    // One mostly north-south pair, one mostly east-west pair.
    const northSouth: [string, string] = ['gombak', 'kl-sentral'];
    const eastWest: [string, string] = ['ampang', 'kelana-jaya'];

    const realRatio = km(...northSouth) / km(...eastWest);
    const screenRatio = px(...northSouth) / px(...eastWest);
    expect(screenRatio / realRatio).toBeGreaterThan(0.9);
    expect(screenRatio / realRatio).toBeLessThan(1.1);
  });

  it('puts an eastern station right of a western one', () => {
    expect(pts.get('ampang')!.x).toBeGreaterThan(pts.get('johan-setia')!.x);
  });
});

describe('makeProjection', () => {
  it('reproduces projectStations for the same inputs', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    for (const s of stations.slice(0, 20)) {
      const a = proj.project(s.geo);
      const b = pts.get(s.id)!;
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('places a point outside the fitted set outside the viewport, not clamped', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    // Far north-west of the network: the backdrop legitimately extends past it.
    const far = proj.project({ lat: 3.9, lng: 100.8 });
    expect(far.x).toBeLessThan(vp.padding);
    expect(far.y).toBeLessThan(vp.padding);
  });
});
