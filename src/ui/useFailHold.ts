import { useEffect, useRef, useState } from 'react';
import type { CareerState } from '../engine/dispatch';
import { runTick } from './useRunRecorder';

/** How long a failed Shift stays on the map, so the last closure is seen. */
export const FAIL_HOLD_MS = 1_200;

/**
 * True while a failed Shift holds the play view before its summary. Display
 * only: the Career has already ended. Decided on the first render that sees
 * the end, so the summary never flashes first; an end found already past the
 * hold (a late key or frame) never holds, and neither does a retired or
 * abandoned one.
 */
export function useFailHold(run: CareerState): boolean {
  const failedAt = run.status === 'ended' && run.endReason === 'failed' ? run.endedAt : null;
  // The remaining hold, fixed on the first render that sees this end.
  const decided = useRef<{ endedAt: number; ms: number } | null>(null);
  if (failedAt === null) decided.current = null;
  else if (decided.current?.endedAt !== failedAt) {
    decided.current = { endedAt: failedAt, ms: Math.max(0, FAIL_HOLD_MS - (runTick() - failedAt)) };
  }
  const [over, setOver] = useState<number | null>(null);
  const holding = decided.current !== null && decided.current.ms > 0 && over !== decided.current.endedAt;

  const endedAt = decided.current?.endedAt;
  const ms = decided.current?.ms ?? 0;
  useEffect(() => {
    if (!holding || endedAt === undefined) return;
    const timer = window.setTimeout(() => setOver(endedAt), ms);
    return () => window.clearTimeout(timer);
  }, [holding, endedAt, ms]);

  return holding;
}
