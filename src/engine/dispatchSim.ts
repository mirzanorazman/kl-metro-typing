import type { LineCode } from '../data/types';
import {
  BUNCH_BLOCKS, CENTRAL_PULL, CENTRAL_STATIONS, DWELL_BASE_MS, DWELL_PER_PASSENGER_MS,
  CROWD_SURGE_MULTIPLIER, LATE_FACTOR, ON_TIME_FACTOR, OOS_CROWD_MS, PASSENGER_RATE, PLATFORM_CAPACITY,
  SKIP_MAX_AHEAD, SKIP_MIN_AHEAD, STATIONS_PER_TRAIN, TICK_MS, TRAIN_CAPACITY, TRAVEL_MS, TURNAROUND_MS,
  type ShiftFlow,
} from './dispatchBalance';
import { servedDistances, servedStations, type Served, type ServedRange } from './dispatchNetwork';
import { nextRandom } from './rng';
import type { NetworkIndex } from './network';

export type Dir = 1 | -1;
export type TrainStage = 'signal' | 'cleared' | 'dwell' | 'running' | 'turnaround';

export interface Exchange {
  station: string;
  boarded: number;
  alighted: number;
  /** The alighted Passengers whose destination was this Station. */
  delivered: number;
  atMs: number;
}

export interface Dispersal {
  station: string;
  count: number;
  incident: number;
  atMs: number;
}

export interface Train {
  id: number;
  line: LineCode;
  dir: Dir;
  /** Approached Station for signal/cleared, current for dwell/turnaround, departed for running. */
  at: number;
  stage: TrainStage;
  /** Elapsed block time, remaining dwell/turnaround time, or time Held at a Signal. */
  ms: number;
  skipTo: number | null;
  load: Record<string, number>;
  /** The most recent call's exchange, set by every call. */
  lastExchange: Exchange | null;
}

export type IncidentKind = 'signal-fault' | 'train-fault' | 'crowd-surge' | 'service-gap';
export type OosCause = 'crowding' | IncidentKind;

export interface Incident {
  id: number;
  kind: IncidentKind;
  /** Station closed if the incident escalates. */
  place: string;
  /** Signal stretch, surge place, or empty for a train fault. */
  stations: string[];
  line: LineCode;
  train: number | null;
  startedMs: number;
  step: number;
  /** Crowd surge only: fractional count of surge-extra arrivals at the place; 0 otherwise. */
  extra: number;
}

export interface Platform {
  waiting: Record<string, number>;
  fullMs: number;
  /** Last accepted call per Line and incoming direction, in Shift milliseconds. */
  lastCall: Record<string, number>;
}

export interface SimState {
  served: Served;
  trains: Train[];
  nextTrainId: number;
  rng: number;
  shiftMs: number;
  platforms: Record<string, Platform>;
  outOfService: Record<string, OosCause>;
  oosOrder: string[];
  delivered: number;
  stranded: number;
  calls: number;
  onTimeCalls: number;
  spawnDebt: Record<string, number>;
  incidents: Incident[];
  nextIncidentId: number;
  incidentDebt: number;
  /** Shift time of the last Train entry per Line and outer end, keyed `${line}:${end}`. */
  entries: Record<string, number>;
  /** Passengers a fixed crowd surge dispersed: neither Delivered nor Stranded. */
  dispersed: number;
  lastDispersal: Dispersal | null;
  /** Shift time each bunched pair began, keyed `${rear}:${leader}` by Train id. */
  pairs: Record<string, number>;
  /** Service gap hold left per Train id, counted down while it waits at a Signal. */
  gapHolds: Record<number, number>;
  /** Pair keys that start no Service gap until the pair changes: their place was taken or closed, or their gap closed it. */
  spentPairs: Record<string, true>;
}

export interface PhaseNow {
  multiplier: number;
  flow: ShiftFlow;
  trainFactor: number;
  escalation: number;
}

/** Physical directed track, shared by Lines such as AG and SP. */
export function blockKey(net: NetworkIndex, line: LineCode, fromIndex: number, toIndex: number): string {
  const stations = net.lines.get(line)!.stations;
  return `${stations[fromIndex]!}>${stations[toIndex]!}`;
}

export function trainsForLine(range: ServedRange, trainFactor: number): number {
  return Math.max(1, Math.round(Math.max(2, Math.round((range.to - range.from + 1) / STATIONS_PER_TRAIN)) * trainFactor));
}

