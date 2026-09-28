import type { LineCode } from '../data/types';
import {
  linesOf,
  onwardOptions,
  stationAt,
  walkOptions,
  type Direction,
  type NetworkIndex,
} from './network';
import { applyKey, beginTyping, isPrintable, type TypingState } from './typing';
import { computeMetrics, type Metrics } from './metrics';
import { nextRandom, seedRandom } from './rng';
import {
  BASE_SPAWN_PER_SECOND,
  CARRIAGE_CAPACITY,
  DAY_ESCALATION,
  DAY_PHASES,
  INTERCHANGE_QUEUE_CAPACITY,
  OVERFLOW_DRAIN_FACTOR,
  OVERFLOW_MS,
  QUEUE_CAPACITY,
  TICK_MS,
  WALK_PENALTY_MS,
  type DayPhaseName,
} from './rushBalance';

export interface Passenger {
  id: number;
  /** A Passenger wants a Line, not a Station. */
  target: LineCode;
}

export interface RushQueue {
  passengers: Passenger[];
  /** Game time accumulated in the Overflow ring; the Run ends at OVERFLOW_MS. */
  overflowMs: number;
}

export type RushStatus = 'ready' | 'running' | 'paused' | 'ended';
export type RushEndReason = 'overflow' | 'abandoned';
/** What the train is doing. Not a Day phase and not the Run's Status. */
export type RushStage = 'typing' | 'junction' | 'walking';

export interface RushState {
  lineSet: LineCode[];
  seed: number;
  rng: number;
  status: RushStatus;
  endReason: RushEndReason | null;
  overflowedAt: string | null;

  /** Run-clock tick of the first printable key. */
  startedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  endedAt: number | null;
  /** Simulated game time, always a whole number of ticks. */
  gameMs: number;

  spawnDebt: number;
  nextPassengerId: number;
  spawned: number;
  dropped: number;
  queues: Record<string, RushQueue>;
  load: Passenger[];
  delivered: number;

