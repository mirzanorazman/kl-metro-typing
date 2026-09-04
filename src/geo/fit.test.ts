import { describe, it, expect } from 'vitest';
import { fitViewBox } from './fit';
import type { Point } from '../data/types';

const pts: Point[] = [
  { x: -100, y: -50 },
  { x: 300, y: 150 },
];

describe('fitViewBox', () => {
  it('contains every point', () => {
    const v = fitViewBox(pts, 0);
    expect(v.x).toBeLessThanOrEqual(-100);
    expect(v.y).toBeLessThanOrEqual(-50);
    expect(v.x + v.w).toBeGreaterThanOrEqual(300);
    expect(v.y + v.h).toBeGreaterThanOrEqual(150);
  });

  it('adds padding as a fraction of the larger span', () => {
    const tight = fitViewBox(pts, 0);
    const padded = fitViewBox(pts, 0.1);
    expect(padded.w).toBeGreaterThan(tight.w);
    expect(padded.h).toBeGreaterThan(tight.h);
  });

  it('handles a single point without collapsing to zero size', () => {
    const v = fitViewBox([{ x: 5, y: 5 }], 0.1);
    expect(v.w).toBeGreaterThan(0);
    expect(v.h).toBeGreaterThan(0);
  });

  it('returns a usable box for an empty set', () => {
    const v = fitViewBox([], 0.1);
    expect(v.w).toBeGreaterThan(0);
    expect(v.h).toBeGreaterThan(0);
  });

  it('frames the real schematic layout', async () => {
    const { loadNetworkData } = await import('../data/load');
    const { buildSchematic } = await import('./schematic');
    const points = [...buildSchematic(loadNetworkData().lines).points.values()];
    const v = fitViewBox(points, 0.08);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(v.x);
      expect(p.x).toBeLessThanOrEqual(v.x + v.w);
      expect(p.y).toBeGreaterThanOrEqual(v.y);
      expect(p.y).toBeLessThanOrEqual(v.y + v.h);
    }
  });
});