/** Terminal turnaround replaces base dwell; intermediate Stations are called in both directions. */
export function targetHeadwayMs(range: ServedRange): number {
  const blocks = range.to - range.from;
  const cycleMs = 2 * blocks * TRAVEL_MS + 2 * Math.max(0, blocks - 1) * DWELL_BASE_MS + 2 * TURNAROUND_MS;
  return cycleMs / trainsForLine(range, 1);
}

export type RangeEnd = 'from' | 'to';

/** Both ends if the range strictly contains a CENTRAL_STATIONS Station; otherwise the end further from masjid-jamek by straight-line distance between the stations' `geo` (lat/lng in stations.json). */
export function outerEnds(net: NetworkIndex, range: ServedRange): RangeEnd[] {
  const ids = net.lines.get(range.line)!.stations;
  for (let at = range.from + 1; at < range.to; at++) if (CENTRAL_STATIONS.includes(ids[at]!)) return ['from', 'to'];
  const centre = net.stations.get('masjid-jamek')!.geo;
  const distance = (id: string) => {
    const { lat, lng } = net.stations.get(id)!.geo;
    return Math.hypot(lat - centre.lat, (lng - centre.lng) * Math.cos(centre.lat * Math.PI / 180));
  };
  return distance(ids[range.to]!) > distance(ids[range.from]!) ? ['to'] : ['from'];
}

function entryKey(range: ServedRange, end: RangeEnd): string {
  return `${range.line}:${end}`;
}

export function crowdAt(s: SimState, id: string): number {
  return Object.values(s.platforms[id]?.waiting ?? {}).reduce((total, count) => total + count, 0);
}

export function heldStations(s: SimState): Set<string> {
  return new Set(s.incidents.filter((inc) => inc.kind === 'signal-fault').flatMap((inc) => inc.stations));
}

/** The next Station a Train will call or approach, including a terminal reversal. */
export function nextStationId(net: NetworkIndex, t: Train): string | null {
  const ids = net.lines.get(t.line)!.stations;
  const at = t.stage === 'signal' || t.stage === 'cleared' ? t.at
    : t.stage === 'turnaround' ? t.at - t.dir : t.at + t.dir;
  return ids[at] ?? null;
}

/**
 * The Station whose Signal a Train will next wait at: past an express run,
 * a terminal reversal and any closed Station it will run through.
 */
export function nextSignalStationId(net: NetworkIndex, s: SimState, t: Train): string | null {
  if (t.stage === 'signal') return nextStationId(net, t);
  const ids = net.lines.get(t.line)!.stations;
  const range = s.served.find((r) => r.line === t.line)!;
  const terminal = (t.dir === 1 && t.at === range.to) || (t.dir === -1 && t.at === range.from);
  let dir: Dir = t.stage === 'turnaround' || (t.stage === 'cleared' && terminal) ? (t.dir === 1 ? -1 : 1) : t.dir;
  let at = t.skipTo ?? t.at + dir;
  for (let blocks = 0; blocks < 2 * (range.to - range.from) && s.outOfService[ids[at] ?? '']; blocks++) {
    if (at + dir > range.to || at + dir < range.from) dir = dir === 1 ? -1 : 1;
    at += dir;
  }
  return ids[at] ?? null;
}

/**
 * Numeric Train.at indices require NetworkIndex to resolve shared Station IDs.
 * A Service gap hold applies only at a Signal: a running Train keeps moving.
 */
export function heldTrains(net: NetworkIndex, s: SimState): Set<number> {
  const stations = heldStations(s);
  const faults = new Set(s.incidents.filter((inc) => inc.kind === 'train-fault').map((inc) => inc.train));
  return new Set(s.trains.filter((t) => faults.has(t.id) || stations.has(nextStationId(net, t) ?? '')
    || (t.stage === 'signal' && (s.gapHolds[t.id] ?? 0) > 0)).map((t) => t.id));
}

export function originWeight(net: NetworkIndex, id: string, flow: ShiftFlow): number {
  const central = CENTRAL_STATIONS.includes(id);
  return net.stations.get(id)!.demand
    * ((flow === 'inbound' && !central) || (flow === 'outbound' && central) ? CENTRAL_PULL : 1);
}

