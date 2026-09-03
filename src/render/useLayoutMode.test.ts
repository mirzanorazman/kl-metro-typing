import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Point } from '../data/types';
import { useLayoutMode, prefersReducedMotion } from './useLayoutMode';

const geo = new Map<string, Point>([['s', { x: 0, y: 0 }]]);
const schematic = new Map<string, Point>([['s', { x: 100, y: 0 }]]);

describe('useLayoutMode', () => {
  it('starts in the requested mode with no animation', () => {
    const { result } = renderHook(() => useLayoutMode(geo, schematic, 'geo'));
    expect(result.current.layout.get('s')).toEqual({ x: 0, y: 0 });
  });

  it('lands exactly on the target layout when the morph is skipped', () => {
    const { result } = renderHook(() => useLayoutMode(geo, schematic, 'geo'));
    act(() => result.current.setMode('schematic', { animate: false }));
    expect(result.current.layout.get('s')).toEqual({ x: 100, y: 0 });
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when the browser reports no preference', () => {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});
