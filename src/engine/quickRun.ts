import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from './network';
import { applyKey, beginTyping, isPrintable, type TypingState } from './typing';
import { computeMetrics, type Metrics } from './metrics';

export const QUICK_RUN_MS = 30_000;
export const QUICK_RUN_MIN_ADVANCES = 4;
export const QUICK_LEG_TRACE_VERSION = 1;

export interface QuickLeg {
  line: LineCode;
  at: string;
  toward: string;
}

export interface QuickLegTrace {
  version: 1;
  legs: QuickLeg[];
}

export type QuickRunStatus = 'ready' | 'running' | 'completed' | 'interrupted';

export interface QuickStationTime {
  id: string;
  ms: number;
}

export interface QuickRunState {
  line: LineCode;
  activeLeg: QuickLeg;
  trace: QuickLegTrace;
  jumpRevision: number;
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
  interruptionReason: 'continuation-error' | null;
}

/** Whether a leg starts at least four Station advances from its Terminus. */
export function isEligibleQuickLeg(net: NetworkIndex, leg: QuickLeg): boolean {
  if (!leg) return false;
  const line = lineAt(net, leg.line);
  if (!line || !stationAt(net, leg.at) || !stationAt(net, leg.toward)) return false;

  const atIndex = line.stations.indexOf(leg.at);
  const towardIndex = line.stations.indexOf(leg.toward);
  if (atIndex < 0 || (towardIndex !== 0 && towardIndex !== line.stations.length - 1)) return false;

  return Math.abs(towardIndex - atIndex) >= QUICK_RUN_MIN_ADVANCES;
}

/** Enumerates eligible legs on one Line, optionally toward one Terminus. */
export function eligibleQuickLegs(net: NetworkIndex, lineCode: LineCode, toward?: string): QuickLeg[] {
  const line = lineAt(net, lineCode);
  if (!line) return [];

  const first = line.stations[0];
  const last = line.stations[line.stations.length - 1];
  if (!first || !last) return [];

  const termini = toward === undefined ? [last, first] : [toward];
  return termini.flatMap((terminus) => line.stations
    .map((at) => ({ line: lineCode, at, toward: terminus }))
    .filter((leg) => isEligibleQuickLeg(net, leg)));
}

function pickRandom<T>(candidates: readonly T[], random: () => number): T {
  const rawIndex = Math.floor(random() * candidates.length);
  const index = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(candidates.length - 1, rawIndex))
    : 0;
  return candidates[index]!;
}

/**
 * A ready Quick Run starting at `at`.
 *
 * Split out of `prepareQuickRun` so a Run can be reconstructed at a known
 * Station — replay cannot re-roll the random choice that picked it.
 * Returns null unless this is an eligible leg, including the four-advance minimum.
 */
