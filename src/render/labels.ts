import type { Point, ViewBox } from '../data/types';

/** A station that would like a label, and how badly it wants one. */
export interface LabelCandidate {
  id: string;
  at: Point;
  text: string;
  /** Higher wins the better spot, and is placed before lower. */
  priority: number;
  /** Placed even when nothing is free — for the station being typed. */
  required?: boolean;
  /**
   * The box's size, when it is not plain text — a chip with padding. Without
   * it the box is `text.length` characters by one line.
   */
  size?: { w: number; h: number };
  /** The side to try first; otherwise right, unless near the right edge. */
  prefer?: Side;
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  textAnchor: 'start' | 'end';
}

export interface PlaceOptions {
  /** Width of one character, in the same units as the positions. */
  charWidth: number;
  /** Height of a line of text, used as the label's box height. */
  lineHeight: number;
  /** Gap between the station mark and its text. */
  offset: number;
  /** The live viewport. Labels near its right edge turn inward. */
  bounds?: ViewBox;
  /**
   * Round furniture the text should not cross — the train and the beacon ring
   * around the station being typed. Station marks are deliberately not in
   * here: at close zoom a name is longer than the gap between two stops, so
   * treating every dot as an obstacle would drop most of the labels.
   */
  obstacles?: readonly Obstacle[];
  /** Rectangles labels must not cross, in the same units — chips already placed, say. */
  boxes?: readonly Box[];
  /**
   * Distances to try, as multiples of `offset`, nearest first. Each ring tries
   * all four corners before the next ring out. Default: just the one.
   */
  rings?: readonly number[];
  /** When set, a label is placed only wholly inside this box: the visible map, say. */
  within?: Box;
  /**
   * Rectangles nothing may be placed under, not even a required label while
   * any corner in any ring clears them: panels floating over the map, say.
   * With no corner free of everything, a required label takes the first one
   * clear of these and of the labels already placed, then the first clear
   * of these alone, and only then its first corner.
   */
  hard?: readonly Box[];
}

/** A circle labels route around. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /**
   * The station whose own label may sit over this box, starting `clear` from
   * its point: a mark drawn around that station, which every other label keeps off.
   */
  owner?: string;
  clear?: number;
}

export type Side = 'right' | 'left';
type Rung = 'up' | 'down';

/** Text sits above its baseline, so a box grows upward from `y`. */
function boxFor(
  candidate: LabelCandidate,
  side: Side,
  rung: Rung,
  opts: PlaceOptions,
  ring = 1,
): { x: number; y: number; textAnchor: 'start' | 'end'; box: Box } {
  const width = candidate.size?.w ?? candidate.text.length * opts.charWidth;
  const height = candidate.size?.h ?? opts.lineHeight;
  const offset = opts.offset * ring;
  const vGap = offset * 0.78;

  const x = candidate.at.x + (side === 'right' ? offset : -offset);
  const y =
    rung === 'up'
      ? candidate.at.y - vGap
      : candidate.at.y + vGap + height;

  return {
    x,
    y,
    textAnchor: side === 'right' ? 'start' : 'end',
    box: {
      x0: side === 'right' ? x : x - width,
      x1: side === 'right' ? x + width : x,
      y0: y - height,
      y1: y,
    },
  };
}

function hits(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Lay out station labels so they do not sit on top of each other.
 *
 * Every label used to go up and to the right of its station, which was fine
 * while only termini and major interchanges were labelled — they are far
 * apart. Once the follow camera pushed in far enough to label every station,
 * neighbours a few units apart wrote their names over each other.
 *
 * Labels are placed in priority order, each taking the first of four corners
 * that is still free. A label with no free corner is dropped rather than
 * stacked: at this zoom an unlabelled dot is legible and a doubled-up one is
 * not. `required` opts out of that, so the station being typed always shows.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  opts: PlaceOptions,
): PlacedLabel[] {
  const order = [...candidates].sort((a, b) => b.priority - a.priority);

  const taken: Box[] = (opts.obstacles ?? []).map((o) => ({
    x0: o.x - o.r,
    y0: o.y - o.r,
    x1: o.x + o.r,
    y1: o.y + o.r,
  }));
  taken.push(...(opts.boxes ?? []));
  const hard = opts.hard ?? [];
  taken.push(...hard);
  const rings = opts.rings ?? [1];
  const inside = (box: Box) => opts.within === undefined
    || (box.x0 >= opts.within.x0 && box.x1 <= opts.within.x1 && box.y0 >= opts.within.y0 && box.y1 <= opts.within.y1);

  // Near the right edge the text would run off screen, so try that side last.
  const nearRightEdge = (p: Point) =>
    opts.bounds !== undefined && p.x > opts.bounds.x + opts.bounds.w * 0.75;

  const placed: PlacedLabel[] = [];
  const placedBoxes: Box[] = [];
  for (const candidate of order) {
    const first = candidate.prefer ?? (nearRightEdge(candidate.at) ? 'left' : 'right');
    const sides: Side[] = first === 'left' ? ['left', 'right'] : ['right', 'left'];
    const corners = sides.flatMap((side): Array<[Side, Rung]> => [
      [side, 'up'],
      [side, 'down'],
    ]);
    // A box owned by this station is drawn around it: its label ignores the
    // box but starts far enough out to clear what is drawn.
    const own = taken.filter((b) => b.owner === candidate.id);
    const reach = Math.max(1, ...own.map((b) => (b.clear ?? 0) / opts.offset));
    const firstClear = (avoid: readonly Box[]) => {
      for (const ring of rings) {
        for (const [side, rung] of corners) {
          const option = boxFor(candidate, side, rung, opts, ring * reach);
          if (inside(option.box) && !avoid.some((t) => t.owner !== candidate.id && hits(t, option.box))) return option;
        }
      }
      return null;
    };

    let chosen = firstClear(taken);
    // A required label never goes under a panel or off the map while any
    // spot clears them, even if it has to sit on lesser things to do so.
    if (!chosen && candidate.required && (hard.length > 0 || opts.within)) {
      chosen = firstClear([...hard, ...placedBoxes]) ?? firstClear(hard);
    }

    // The station being typed wears the beacon ring, so every corner of it is
    // blocked; it keeps its label anyway rather than the player losing the
    // name of the place they are typing.
    if (!chosen && candidate.required) chosen = boxFor(candidate, sides[0]!, 'up', opts, reach);
    if (!chosen) continue;

    taken.push(chosen.box);
    placedBoxes.push(chosen.box);
    placed.push({
      id: candidate.id,
      x: chosen.x,
      y: chosen.y,
      textAnchor: chosen.textAnchor,
    });
  }
  return placed;
}
