import type { LineCode, Point } from '../../src/data/types';
import { loadNetworkData } from '../../src/data/load';
import { networkLayout } from '../../src/geo/networkLayout';

/**
 * The game's own network, in the game's own coordinates.
 *
 * The reel draws from `networkLayout()` rather than a copy, so every station
 * sits exactly where it does on the home map, and a data fix in the app
 * carries into the next render.
 */
const data = loadNetworkData();
const layout = networkLayout();

export interface ReelLine {
  code: LineCode;
  colour: string;
  stations: string[];
}

export const LINES: Record<LineCode, ReelLine> = Object.fromEntries(
  data.lines.map((l) => [l.code, { code: l.code, colour: l.colour, stations: l.stations }]),
) as Record<LineCode, ReelLine>;

/** Badge order on screen, matching the order the Lines are drawn in. */
export const LINE_ORDER: LineCode[] = ['KJ', 'AG', 'SP', 'MR', 'KG', 'PY', 'SA'];

export const STATION_NAME = new Map(data.stations.map((s) => [s.id, s.name]));
export const STATION_COUNT = data.stations.length;

/** Stations served by more than one Line, drawn as interchange rings. */
export const INTERCHANGES = new Set(
  data.stations.filter((s) => Object.keys(s.codes).length > 1).map((s) => s.id),
);

export const BACKDROP: Point[][] = layout.backdrop.map((b) => b.points);

export function pos(id: string): Point {
  const p = layout.geo.get(id);
  if (!p) throw new Error(`No position for station ${id}`);
  return p;
}

export function nameOf(id: string): string {
  return STATION_NAME.get(id) ?? id;
}

export function idx(line: LineCode, id: string): number {
  const i = LINES[line].stations.indexOf(id);
  if (i < 0) throw new Error(`${id} is not on ${line}`);
  return i;
}

/** A point part-way along a Line, where `at` is a fractional station index. */
export function along(line: LineCode, at: number): Point {
  const ids = LINES[line].stations;
  const clamped = Math.max(0, Math.min(ids.length - 1, at));
  const i = Math.min(Math.floor(clamped), ids.length - 2);
  const t = clamped - i;
  const a = pos(ids[i]!);
  const b = pos(ids[i + 1]!);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Direction of travel at a fractional index, as a unit vector. */
export function heading(line: LineCode, at: number, forward: boolean): Point {
  const ids = LINES[line].stations;
  const i = Math.max(0, Math.min(ids.length - 2, Math.floor(at)));
  const a = pos(ids[i]!);
  const b = pos(ids[i + 1]!);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const s = forward ? 1 : -1;
  return { x: ((b.x - a.x) / len) * s, y: ((b.y - a.y) / len) * s };
}

/** Station-pair keys shared by more than one Line, with each Line's slot. */
export const SHARED_SLOT = (() => {
  const byPair = new Map<string, LineCode[]>();
  for (const code of LINE_ORDER) {
    const ids = LINES[code].stations;
    for (let i = 0; i < ids.length - 1; i++) {
      const key = [ids[i], ids[i + 1]].sort().join('|');
      byPair.set(key, [...(byPair.get(key) ?? []), code]);
    }
  }
  return byPair;
})();