export function destinationWeight(net: NetworkIndex, id: string, flow: ShiftFlow): number {
  const central = CENTRAL_STATIONS.includes(id);
  return net.stations.get(id)!.demand
    * ((flow === 'inbound' && central) || (flow === 'outbound' && !central) ? CENTRAL_PULL : 1);
}

function platformWait(net: NetworkIndex, s: SimState, t: Train): number {
  const id = net.lines.get(t.line)!.stations[t.at]!;
  return s.shiftMs - (s.platforms[id]!.lastCall[`${t.line}:${t.dir}`] ?? 0);
}

export function isLate(net: NetworkIndex, s: SimState, t: Train): boolean {
  const id = net.lines.get(t.line)!.stations[t.at]!;
  const range = s.served.find((r) => r.line === t.line)!;
  return (t.stage === 'signal' || t.stage === 'cleared') && !s.outOfService[id]
    && platformWait(net, s, t) > LATE_FACTOR * targetHeadwayMs(range);
}

function spawnPassengers(net: NetworkIndex, s: SimState, phase: PhaseNow): void {
  const ids = Object.keys(s.platforms).filter((id) => !s.outOfService[id]);
  // With fewer than two open Stations there is no valid trip or deferred demand.
  if (ids.length < 2) {
    for (const id of ids) s.spawnDebt[id] = 0;
    return;
  }
  const weights = ids.map((id) => destinationWeight(net, id, phase.flow));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const surge = s.incidents.find((inc) => inc.kind === 'crowd-surge' && inc.place === id);
    s.spawnDebt[id] = (s.spawnDebt[id] ?? 0)
      + PASSENGER_RATE * originWeight(net, id, phase.flow) * phase.multiplier * phase.escalation
      * (surge ? CROWD_SURGE_MULTIPLIER : 1)
      * TICK_MS / 1000;
    let spawned = 0;
    while (s.spawnDebt[id]! >= 1) {
      s.spawnDebt[id]!--;
      spawned++;
      let random: number;
      [random, s.rng] = nextRandom(s.rng);
      let draw = random * (total - weights[i]!);
      let destination = ids.find((candidate) => candidate !== id)!;
      for (let j = 0; j < ids.length; j++) {
        if (j === i) continue;
        destination = ids[j]!;
        draw -= weights[j]!;
        if (draw < 0) break;
      }
      const waiting = s.platforms[id]!.waiting;
      waiting[destination] = (waiting[destination] ?? 0) + 1;
    }
    // Bookkeeping only, with no rng: the share of this tick's arrivals the surge added.
    if (surge) surge.extra += spawned * (CROWD_SURGE_MULTIPLIER - 1) / CROWD_SURGE_MULTIPLIER;
  }
}

/** Next call after departure, including a reversal beyond closed end Stations. */
function nextStop(net: NetworkIndex, s: SimState, t: Train, dir: Dir): string | null {
  const range = s.served.find((r) => r.line === t.line)!;
  const ids = net.lines.get(t.line)!.stations;
  let at = t.at;
  for (let blocks = 0; blocks < 2 * (range.to - range.from); blocks++) {
    if (at + dir > range.to || at + dir < range.from) dir = dir === 1 ? -1 : 1;
    at += dir;
    const id = ids[at]!;
    if (!s.outOfService[id]) return id;
  }
  return null;
}

/** Called only after reserving a real platform entry. Returns added dwell time. */
function exchangePassengers(net: NetworkIndex, s: SimState, t: Train, outgoing: Dir): number {
  const id = net.lines.get(t.line)!.stations[t.at]!;
  const platform = s.platforms[id]!;
  const range = s.served.find((r) => r.line === t.line)!;
  s.calls++;
  if (platformWait(net, s, t) <= ON_TIME_FACTOR * targetHeadwayMs(range)) s.onTimeCalls++;
  platform.lastCall[`${t.line}:${t.dir}`] = s.shiftMs;
  const distances = servedDistances(net, s.served);
  const next = nextStop(net, s, t, outgoing);
  const closer = (destination: string) => next !== null
    && (distances.get(next)?.get(destination) ?? Infinity) < (distances.get(id)?.get(destination) ?? Infinity);
  let alighted = 0;
  let delivered = 0;
  let boarded = 0;
  for (const [destination, count] of Object.entries(t.load)) {
    if (destination !== id && closer(destination)) continue;
    delete t.load[destination];
    alighted += count;
    if (destination === id) {
      s.delivered += count;
      delivered += count;
    } else platform.waiting[destination] = (platform.waiting[destination] ?? 0) + count;
  }
  let room = TRAIN_CAPACITY - Object.values(t.load).reduce((sum, count) => sum + count, 0);
  for (const [destination, count] of Object.entries(platform.waiting)) {
    if (room <= 0) break;
    if (!closer(destination)) continue;
    const boarding = Math.min(room, count);
    t.load[destination] = (t.load[destination] ?? 0) + boarding;
    if (boarding === count) delete platform.waiting[destination];
    else platform.waiting[destination] = count - boarding;
    room -= boarding;
    boarded += boarding;
  }
  t.lastExchange = { station: id, boarded, alighted, delivered, atMs: s.shiftMs };
  return (alighted + boarded) * DWELL_PER_PASSENGER_MS;
}

