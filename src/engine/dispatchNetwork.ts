import type { LineCode } from '../data/types';
import {
  EXPANSION_MAX_STATIONS,
  EXPANSION_MIN_STATIONS,
  EXPANSION_OFFERS,
  SHIFTS_PER_ERA,
} from './dispatchBalance';
import { stationAt, type NetworkIndex } from './network';
import { nextRandom } from './rng';

/** Inclusive indices into a Line's ordered Stations. */
export interface ServedRange { line: LineCode; from: number; to: number }
/** One contiguous range per Line, sorted by Line code. */
export type Served = readonly ServedRange[];

export const STARTING_NETWORK: Served = [{ line: 'KJ', from: 4, to: 17 }];

export interface EraOpening { line: LineCode; from: string; to: string }
export interface Era { label: string; opens: readonly EraOpening[] }

export const ERAS: readonly Era[] = [
  { label: '1990s', opens: [
    { line: 'KJ', from: 'gombak', to: 'kelana-jaya' },
    { line: 'AG', from: 'sentul-timur', to: 'ampang' },
    { line: 'SP', from: 'sentul-timur', to: 'sri-petaling' },
  ] },
  { label: '2003', opens: [{ line: 'MR', from: 'kl-sentral', to: 'titiwangsa' }] },
  { label: '2015–17', opens: [
    { line: 'KJ', from: 'kelana-jaya', to: 'putra-heights' },
    { line: 'SP', from: 'sri-petaling', to: 'putra-heights' },
    { line: 'KG', from: 'kwasa-damansara', to: 'kajang' },
  ] },
  { label: '2022–23', opens: [{ line: 'PY', from: 'kwasa-damansara', to: 'putrajaya-sentral' }] },
  { label: 'Latest', opens: [{ line: 'SA', from: 'bandar-utama', to: 'johan-setia' }] },
];

export function eraFor(cleared: number): number {
  return Math.min(Math.floor(cleared / SHIFTS_PER_ERA), ERAS.length - 1);
}

export function servedKey(served: Served): string {
  return [...served].sort((a, b) => a.line.localeCompare(b.line))
    .map((r) => `${r.line}:${r.from}-${r.to}`).join('|');
}

export function servedStations(net: NetworkIndex, served: Served): string[] {
  return [...new Set(served.flatMap((r) => net.lines.get(r.line)!.stations.slice(r.from, r.to + 1)))].sort();
}

export function servedLines(served: Served): LineCode[] {
  return served.map((r) => r.line).sort();
}

export function isServed(net: NetworkIndex, served: Served, id: string): boolean {
  return served.some((r) => {
    const i = net.order.get(r.line)?.get(id);
    return i !== undefined && i >= r.from && i <= r.to;
  });
}

/** The resulting range on this Line; added counts globally new Stations only. */
export interface Expansion {
  line: LineCode;
  from: number;
  to: number;
  farEnd: string;
  added: string[];
}

/** Union each Line's openings up to this Era, preserving any unopened gaps. */
function openedRanges(net: NetworkIndex, era: number): ServedRange[] {
  const ranges: ServedRange[] = [];
  for (const spec of ERAS.slice(0, era + 1)) {
    for (const opening of spec.opens) {
      const order = net.order.get(opening.line);
      const from = order?.get(opening.from);
      const to = order?.get(opening.to);
      if (from !== undefined && to !== undefined) ranges.push({ line: opening.line, from, to });
    }
  }
  ranges.sort((a, b) => a.line.localeCompare(b.line) || a.from - b.from);
  const merged: ServedRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous?.line === range.line && range.from <= previous.to + 1) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

