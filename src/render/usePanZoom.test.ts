import { describe, it, expect } from 'vitest';
import { zoomAt, panBy, viewBoxString, type ViewBox } from './usePanZoom';

// A realistic starting view: the whole network spans about 1364 x 1100 units.
const base: ViewBox = { x: 0, y: 0, w: 1000, h: 1000 };

describe('zoomAt', () => {
  it('shrinks the view box when zooming in', () => {
    expect(zoomAt(base, 0.5, 500, 500).w).toBeCloseTo(500);
  });

  it('keeps the focal point stationary', () => {
    const z = zoomAt(base, 0.5, 0, 0);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
  });

  it('refuses to zoom past the limits', () => {
    let v = base;
    for (let i = 0; i < 50; i++) v = zoomAt(v, 0.5, 500, 500);
    expect(v.w).toBeGreaterThan(0);
  });
});

describe('panBy', () => {
  it('shifts the view box', () => {
    expect(panBy(base, 10, -5)).toMatchObject({ x: 10, y: -5 });
  });
});

describe('viewBoxString', () => {
  it('formats for the SVG attribute', () => {
    expect(viewBoxString(base)).toBe('0 0 1000 1000');
  });
});
