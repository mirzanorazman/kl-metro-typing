import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from './network';
import { applyKey, beginTyping, isPrintable, type TypingState } from './typing';
import { computeMetrics, type Metrics } from './metrics';

export const QUICK_RUN_MS = 45_000;

export type QuickRunStatus = 'ready' | 'running' | 'completed' | 'interrupted';

export interface QuickStationTime {
  id: string;
  ms: number;
}

export interface QuickRunState {
  line: LineCode;
  /** Terminus station id selected as the run's destination. */
  initialToward: string;
  direction: -1 | 1;
  at: string;
  arrivedFrom: string | null;
  typing: TypingState;
  completedStations: QuickStationTime[];
  startedAt: number | null;
  stationStartedAt: number | null;
  deadline: number | null;
  endedAt: number | null;
  correctChars: number;
  keystrokes: number;
  errors: number;
  status: QuickRunStatus;
}

export function prepareQuickRun(
  net: NetworkIndex,
  lineCode: LineCode,
  toward: string,
  previousStart: string | null,
  random: () => number = Math.random,
): QuickRunState {
  const line = lineAt(net, lineCode);
  if (!line || line.stations.length < 2) {
    throw new Error('Quick Run needs a valid Line');
  }

  const first = line.stations[0]!;
  const last = line.stations[line.stations.length - 1]!;
  if (toward !== first && toward !== last) {
    throw new Error('Quick Run destination must be a terminus');
  }

  const allCandidates = line.stations.filter((id) => id !== toward);
  const alternatives = allCandidates.filter((id) => id !== previousStart);
  const candidates = alternatives.length > 0 ? alternatives : allCandidates;
  const rawIndex = Math.floor(random() * candidates.length);
  const index = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(candidates.length - 1, rawIndex))
    : 0;
  const at = candidates[index]!;
  const station = stationAt(net, at);
  if (!station) {
    throw new Error(`Quick Run starting station not found: ${at}`);
  }

  return {
    line: lineCode,
    initialToward: toward,
    direction: toward === last ? 1 : -1,
    at,
    arrivedFrom: null,
    typing: beginTyping(station.name),
    completedStations: [],
    startedAt: null,
    stationStartedAt: null,
    deadline: null,
    endedAt: null,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
    status: 'ready',
  };
}

export function quickRunToward(net: NetworkIndex, state: QuickRunState): string {
  const line = lineAt(net, state.line);
  if (!line) return '';
  return line.termini[state.direction === 1 ? 1 : 0];
}

function completeQuickRun(state: QuickRunState): QuickRunState {
  if (state.status !== 'running' || state.deadline === null) return state;
  return { ...state, status: 'completed', endedAt: state.deadline };
}

/** Completes a run exactly when its deadline has been reached. */
export function advanceQuickRun(state: QuickRunState, now: number): QuickRunState {
  if (state.status !== 'running' || state.deadline === null || now < state.deadline) return state;
  return completeQuickRun(state);
}

function advanceStation(net: NetworkIndex, state: QuickRunState, now: number): QuickRunState {
  const line = lineAt(net, state.line);
  const stationIndex = line?.stations.indexOf(state.at) ?? -1;
  const stationStartedAt = state.stationStartedAt;
  if (!line || stationIndex < 0 || stationStartedAt === null) return state;

  let direction = state.direction;
  if (stationIndex + direction < 0 || stationIndex + direction >= line.stations.length) {
    direction = direction === 1 ? -1 : 1;
  }
  const at = line.stations[stationIndex + direction];
  if (!at) return state;

  const station = stationAt(net, at);
  if (!station) return state;

  return {
    ...state,
    direction,
    at,
    arrivedFrom: state.at,
    typing: beginTyping(station.name),
    completedStations: [...state.completedStations, { id: state.at, ms: now - stationStartedAt }],
    stationStartedAt: now,
  };
}

function applyQuickCharacter(net: NetworkIndex, state: QuickRunState, key: string, now: number): QuickRunState {
  const typing = applyKey(state.typing, key);
  if (typing === state.typing) return state;

  const next = {
    ...state,
    typing,
    correctChars: state.correctChars + (typing.cursor - state.typing.cursor),
    keystrokes: state.keystrokes + (typing.keystrokes - state.typing.keystrokes),
    errors: state.errors + (typing.errors - state.typing.errors),
  };
  return typing.done ? advanceStation(net, next, now) : next;
}

/** Enters one character, starting the run only for a printable first key. */
export function enterQuickCharacter(
  net: NetworkIndex,
  state: QuickRunState,
  key: string,
  now: number,
): QuickRunState {
  if (state.status === 'completed' || state.status === 'interrupted') return state;

  if (state.status === 'ready') {
    if (!isPrintable(key)) return state;
    const started: QuickRunState = {
      ...state,
      startedAt: now,
      stationStartedAt: now,
      deadline: now + QUICK_RUN_MS,
      status: 'running',
    };
    return applyQuickCharacter(net, started, key, now);
  }

  if (state.deadline !== null && now >= state.deadline) return completeQuickRun(state);
  return applyQuickCharacter(net, state, key, now);
}

/** Interrupts a live run unless it has already reached its deadline. */
export function interruptQuickRun(state: QuickRunState, now: number): QuickRunState {
  if (state.status !== 'running') return state;
  if (state.deadline !== null && now >= state.deadline) return completeQuickRun(state);
  return { ...state, status: 'interrupted', endedAt: now };
}

/** Reports score metrics for the elapsed portion of a Quick Run. */
export function quickRunMetrics(state: QuickRunState, now: number): Metrics {
  if (state.status === 'ready') return computeMetrics(0, 0, 0);

  const startedAt = state.startedAt ?? now;
  const endedAt = state.status === 'running'
    ? Math.min(now, state.deadline ?? now)
    : state.endedAt ?? now;
  return computeMetrics(state.correctChars, state.keystrokes, endedAt - startedAt);
}
