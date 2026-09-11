import { describe, it, expect } from 'vitest';
import { KEYLOG_VERSION, type KeyEvent, type KeyLog } from './keylog';
import { verifyKeyLog } from './integrity';

/** A log with the given inter-key intervals. The first event is stamped at 0. */
function logOf(intervals: number[], extra: Partial<KeyEvent> = {}): KeyLog {
  const events: KeyEvent[] = [{ k: 'a', dt: 0, ...extra }];
  for (const dt of intervals) events.push({ k: 'a', dt, ...extra });
  return { v: KEYLOG_VERSION, t0: 0, ms: intervals.reduce((a, b) => a + b, 0), events };
}

/** Plausible human typing: roughly 110 wpm with ordinary variation. */
const HUMAN = Array.from({ length: 120 }, (_, i) => [128, 191, 97, 164, 233, 112, 145, 178, 88, 205][i % 10]!);
const HUMAN_WPM = 110;

describe('verifyKeyLog', () => {
  // The false-positive guard. Every threshold change reruns against this.
  it('passes plausible human typing', () => {
    expect(verifyKeyLog(logOf(HUMAN), HUMAN_WPM)).toEqual({ ok: true });
  });

  it('passes a long thinking pause before the first keystroke', () => {
    const log = logOf(HUMAN);
    log.events[0]!.dt = 12_000;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: true });
  });

  it('rejects a log from another version', () => {
    const log = { ...logOf(HUMAN), v: 99 };
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  // A capped log's length is exactly KEYLOG_MAX_EVENTS, so length alone
  // cannot distinguish it from an honestly short-but-long run; the flag is
  // what appendKey leaves behind, and this is what refuses it.
  it('rejects a log flagged as truncated', () => {
    const log = { ...logOf(HUMAN), truncated: true as const };
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects a log that runs backwards', () => {
    const log = logOf(HUMAN);
    log.events[40]!.dt = -50;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects a log too short to judge', () => {
    expect(verifyKeyLog(logOf([100, 100, 100]), 60)).toEqual({
      ok: false, reason: 'too-few-keystrokes',
    });
  });

  it('rejects synthetic keystrokes', () => {
    expect(verifyKeyLog(logOf(HUMAN, { u: 1 }), HUMAN_WPM)).toEqual({
      ok: false, reason: 'untrusted-input',
    });
  });

  it('rejects a pasted station name', () => {
    const log = logOf(HUMAN);
    log.events[30]!.b = 11;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'batched-input' });
  });

  it('tolerates the two- and three-character bursts a predictive keyboard sends', () => {
    const log = logOf(HUMAN);
    log.events[10]!.b = 2;
    log.events[20]!.b = 3;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: true });
  });

  // The encoder marks only the first character of a burst with `b`, so a
  // burst is one flagged event, never two — a real 12-burst run looks like
  // 12 solitary `b: 2` events, exactly what this builds, not 12 adjacent
  // pairs. See TypingInputProvider.test.tsx for the same rule exercised
  // through the actual encoder rather than a hand-built log.
  it('rejects many small bursts even when none is large', () => {
    const log = logOf(HUMAN);
    for (let i = 1; i <= 12; i++) log.events[i * 5]!.b = 2;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'batched-input' });
  });

  it('rejects a speed no human reaches', () => {
    expect(verifyKeyLog(logOf(HUMAN), 420)).toEqual({ ok: false, reason: 'impossible-speed' });
  });

  it('rejects a stopped clock', () => {
    // performance.now() overridden to a constant: every delta collapses to zero.
    // WPM is modest so the median check (not the WPM check) is the sole cause.
    const log = logOf(Array.from({ length: 120 }, () => 0));
    expect(verifyKeyLog(log, 100)).toEqual({ ok: false, reason: 'impossible-speed' });
  });

  it('rejects the metronome timing of a scripted bot', () => {
    const log = logOf(Array.from({ length: 120 }, () => 100));
    expect(verifyKeyLog(log, 120)).toEqual({ ok: false, reason: 'inhuman-consistency' });
  });

  it('rejects a bot that adds a little jitter', () => {
    const log = logOf(Array.from({ length: 120 }, (_, i) => 100 + (i % 5)));
    expect(verifyKeyLog(log, 120)).toEqual({ ok: false, reason: 'inhuman-consistency' });
  });

  it('does not judge consistency on too small a sample', () => {
    // 30 uniform intervals is below the sample floor: suspicious, not provable.
    const log = logOf(Array.from({ length: 30 }, () => 150));
    expect(verifyKeyLog(log, 80)).toEqual({ ok: true });
  });

  it('never penalises perfect accuracy on its own', () => {
    expect(verifyKeyLog(logOf(HUMAN), 180)).toEqual({ ok: true });
  });

  it('rejects null log', () => {
    expect(verifyKeyLog(null as any, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects undefined log', () => {
    expect(verifyKeyLog(undefined as any, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects log with missing events array', () => {
    expect(verifyKeyLog({ v: KEYLOG_VERSION, t0: 0, ms: 0 } as any, HUMAN_WPM)).toEqual({
      ok: false, reason: 'malformed-log',
    });
  });

  it('rejects log with non-array events', () => {
    expect(verifyKeyLog({ v: KEYLOG_VERSION, t0: 0, ms: 0, events: 'not-an-array' } as any, HUMAN_WPM)).toEqual({
      ok: false, reason: 'malformed-log',
    });
  });

  it('rejects NaN WPM', () => {
    expect(verifyKeyLog(logOf(HUMAN), NaN)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects Infinity WPM', () => {
    expect(verifyKeyLog(logOf(HUMAN), Infinity)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects negative Infinity WPM', () => {
    expect(verifyKeyLog(logOf(HUMAN), -Infinity)).toEqual({ ok: false, reason: 'malformed-log' });
  });
});
