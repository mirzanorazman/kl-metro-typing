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
}

export type IncidentKind = 'signal-fault' | 'train-fault' | 'crowd-surge';
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

/** Numeric Train.at indices require NetworkIndex to resolve shared Station IDs. */
export function heldTrains(net: NetworkIndex, s: SimState): Set<number> {
  const stations = heldStations(s);
  const faults = new Set(s.incidents.filter((inc) => inc.kind === 'train-fault').map((inc) => inc.train));
  return new Set(s.trains.filter((t) => faults.has(t.id) || stations.has(nextStationId(net, t) ?? '')).map((t) => t.id));
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
    s.spawnDebt[id] = (s.spawnDebt[id] ?? 0)
      + PASSENGER_RATE * originWeight(net, id, phase.flow) * phase.multiplier * phase.escalation
      * (s.incidents.some((inc) => inc.kind === 'crowd-surge' && inc.place === id) ? CROWD_SURGE_MULTIPLIER : 1)
      * TICK_MS / 1000;
    while (s.spawnDebt[id]! >= 1) {
      s.spawnDebt[id]!--;
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
  let exchanged = 0;
  for (const [destination, count] of Object.entries(t.load)) {
    if (destination !== id && closer(destination)) continue;
    delete t.load[destination];
    exchanged += count;
    if (destination === id) s.delivered += count;
    else platform.waiting[destination] = (platform.waiting[destination] ?? 0) + count;
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
    exchanged += boarding;
  }
  return exchanged * DWELL_PER_PASSENGER_MS;
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
  s.trains.push({ id: s.nextTrainId++, line, at, dir, stage, ms, skipTo: null, load: {} });
}

export function startShiftSim(net: NetworkIndex, served: Served, rng: number): SimState {
  const s: SimState = {
    served: served.map((r) => ({ ...r })), trains: [], nextTrainId: 1, rng, shiftMs: 0,
    platforms: {}, outOfService: {}, oosOrder: [], delivered: 0, stranded: 0,
    calls: 0, onTimeCalls: 0, spawnDebt: {}, incidents: [], nextIncidentId: 1, incidentDebt: 0,
  };
  for (const id of servedStations(net, served)) {
    s.platforms[id] = { waiting: {}, fullMs: 0, lastCall: {} };
    s.spawnDebt[id] = 0;
  }
  for (const range of s.served) {
    const blocks = range.to - range.from;
    const slots = 2 * blocks;
    const count = trainsForLine(range, 1);
    for (let i = 0; i < count; i++) {
      // Start evenly around the out-and-back route. Shared-track collisions move
      // to the next free block; deferred fleets can reinforce when a safe
      // terminal slot opens on a later tick.
      for (let offset = 0; offset < slots; offset++) {
        const slot = (Math.floor(i * slots / count) + offset) % slots;
        const dir: Dir = slot < blocks ? 1 : -1;
        const at = dir === 1 ? range.from + slot + 1 : range.to - (slot - blocks) - 1;
        if (!blockFree(net, s, range.line, at - dir, at)) continue;
        addTrain(s, range.line, at, dir, 'signal', 0);
        break;
      }
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
    for (const dir of [1, -1] as const) {
      if (s.trains.filter((t) => t.line === range.line).length >= desired) break;
      const at = dir === 1 ? range.from : range.to;
      // An outbound reinforcement must not turn the other directional platform
      // into extra terminal storage. It can otherwise remain trapped there even
      // while the circular-wait guard keeps the existing fleet moving.
      if (range.from === range.to || !platformFree(net, s, range.line, at, dir)
        || !platformFree(net, s, range.line, at, dir === 1 ? -1 : 1)
        || !blockFree(net, s, range.line, at, at + dir)) continue;
      const id = net.lines.get(range.line)!.stations[at]!;
      if (s.outOfService[id]) continue;
      addTrain(s, range.line, at, dir, 'dwell', DWELL_BASE_MS);
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
    trains: s.trains.map((t) => ({ ...t, load: { ...t.load } })),
    platforms: Object.fromEntries(Object.entries(s.platforms).map(([id, p]) => [id, {
      ...p, waiting: { ...p.waiting }, lastCall: { ...p.lastCall },
    }])),
    outOfService: { ...s.outOfService },
    oosOrder: [...s.oosOrder],
    spawnDebt: { ...s.spawnDebt },
    incidents: s.incidents.map((inc) => ({ ...inc, stations: [...inc.stations] })),
  };
}

export function trainPosition(net: NetworkIndex, t: Train): { from: string; to: string; t: number } {
  const stations = net.lines.get(t.line)!.stations;
  return t.stage === 'running'
    ? { from: stations[t.at]!, to: stations[t.at + t.dir]!, t: Math.max(0, Math.min(1, t.ms / TRAVEL_MS)) }
    : { from: stations[t.at]!, to: stations[t.at]!, t: 0 };
}

export function bunchedTrains(net: NetworkIndex, s: SimState): Set<number> {
  const bunched = new Set<number>();
  const positions = s.trains.map((t) => {
    const position = trainPosition(net, t);
    return t.at + (t.stage === 'running' ? t.dir * position.t : 0);
  });
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