export function quickRunAt(
  net: NetworkIndex,
  lineCode: LineCode,
  at: string,
  toward: string,
): QuickRunState | null {
  const activeLeg: QuickLeg = { line: lineCode, at, toward };
  if (!isEligibleQuickLeg(net, activeLeg)) return null;
  const line = lineAt(net, lineCode)!;
  const last = line.stations[line.stations.length - 1]!;
  const station = stationAt(net, at)!;

  return {
    line: lineCode,
    activeLeg,
    trace: { version: QUICK_LEG_TRACE_VERSION, legs: [activeLeg] },
    jumpRevision: 0,
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
    interruptionReason: null,
  };
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

  const allCandidates = eligibleQuickLegs(net, lineCode, toward);
  if (allCandidates.length === 0) {
    throw new Error('Quick Run unavailable: Line needs at least four station advances to a terminus');
  }
  const alternatives = allCandidates.filter((leg) => leg.at !== previousStart);
  const candidates = alternatives.length > 0 ? alternatives : allCandidates;
  const at = pickRandom(candidates, random).at;
  const state = quickRunAt(net, lineCode, at, toward);
  if (!state) throw new Error(`Quick Run starting station not found: ${at}`);
  return state;
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

type QuickLegCandidates = { line: LineCode; legs: QuickLeg[] }[];
type ChooseQuickLeg = (candidates: QuickLegCandidates) => QuickLeg | null;

/** Highest available preference tiers, shared by live selection and recorded choices. */
function nextQuickLegCandidates(net: NetworkIndex, state: QuickRunState): QuickLegCandidates {
  const eligibleLines = [...net.lines.keys()]
    .filter((line) => line !== state.line)
    .map((line) => ({ line, legs: eligibleQuickLegs(net, line) }))
    .filter(({ legs }) => legs.length > 0);
  const usedLines = new Set(state.trace.legs.map((leg) => leg.line));
  const unusedLines = eligibleLines.filter(({ line }) => !usedLines.has(line));
  const preferredLines = unusedLines.length > 0 ? unusedLines : eligibleLines;
  const typedStations = new Set(state.completedStations.map(({ id }) => id));
  return preferredLines.map(({ line, legs }) => {
    const untypedLegs = legs.filter((leg) => !typedStations.has(leg.at));
    return { line, legs: untypedLegs.length > 0 ? untypedLegs : legs };
  });
}

function selectNextLeg(candidates: QuickLegCandidates, random: () => number): QuickLeg | null {
  if (candidates.length === 0) return null;
  return pickRandom(pickRandom(candidates, random).legs, random);
}

/** Activates one validated leg for both live play and recorded-leg replay. */
function activateQuickLeg(net: NetworkIndex, state: QuickRunState, leg: QuickLeg, now: number): QuickRunState {
  const line = lineAt(net, leg.line)!;
  const station = stationAt(net, leg.at)!;
  return {
    ...state,
    line: leg.line,
    activeLeg: leg,
    trace: { ...state.trace, legs: [...state.trace.legs, leg] },
    jumpRevision: state.jumpRevision + 1,
    direction: leg.toward === line.stations[line.stations.length - 1] ? 1 : -1,
    at: leg.at,
    arrivedFrom: null,
    typing: beginTyping(station.name),
    stationStartedAt: now,
  };
}

function advanceStation(net: NetworkIndex, state: QuickRunState, now: number, chooseLeg: ChooseQuickLeg): QuickRunState {
  const line = lineAt(net, state.line);
  const stationIndex = line?.stations.indexOf(state.at) ?? -1;
  const stationStartedAt = state.stationStartedAt;
  if (!line || stationIndex < 0 || stationStartedAt === null) return state;

  const completed: QuickRunState = {
    ...state,
    completedStations: [...state.completedStations, { id: state.at, ms: now - stationStartedAt }],
  };
  if (state.at === state.activeLeg.toward) {
    const candidates = nextQuickLegCandidates(net, completed);
    const selected = chooseLeg(candidates);
    const leg = selected && candidates.find(({ line }) => line === selected.line)?.legs
      .find(({ at, toward }) => at === selected.at && toward === selected.toward);
    return leg
      ? activateQuickLeg(net, completed, leg, now)
      : { ...completed, status: 'interrupted', interruptionReason: 'continuation-error', endedAt: now };
  }
  const at = line.stations[stationIndex + state.direction];
  if (!at) return state;

  const station = stationAt(net, at);
  if (!station) return state;

  return {
    ...completed,
    at,
    arrivedFrom: state.at,
    typing: beginTyping(station.name),
    stationStartedAt: now,
  };
}

function applyQuickCharacter(net: NetworkIndex, state: QuickRunState, key: string, now: number, chooseLeg: ChooseQuickLeg): QuickRunState {
  const typing = applyKey(state.typing, key);
  if (typing === state.typing) return state;

  const next = {
    ...state,
    typing,
    correctChars: state.correctChars + (typing.cursor - state.typing.cursor),
    keystrokes: state.keystrokes + (typing.keystrokes - state.typing.keystrokes),
    errors: state.errors + (typing.errors - state.typing.errors),
  };
  return typing.done ? advanceStation(net, next, now, chooseLeg) : next;
}

function enterQuickKey(
  net: NetworkIndex,
  state: QuickRunState,
  key: string,
  now: number,
  chooseLeg: ChooseQuickLeg,
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
    return applyQuickCharacter(net, started, key, now, chooseLeg);
  }

  if (state.deadline !== null && now >= state.deadline) return completeQuickRun(state);
  return applyQuickCharacter(net, state, key, now, chooseLeg);
}

/** Enters one character, starting the run only for a printable first key. */
export function enterQuickCharacter(
  net: NetworkIndex,
  state: QuickRunState,
  key: string,
  now: number,
  random: () => number = Math.random,
): QuickRunState {
  return enterQuickKey(net, state, key, now, (candidates) => selectNextLeg(candidates, random));
}

/**
 * Replays a key using the next recorded leg only if this key completes a Terminus.
 * Missing or ineligible continuation interrupts with the same live failure state.
 */
export function enterRecordedQuickCharacter(
  net: NetworkIndex,
  state: QuickRunState,
  key: string,
  now: number,
  nextLeg: QuickLeg | null,
): QuickRunState {
  return enterQuickKey(net, state, key, now, () => nextLeg);
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
