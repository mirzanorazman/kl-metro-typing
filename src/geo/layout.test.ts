import { describe, it, expect } from 'vitest';
import { lerpLayouts } from './layout';
import type { Point } from '../data/types';

const a = new Map<string, Point>([['s', { x: 0, y: 0 }]]);
const b = new Map<string, Point>([['s', { x: 100, y: 50 }]]);

describe('lerpLayouts', () => {
  it('returns the start layout at t = 0', () => {
    expect(lerpLayouts(a, b, 0).get('s')).toEqual({ x: 0, y: 0 });
  });

  it('returns the end layout at t = 1', () => {
    expect(lerpLayouts(a, b, 1).get('s')).toEqual({ x: 100, y: 50 });
  });

  it('interpolates in between', () => {
    expect(lerpLayouts(a, b, 0.5).get('s')).toEqual({ x: 50, y: 25 });
  });

  it('clamps t outside the unit range', () => {
    expect(lerpLayouts(a, b, 2).get('s')).toEqual({ x: 100, y: 50 });
    expect(lerpLayouts(a, b, -1).get('s')).toEqual({ x: 0, y: 0 });
  });

  it('skips stations missing from either layout rather than throwing', () => {
    const partial = new Map<string, Point>();
    expect(lerpLayouts(a, partial, 0.5).size).toBe(0);
  });
});
