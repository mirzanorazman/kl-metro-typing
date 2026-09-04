import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { loadBoundaries, projectBoundaries } from './boundaries';
import { makeProjection } from './project';

const vp = { width: 1000, height: 800, padding: 60 };

describe('loadBoundaries', () => {
  it('loads the three Klang Valley regions', () => {
    expect(loadBoundaries().regions.map((r) => r.id).sort())
      .toEqual(['kuala-lumpur', 'putrajaya', 'selangor']);
  });

  it('gives every ring at least three points', () => {
    for (const r of loadBoundaries().regions) {
      for (const ring of r.rings) expect(ring.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('records its attribution', () => {
    expect(loadBoundaries().attribution).toMatch(/natural earth/i);
  });
});

describe('projectBoundaries', () => {
  it('projects with the same transform as the stations', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    const paths = projectBoundaries(loadBoundaries(), proj);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.d.startsWith('M')).toBe(true);
  });

  it('surrounds the network rather than sitting beside it', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    const pts = projectBoundaries(loadBoundaries(), proj).flatMap((p) => p.points);
    const sx = stations.map((s) => proj.project(s.geo).x);
    const sy = stations.map((s) => proj.project(s.geo).y);
    // Land extends past the network on every side.
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(Math.min(...sx));
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(Math.max(...sx));
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(Math.min(...sy));
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(Math.max(...sy));
  });
});
