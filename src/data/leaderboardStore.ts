import { LINE_CODES, type LineCode } from './types';
import type { Metrics } from '../engine/metrics';
import type { NetworkIndex } from '../engine/network';
import {
  LEADERBOARD_LIMIT,
  cutoffValue,
  makeEntry,
  rankOf,
  rankedInsert,
  weightForLine,
  wouldQualify,
  type LeaderboardEntry,
} from '../engine/leaderboard';

export const LEADERBOARD_STORAGE_KEY = 'klmetro.leaderboard.v1';
const SCHEMA_VERSION = 1;

export interface LeaderboardStore {
  version: number;
  overall: LeaderboardEntry[];
  perLine: Record<LineCode, LeaderboardEntry[]>;
}

export function emptyStore(): LeaderboardStore {
  return {
    version: SCHEMA_VERSION,
    overall: [],
    perLine: Object.fromEntries(
      LINE_CODES.map((code): [LineCode, LeaderboardEntry[]] => [code, []]),
    ) as Record<LineCode, LeaderboardEntry[]>,
  };
}

/**
 * Future schema versions migrate here. An unknown version is treated as
 * unreadable rather than guessed at — matches engine/progress.ts's approach.
 */
export function loadStore(): LeaderboardStore {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
  } catch {
    return emptyStore();
  }
  if (stored === null) return emptyStore();

  try {
    const raw: unknown = JSON.parse(stored);
    if (typeof raw !== 'object' || raw === null) return emptyStore();
    const parsed = raw as Partial<LeaderboardStore>;
    if (
      parsed.version === SCHEMA_VERSION &&
      Array.isArray(parsed.overall) &&
      (parsed.perLine === undefined ||
        Object.values(parsed.perLine).every((entries) => Array.isArray(entries)))
    ) {
      return {
        ...emptyStore(),
        ...parsed,
        perLine: { ...emptyStore().perLine, ...parsed.perLine },
      };
    }
  } catch {
    // falls through to an empty store
  }
  return emptyStore();
}

export function saveStore(store: LeaderboardStore): void {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable or full. The run continues; the score is simply not kept.
  }
}

export interface Qualification {
  weight: number;
  weightedScore: number;
  overallQualifies: boolean;
  lineQualifies: boolean;
  overallCutoff: number | null;
  lineCutoff: number | null;
}

/** Pre-submission check: would this run's metrics place on either board? Does not mutate the store. */
export function evaluateRun(
  net: NetworkIndex,
  store: LeaderboardStore,
  lineCode: LineCode,
  metrics: Metrics,
): Qualification {
  const weight = weightForLine(net, lineCode);
  const weightedScore = metrics.score * weight;
  const lineEntries = store.perLine[lineCode];
  return {
    weight,
    weightedScore,
    overallQualifies: wouldQualify(store.overall, weightedScore, 'weightedScore', LEADERBOARD_LIMIT),
    lineQualifies: wouldQualify(lineEntries, metrics.score, 'score', LEADERBOARD_LIMIT),
    overallCutoff: cutoffValue(store.overall, 'weightedScore', LEADERBOARD_LIMIT),
    lineCutoff: cutoffValue(lineEntries, 'score', LEADERBOARD_LIMIT),
  };
}

export interface SubmitResult {
  store: LeaderboardStore;
  overallRank: number | null;
  lineRank: number | null;
}

/** Inserts `name`'s run into whichever board(s) it qualifies for and saves the store. */
export function submitEntry(
  net: NetworkIndex,
  store: LeaderboardStore,
  params: { name: string; lineCode: LineCode; metrics: Metrics; playedAt: number; verified?: boolean },
): SubmitResult {
  const { name, lineCode, metrics, playedAt, verified } = params;
  const q = evaluateRun(net, store, lineCode, metrics);
  const id = `${lineCode}-${playedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = makeEntry({
    id, name: name.trim(), lineCode, metrics, weight: q.weight, playedAt, verified,
  });

  let overall = store.overall;
  let overallRank: number | null = null;
  if (q.overallQualifies) {
    overall = rankedInsert(store.overall, entry, 'weightedScore', LEADERBOARD_LIMIT);
    overallRank = rankOf(overall, id);
  }

  let line = store.perLine[lineCode];
  let lineRank: number | null = null;
  if (q.lineQualifies) {
    line = rankedInsert(line, entry, 'score', LEADERBOARD_LIMIT);
    lineRank = rankOf(line, id);
  }

  const next: LeaderboardStore = { ...store, overall, perLine: { ...store.perLine, [lineCode]: line } };
  saveStore(next);
  return { store: next, overallRank, lineRank };
}

/** Unique names already on either board, alphabetical — feeds the entry form's autocomplete. */
export function knownNames(store: LeaderboardStore): string[] {
  const names = new Set<string>();
  for (const entry of store.overall) names.add(entry.name);
  for (const code of LINE_CODES) {
    for (const entry of store.perLine[code]) names.add(entry.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