  at: string;
  arrivedFrom: string | null;
  line: LineCode | null;
  stage: RushStage;
  options: Direction[];
  walks: string[];
  /** Game time at which a Walk lockout ends. */
  walkUntil: number | null;
  walkLockedMs: number;
  typing: TypingState;
  visited: string[];
  correctChars: number;
  keystrokes: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Geometry: what a Line set allows, derived once per network and Line set.

export interface SpawnPoint {
  station: string;
  weight: number;
  targets: LineCode[];
}

export interface RushGeometry {
  stations: string[];
  spawns: SpawnPoint[];
  totalWeight: number;
}

const geometryCache = new WeakMap<NetworkIndex, Map<string, RushGeometry>>();

export function rushLineSetKey(lineSet: readonly LineCode[]): string {
  return [...new Set(lineSet)].sort().join('+');
}

function onLineSet(net: NetworkIndex, lineSet: readonly LineCode[], id: string): boolean {
  const station = stationAt(net, id);
  return !!station && linesOf(station).some((l) => lineSet.includes(l));
}

export function rushGeometry(net: NetworkIndex, lineSet: readonly LineCode[]): RushGeometry {
  const key = rushLineSetKey(lineSet);
  let perNet = geometryCache.get(net);
  if (!perNet) geometryCache.set(net, (perNet = new Map()));
  const cached = perNet.get(key);
  if (cached) return cached;

  const stations = [...new Set(lineSet.flatMap((code) => net.lines.get(code)?.stations ?? []))].sort();
  const reachable = new Set(stations.flatMap((id) => linesOf(stationAt(net, id)!)));
  const spawns = stations
    .map((id) => {
      const station = stationAt(net, id)!;
      const served = linesOf(station);
      const targets = [...net.lines.keys()].filter((l) => reachable.has(l) && !served.includes(l));
      return { station: id, weight: station.demand, targets };
    })
    .filter((s) => s.targets.length > 0 && s.weight > 0);
  const geometry = { stations, spawns, totalWeight: spawns.reduce((n, s) => n + s.weight, 0) };
  perNet.set(key, geometry);
  return geometry;
}

export function queueCapacity(net: NetworkIndex, id: string): number {
  const station = stationAt(net, id);
  return station && linesOf(station).length > 1 ? INTERCHANGE_QUEUE_CAPACITY : QUEUE_CAPACITY;
}

// ---------------------------------------------------------------------------
// The day.

export interface RushDayPhase {
  day: number;
  name: DayPhaseName;
  multiplier: number;
  /** 0..1 through the current Day phase. */
  progress: number;
}

const DAY_MS = DAY_PHASES.reduce((n, p) => n + p.ms, 0);

export function rushDayPhase(gameMs: number): RushDayPhase {
  const day = Math.floor(gameMs / DAY_MS) + 1;
  let within = gameMs - (day - 1) * DAY_MS;
  const escalation = 1 + DAY_ESCALATION * (day - 1);
  for (const phase of DAY_PHASES) {
    if (within < phase.ms) {
      return { day, name: phase.name, multiplier: phase.multiplier * escalation, progress: within / phase.ms };
    }
    within -= phase.ms;
  }
  const last = DAY_PHASES[DAY_PHASES.length - 1]!;
  return { day, name: last.name, multiplier: last.multiplier * escalation, progress: 1 };
}

// ---------------------------------------------------------------------------
// Start and the tick.

export function startRush(
  net: NetworkIndex,
  lineSet: readonly LineCode[],
  at: string,
  seed: number,
): RushState {
  const lines = [...new Set(lineSet)].sort() as LineCode[];
  if (lines.length === 0 || lines.some((l) => !net.lines.has(l))) {
    throw new Error('Rush Hour needs a Line set of known Lines');
  }
  const station = stationAt(net, at);
  if (!station || !onLineSet(net, lines, at)) {
    throw new Error(`Rush Hour start must be on the Line set: ${at}`);
  }
  const queues: Record<string, RushQueue> = {};
  for (const id of rushGeometry(net, lines).stations) queues[id] = { passengers: [], overflowMs: 0 };

  return {
    lineSet: lines,
    seed,
    rng: seedRandom(seed),
    status: 'ready',
    endReason: null,
    overflowedAt: null,
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    endedAt: null,
    gameMs: 0,
    spawnDebt: 0,
    nextPassengerId: 1,
    spawned: 0,
    dropped: 0,
    queues,
    load: [],
    delivered: 0,
    at,
    arrivedFrom: null,
    line: null,
    stage: 'typing',
    options: [],
    walks: [],
    walkUntil: null,
    walkLockedMs: 0,
    typing: beginTyping(station.name),
    visited: [],
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
  };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], total: number, r: number): T {
  let x = r * total;
  for (const item of items) {
    if (x < item.weight) return item;
    x -= item.weight;
  }
  return items[items.length - 1]!;
}

/** One fixed step of game time. Mutates a private copy made by the caller. */
function tick(net: NetworkIndex, s: RushState, geo: RushGeometry): void {
  const phase = rushDayPhase(s.gameMs);
  s.gameMs += TICK_MS;

  if (s.stage === 'walking') {
    s.walkLockedMs += TICK_MS;
    if (s.walkUntil !== null && s.gameMs >= s.walkUntil) {
      s.stage = 'typing';
      s.walkUntil = null;
    }
  }

  if (geo.spawns.length > 0) {
    s.spawnDebt += (BASE_SPAWN_PER_SECOND * phase.multiplier * TICK_MS) / 1000;
    while (s.spawnDebt >= 1) {
      s.spawnDebt -= 1;
      let r: number;
      [r, s.rng] = nextRandom(s.rng);
      const point = pickWeighted(geo.spawns, geo.totalWeight, r);
      [r, s.rng] = nextRandom(s.rng);
      const target = point.targets[Math.min(point.targets.length - 1, Math.floor(r * point.targets.length))]!;
      const queue = s.queues[point.station]!;
      s.spawned += 1;
      if (queue.passengers.length >= queueCapacity(net, point.station)) {
        s.dropped += 1;
      } else {
        s.queues[point.station] = {
          ...queue,
          passengers: [...queue.passengers, { id: s.nextPassengerId++, target }],
        };
      }
    }
  }

  for (const id of geo.stations) {
    const queue = s.queues[id]!;
    const full = queue.passengers.length >= queueCapacity(net, id);
    const overflowMs = full
      ? queue.overflowMs + TICK_MS
      : Math.max(0, queue.overflowMs - TICK_MS * OVERFLOW_DRAIN_FACTOR);
    if (overflowMs !== queue.overflowMs) s.queues[id] = { ...queue, overflowMs };
    if (overflowMs >= OVERFLOW_MS && s.status === 'running') {
      s.status = 'ended';
      s.endReason = 'overflow';
      s.overflowedAt = id;
      s.endedAt = s.startedAt! + s.pausedMs + s.gameMs;
    }
  }
}

