import type { LineCode } from '../data/types';
import type { NetworkIndex } from './network';
import type { DispatchJudgement } from './dispatchJudge';
import { eraFor } from './dispatchNetwork';
import type { Metrics } from './metrics';
import { isLongName, type EvalContext } from './achievementDefs';
import { RUN_LOG_SIZE, type AchievementState } from './achievementState';
import { evaluate, localDay, type Recorded } from './achievements';

/** What a finished Line Run or Quick Run tells the achievements about the typing. */
export interface TypingFacts {
  /** True when the replay accepted the Run; only then do Score, accuracy and typing records count. */
  eligible: boolean;
  /** The replayed Metrics when eligible, else the live ones. */
  metrics: Metrics;
  correctChars: number;
  bestKeyStreak: number;
  stations: { id: string; ms: number; errors: number }[];
}
export interface LineRunFacts extends TypingFacts { line: LineCode; from: string; complete: boolean }
export interface QuickRunFacts extends TypingFacts {
  startLine: LineCode;
  jumps: number;
  /** Time left on the Quick Run clock when its last Station completed; null when none did. */
  lastStationLeftMs: number | null;
  /** Wall-clock time the Run was opened. */
  openedAt: number;
}

/** A Quick Run chain carries on if the next one opens within this long of the last Summary. */
const CHAIN_WINDOW_MS = 60_000;
/** Last Train Home: a Quick Run's last Station finished with this much clock left, or less. */
const LAST_TRAIN_MS = 1_000;
/** Puchong in One Breath: the Station must be typed at this pace. */
const PUCHONG_WPM = 60;
const MIN_COMEBACK_ACCURACY = 0.97;
const LOW_ACCURACY = 0.9;
/** Seven Colours: ride this many different Lines in one Adventure. */
const SEVEN_COLOURS = 7;
/** Round Trip: back at the start after this many other Stations. */
const ROUND_TRIP_STATIONS = 20;

// --- small helpers ---------------------------------------------------------

/** `list` with `item` in it once. Returns `list` itself when nothing changes. */
function withItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list : [...list, item];
}

function withFlag(state: AchievementState, flag: string): AchievementState {
  return state.flags.includes(flag) ? state : { ...state, flags: [...state.flags, flag] };
}

function wpmOf(chars: number, ms: number): number {
  return ms > 0 ? chars / 5 / (ms / 60_000) : 0;
}

/**
 * Typing-craft records, from an eligible Run only. `logRun` false (a Career) keeps the Run out of the
 * Picking Up Speed log, though its accuracy still counts for Back on Track.
 */
function recordCraft(
  net: NetworkIndex, state: AchievementState, facts: TypingFacts, at: number, logRun = true,
): AchievementState {
  if (!facts.eligible) return state;

  let next: AchievementState = {
    ...state,
    counters: { ...state.counters, characters: state.counters.characters + facts.correctChars },
    bests: { ...state.bests, keyStreak: Math.max(state.bests.keyStreak, facts.bestKeyStreak) },
  };

  let longNames = next.sets.longNames;
  for (const station of facts.stations) {
    if (station.errors > 0) continue; // only a clean pass counts
    const name = net.stations.get(station.id)?.name;
    if (name === undefined) continue;
    if (isLongName(name)) longNames = withItem(longNames, station.id);
    if (station.id === '16-sierra') next = withFlag(next, 'secret.sixteen');
    if (station.id === 'taman-perindustrian-puchong' && wpmOf(name.length, station.ms) >= PUCHONG_WPM) {
      next = withFlag(next, 'secret.puchong');
    }
  }
  if (longNames !== next.sets.longNames) next = { ...next, sets: { ...next.sets, longNames: longNames } };

  const { accuracy, wpm } = facts.metrics;
  const comeback = next.runLog.lastAccuracy !== null
    && next.runLog.lastAccuracy < LOW_ACCURACY && accuracy >= MIN_COMEBACK_ACCURACY;
  const entry = { at, wpm, accuracy };
  const { count, first, recent } = next.runLog;
  return {
    ...next,
    counters: { ...next.counters, comebacks: next.counters.comebacks + (comeback ? 1 : 0) },
    runLog: logRun
      ? {
          count: count + 1,
          first: first.length < RUN_LOG_SIZE ? [...first, entry] : first,
          recent: [...recent, entry].slice(-RUN_LOG_SIZE),
          lastAccuracy: accuracy,
        }
      : { ...next.runLog, lastAccuracy: accuracy },
  };
}

