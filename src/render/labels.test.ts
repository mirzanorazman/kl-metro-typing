import { describe, it, expect } from 'vitest';
import { placeLabels, type LabelCandidate } from './labels';

const opts = { charWidth: 10, lineHeight: 10, offset: 5 };

const at = (id: string, x: number, y: number, priority = 0): LabelCandidate =>
  ({ id, at: { x, y }, text: 'AB', priority });

describe('placeLabels', () => {
  it('sets a lone label above and to the right of its station', () => {
    const [label] = placeLabels([at('a', 0, 0)], opts);
    expect(label!.x).toBeGreaterThan(0);
    expect(label!.y).toBeLessThan(0);
    expect(label!.textAnchor).toBe('start');
  });

  it('labels every station when they are far apart', () => {
    const placed = placeLabels(
      [at('a', 0, 0), at('b', 500, 0), at('c', 0, 500)],
      opts,
    );
    expect(placed.map((l) => l.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('moves a label that would collide rather than overlapping it', () => {
    // Two stations close enough that both labels cannot sit up and right.
    const placed = placeLabels([at('a', 0, 0), at('b', 4, 0)], opts);
    expect(placed).toHaveLength(2);
    const [first, second] = placed;
    const overlaps =
      Math.abs(first!.x - second!.x) < 20 && Math.abs(first!.y - second!.y) < 10;
    expect(overlaps).toBe(false);
  });

  it('places the higher priority station first, so it keeps the best spot', () => {
    const loose = placeLabels([at('a', 0, 0)], opts)[0]!;
    const placed = placeLabels([at('a', 0, 0, 0), at('b', 4, 0, 9)], opts);
    const b = placed.find((l) => l.id === 'b')!;
    expect(b.x - 4).toBeCloseTo(loose.x, 5);
    expect(b.y).toBeCloseTo(loose.y, 5);
  });

  it('drops a label with nowhere free rather than stacking it on another', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => at(`s${i}`, i % 4, Math.floor(i / 4)));
    const placed = placeLabels(crowd, opts);
    expect(placed.length).toBeLessThan(crowd.length);
  });

  it('never drops a station marked as required', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => at(`s${i}`, i % 4, Math.floor(i / 4)));
    const placed = placeLabels(
      [...crowd, { ...at('must', 1, 0), required: true }],
      opts,
    );
    expect(placed.some((l) => l.id === 'must')).toBe(true);
  });

  it('turns a label inward near the right edge, so it stays on screen', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 };
    const [label] = placeLabels([at('a', 95, 50)], { ...opts, bounds });
    expect(label!.textAnchor).toBe('end');
    expect(label!.x).toBeLessThan(95);
  });

  it('keeps a label clear of the train and the beacon ring', () => {
    // Nothing else competes for the spot, so only the obstacle can move it.
    const free = placeLabels([at('a', 0, 0)], opts)[0]!;
    const obstacle = { x: free.x + 5, y: free.y - 3, r: 12 };
    const [moved] = placeLabels([at('a', 0, 0)], { ...opts, obstacles: [obstacle] });

    const width = 2 * opts.charWidth;
    const x0 = moved!.textAnchor === 'end' ? moved!.x - width : moved!.x;
    const overlaps =
      x0 < obstacle.x + obstacle.r && obstacle.x - obstacle.r < x0 + width &&
      moved!.y - opts.lineHeight < obstacle.y + obstacle.r &&
      obstacle.y - obstacle.r < moved!.y;
    expect(overlaps).toBe(false);
  });

  it('lets a required label sit inside an obstacle rather than vanish', () => {
    // The station being typed wears the beacon ring, so its own label has
    // nowhere outside it to go.
    const placed = placeLabels(
      [{ ...at('active', 0, 0), required: true }],
      { ...opts, obstacles: [{ x: 0, y: 0, r: 200 }] },
    );
    expect(placed).toHaveLength(1);
    expect(placed[0]!.id).toBe('active');
  });
});