/** Game time the Run clock `now` corresponds to. */
function gameTimeAt(state: RushState, now: number): number {
  if (state.startedAt === null) return 0;
  return now - state.startedAt - state.pausedMs;
}

/** Advances the sim, in whole ticks, up to the Run clock `now`. */
export function advanceRush(net: NetworkIndex, state: RushState, now: number): RushState {
  if (state.status !== 'running') return state;
  const target = gameTimeAt(state, now);
  if (state.gameMs + TICK_MS > target) return state;

  const geo = rushGeometry(net, state.lineSet);
  const s: RushState = { ...state, queues: { ...state.queues } };
  while (s.status === 'running' && s.gameMs + TICK_MS <= target) tick(net, s, geo);
  return s;
}

// ---------------------------------------------------------------------------
// Movement.

function moveTo(net: NetworkIndex, state: RushState, to: string, line: LineCode | null): RushState {
  return {
    ...state,
    at: to,
    arrivedFrom: line === null ? null : state.at,
    line,
    stage: 'typing',
    options: [],
    walks: [],
    typing: beginTyping(stationAt(net, to)!.name),
  };
}

function serves(net: NetworkIndex, id: string, line: LineCode): boolean {
  const station = stationAt(net, id);
  return !!station && linesOf(station).includes(line);
}

/** How many of the Load would be Delivered at `station`. */
export function deliverableAt(net: NetworkIndex, state: RushState, station: string): number {
  return state.load.filter((p) => serves(net, station, p.target)).length;
}

function arrive(net: NetworkIndex, state: RushState): RushState {
  const at = state.at;
  const staying = state.load.filter((p) => !serves(net, at, p.target));
  const delivered = state.delivered + (state.load.length - staying.length);
  const queue = state.queues[at] ?? { passengers: [], overflowMs: 0 };
  const room = Math.max(0, CARRIAGE_CAPACITY - staying.length);
  const boarding = queue.passengers.slice(0, room);

  const inSet = (d: Direction) => state.lineSet.includes(d.line);
  let options = onwardOptions(net, at, state.arrivedFrom).filter(inSet);
  if (options.length === 0) options = onwardOptions(net, at, null).filter(inSet);
  const walks = walkOptions(net, at).filter((id) => onLineSet(net, state.lineSet, id));

  const arrived: RushState = {
    ...state,
    load: [...staying, ...boarding],
    delivered,
    queues: { ...state.queues, [at]: { ...queue, passengers: queue.passengers.slice(boarding.length) } },
    visited: state.visited.includes(at) ? state.visited : [...state.visited, at],
  };

  const only = options.length === 1 && walks.length === 0 ? options[0]! : null;
  if (only) return moveTo(net, arrived, only.next, only.line);
  return { ...arrived, stage: 'junction', options, walks };
}

function applyCharacter(net: NetworkIndex, state: RushState, key: string): RushState {
  if (state.stage !== 'typing') return state;
  const typing = applyKey(state.typing, key);
  if (typing === state.typing) return state;
  const next: RushState = {
    ...state,
    typing,
    correctChars: state.correctChars + (typing.cursor - state.typing.cursor),
    keystrokes: state.keystrokes + (typing.keystrokes - state.typing.keystrokes),
    errors: state.errors + (typing.errors - state.typing.errors),
  };
  return typing.done ? arrive(net, next) : next;
}

