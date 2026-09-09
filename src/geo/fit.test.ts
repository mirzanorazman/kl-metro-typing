import { describe, it, expect } from 'vitest';
import { clampSpan, coverAspect, fitViewBox, followPoints, scaleToContain } from './fit';
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

describe('followPoints', () => {
  const route: Point[] = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 0 }));

  it('takes the stations behind and ahead of the index', () => {
    expect(followPoints(route, 5, { behind: 2, ahead: 3 })).toEqual([
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 50, y: 0 },
      { x: 60, y: 0 },
      { x: 70, y: 0 },
      { x: 80, y: 0 },
    ]);
  });

  it('clips at the start of the route without wrapping', () => {
    expect(followPoints(route, 0, { behind: 2, ahead: 3 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it('clips at the end of the route', () => {
    expect(followPoints(route, 9, { behind: 2, ahead: 3 })).toEqual([
      { x: 70, y: 0 },
      { x: 80, y: 0 },
      { x: 90, y: 0 },
    ]);
  });

  it('returns nothing for an index outside the route', () => {
    expect(followPoints(route, -1, { behind: 2, ahead: 3 })).toEqual([]);
    expect(followPoints([], 0, { behind: 2, ahead: 3 })).toEqual([]);
  });
});

describe('clampSpan', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };

  it('leaves a box inside the range untouched', () => {
    expect(clampSpan(box, 50, 200)).toEqual(box);
  });

  it('grows a box narrower than the minimum, about its centre', () => {
    const v = clampSpan(box, 200, 400);
    expect(v.w).toBe(200);
    expect(v.h).toBe(100);
    expect(v.x + v.w / 2).toBe(50);
    expect(v.y + v.h / 2).toBe(25);
  });

  it('shrinks a box wider than the maximum, about its centre', () => {
    const v = clampSpan(box, 10, 40);
    expect(v.w).toBe(40);
    expect(v.h).toBe(20);
    expect(v.x + v.w / 2).toBe(50);
    expect(v.y + v.h / 2).toBe(25);
  });

  it('measures the longer side, so a tall box is clamped by its height', () => {
    const tall = { x: 0, y: 0, w: 50, h: 400 };
    const v = clampSpan(tall, 100, 200);
    expect(v.h).toBe(200);
    expect(v.w).toBe(25);
  });
});

describe('coverAspect', () => {
  it('widens a tall box to the container shape', () => {
    const v = coverAspect({ x: 0, y: 0, w: 100, h: 200 }, 2);
    expect(v.w).toBe(400);
    expect(v.h).toBe(200);
    expect(v.x + v.w / 2).toBe(50);
    expect(v.y + v.h / 2).toBe(100);
  });

  it('heightens a wide box to the container shape', () => {
    const v = coverAspect({ x: 0, y: 0, w: 400, h: 100 }, 1);
    expect(v.w).toBe(400);
    expect(v.h).toBe(400);
    expect(v.x + v.w / 2).toBe(200);
    expect(v.y + v.h / 2).toBe(50);
  });

  it('only ever grows, so nothing framed can fall outside', () => {
    const box = { x: 0, y: 0, w: 100, h: 200 };
    const v = coverAspect(box, 0.25);
    expect(v.w).toBeGreaterThanOrEqual(box.w);
    expect(v.h).toBeGreaterThanOrEqual(box.h);
  });

  it('leaves a box already at the container shape alone', () => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    expect(coverAspect(box, 2)).toEqual(box);
  });

  it('ignores a nonsensical aspect rather than collapsing the box', () => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    expect(coverAspect(box, 0)).toEqual(box);
    expect(coverAspect(box, Number.NaN)).toEqual(box);
  });
});

describe('scaleToContain', () => {
  const size = { w: 100, h: 100 };
  const focus: Point = { x: 0, y: 0 };
  // Placed at bias 0.5 the box runs from -50 to +50 on both axes.

  it('leaves a shot that already holds the points alone', () => {
    expect(scaleToContain(size, focus, 0.5, [{ x: 10, y: 10 }], 0)).toBe(1);
  });

  it('opens up until a point outside the shot fits', () => {
    expect(scaleToContain(size, focus, 0.5, [{ x: 100, y: 0 }], 0)).toBe(2);
  });

  it('accounts for the upward bias, which leaves less room above', () => {
    // At bias 0.25 only a quarter of the height sits above the focus, so a
    // point 50 above needs a box 200 tall.
    expect(scaleToContain(size, focus, 0.25, [{ x: 0, y: -50 }], 0)).toBe(2);
  });

  it('scales by the axis that needs it most, so the shot keeps its shape', () => {
    expect(scaleToContain(size, focus, 0.5, [{ x: 100, y: 25 }], 0)).toBe(2);
  });

  it('adds a margin so a point never sits exactly on the edge', () => {
    expect(scaleToContain(size, focus, 0.5, [{ x: 50, y: 0 }], 0.1)).toBeGreaterThan(1);
  });

  it('never shrinks the shot', () => {
    expect(scaleToContain(size, focus, 0.5, [], 0)).toBe(1);
    expect(scaleToContain(size, focus, 0.5, [{ x: 1, y: 1 }], 0)).toBe(1);
  });
});
