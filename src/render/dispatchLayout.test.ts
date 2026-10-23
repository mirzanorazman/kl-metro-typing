import { describe, expect, it } from 'vitest';
import { hits, layoutPops, popBox, type PopWant } from './dispatchLayout';

describe('exchange pops', () => {
  const pop = (key: string, own = true, lines: 1 | 2 = 2): PopWant =>
    ({ key, at: { x: 0, y: 0 }, text: ['+12 boarded', '−3 off'].slice(0, lines), own });

  it('with nothing in the way, a pop sits centred above its Station', () => {
    const [placed] = layoutPops([pop('a')], 1, []);
    expect(placed!.x).toBe(0);
    expect(placed!.y).toBeLessThan(0);
    const box = popBox(placed!);
    expect(box.y1).toBeLessThanOrEqual(0);
  });

  it('pops at one Station stack upward', () => {
    const [a, b] = layoutPops([pop('a'), pop('b')], 1, []);
    expect(hits(popBox(a!), popBox(b!))).toBe(false);
    expect(b!.y).toBeLessThan(a!.y);
  });

  it('a pop whose usual spot is under a chip is placed clear of every chip', () => {
    const [free] = layoutPops([pop('a')], 1, []);
    const over = popBox(free!);
    // One chip over the usual spot, others round about.
    const chips = [
      { x0: over.x0 - 10, y0: over.y0 - 5, x1: over.x1 + 10, y1: over.y1 + 5 },
      { x0: 20, y0: -10, x1: 120, y1: 10 },
    ];
    for (const own of [true, false]) {
      const [placed] = layoutPops([pop('a', own)], 1, chips);
      expect(placed, 'every pop still shows').toBeTruthy();
      for (const chip of chips) expect(hits(popBox(placed!), chip)).toBe(false);
    }
  });

  it('pops keep on the visible map and out from under its panels', () => {
    const frame = { view: { x0: -40, y0: -15, x1: 400, y1: 400 }, panels: [{ x0: -400, y0: -400, x1: 400, y1: -15 }] };
    const [placed] = layoutPops([pop('a')], 1, [], frame);
    const box = popBox(placed!);
    expect(box.y0).toBeGreaterThanOrEqual(-15);
    expect(box.x0).toBeGreaterThanOrEqual(-40);
  });
});
