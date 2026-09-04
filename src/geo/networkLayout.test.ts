import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { networkLayout, lineExtent } from './networkLayout';

describe('networkLayout', () => {
  it('places every station in both layouts', () => {
    const { geo, schematic } = networkLayout();
    const total = loadNetworkData().stations.length;
    expect(geo.size).toBe(total);
    expect(schematic.size).toBe(total);
  });

  it('returns the identical instance on repeat calls', () => {
    // Screens rely on this: a new Map each render would retrigger reframing.
    expect(networkLayout()).toBe(networkLayout());
    expect(networkLayout().geo).toBe(networkLayout().geo);
  });

  it('projects the backdrop with the same transform as the stations', () => {
    const { geo, backdrop } = networkLayout();
    const pts = backdrop.flatMap((p) => p.points);
    const sx = [...geo.values()].map((p) => p.x);
    const sy = [...geo.values()].map((p) => p.y);
    // Land extends past the network on every side: same coordinate space.
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(Math.min(...sx));
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(Math.max(...sx));
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(Math.min(...sy));
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(Math.max(...sy));
  });
});

describe('lineExtent', () => {
  it('returns a position per station, in order', () => {
    const kj = loadNetworkData().lines.find((l) => l.code === 'KJ')!;
    const pts = lineExtent(kj.stations);
    expect(pts).toHaveLength(kj.stations.length);
    expect(pts[0]).toEqual(networkLayout().geo.get(kj.stations[0]!));
  });

  it('skips ids that are not in the layout', () => {
    expect(lineExtent(['nope'])).toEqual([]);
  });
});
