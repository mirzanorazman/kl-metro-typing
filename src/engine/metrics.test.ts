import { describe, it, expect } from 'vitest';
import { computeMetrics } from './metrics';

const MIN = 60_000;

describe('computeMetrics', () => {
  it('treats five correct characters as one word', () => {
    // 300 correct characters in one minute = 60 wpm
    expect(computeMetrics(300, 300, MIN).wpm).toBeCloseTo(60);
  });

  it('scales with elapsed time', () => {
    expect(computeMetrics(300, 300, MIN / 2).wpm).toBeCloseTo(120);
  });

  it('measures accuracy against total keystrokes', () => {
    expect(computeMetrics(90, 100, MIN).accuracy).toBeCloseTo(0.9);
  });

  it('squares accuracy in the score', () => {
    const m = computeMetrics(90, 100, MIN);
    expect(m.score).toBeCloseTo(m.wpm * 0.81);
  });

  it('returns zeroes rather than Infinity when no time has passed', () => {
    const m = computeMetrics(10, 10, 0);
    expect(m.wpm).toBe(0);
    expect(m.score).toBe(0);
  });

  it('reports perfect accuracy before any keystroke', () => {
    expect(computeMetrics(0, 0, MIN).accuracy).toBe(1);
  });
});
