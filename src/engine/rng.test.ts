import { describe, expect, it } from 'vitest';
import { nextRandom, seedRandom } from './rng';

function draw(state: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [value, next] = nextRandom(state);
    out.push(value);
    state = next;
  }
  return out;
}

describe('rng', () => {
  it('reproduces the same sequence from the same seed', () => {
    expect(draw(seedRandom(42), 10)).toEqual(draw(seedRandom(42), 10));
  });

  it('diverges for different seeds', () => {
    expect(draw(seedRandom(1), 5)).not.toEqual(draw(seedRandom(2), 5));
  });

  it('yields values in [0, 1)', () => {
    for (const v of draw(seedRandom(7), 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps its state a 32-bit unsigned integer, so it survives JSON', () => {
    let state = seedRandom(123.9);
    for (let i = 0; i < 100; i++) {
      state = nextRandom(state)[1];
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(2 ** 32);
    }
  });
});
