import type { Compass, Line, Point } from '../data/types';

/** Grid spacing between adjacent stations, in schematic units. */
export const STEP = 44;

const DELTA: Record<Compass, Point> = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 },
};

/**
 * Expands one line's path description into per-station positions.
 * Only the eight compass directions exist, so the result is octolinear
 * by construction rather than by careful hand-placement.
 */
export function expandLine(line: Line, step = STEP): Map<string, Point> {
  const totalGaps = line.schematic.segments.reduce((n, [, count]) => n + count, 0);
  const needed = line.stations.length - 1;
  if (totalGaps !== needed) {
    throw new Error(
      `line ${line.code}: segments describe ${totalGaps} gaps but the line has ${needed}`,
    );
  }

  const out = new Map<string, Point>();
  let cursor = { ...line.schematic.start };
  let i = 0;
  out.set(line.stations[0]!, { ...cursor });

  for (const [dir, count] of line.schematic.segments) {
    const d = DELTA[dir];
    for (let n = 0; n < count; n++) {
      cursor = { x: cursor.x + d.x * step, y: cursor.y + d.y * step };
      i++;
      out.set(line.stations[i]!, { ...cursor });
    }
  }
  return out;
}

/**
 * Merges every line's expansion. A station served by several lines must
 * resolve to the same point from each of them; anything else is a conflict.
 */
export function buildSchematic(
  lines: Line[],
  step = STEP,
): { points: Map<string, Point>; conflicts: string[] } {
  const points = new Map<string, Point>();
  const conflicts: string[] = [];

  for (const line of lines) {
    for (const [id, p] of expandLine(line, step)) {
      const existing = points.get(id);
      if (!existing) {
        points.set(id, p);
      } else if (existing.x !== p.x || existing.y !== p.y) {
        conflicts.push(
          `station ${id} is at (${existing.x}, ${existing.y}) on another line ` +
            `but (${p.x}, ${p.y}) on ${line.code}`,
        );
      }
    }
  }
  return { points, conflicts };
}
