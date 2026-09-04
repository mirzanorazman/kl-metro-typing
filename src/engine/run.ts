import type { LineCode } from '../data/types';
import {
  onwardOptions,
  stationAt,
  type Direction,
  type NetworkIndex,
} from './network';
import { applyKey, beginTyping, type TypingState } from './typing';
import { computeMetrics, type Metrics } from './metrics';

export type RunPhase = 'typing' | 'junction' | 'ended';

export interface StationTime {
  id: string;
  ms: number;
}

export interface RunState {
  at: string;
  arrivedFrom: string | null;
  /** Line currently being travelled. Null before the first direction choice. */
  line: LineCode | null;
  phase: RunPhase;
  typing: TypingState;
  /** Directions offered while phase is 'junction'. */
  options: Direction[];
  visited: string[];
  stationTimes: StationTime[];
  startedAt: number;
  stationStartedAt: number;
  correctChars: number;
  keystrokes: number;
  errors: number;
}

export function startRun(net: NetworkIndex, at: string, now: number): RunState {
  const station = stationAt(net, at);
  if (!station) throw new Error(`unknown start station: ${at}`);
  return {
    at,
    arrivedFrom: null,
    line: null,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    visited: [],
    stationTimes: [],
    startedAt: now,
    stationStartedAt: now,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
  };
}

/** Begins typing `to`, having come from `state.at` along `line`. */
function moveTo(
  net: NetworkIndex,
  state: RunState,
  to: string,
  line: LineCode,
  now: number,
): RunState {
  const station = stationAt(net, to);
  if (!station) throw new Error(`unknown station: ${to}`);
  return {
    ...state,
    at: to,
    arrivedFrom: state.at,
    line,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    stationStartedAt: now,
  };
}

/** Called when the current station's name has been typed in full. */
function arrive(net: NetworkIndex, state: RunState, now: number): RunState {
  const visited = state.visited.includes(state.at)
    ? state.visited
    : [...state.visited, state.at];

  const arrived: RunState = {
    ...state,
    visited,
    stationTimes: [
      ...state.stationTimes,
      { id: state.at, ms: now - state.stationStartedAt },
    ],
  };

  const options = onwardOptions(net, state.at, state.arrivedFrom);
  if (options.length === 0) return { ...arrived, phase: 'ended', options: [] };

  // A single onward direction needs no decision — keep the train rolling.
  const only = options.length === 1 ? options[0]! : null;
  if (only) return moveTo(net, arrived, only.next, only.line, now);

  return { ...arrived, phase: 'junction', options };
}

export function keyRun(
  net: NetworkIndex,
  state: RunState,
  key: string,
  now: number,
): RunState {
  if (state.phase !== 'typing') return state;

  const before = state.typing;
  const typing = applyKey(before, key);
  if (typing === before) return state;

  const gainedChar = typing.cursor > before.cursor;
  const next: RunState = {
    ...state,
    typing,
    correctChars: state.correctChars + (gainedChar ? 1 : 0),
    keystrokes: state.keystrokes + 1,
    errors: state.errors + (gainedChar ? 0 : 1),
  };

  return typing.done ? arrive(net, next, now) : next;
}

export function chooseDirection(
  net: NetworkIndex,
  state: RunState,
  dir: Direction,
  now: number,
): RunState {
  if (state.phase !== 'junction') return state;
  return moveTo(net, state, dir.next, dir.line, now);
}

/**
 * Takes whichever onward option leads to `next`. Used by Line Run, where the
 * route is fixed and interchanges must not prompt the player for a decision.
 */
export function chooseTowards(
  net: NetworkIndex,
  state: RunState,
  next: string,
  now: number,
): RunState {
  if (state.phase !== 'junction') return state;
  const dir = state.options.find((o) => o.next === next);
  return dir ? chooseDirection(net, state, dir, now) : state;
}

/** Walk transfers are free in Adventure: no line, no cost. */
export function walkTo(net: NetworkIndex, state: RunState, to: string, now: number): RunState {
  const station = stationAt(net, to);
  if (!station) return state;
  return {
    ...state,
    at: to,
    arrivedFrom: null,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    stationStartedAt: now,
  };
}

export function endRun(state: RunState): RunState {
  return { ...state, phase: 'ended', options: [] };
}

export function runMetrics(state: RunState, now: number): Metrics {
  return computeMetrics(state.correctChars, state.keystrokes, now - state.startedAt);
}

/**
 * Reverses mid-line: the station just left becomes the next one to type.
 * A no-op before the first move, or while a junction choice is open.
 */
export function turnAround(net: NetworkIndex, state: RunState, now: number): RunState {
  if (state.phase !== 'typing') return state;
  if (state.arrivedFrom === null || state.line === null) return state;
  return moveTo(net, state, state.arrivedFrom, state.line, now);
}
