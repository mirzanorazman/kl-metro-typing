import type { LineCode } from '../data/types';
import { LINE_CODES } from '../data/types';
import type { Metrics } from './metrics';
import { stationAt, type NetworkIndex } from './network';

export const LEADERBOARD_LIMIT = 20;

export interface LeaderboardEntry {
  id: string;
  name: string;
  lineCode: LineCode;
  wpm: number;
  accuracy: number;
  score: number;
  weightedScore: number;
  playedAt: number;
}

export type LeaderboardKey = 'score' | 'weightedScore';

/** Sum of station-name lengths along a line's fixed route — a stand-in for typing effort. */
export function lineCharCount(net: NetworkIndex, lineCode: LineCode): number {
  const line = net.lines.get(lineCode);
  if (!line) return 0;
  return line.stations.reduce((n, id) => n + (stationAt(net, id)?.name.length ?? 0), 0);
}

/** The largest lineCharCount across every line in the network. */
export function longestLineCharCount(net: NetworkIndex): number {
  return Math.max(...LINE_CODES.map((code) => lineCharCount(net, code)));
}

/** 0 < weight <= 1. The longest line weighs 1; shorter lines weigh proportionally less. */
export function weightForLine(net: NetworkIndex, lineCode: LineCode): number {
  const longest = longestLineCharCount(net);
  if (longest === 0) return 1;
  return lineCharCount(net, lineCode) / longest;
}

export function makeEntry(params: {
  id: string;
  name: string;
  lineCode: LineCode;
  metrics: Metrics;
  weight: number;
  playedAt: number;
}): LeaderboardEntry {
  const { id, name, lineCode, metrics, weight, playedAt } = params;
  return {
    id,
    name,
    lineCode,
    wpm: metrics.wpm,
    accuracy: metrics.accuracy,
    score: metrics.score,
    weightedScore: metrics.score * weight,
    playedAt,
  };
}

/** Descending by `key`; ties broken by earlier playedAt (first to set the score keeps the higher slot). */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry, key: LeaderboardKey): number {
  if (b[key] !== a[key]) return b[key] - a[key];
  return a.playedAt - b.playedAt;
}

/** New array: `entry` inserted, sorted by `key`, sliced to `limit`. Does not mutate `entries`. */
export function rankedInsert(
  entries: LeaderboardEntry[],
  entry: LeaderboardEntry,
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): LeaderboardEntry[] {
  return [...entries, entry].sort((a, b) => compareEntries(a, b, key)).slice(0, limit);
}

/** The value held by the entry at rank `limit`, or null if the board hasn't reached that size yet. */
export function cutoffValue(
  entries: LeaderboardEntry[],
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): number | null {
  if (entries.length < limit) return null;
  return entries[limit - 1]![key];
}

/** True if `value` would land within the top `limit` — board not full, or value beats the current cutoff. */
export function wouldQualify(
  entries: LeaderboardEntry[],
  value: number,
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): boolean {
  const cutoff = cutoffValue(entries, key, limit);
  return cutoff === null || value > cutoff;
}

/** 1-indexed rank of `id` within `entries`, or null if not present. */
export function rankOf(entries: LeaderboardEntry[], id: string): number | null {
  const idx = entries.findIndex((e) => e.id === id);
  return idx === -1 ? null : idx + 1;
}
