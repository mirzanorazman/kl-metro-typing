import type { Line, LineCode, NetworkData, Station } from '../data/types';

export interface NetworkIndex {
  lines: Map<LineCode, Line>;
  stations: Map<string, Station>;
  /** station id -> walk-linked station ids */
  walk: Map<string, string[]>;
  /** line -> (station id -> index along the line) */
  order: Map<LineCode, Map<string, number>>;
}

/** A rail neighbour has a line; a walk-link neighbour has null. */
export interface Neighbour {
  station: string;
  line: LineCode | null;
}

export function buildNetwork(data: NetworkData): NetworkIndex {
  const lines = new Map(data.lines.map((l) => [l.code, l]));
  const stations = new Map(data.stations.map((s) => [s.id, s]));

  const order = new Map<LineCode, Map<string, number>>();
  for (const line of data.lines) {
    order.set(line.code, new Map(line.stations.map((id, i) => [id, i])));
  }

  const walk = new Map<string, string[]>();
  const addWalk = (from: string, to: string) => {
    const list = walk.get(from) ?? [];
    list.push(to);
    walk.set(from, list);
  };
  for (const link of data.links) {
    addWalk(link.a, link.b);
    addWalk(link.b, link.a);
  }

  return { lines, stations, walk, order };
}

export function stationAt(net: NetworkIndex, id: string): Station | undefined {
  return net.stations.get(id);
}

export function lineAt(net: NetworkIndex, code: LineCode): Line | undefined {
  return net.lines.get(code);
}

/** The lines a station serves. Stored once, as the keys of its code map. */
export function linesOf(station: Station): LineCode[] {
  return Object.keys(station.codes) as LineCode[];
}

export function neighboursOf(net: NetworkIndex, id: string): Neighbour[] {
  const station = net.stations.get(id);
  if (!station) return [];

  const out: Neighbour[] = [];
  for (const code of linesOf(station)) {
    const line = net.lines.get(code);
    const idx = net.order.get(code)?.get(id);
    if (!line || idx === undefined) continue;
    const before = line.stations[idx - 1];
    const after = line.stations[idx + 1];
    if (before !== undefined) out.push({ station: before, line: code });
    if (after !== undefined) out.push({ station: after, line: code });
  }

  for (const to of net.walk.get(id) ?? []) {
    out.push({ station: to, line: null });
  }
  return out;
}

/** One rail direction the train may take out of a station. */
export interface Direction {
  line: LineCode;
  /** The station this direction leads to next. */
  next: string;
  /** Terminus name this direction heads toward, for display. */
  toward: string;
}

function railDirections(net: NetworkIndex, id: string): Direction[] {
  const station = net.stations.get(id);
  if (!station) return [];

  const out: Direction[] = [];
  for (const code of linesOf(station)) {
    const line = net.lines.get(code);
    const idx = net.order.get(code)?.get(id);
    if (!line || idx === undefined) continue;

    const back = line.stations[idx - 1];
    const fwd = line.stations[idx + 1];
    if (back !== undefined) out.push({ line: code, next: back, toward: line.termini[0] });
    if (fwd !== undefined) out.push({ line: code, next: fwd, toward: line.termini[1] });
  }
  return out;
}

/**
 * Directions available from `at`, having arrived from `arrivedFrom`
 * (null when starting a run).
 *
 * Immediate reversal is filtered out, so the player cannot bounce back and
 * forth on a through line. The exception is per-LINE, not global: if the line
 * you arrived on ends here, reversing on that line is offered even when other
 * lines still have somewhere to go. Titiwangsa is the case that forces this —
 * it is the Monorail terminus but also serves AG, SP, and PY, so a global
 * "only reverse when there is nothing else" rule would strand the player at
 * the end of the Monorail.
 */
export function onwardOptions(
  net: NetworkIndex,
  at: string,
  arrivedFrom: string | null,
): Direction[] {
  const all = railDirections(net, at);
  if (arrivedFrom === null) return all;

  const forward = all.filter((d) => d.next !== arrivedFrom);
  const linesWithForward = new Set(forward.map((d) => d.line));

  const terminusReversals = all.filter(
    (d) => d.next === arrivedFrom && !linesWithForward.has(d.line),
  );

  const options = [...forward, ...terminusReversals];
  return options.length > 0 ? options : all;
}

/** Walk transfers out of a station. Free in Adventure. */
export function walkOptions(net: NetworkIndex, at: string): string[] {
  return net.walk.get(at) ?? [];
}

/** True when every station on the line is present in `visited`. */
export function isLineComplete(
  net: NetworkIndex,
  code: LineCode,
  visited: ReadonlySet<string>,
): boolean {
  const line = net.lines.get(code);
  if (!line) return false;
  return line.stations.every((id) => visited.has(id));
}
