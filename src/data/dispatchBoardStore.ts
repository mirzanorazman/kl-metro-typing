import type { Metrics } from '../engine/metrics';
import { LEADERBOARD_LIMIT } from '../engine/leaderboard';

export const DISPATCH_BOARD_KEY = 'klmetro.dispatch.v1';
const SCHEMA_VERSION = 1;

export interface DispatchEntry {
  id: string;
  name: string;
  score: number;
  /** Passengers Delivered across the whole Career. */
  delivered: number;
  /** Shifts completed in the Career. */
  shifts: number;
  wpm: number;
  accuracy: number;
  playedAt: number;
  /** Present only on entries whose Keylog replayed and passed its Verdict. */
  verified?: true;
}

export interface DispatchBoard {
  version: 1;
  entries: DispatchEntry[];
}

function emptyBoard(): DispatchBoard {
  return { version: SCHEMA_VERSION, entries: [] };
}

function isEntry(value: unknown): value is DispatchEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    finite(e.score) &&
    finite(e.delivered) &&
    finite(e.shifts) &&
    finite(e.wpm) &&
    finite(e.accuracy) &&
    finite(e.playedAt)
  );
}

/** Descending by score; ties go to the earlier playedAt. */
function compareEntries(a: DispatchEntry, b: DispatchEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.playedAt - b.playedAt;
}

/**
 * Corrupt or unknown-version data loads as an empty board, never guessed at —
 * matches leaderboardStore's approach. Unreadable entries are dropped.
 */
export function loadDispatchBoard(): DispatchBoard {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(DISPATCH_BOARD_KEY);
  } catch {
    return emptyBoard();
  }
  if (stored === null) return emptyBoard();

  try {
    const raw: unknown = JSON.parse(stored);
    if (typeof raw !== 'object' || raw === null) return emptyBoard();
    const parsed = raw as Partial<DispatchBoard>;
    if (parsed.version === SCHEMA_VERSION && Array.isArray(parsed.entries)) {
      return {
        version: SCHEMA_VERSION,
        entries: parsed.entries.filter(isEntry).sort(compareEntries).slice(0, LEADERBOARD_LIMIT),
      };
    }
  } catch {
    // falls through to an empty board
  }
  return emptyBoard();
}

export function saveDispatchBoard(board: DispatchBoard): void {
  try {
    localStorage.setItem(DISPATCH_BOARD_KEY, JSON.stringify(board));
  } catch {
    // Storage unavailable or full. The Career continues; the score is simply not kept.
  }
}

/** True if `score` would land within the top LEADERBOARD_LIMIT: board not full, or score beats the cutoff. */
export function dispatchQualifies(board: DispatchBoard, score: number): boolean {
  if (board.entries.length < LEADERBOARD_LIMIT) return true;
  return score > board.entries[LEADERBOARD_LIMIT - 1]!.score;
}

/** Inserts the Career into the board if it qualifies, saves, and returns its 1-indexed rank (null if it missed). */
export function submitDispatchEntry(
  board: DispatchBoard,
  p: {
    name: string;
    score: number;
    delivered: number;
    shifts: number;
    metrics: Metrics;
    playedAt: number;
    verified: boolean;
  },
): { board: DispatchBoard; rank: number | null } {
  const id = `dispatch-${p.playedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DispatchEntry = {
    id,
    name: p.name.trim(),
    score: p.score,
    delivered: p.delivered,
    shifts: p.shifts,
    wpm: p.metrics.wpm,
    accuracy: p.metrics.accuracy,
    playedAt: p.playedAt,
  };
  if (p.verified) entry.verified = true;

  const entries = [...board.entries, entry].sort(compareEntries).slice(0, LEADERBOARD_LIMIT);
  const idx = entries.findIndex((e) => e.id === id);
  const next: DispatchBoard = { version: SCHEMA_VERSION, entries };
  saveDispatchBoard(next);
  return { board: next, rank: idx === -1 ? null : idx + 1 };
}
