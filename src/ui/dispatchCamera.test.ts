import { describe, expect, it } from 'vitest';
import { closeness, failCloseness } from './dispatchCamera';

describe('failCloseness', () => {
  it('is twice the closeness now, and never less than 4×', () => {
    expect(failCloseness(3)).toBe(6);
    expect(failCloseness(1.2)).toBe(4);
  });
});

describe('closeness', () => {
  it('is the early closeness up to 14 Stations', () => {
    expect(closeness(10)).toBe(3);
    expect(closeness(14)).toBe(3);
  });

  it('is the late closeness from 40 Stations', () => {
    expect(closeness(40)).toBe(1.2);
    expect(closeness(51)).toBe(1.2);
  });

  it('eases linearly between them', () => {
    expect(closeness(27)).toBeCloseTo(2.1);
  });

  it('follows the given settings', () => {
    expect(closeness(27, { early: 2, late: 2 })).toBe(2);
  });
});
