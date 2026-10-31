import { LINE_CODES, type LineCode } from '../data/types';

export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
export type Award = Tier | 'secret';
export interface EarnedTier { id: string; award: Award; at: number }
export interface RunLogEntry { at: number; wpm: number; accuracy: number }

/** How many Runs the run log keeps at each end: the first and the latest. */
export const RUN_LOG_SIZE = 10;

/**
 * Everything the achievements need that the Profile doesn't already keep.
 * Bounded: counters, small sets keyed by the network, and a 20-entry run log.
 */
export interface AchievementState {
  v: 1;
  earned: Record<string, { award: Award; at: Partial<Record<Award, number>> }>;
  unannounced: EarnedTier[];
  backfilled: string[] | null;
  counters: {
    junctions: number; lineStations: number; linePersonalBests: number;
    quickCompleted: number; quickClean: number;
    clears: number; fixes: number; gapsHeld: number; express: number;
    characters: number; comebacks: number;
  };
  sets: {
    walkLinks: string[]; adventureLines: LineCode[]; quickStarts: LineCode[];
    longNames: string[]; days: string[]; linesCompleted: LineCode[]; lineDirections: string[];
  };
  bests: {
    lineScore: Partial<Record<LineCode, number>>; lineAccuracy: number;
    quickScore: number; quickFirstScore: number | null;
    /** Up the Line: the best Score of an Eligible Quick Run after the first one, minus the first's. */
    quickImproved: number;
    quickJumps: number; quickChain: number;
    keyStreak: number; era: number; delivered: number; perfectShifts: number; onTime: number;
    longRide: number;
  };
  dayPass: { day: string; lines: LineCode[] } | null;
  quickChain: { count: number; summaryAt: number } | null;
  /** `count` is every Line/Quick Run ever logged; `first` and `recent` hold at most RUN_LOG_SIZE each. */
  runLog: { count: number; first: RunLogEntry[]; recent: RunLogEntry[]; lastAccuracy: number | null };
  adventureRun: { start: string; visited: string[]; lines: LineCode[] } | null;
  flags: string[];
}

export function emptyAchievements(): AchievementState {
  return {
    v: 1,
    earned: {},
    unannounced: [],
    backfilled: null,
    counters: {
      junctions: 0, lineStations: 0, linePersonalBests: 0,
      quickCompleted: 0, quickClean: 0,
      clears: 0, fixes: 0, gapsHeld: 0, express: 0,
      characters: 0, comebacks: 0,
    },
    sets: {
      walkLinks: [], adventureLines: [], quickStarts: [],
      longNames: [], days: [], linesCompleted: [], lineDirections: [],
    },
    bests: {
      lineScore: {}, lineAccuracy: 0,
      quickScore: 0, quickFirstScore: null, quickImproved: 0, quickJumps: 0, quickChain: 0,
      keyStreak: 0, era: 0, delivered: 0, perfectShifts: 0, onTime: 0,
      longRide: 0,
    },
    dayPass: null,
    quickChain: null,
    runLog: { count: 0, first: [], recent: [], lastAccuracy: null },
    adventureRun: null,
    flags: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLineCode(value: unknown): value is LineCode {
  return typeof value === 'string' && LINE_CODES.includes(value as LineCode);
}

function isAward(value: unknown): value is Award {
  return value === 'secret' || TIERS.includes(value as Tier);
}

function cleanNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cleanNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string'))];
}

function cleanLines(value: unknown): LineCode[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isLineCode))];
}

function cleanLineScores(value: unknown): Partial<Record<LineCode, number>> {
  const clean: Partial<Record<LineCode, number>> = {};
  if (!isRecord(value)) return clean;
  for (const [line, score] of Object.entries(value)) {
    if (isLineCode(line) && typeof score === 'number' && Number.isFinite(score) && score >= 0) {
      clean[line] = score;
    }
  }
  return clean;
}

function cleanEarned(value: unknown): AchievementState['earned'] {
  const clean: AchievementState['earned'] = {};
  if (!isRecord(value)) return clean;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || !isAward(entry.award) || !isRecord(entry.at)) continue;
    const at: Partial<Record<Award, number>> = {};
    for (const [award, time] of Object.entries(entry.at)) {
      if (isAward(award) && typeof time === 'number' && Number.isFinite(time)) at[award] = time;
    }
    clean[id] = { award: entry.award, at };
  }
  return clean;
}

function cleanUnannounced(value: unknown): EarnedTier[] {
  if (!Array.isArray(value)) return [];
  const clean: EarnedTier[] = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.id === 'string' && isAward(entry.award)
      && typeof entry.at === 'number' && Number.isFinite(entry.at)) {
      clean.push({ id: entry.id, award: entry.award, at: entry.at });
    }
  }
  return clean;
}