export function expansionCandidates(net: NetworkIndex, served: Served, era: number): Expansion[] {
  const stations = new Set(servedStations(net, served));
  const candidates = new Map<string, Expansion>();
  const add = (line: LineCode, from: number, to: number, farIndex: number) => {
    const ids = net.lines.get(line)!.stations;
    const key = `${line}:${from}-${to}`;
    if (!candidates.has(key)) candidates.set(key, {
      line, from, to, farEnd: ids[farIndex]!,
      added: [...new Set(ids.slice(from, to + 1).filter((id) => !stations.has(id)))],
    });
  };

  for (const open of openedRanges(net, era)) {
    const current = served.find((r) => r.line === open.line);
    if (current) {
      if (current.from < open.from || current.to > open.to) continue;
      for (let size = EXPANSION_MIN_STATIONS; size <= EXPANSION_MAX_STATIONS; size++) {
        const from = Math.max(open.from, current.from - size);
        const to = Math.min(open.to, current.to + size);
        if (from < current.from) add(open.line, from, current.to, from);
        if (to > current.to) add(open.line, current.from, to, to);
      }
    } else {
      const ids = net.lines.get(open.line)!.stations;
      for (let anchor = open.from; anchor <= open.to; anchor++) {
        if (!stations.has(ids[anchor]!)) continue;
        for (let size = EXPANSION_MIN_STATIONS; size <= EXPANSION_MAX_STATIONS; size++) {
          const from = Math.max(open.from, anchor - size + 1);
          const to = Math.min(open.to, anchor + size - 1);
          if (from < anchor) add(open.line, from, anchor, from);
          if (to > anchor) add(open.line, anchor, to, to);
        }
      }
    }
  }
  return [...candidates.values()];
}

export function drawOffers(net: NetworkIndex, served: Served, era: number, rng: number): [Expansion[], number] {
  const shuffled = expansionCandidates(net, served, era);
  for (let i = shuffled.length - 1; i > 0; i--) {
    let r: number;
    [r, rng] = nextRandom(rng);
    const j = Math.floor(r * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const offers: Expansion[] = [];
  const ends = new Set<string>();
  const names = new Set<string>();
  for (const e of shuffled) {
    const end = `${e.line}:${net.order.get(e.line)!.get(e.farEnd) === e.from ? 'from' : 'to'}`;
    const name = stationAt(net, e.farEnd)!.name;
    if (ends.has(end) || names.has(name)) continue;
    offers.push(e);
    ends.add(end);
    names.add(name);
    if (offers.length === EXPANSION_OFFERS) break;
  }
  return [offers, rng];
}

export function applyExpansion(served: Served, e: Expansion): Served {
  const current = served.find((r) => r.line === e.line);
  const range = {
    line: e.line,
    from: Math.min(current?.from ?? e.from, e.from),
    to: Math.max(current?.to ?? e.to, e.to),
  };
  return [...served.filter((r) => r.line !== e.line), range].sort((a, b) => a.line.localeCompare(b.line));
}

type Distances = ReadonlyMap<string, ReadonlyMap<string, number>>;
const distancesCache = new WeakMap<NetworkIndex, Map<string, Distances>>();

/** All-pairs shortest rail hops within served ranges; Walk links never connect them. */
export function servedDistances(net: NetworkIndex, served: Served): Distances {
  const key = servedKey(served);
  let perNet = distancesCache.get(net);
  if (!perNet) distancesCache.set(net, (perNet = new Map()));
  const cached = perNet.get(key);
  if (cached) return cached;

  const neighbours = new Map(servedStations(net, served).map((id) => [id, new Set<string>()]));
  for (const r of served) {
    const ids = net.lines.get(r.line)!.stations;
    for (let i = r.from; i < r.to; i++) {
      neighbours.get(ids[i]!)!.add(ids[i + 1]!);
      neighbours.get(ids[i + 1]!)!.add(ids[i]!);
    }
  }
  const distances = new Map<string, ReadonlyMap<string, number>>();
  for (const from of neighbours.keys()) {
    const hops = new Map([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i]!;
      for (const next of neighbours.get(at)!) {
        if (hops.has(next)) continue;
        hops.set(next, hops.get(at)! + 1);
        queue.push(next);
      }
    }
    distances.set(from, hops);
  }
  perNet.set(key, distances);
  return distances;
}