// --- recorders -------------------------------------------------------------

/** The Run-ending facts that don't depend on the kind of Run: the day, Night Owl, Merdeka!. */
export function recordRunEnd(state: AchievementState, at: number): AchievementState {
  const when = new Date(at);
  let next: AchievementState = {
    ...state,
    sets: { ...state.sets, days: withItem(state.sets.days, localDay(at)) },
  };
  if (when.getHours() <= 3) next = withFlag(next, 'secret.nightOwl');
  const month = when.getMonth(); // 0-based: 7 is August, 8 is September
  const date = when.getDate();
  if ((month === 7 && date === 31) || (month === 8 && date === 16)) next = withFlag(next, 'secret.merdeka');
  return next;
}

export function recordLineRun(
  net: NetworkIndex, state: AchievementState, facts: LineRunFacts, ctx: EvalContext, at: number,
): Recorded {
  let next = recordRunEnd(state, at);
  next = { ...next, counters: { ...next.counters, lineStations: next.counters.lineStations + facts.stations.length } };

  if (facts.complete) {
    const day = localDay(at);
    const dayPass = next.dayPass?.day === day ? next.dayPass : { day, lines: [] };
    next = {
      ...next,
      sets: {
        ...next.sets,
        linesCompleted: withItem(next.sets.linesCompleted, facts.line),
        lineDirections: withItem(next.sets.lineDirections, `${facts.line}:${facts.from}`),
      },
      dayPass: { day, lines: withItem(dayPass.lines, facts.line) },
    };
    if (facts.eligible) {
      const previous = next.bests.lineScore[facts.line];
      const score = facts.metrics.score;
      const beaten = previous !== undefined && score > previous;
      next = {
        ...next,
        counters: { ...next.counters, linePersonalBests: next.counters.linePersonalBests + (beaten ? 1 : 0) },
        bests: {
          ...next.bests,
          lineAccuracy: Math.max(next.bests.lineAccuracy, facts.metrics.accuracy),
          lineScore: { ...next.bests.lineScore, [facts.line]: previous === undefined ? score : Math.max(previous, score) },
        },
      };
    }
  }

  return evaluate(net, recordCraft(net, next, facts, at), ctx, at);
}

export function recordQuickRun(
  net: NetworkIndex, state: AchievementState, facts: QuickRunFacts, ctx: EvalContext, at: number,
): Recorded {
  let next = recordRunEnd(state, at);

  // One More Go counts eligible Runs only. An ineligible Run adds nothing to the chain, but it is
  // still a Run the next must start in time after: it resets a chain it was late for, and its
  // Summary is what the next Run's start is measured from.
  const continues = next.quickChain !== null && facts.openedAt <= next.quickChain.summaryAt + CHAIN_WINDOW_MS;
  const chain = (continues ? next.quickChain!.count : 0) + (facts.eligible ? 1 : 0);
  next = {
    ...next,
    counters: { ...next.counters, quickCompleted: next.counters.quickCompleted + 1 },
    sets: { ...next.sets, quickStarts: withItem(next.sets.quickStarts, facts.startLine) },
    bests: { ...next.bests, quickChain: Math.max(next.bests.quickChain, chain) },
    quickChain: { count: chain, summaryAt: at },
  };

  if (facts.eligible) {
    const { score, accuracy } = facts.metrics;
    // The first eligible Quick Run is Up the Line's baseline; only later Scores measure against it.
    // A backfilled `quickScore` predates the baseline, so it never counts as improvement.
    const baseline = next.bests.quickFirstScore;
    next = {
      ...next,
      counters: { ...next.counters, quickClean: next.counters.quickClean + (accuracy >= 1 ? 1 : 0) },
      bests: {
        ...next.bests,
        quickScore: Math.max(next.bests.quickScore, score),
        quickFirstScore: baseline ?? score,
        quickImproved: baseline === null ? next.bests.quickImproved : Math.max(next.bests.quickImproved, score - baseline),
        quickJumps: Math.max(next.bests.quickJumps, facts.jumps),
      },
    };
    if (facts.lastStationLeftMs !== null && facts.lastStationLeftMs <= LAST_TRAIN_MS) {
      next = withFlag(next, 'secret.lastTrain');
    }
  }

  return evaluate(net, recordCraft(net, next, facts, at), ctx, at);
}