/** Close once and strand all trips from or to the Station, regardless of cause. */
export function closeStation(s: SimState, id: string, cause: OosCause): boolean {
  const platform = s.platforms[id];
  if (!platform || s.outOfService[id]) return false;
  s.outOfService[id] = cause;
  s.oosOrder.push(id);
  s.spawnDebt[id] = 0;
  s.stranded += crowdAt(s, id);
  platform.waiting = {};
  for (const other of Object.values(s.platforms)) {
    s.stranded += other.waiting[id] ?? 0;
    delete other.waiting[id];
  }
  for (const t of s.trains) {
    s.stranded += t.load[id] ?? 0;
    delete t.load[id];
  }
  // A Service gap that closes its place spends its pair: no new gap at the rear Train's next call.
  for (const inc of s.incidents) {
    if (inc.kind !== 'service-gap' || inc.place !== id) continue;
    for (const key of Object.keys(s.pairs)) if (key.startsWith(`${inc.train}:`)) s.spentPairs[key] = true;
  }
  // A closed place cannot remain an active repair target.
  s.incidents = s.incidents.filter((inc) => inc.place !== id);
  return true;
}

function closeCrowdedPlatforms(s: SimState): void {
  for (const [id, platform] of Object.entries(s.platforms)) {
    if (s.outOfService[id]) continue;
    platform.fullMs = crowdAt(s, id) >= PLATFORM_CAPACITY ? platform.fullMs + TICK_MS : 0;
    if (platform.fullMs < OOS_CROWD_MS) continue;
    closeStation(s, id, 'crowding');
  }
}

function occupiedBlock(net: NetworkIndex, t: Train): string | null {
  if (t.stage === 'dwell' || t.stage === 'turnaround') return null;
  return t.stage === 'running'
    ? blockKey(net, t.line, t.at, t.at + t.dir)
    : blockKey(net, t.line, t.at - t.dir, t.at);
}

function blockFree(net: NetworkIndex, s: SimState, line: LineCode, from: number, to: number): boolean {
  const key = blockKey(net, line, from, to);
  return !s.trains.some((t) => occupiedBlock(net, t) === key);
}

function platformFree(net: NetworkIndex, s: SimState, line: LineCode, at: number, dir: Dir): boolean {
  const id = net.lines.get(line)!.stations[at]!;
  return !s.trains.some((t) => (t.stage === 'dwell' || t.stage === 'turnaround')
    && t.dir === dir && net.lines.get(t.line)!.stations[t.at] === id);
}

function platformKey(net: NetworkIndex, t: Train, at: number): string {
  return `platform:${net.lines.get(t.line)!.stations[at]!}:${t.dir}`;
}

/** The resource required after the Train leaves the one it currently occupies. */
function nextResource(net: NetworkIndex, s: SimState, t: Train): string {
  if (t.stage === 'dwell') return `block:${blockKey(net, t.line, t.at, t.at + t.dir)}`;
  if (t.stage === 'turnaround') return `block:${blockKey(net, t.line, t.at, t.at - t.dir)}`;
  // A bypass needs the next physical block, rather than the skipped platform.
  const at = t.stage === 'running' ? t.at + t.dir : t.at;
  const id = net.lines.get(t.line)!.stations[at]!;
  const range = s.served.find((r) => r.line === t.line)!;
  if ((s.outOfService[id] || (t.skipTo !== null && at !== t.skipTo)) && at !== range.from && at !== range.to) {
    return `block:${blockKey(net, t.line, at, at + t.dir)}`;
  }
  return platformKey(net, t, at);
}

