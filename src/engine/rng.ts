/**
 * A seeded PRNG (mulberry32) whose whole state is one 32-bit unsigned integer.
 *
 * Functional rather than a closure so the state can live inside a Run's state
 * and survive a JSON round-trip — Replay depends on regenerating exactly the
 * same spawns from the same seed.
 */
export function seedRandom(seed: number): number {
  return Math.floor(seed) >>> 0;
}

/** Returns a value in [0, 1) and the next state. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}