export function recordCareer(
  net: NetworkIndex, state: AchievementState, judgement: DispatchJudgement, ctx: EvalContext, at: number,
): Recorded {
  if (!judgement.eligible) return { state, earned: [] };
  const { tally, metrics } = judgement;

  let onTime = state.bests.onTime;
  for (const shift of judgement.history) {
    if (shift.cleared && shift.calls > 0) onTime = Math.max(onTime, shift.onTimeCalls / shift.calls);
  }

  let next: AchievementState = {
    ...state,
    counters: {
      ...state.counters,
      clears: state.counters.clears + tally.clears,
      fixes: state.counters.fixes + tally.fixes,
      gapsHeld: state.counters.gapsHeld + tally.gapsHeld,
      express: state.counters.express + tally.express,
    },
    bests: {
      ...state.bests,
      era: Math.max(state.bests.era, eraFor(judgement.cleared)),
      delivered: Math.max(state.bests.delivered, judgement.delivered),
      perfectShifts: Math.max(state.bests.perfectShifts, tally.bestPerfectRun),
      onTime,
    },
  };
  if (tally.closeCall) next = withFlag(next, 'secret.closeCall');
  if (tally.againstOdds) next = withFlag(next, 'secret.againstOdds');
  if (tally.ampang) next = withFlag(next, 'secret.ampang');
  if (tally.survivedTrio) next = withFlag(next, 'secret.rushHour');

  // A Career has no per-Station typing, so it feeds only characters, key streak and Back on Track.
  const typing: TypingFacts = {
    eligible: true, metrics, correctChars: judgement.correctChars, bestKeyStreak: tally.bestKeyStreak, stations: [],
  };
  next = recordCraft(net, next, typing, at, false);
  return evaluate(net, recordRunEnd(next, at), ctx, at);
}

/** Keeps a resumed Adventure's record; any other start begins a fresh one. */
export function startAdventure(state: AchievementState, start: string, resume: boolean): AchievementState {
  if (resume && state.adventureRun) return state;
  return { ...state, adventureRun: { start, visited: [], lines: [] } };
}

export function recordAdventureArrival(
  net: NetworkIndex, state: AchievementState, station: string, line: LineCode | null, ctx: EvalContext, at: number,
): Recorded {
  const run = (state.adventureRun ?? startAdventure(state, station, false).adventureRun)!;
  const visited = withItem(run.visited, station);
  const lines = line === null ? run.lines : withItem(run.lines, line);

  let next: AchievementState = {
    ...state,
    sets: {
      ...state.sets,
      adventureLines: line === null ? state.sets.adventureLines : withItem(state.sets.adventureLines, line),
      days: withItem(state.sets.days, localDay(at)),
    },
    bests: { ...state.bests, longRide: Math.max(state.bests.longRide, visited.length) },
    adventureRun: { start: run.start, visited, lines },
  };
  if (lines.length >= SEVEN_COLOURS) next = withFlag(next, 'secret.sevenColours');
  if (station === run.start && visited.filter((id) => id !== run.start).length >= ROUND_TRIP_STATIONS) {
    next = withFlag(next, 'secret.roundTrip');
  }
  return evaluate(net, next, ctx, at);
}

export function recordJunctionChoice(
  net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number,
): Recorded {
  const next = { ...state, counters: { ...state.counters, junctions: state.counters.junctions + 1 } };
  return evaluate(net, next, ctx, at);
}

export function recordWalk(
  net: NetworkIndex, state: AchievementState, from: string, to: string, ctx: EvalContext, at: number,
): Recorded {
  if (!net.walk.get(from)?.includes(to)) return { state, earned: [] };
  const key = [from, to].sort().join('|');
  const next = { ...state, sets: { ...state.sets, walkLinks: withItem(state.sets.walkLinks, key) } };
  return evaluate(net, next, ctx, at);
}

export function recordAdventureEnd(
  net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number,
): Recorded {
  return evaluate(net, recordRunEnd(state, at), ctx, at);
}
