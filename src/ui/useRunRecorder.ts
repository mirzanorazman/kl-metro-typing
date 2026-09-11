import { useCallback, useMemo, useRef } from 'react';
import {
  PLAIN_SOURCE,
  appendKey,
  beginLog,
  type KeyLog,
  type KeySource,
} from '../engine/keylog';

/**
 * The clock a Run is recorded against: whole milliseconds, monotonic.
 *
 * Screens use this rather than `performance.now()` directly for anything a
 * Run's state is stamped with, so the live Run and its Keylog share one clock
 * and a replay reproduces the Run's Metrics exactly.
 */
export function runTick(): number {
  return Math.round(performance.now());
}

export interface RunRecorder {
  /** Records one keystroke and returns the tick it was recorded at. */
  record: (key: string, source?: KeySource) => number;
  snapshot: () => KeyLog;
  reset: (startedAt: number) => void;
}

/**
 * Accumulates a Run's Keylog.
 *
 * Ref-backed on purpose: a 37-station Line Run is roughly 500 keystrokes, and
 * recording one must not re-render anything. This is the only impure unit in
 * the integrity design — everything that judges is pure and lives in engine/.
 */
export function useRunRecorder(startedAt: number): RunRecorder {
  const logRef = useRef<KeyLog | null>(null);
  if (logRef.current === null) logRef.current = beginLog(startedAt);

  const record = useCallback((key: string, source: KeySource = PLAIN_SOURCE) => {
    const now = runTick();
    logRef.current = appendKey(logRef.current!, key, source, now);
    return now;
  }, []);

  const snapshot = useCallback(() => logRef.current!, []);

  const reset = useCallback((next: number) => {
    logRef.current = beginLog(next);
  }, []);

  return useMemo(() => ({ record, snapshot, reset }), [record, snapshot, reset]);
}
