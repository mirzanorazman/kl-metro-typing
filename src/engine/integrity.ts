import { KEYLOG_MAX_EVENTS, KEYLOG_VERSION, type KeyLog } from './keylog';

export type IntegrityReason =
  | 'malformed-log'
  | 'too-few-keystrokes'
  | 'untrusted-input'
  | 'batched-input'
  | 'impossible-speed'
  | 'inhuman-consistency';

export type Verdict = { ok: true } | { ok: false; reason: IntegrityReason };

/**
 * Every number the validator judges by, in one place.
 *
 * These are deliberately generous. A false positive costs an honest player a
 * leaderboard entry, so each threshold sits well clear of what a human can
 * actually do rather than close to it.
 */
export const INTEGRITY_THRESHOLDS = {
  /** Below this the statistics mean nothing. */
  minEvents: 20,
  /** "Kelana Jaya" pastes as one event of 11. Predictive keyboards send 2-3. */
  maxBatchPerEvent: 4,
  maxBatchedEvents: 8,
  /** The sustained human record is around 212 wpm. */
  maxWpm: 300,
  minMedianIntervalMs: 40,
  minIntervalsForConsistency: 40,
  /** Humans run 0.35-0.7; a setInterval script runs 0.01-0.05. */
  minCoefficientOfVariation: 0.12,
} as const;

const fail = (reason: IntegrityReason): Verdict => ({ ok: false, reason });

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Judges one Keylog. Total: every input produces a Verdict, nothing throws.
 *
 * `replayedWpm` comes from Replay rather than being derived here. A Keylog
 * records which keys were pressed and when, but not which were correct — only
 * Replay knows that, because only Replay knows the route.
 *
 * Checks run cheapest-and-most-certain first, so the reported Reason is the
 * most defensible one available.
 */
export function verifyKeyLog(log: KeyLog, replayedWpm: number): Verdict {
  const t = INTEGRITY_THRESHOLDS;

  if (log.v !== KEYLOG_VERSION) return fail('malformed-log');
  if (log.events.length > KEYLOG_MAX_EVENTS) return fail('malformed-log');
  if (log.events.some((event) => event.dt < 0)) return fail('malformed-log');
  if (log.events.length < t.minEvents) return fail('too-few-keystrokes');

  if (log.events.some((event) => event.u === 1)) return fail('untrusted-input');

  const batched = log.events.filter((event) => (event.b ?? 1) > 1);
  if (batched.some((event) => (event.b ?? 1) >= t.maxBatchPerEvent)) return fail('batched-input');
  if (batched.length > t.maxBatchedEvents) return fail('batched-input');

  // The first event's delta measures the pause before typing began, not an
  // inter-key interval. A player thinking for ten seconds is not evidence.
  const intervals = log.events.slice(1).map((event) => event.dt);

  if (replayedWpm > t.maxWpm) return fail('impossible-speed');
  if (median(intervals) < t.minMedianIntervalMs) return fail('impossible-speed');

  if (
    intervals.length >= t.minIntervalsForConsistency &&
    coefficientOfVariation(intervals) < t.minCoefficientOfVariation
  ) {
    return fail('inhuman-consistency');
  }

  return { ok: true };
}