/**
 * A free destination alone is insufficient: entering it can close a circular
 * wait between terminal platforms and incoming blocks. Reserve the move only
 * if the candidate's next-resource chain does not lead back to itself.
 * Existing waits remain intact; another Train can use the vacant resource to
 * open the circle. Both the occupancy map and bounded walk are O(Train count).
 */
function canMove(net: NetworkIndex, s: SimState, t: Train, stage: TrainStage, dir = t.dir): boolean {
  const candidate = { ...t, stage, dir };
  const owners = new Map<string, Train>();
  for (const train of s.trains) {
    const current = train === t ? candidate : train;
    const block = occupiedBlock(net, current);
    owners.set(block === null ? platformKey(net, current, current.at) : `block:${block}`, current);
  }
  let current = candidate;
  const seen = new Set<number>();
  while (!seen.has(current.id)) {
    seen.add(current.id);
    const owner = owners.get(nextResource(net, s, current));
    if (!owner) return true;
    if (owner.id === candidate.id) return false;
    current = owner;
  }
  return true;
}

function addTrain(s: SimState, line: LineCode, at: number, dir: Dir, stage: TrainStage, ms: number): void {
  s.trains.push({ id: s.nextTrainId++, line, at, dir, stage, ms, skipTo: null, load: {}, lastExchange: null });
}

export function startShiftSim(net: NetworkIndex, served: Served, rng: number): SimState {
  const s: SimState = {
    served: served.map((r) => ({ ...r })), trains: [], nextTrainId: 1, rng, shiftMs: 0,
    platforms: {}, outOfService: {}, oosOrder: [], delivered: 0, stranded: 0,
    calls: 0, onTimeCalls: 0, spawnDebt: {}, incidents: [], nextIncidentId: 1, incidentDebt: 0, entries: {},
    dispersed: 0, lastDispersal: null, pairs: {}, gapHolds: {}, spentPairs: {},
  };
  for (const id of servedStations(net, served)) {
    s.platforms[id] = { waiting: {}, fullMs: 0, lastCall: {} };
    s.spawnDebt[id] = 0;
  }
  for (const range of s.served) {
    if (range.from === range.to) continue;
    // The Morning peak runs inbound: the first train at each outer end already
    // waits at its first Signal, one block in, so the ready Shift has something
    // to type. A shared block taken by another Line's opener leaves that end to
    // reinforcement, which enters once the block is safe.
    for (const end of outerEnds(net, range)) {
      const dir: Dir = end === 'from' ? 1 : -1;
      const at = (end === 'from' ? range.from : range.to) + dir;
      if (!blockFree(net, s, range.line, at - dir, at)) continue;
      addTrain(s, range.line, at, dir, 'signal', 0);
      s.entries[entryKey(range, end)] = 0;
    }
  }
  return s;
}

export function clearSignal(net: NetworkIndex, s: SimState, trainId: number): boolean {
  const t = s.trains.find((candidate) => candidate.id === trainId);
  if (!t || t.stage !== 'signal' || heldTrains(net, s).has(trainId)) return false;
  t.stage = 'cleared';
  t.ms = 0;
  return true;
}

/** Set an express call without releasing the incoming block or exchanging Passengers. */
export function skipSignal(net: NetworkIndex, s: SimState, trainId: number, toIndex: number): boolean {
  const t = s.trains.find((candidate) => candidate.id === trainId);
  if (!t || t.stage !== 'signal' || heldTrains(net, s).has(trainId) || !isLate(net, s, t)) return false;
  const range = s.served.find((r) => r.line === t.line)!;
  const ahead = (toIndex - t.at) * t.dir;
  const id = net.lines.get(t.line)!.stations[toIndex];
  if (!Number.isInteger(toIndex) || ahead < SKIP_MIN_AHEAD || ahead > SKIP_MAX_AHEAD
    || toIndex < range.from || toIndex > range.to || id === undefined || s.outOfService[id]) return false;
  t.skipTo = toIndex;
  t.stage = 'cleared';
  t.ms = 0;
  return true;
}

