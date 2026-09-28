export const KEYLOG_VERSION = 1;

/**
 * A hard ceiling on log length. Both instrumented modes finish far below it —
 * a 37-station Line Run is roughly 500 keystrokes — so this only bounds memory
 * against a pathological case.
 */
export const KEYLOG_MAX_EVENTS = 5_000;

/** How a keystroke reached the game. */
export interface KeySource {
  /** The browser's `event.isTrusted` for the event that delivered it. */
  trusted: boolean;
  /** Characters delivered by that one event. 1 for an ordinary keypress. */
  batch: number;
}

/** The Source of an ordinary, unremarkable keystroke. */
export const PLAIN_SOURCE: KeySource = { trusted: true, batch: 1 };

export interface KeyEvent {
  /** The character typed. */
  k: string;
  /** Milliseconds since the previous event, or since the log opened. */
  dt: number;
  /** Present only when the event was untrusted. */
  u?: 1;
  /**
   * Present only on the first keystroke of a burst, carrying how many
   * characters that one input event delivered. Later characters of the same
   * burst carry no `b`, so the count of flagged events in a log is the count
   * of bursts, not the count of batched characters.
   */
  b?: number;
}

export interface KeyLog {
  v: number;
  /** The Run clock's value when the log opened. */
  t0: number;
  /** Offset of the most recent event. 0 while the log is empty. */
  ms: number;
  events: KeyEvent[];
  /**
   * Present only once the log has hit `KEYLOG_MAX_EVENTS` and stopped
   * appending. A log's length can never exceed the cap, so length alone
   * cannot distinguish a capped log from an honestly short one — this flag
   * is what lets the Verdict tell them apart and refuse the truncated one.
   */
  truncated?: true;
}

export function beginLog(now: number): KeyLog {
  return { v: KEYLOG_VERSION, t0: Math.round(now), ms: 0, events: [] };
}

/**
 * Appends one keystroke.
 *
 * `dt` is the difference between *rounded offsets*, never a rounded
 * difference. Summing deltas therefore reconstructs each timestamp exactly,
 * with no error accumulating across hundreds of events — which is what lets a
 * replayed Run reproduce the live one's Metrics rather than approximate them.
 */
export function appendKey(
  log: KeyLog,
  key: string,
  source: KeySource,
  now: number,
  maxEvents: number = KEYLOG_MAX_EVENTS,
): KeyLog {
  if (log.events.length >= maxEvents) {
    return log.truncated ? log : { ...log, truncated: true };
  }

  const offset = Math.round(now) - log.t0;
  const event: KeyEvent = { k: key, dt: offset - log.ms };
  if (!source.trusted) event.u = 1;
  if (source.batch > 1) event.b = source.batch;

  return { ...log, ms: offset, events: [...log.events, event] };
}