function cleanLogEntries(value: unknown): RunLogEntry[] {
  if (!Array.isArray(value)) return [];
  const clean: RunLogEntry[] = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.at === 'number' && Number.isFinite(entry.at)
      && typeof entry.wpm === 'number' && Number.isFinite(entry.wpm)
      && typeof entry.accuracy === 'number' && Number.isFinite(entry.accuracy)) {
      clean.push({ at: entry.at, wpm: entry.wpm, accuracy: entry.accuracy });
    }
  }
  return clean;
}

/**
 * A stored value read back as state. Anything that isn't a version-1 record is
 * `undefined`; inside one, every wrong-typed field degrades to its empty value.
 * Never throws.
 */
export function cleanAchievements(raw: unknown): AchievementState | undefined {
  if (!isRecord(raw) || raw.v !== 1) return undefined;
  const counters = isRecord(raw.counters) ? raw.counters : {};
  const sets = isRecord(raw.sets) ? raw.sets : {};
  const bests = isRecord(raw.bests) ? raw.bests : {};
  const dayPass = isRecord(raw.dayPass) ? raw.dayPass : null;
  const quickChain = isRecord(raw.quickChain) ? raw.quickChain : null;
  const runLog = isRecord(raw.runLog) ? raw.runLog : {};
  const adventureRun = isRecord(raw.adventureRun) ? raw.adventureRun : null;

  return {
    v: 1,
    earned: cleanEarned(raw.earned),
    unannounced: cleanUnannounced(raw.unannounced),
    backfilled: Array.isArray(raw.backfilled) ? cleanStrings(raw.backfilled) : null,
    counters: {
      junctions: cleanNumber(counters.junctions),
      lineStations: cleanNumber(counters.lineStations),
      linePersonalBests: cleanNumber(counters.linePersonalBests),
      quickCompleted: cleanNumber(counters.quickCompleted),
      quickClean: cleanNumber(counters.quickClean),
      clears: cleanNumber(counters.clears),
      fixes: cleanNumber(counters.fixes),
      gapsHeld: cleanNumber(counters.gapsHeld),
      express: cleanNumber(counters.express),
      characters: cleanNumber(counters.characters),
      comebacks: cleanNumber(counters.comebacks),
    },
    sets: {
      walkLinks: cleanStrings(sets.walkLinks),
      adventureLines: cleanLines(sets.adventureLines),
      quickStarts: cleanLines(sets.quickStarts),
      longNames: cleanStrings(sets.longNames),
      days: cleanStrings(sets.days),
      linesCompleted: cleanLines(sets.linesCompleted),
      lineDirections: cleanStrings(sets.lineDirections),
    },
    bests: {
      lineScore: cleanLineScores(bests.lineScore),
      lineAccuracy: cleanNumber(bests.lineAccuracy),
      quickScore: cleanNumber(bests.quickScore),
      quickFirstScore: cleanNullableNumber(bests.quickFirstScore),
      // Added after the first version: an older record has none, and reads as no improvement yet.
      quickImproved: cleanNumber(bests.quickImproved),
      quickJumps: cleanNumber(bests.quickJumps),
      quickChain: cleanNumber(bests.quickChain),
      keyStreak: cleanNumber(bests.keyStreak),
      era: cleanNumber(bests.era),
      delivered: cleanNumber(bests.delivered),
      perfectShifts: cleanNumber(bests.perfectShifts),
      onTime: cleanNumber(bests.onTime),
      longRide: cleanNumber(bests.longRide),
    },
    dayPass: dayPass && typeof dayPass.day === 'string'
      ? { day: dayPass.day, lines: cleanLines(dayPass.lines) }
      : null,
    quickChain: quickChain
      ? { count: cleanNumber(quickChain.count), summaryAt: cleanNumber(quickChain.summaryAt) }
      : null,
    runLog: {
      count: cleanNumber(runLog.count),
      first: cleanLogEntries(runLog.first).slice(0, RUN_LOG_SIZE),
      recent: cleanLogEntries(runLog.recent).slice(-RUN_LOG_SIZE),
      lastAccuracy: cleanNullableNumber(runLog.lastAccuracy),
    },
    adventureRun: adventureRun && typeof adventureRun.start === 'string'
      ? {
          start: adventureRun.start,
          visited: cleanStrings(adventureRun.visited),
          lines: cleanLines(adventureRun.lines),
        }
      : null,
    flags: cleanStrings(raw.flags),
  };
}
