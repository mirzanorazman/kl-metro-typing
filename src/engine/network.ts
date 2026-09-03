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