/** Advances one fixed tick in array order, reserving every move before the next Train moves. */
export function stepSim(net: NetworkIndex, s: SimState, phase: PhaseNow): void {
  s.shiftMs += TICK_MS;
  spawnPassengers(net, s, phase);
  const held = heldTrains(net, s);
  for (const t of [...s.trains]) {
    if (held.has(t.id)) continue;
    const range = s.served.find((r) => r.line === t.line)!;
    const id = net.lines.get(t.line)!.stations[t.at]!;
    const closed = !!s.outOfService[id];
    const terminal = (t.dir === 1 && t.at === range.to) || (t.dir === -1 && t.at === range.from);
    if (closed && t.stage === 'signal') { t.stage = 'cleared'; t.ms = 0; }
    switch (t.stage) {
      case 'signal':
        t.ms += TICK_MS;
        break;
      case 'cleared':
        if ((closed || (t.skipTo !== null && t.at !== t.skipTo)) && !terminal) {
          if (blockFree(net, s, t.line, t.at, t.at + t.dir) && canMove(net, s, t, 'running')) {
            t.stage = 'running';
            t.ms = 0;
          }
          break;
        }
        if (!platformFree(net, s, t.line, t.at, t.dir)) break;
        if (terminal) {
          if (!canMove(net, s, t, 'turnaround')) break;
          t.stage = 'turnaround';
          t.ms = closed ? 0 : TURNAROUND_MS + exchangePassengers(net, s, t, t.dir === 1 ? -1 : 1);
        } else {
          if (!canMove(net, s, t, 'dwell')) break;
          t.stage = 'dwell';
          t.ms = DWELL_BASE_MS + exchangePassengers(net, s, t, t.dir);
        }
        break;
      case 'dwell':
        t.ms = Math.max(0, t.ms - TICK_MS);
        if (t.ms === 0 && blockFree(net, s, t.line, t.at, t.at + t.dir) && canMove(net, s, t, 'running')) {
          t.stage = 'running';
        }
        break;
      case 'running':
        t.ms += TICK_MS;
        if (t.ms >= TRAVEL_MS) {
          t.at += t.dir;
          if (t.at === t.skipTo) t.skipTo = null;
          t.stage = s.outOfService[net.lines.get(t.line)!.stations[t.at]!]
            || t.skipTo !== null ? 'cleared' : 'signal';
          t.ms = 0;
        }
        break;
      case 'turnaround': {
        const count = s.trains.filter((candidate) => candidate.line === t.line).length;
        if (count > trainsForLine(range, phase.trainFactor)) {
          for (const [destination, count] of Object.entries(t.load)) {
            if (closed || s.outOfService[destination]) s.stranded += count;
            else if (destination === id) s.delivered += count;
            else s.platforms[id]!.waiting[destination] = (s.platforms[id]!.waiting[destination] ?? 0) + count;
          }
          s.trains.splice(s.trains.indexOf(t), 1);
          break;
        }
        t.ms = Math.max(0, t.ms - TICK_MS);
        const dir: Dir = t.dir === 1 ? -1 : 1;
        if (t.ms === 0 && blockFree(net, s, t.line, t.at, t.at + dir) && canMove(net, s, t, 'running', dir)) {
          t.dir = dir;
          t.stage = 'running';
        }
        break;
      }
    }
  }

  for (const range of s.served) {
    const desired = trainsForLine(range, phase.trainFactor);
    const ends = outerEnds(net, range);
    for (const end of ends) {
      if (s.trains.filter((t) => t.line === range.line).length >= desired) break;
      // Entries come inward from the outskirts at headway intervals rather than
      // all at once, so the fleet arrives spread along the Line.
      const last = s.entries[entryKey(range, end)];
      if (last !== undefined && s.shiftMs - last < targetHeadwayMs(range) / ends.length) continue;
      const dir: Dir = end === 'from' ? 1 : -1;
      const at = end === 'from' ? range.from : range.to;
      // An outbound reinforcement must not turn the other directional platform
      // into extra terminal storage. It can otherwise remain trapped there even
      // while the circular-wait guard keeps the existing fleet moving.
      if (range.from === range.to || !platformFree(net, s, range.line, at, dir)
        || !platformFree(net, s, range.line, at, dir === 1 ? -1 : 1)
        || !blockFree(net, s, range.line, at, at + dir)) continue;
      const id = net.lines.get(range.line)!.stations[at]!;
      if (s.outOfService[id]) continue;
      addTrain(s, range.line, at, dir, 'dwell', DWELL_BASE_MS);
      s.entries[entryKey(range, end)] = s.shiftMs;
      const t = s.trains[s.trains.length - 1]!;
      t.ms += exchangePassengers(net, s, t, dir);
    }
  }
  closeCrowdedPlatforms(s);
}

