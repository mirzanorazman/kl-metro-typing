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
