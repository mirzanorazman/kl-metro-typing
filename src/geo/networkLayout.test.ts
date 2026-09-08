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

describe('district watermarks', () => {
  it('projects every district into the same space as the stations', () => {
    const { districts, geo } = networkLayout();
    expect(districts).toHaveLength(8);

    const xs = [...geo.values()].map((p) => p.x);
    const kl = districts.find((d) => d.name === 'Kuala Lumpur');
    // KL sits inside the network's horizontal span, not off in another
    // coordinate system — the failure this guards against.
    expect(kl!.at.x).toBeGreaterThan(Math.min(...xs) - 200);
    expect(kl!.at.x).toBeLessThan(Math.max(...xs) + 200);
  });
});

describe('map scale', () => {
  it('reports a positive number of user units per kilometre', () => {
    expect(networkLayout().pxPerKm).toBeGreaterThan(0);
  });

  it('measures a kilometre the station span agrees with', () => {
    const { geo, pxPerKm } = networkLayout();
    const xs = [...geo.values()].map((p) => p.x);
    const spanKm = (Math.max(...xs) - Math.min(...xs)) / pxPerKm;
    // The network runs roughly 39km east to west in the real world. If
    // pxPerKm were inverted, or out by an order of magnitude, the projected
    // span would not survive being divided by it.
    expect(spanKm).toBeGreaterThan(30);
    expect(spanKm).toBeLessThan(60);
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
