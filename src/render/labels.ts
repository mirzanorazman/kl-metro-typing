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
}

/** A circle labels route around. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Side = 'right' | 'left';
type Rung = 'up' | 'down';

/** Text sits above its baseline, so a box grows upward from `y`. */
function boxFor(
  candidate: LabelCandidate,
  side: Side,
  rung: Rung,
  opts: PlaceOptions,
): { x: number; y: number; textAnchor: 'start' | 'end'; box: Box } {
  const width = candidate.text.length * opts.charWidth;
  const vGap = opts.offset * 0.78;

  const x = candidate.at.x + (side === 'right' ? opts.offset : -opts.offset);
  const y =
    rung === 'up'
      ? candidate.at.y - vGap
      : candidate.at.y + vGap + opts.lineHeight;

  return {
    x,
    y,
    textAnchor: side === 'right' ? 'start' : 'end',
    box: {
      x0: side === 'right' ? x : x - width,
      x1: side === 'right' ? x + width : x,
      y0: y - opts.lineHeight,
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

  // Near the right edge the text would run off screen, so try that side last.
  const nearRightEdge = (p: Point) =>
    opts.bounds !== undefined && p.x > opts.bounds.x + opts.bounds.w * 0.75;

  const placed: PlacedLabel[] = [];
  for (const candidate of order) {
    const sides: Side[] = nearRightEdge(candidate.at) ? ['left', 'right'] : ['right', 'left'];
    const corners = sides.flatMap((side): Array<[Side, Rung]> => [
      [side, 'up'],
      [side, 'down'],
    ]);

    let chosen: ReturnType<typeof boxFor> | null = null;
    for (const [side, rung] of corners) {
      const option = boxFor(candidate, side, rung, opts);
      if (!taken.some((t) => hits(t, option.box))) {
        chosen = option;
        break;
      }
    }

    // The station being typed wears the beacon ring, so every corner of it is
    // blocked; it keeps its label anyway rather than the player losing the
    // name of the place they are typing.
    if (!chosen && candidate.required) chosen = boxFor(candidate, sides[0]!, 'up', opts);
    if (!chosen) continue;

    taken.push(chosen.box);
    placed.push({
      id: candidate.id,
      x: chosen.x,
      y: chosen.y,
      textAnchor: chosen.textAnchor,
    });
  }
  return placed;
}
