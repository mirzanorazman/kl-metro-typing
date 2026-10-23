import { DISPATCH_KEYLOG_MAX_EVENTS } from './dispatchBalance';
import { verifyKeyLog, type Verdict } from './integrity';
import type { NetworkIndex } from './network';
import { replayDispatch, type DispatchEvidence } from './replay';

export interface DispatchJudgement {
  /** True only for a failed Career that replays to its recorded end and passes its Verdict. */
  eligible: boolean;
  /** Derived by Replay, never as reported by the live Career. */
  score: number;
  delivered: number;
  cleared: number;
  /** Present when Replay completed and the Keylog was judged. */
  verdict: Verdict | null;
}

/** Decides whether a finished Career may set a best. Pure; never throws. */
export function judgeCareer(net: NetworkIndex, evidence: DispatchEvidence): DispatchJudgement {
  try {
    const replayed = replayDispatch(net, evidence);
    const totals = { score: replayed?.score ?? 0, delivered: replayed?.delivered ?? 0, cleared: replayed?.cleared ?? 0 };
    if (!replayed || !replayed.complete) return { eligible: false, ...totals, verdict: null };
    const verdict = verifyKeyLog(evidence.keylog, replayed.metrics.wpm, DISPATCH_KEYLOG_MAX_EVENTS);
    return { eligible: verdict.ok, ...totals, verdict };
  } catch {
    return { eligible: false, score: 0, delivered: 0, cleared: 0, verdict: null };
  }
}
