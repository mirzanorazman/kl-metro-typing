import { describe, it, expect } from 'vitest';
import { zoomAt, panBy, viewBoxString, type ViewBox } from './usePanZoom';

const base: ViewBox = { x: 0, y: 0, w: 100, h: 100 };

describe('zoomAt', () => {
  it('shrinks the view box when zooming in', () => {
    expect(zoomAt(base, 0.5, 50, 50).w).toBeCloseTo(50);
  });

  it('keeps the focal point stationary', () => {
    const z = zoomAt(base, 0.5, 0, 0);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
  });

  it('refuses to zoom past the limits', () => {
    let v = base;
    for (let i = 0; i < 50; i++) v = zoomAt(v, 0.5, 50, 50);
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
    expect(viewBoxString(base)).toBe('0 0 100 100');
  });
});
