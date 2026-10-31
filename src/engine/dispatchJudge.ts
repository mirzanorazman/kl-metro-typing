import { emptyTally, type CareerTally, type ShiftRecord } from './dispatch';
import { DISPATCH_KEYLOG_MAX_EVENTS } from './dispatchBalance';
import { verifyKeyLog, type Verdict } from './integrity';
import { computeMetrics, type Metrics } from './metrics';
import type { NetworkIndex } from './network';
import { replayDispatch, type DispatchEvidence, type DispatchReplayResult } from './replay';

export interface DispatchJudgement {
  /** True only for a failed or retired Career that replays to its recorded end and passes its Verdict. */
  eligible: boolean;
  /** Derived by Replay, never as reported by the live Career; zero or empty when it cannot replay. */
  score: number;
  delivered: number;
  cleared: number;
  metrics: Metrics;
  tally: CareerTally;
  history: ShiftRecord[];
  correctChars: number;
  /** Present when Replay completed and the Keylog was judged. */
  verdict: Verdict | null;
}

function replayed(result: DispatchReplayResult | null): Omit<DispatchJudgement, 'eligible' | 'verdict'> {
  return { score: result?.score ?? 0, delivered: result?.delivered ?? 0, cleared: result?.cleared ?? 0,
    metrics: result?.metrics ?? computeMetrics(0, 0, 0), tally: result?.tally ?? emptyTally(),
    history: result?.history ?? [], correctChars: result?.correctChars ?? 0 };
}

/** Decides whether a finished Career may set a best. Pure; never throws. */
export function judgeCareer(net: NetworkIndex, evidence: DispatchEvidence): DispatchJudgement {
  try {
    const result = replayDispatch(net, evidence);
    if (!result || !result.complete) return { eligible: false, ...replayed(result), verdict: null };
    const verdict = verifyKeyLog(evidence.keylog, result.metrics.wpm, DISPATCH_KEYLOG_MAX_EVENTS);
    return { eligible: verdict.ok, ...replayed(result), verdict };
  } catch {
    return { eligible: false, ...replayed(null), verdict: null };
  }
}