/** Enters one character; the first printable key starts the Run. */
export function enterRushCharacter(net: NetworkIndex, state: RushState, key: string, now: number): RushState {
  if (state.status === 'ready') {
    if (!isPrintable(key)) return state;
    return applyCharacter(net, { ...state, status: 'running', startedAt: now }, key);
  }
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running') return synced;
  return applyCharacter(net, synced, key);
}

export function chooseRushDirection(net: NetworkIndex, state: RushState, dir: Direction, now: number): RushState {
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running' || synced.stage !== 'junction') return state;
  const offered = synced.options.find((o) => o.line === dir.line && o.next === dir.next);
  return offered ? moveTo(net, synced, offered.next, offered.line) : state;
}

export function turnRushAround(net: NetworkIndex, state: RushState, now: number): RushState {
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running' || synced.stage !== 'typing') return state;
  if (synced.arrivedFrom === null || synced.line === null) return state;
  return moveTo(net, synced, synced.arrivedFrom, synced.line);
}

/** Takes a Walk link from a Junction; typing is locked for WALK_PENALTY_MS. */
export function walkRush(net: NetworkIndex, state: RushState, to: string, now: number): RushState {
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running' || synced.stage !== 'junction' || !synced.walks.includes(to)) return state;
  return { ...moveTo(net, synced, to, null), stage: 'walking', walkUntil: synced.gameMs + WALK_PENALTY_MS };
}

// ---------------------------------------------------------------------------
// Pause, abandon, metrics.

export function pauseRush(net: NetworkIndex, state: RushState, now: number): RushState {
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running') return state;
  return { ...synced, status: 'paused', pausedAt: now };
}

export function resumeRush(state: RushState, now: number): RushState {
  if (state.status !== 'paused' || state.pausedAt === null) return state;
  return { ...state, status: 'running', pausedMs: state.pausedMs + (now - state.pausedAt), pausedAt: null };
}

export function abandonRush(net: NetworkIndex, state: RushState, now: number): RushState {
  const synced = advanceRush(net, state, now);
  if (synced.status !== 'running' && synced.status !== 'paused') return state;
  return { ...synced, status: 'ended', endReason: 'abandoned', endedAt: now, pausedAt: null };
}

/** Metrics over typing time: game time, less pauses and Walk lockouts. */
export function rushMetrics(state: RushState, now: number): Metrics {
  if (state.status === 'ready') return computeMetrics(0, 0, 0);
  const gameMs = state.status === 'running' ? Math.max(state.gameMs, gameTimeAt(state, now)) : state.gameMs;
  return computeMetrics(state.correctChars, state.keystrokes, gameMs - state.walkLockedMs);
}

// ---------------------------------------------------------------------------
// Actions: every non-key input, logged beside the Keylog so Replay can
// reproduce the Run. `i` is how many Keylog events preceded the action, which
// orders it against keys even when both land on the same millisecond.

export const RUSH_EVIDENCE_VERSION = 1;

export type RushActionBody =
  | { a: 'choose'; line: LineCode; next: string }
  | { a: 'turn' }
  | { a: 'walk'; to: string }
  | { a: 'pause' }
  | { a: 'resume' }
  | { a: 'abandon' };

export type RushAction = RushActionBody & { i: number; t: number };

/**
 * Applies one action. Returns the very same object when the action is refused
 * (every action function returns its input unsynced on refusal), so callers
 * log an action only when it was taken.
 */
export function applyRushAction(
  net: NetworkIndex,
  state: RushState,
  action: RushActionBody,
  now: number,
): RushState {
  switch (action.a) {
    case 'choose': {
      const dir = state.options.find((o) => o.line === action.line && o.next === action.next);
      return dir ? chooseRushDirection(net, state, dir, now) : state;
    }
    case 'turn':
      return turnRushAround(net, state, now);
    case 'walk':
      return walkRush(net, state, action.to, now);
    case 'pause':
      return pauseRush(net, state, now);
    case 'resume':
      return resumeRush(state, now);
    case 'abandon':
      return abandonRush(net, state, now);
  }
}