export function cloneSim(s: SimState): SimState {
  return {
    ...s,
    served: s.served.map((r) => ({ ...r })),
    trains: s.trains.map((t) => ({ ...t, load: { ...t.load }, lastExchange: t.lastExchange && { ...t.lastExchange } })),
    platforms: Object.fromEntries(Object.entries(s.platforms).map(([id, p]) => [id, {
      ...p, waiting: { ...p.waiting }, lastCall: { ...p.lastCall },
    }])),
    outOfService: { ...s.outOfService },
    oosOrder: [...s.oosOrder],
    spawnDebt: { ...s.spawnDebt },
    entries: { ...s.entries },
    incidents: s.incidents.map((inc) => ({ ...inc, stations: [...inc.stations] })),
    lastDispersal: s.lastDispersal && { ...s.lastDispersal },
    pairs: { ...s.pairs },
    gapHolds: { ...s.gapHolds },
    spentPairs: { ...s.spentPairs },
  };
}

export function trainPosition(net: NetworkIndex, t: Train): { from: string; to: string; t: number } {
  const stations = net.lines.get(t.line)!.stations;
  return t.stage === 'running'
    ? { from: stations[t.at]!, to: stations[t.at + t.dir]!, t: Math.max(0, Math.min(1, t.ms / TRAVEL_MS)) }
    : { from: stations[t.at]!, to: stations[t.at]!, t: 0 };
}

/** Fractional Station index along the Line, moving between Stations while running. */
function linePosition(net: NetworkIndex, t: Train): number {
  return t.at + (t.stage === 'running' ? t.dir * trainPosition(net, t).t : 0);
}

/** At one position, a Train approaching the Station is behind one at its platform, which is behind one leaving. */
const STAGE_ORDER: Record<TrainStage, number> = { signal: 0, cleared: 0, dwell: 1, turnaround: 1, running: 2 };

/** True when `a` is behind `b` in their shared direction of travel. */
function behind(a: Train, pa: number, b: Train, pb: number): boolean {
  if (pa !== pb) return (pb - pa) * a.dir > 0;
  if (STAGE_ORDER[a.stage] !== STAGE_ORDER[b.stage]) return STAGE_ORDER[a.stage] < STAGE_ORDER[b.stage];
  return a.id < b.id;
}

/**
 * Rear Train id to its leader's, for bunched Trains (as `bunchedTrains`
 * decides) with the rear behind in the direction of travel. In a chain each
 * Train's leader is the nearest Train ahead of it.
 */
export function pairedRears(net: NetworkIndex, s: SimState): Map<number, number> {
  const positions = s.trains.map((t) => linePosition(net, t));
  const pairs = new Map<number, number>();
  for (let i = 0; i < s.trains.length; i++) {
    const rear = s.trains[i]!;
    let leader = -1;
    for (let j = 0; j < s.trains.length; j++) {
      const other = s.trains[j]!;
      if (j === i || other.line !== rear.line || other.dir !== rear.dir
        || Math.abs(positions[i]! - positions[j]!) > BUNCH_BLOCKS || !behind(rear, positions[i]!, other, positions[j]!)) continue;
      if (leader < 0 || behind(other, positions[j]!, s.trains[leader]!, positions[leader]!)) leader = j;
    }
    if (leader >= 0) pairs.set(rear.id, s.trains[leader]!.id);
  }
  return pairs;
}

export function bunchedTrains(net: NetworkIndex, s: SimState): Set<number> {
  const bunched = new Set<number>();
  const positions = s.trains.map((t) => linePosition(net, t));
  for (let i = 0; i < s.trains.length; i++) {
    const a = s.trains[i]!;
    for (let j = i + 1; j < s.trains.length; j++) {
      const b = s.trains[j]!;
      if (a.line !== b.line || a.dir !== b.dir || Math.abs(positions[i]! - positions[j]!) > BUNCH_BLOCKS) continue;
      bunched.add(a.id);
      bunched.add(b.id);
    }
  }
  return bunched;
}
