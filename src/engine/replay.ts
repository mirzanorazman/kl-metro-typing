import type { LineCode } from '../data/types';
import { KEYLOG_VERSION, type KeyLog } from './keylog';
import { keyLineRun, lineRunRoute } from './lineRun';
import { computeMetrics, type Metrics } from './metrics';
import type { NetworkIndex } from './network';
import {
  QUICK_LEG_TRACE_VERSION,
  advanceQuickRun,
  enterRecordedQuickCharacter,
  quickRunAt,
  quickRunMetrics,
  type QuickLegTrace,
} from './quickRun';
import { startRun, type RunState } from './run';
import {
  RUSH_EVIDENCE_VERSION,
  advanceRush,
  applyRushAction,
  enterRushCharacter,
  rushMetrics,
  startRush,
  type RushAction,
  type RushState,
} from './rushHour';

export interface ReplayResult {
  metrics: Metrics;
  stationsCompleted: number;
  /** True when the replay reached the terminal state a real Run would. */
  complete: boolean;
}

export interface QuickRunEvidence {
  keylog: KeyLog;
  trace: QuickLegTrace;
}

/**
 * Drives a Keylog back through the Line Run engine to derive its Metrics.
 *
 * `null` means the Keylog cannot describe a Run on this route at all — a
 * hand-forged log fails here, before any heuristic gets a say. A log that
 * replays but stops short returns `complete: false` instead.
 */
export function replayLineRun(
  net: NetworkIndex,
  line: LineCode,
  from: string,
  log: KeyLog,
): ReplayResult | null {
  if (log.v !== KEYLOG_VERSION) return null;

  const route = lineRunRoute(net, line, from);
  if (route.length === 0) return null;

  let state: RunState;
  try {
    state = startRun(net, from, log.t0);
  } catch {
    return null;
  }

  let now = log.t0;
  for (const event of log.events) {
    now += event.dt;
    state = keyLineRun(net, route, state, event.k, now);
  }

  // Elapsed time is the sum of Station times, not wall time — the same
  // measure SummaryScreen has always used, so pauses between Stations are
  // not charged against the player.
  const elapsed = state.stationTimes.reduce((n, s) => n + s.ms, 0);

  return {
    metrics: computeMetrics(state.correctChars, state.keystrokes, elapsed),
    stationsCompleted: state.stationTimes.length,
    complete: state.phase === 'ended' && state.stationTimes.length === route.length,
  };
}

/**
 * Drives a Keylog and its recorded leg choices back through the Quick Run engine.
 *
 * The 30-second deadline needs no parameter: the engine derives it
 * from the first keystroke. The run is advanced to that deadline afterwards,
 * because live it is the interval tick — not a keystroke — that completes it.
 */
export function replayQuickRun(
  net: NetworkIndex,
  evidence: QuickRunEvidence,
): ReplayResult | null {
  const log = evidence?.keylog;
  const trace = evidence?.trace;
  if (log?.v !== KEYLOG_VERSION || !Array.isArray(log.events)) return null;
  if (trace?.version !== QUICK_LEG_TRACE_VERSION || !Array.isArray(trace.legs)) return null;
  const first = trace.legs[0];
  if (!first) return null;

  let state = quickRunAt(net, first.line, first.at, first.toward);
  if (!state) return null;

  let now = log.t0;
  for (const event of log.events) {
    now += event.dt;
    state = enterRecordedQuickCharacter(net, state, event.k, now, trace.legs[state.trace.legs.length] ?? null);
    if (state.status === 'interrupted') return null;
  }
  if (state.deadline !== null) state = advanceQuickRun(state, state.deadline);
  if (state.trace.legs.length !== trace.legs.length) return null;

  return {
    metrics: quickRunMetrics(state, state.endedAt ?? now),
    stationsCompleted: state.completedStations.length,
    complete: state.status === 'completed',
  };
}

export interface RushEvidence {
  v: number;
  lineSet: LineCode[];
  start: string;
  seed: number;
  keylog: KeyLog;
  actions: RushAction[];
  /** The Run clock tick the live Run ended at. */
  endedAt: number;
}

export interface RushReplayResult extends ReplayResult {
  delivered: number;
  overflowedAt: string | null;
}

/**
 * Rebuilds a Rush Hour Run from its seed, Keylog and action log.
 *
 * `null` means the evidence cannot describe a Run at all: malformed, out of
 * order, or an action the engine would have refused. `complete` is true only
 * when the Run ended by Overflow at exactly the recorded tick — an abandoned
 * Run replays but is never complete.
 */
export function replayRushHour(net: NetworkIndex, evidence: RushEvidence): RushReplayResult | null {
  const log = evidence?.keylog;
  const actions = evidence?.actions;
  if (evidence?.v !== RUSH_EVIDENCE_VERSION) return null;
  if (log?.v !== KEYLOG_VERSION || !Array.isArray(log.events) || !Array.isArray(actions)) return null;
  if (!Number.isFinite(evidence.endedAt) || !Number.isFinite(evidence.seed)) return null;

  let state: RushState;
  try {
    state = startRush(net, evidence.lineSet, evidence.start, evidence.seed);
  } catch {
    return null;
  }

  let now = log.t0;
  let next = 0;
  const applyActionsBefore = (index: number): boolean => {
    while (next < actions.length && actions[next]!.i === index) {
      const action = actions[next]!;
      if (!Number.isFinite(action.t) || action.t < now) return false;
      now = action.t;
      const after = applyRushAction(net, state, action, now);
      if (after === state) return false;
      state = after;
      next += 1;
    }
    return true;
  };

  let keyAt = log.t0;
  for (let i = 0; i < log.events.length; i++) {
    if (!applyActionsBefore(i)) return null;
    keyAt += log.events[i]!.dt;
    const at = keyAt;
    if (at < now) return null;
    now = at;
    state = enterRushCharacter(net, state, log.events[i]!.k, now);
  }
  if (!applyActionsBefore(log.events.length)) return null;
  if (next !== actions.length) return null;
  if (evidence.endedAt < now) return null;

  state = advanceRush(net, state, evidence.endedAt);

  return {
    metrics: rushMetrics(state, evidence.endedAt),
    stationsCompleted: state.visited.length,
    delivered: state.delivered,
    overflowedAt: state.overflowedAt,
    complete: state.status === 'ended' && state.endReason === 'overflow' && state.endedAt === evidence.endedAt,
  };
}
