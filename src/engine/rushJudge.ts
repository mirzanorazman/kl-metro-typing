import { verifyKeyLog, type Verdict } from './integrity';
import type { NetworkIndex } from './network';
import { replayRushHour, type RushEvidence } from './replay';
import { RUSH_KEYLOG_MAX_EVENTS } from './rushBalance';

export interface RushJudgement {
  /** True only for an Overflow-ended Run that replays and passes its Verdict. */
  eligible: boolean;
  /** Delivered as derived by Replay, never as reported by the live Run. */
  delivered: number;
  /** Present when Replay succeeded and the Keylog was judged. */
  verdict: Verdict | null;
}

/** Decides whether a finished Rush Hour Run may set a best. Pure; never throws. */
export function judgeRushRun(net: NetworkIndex, evidence: RushEvidence): RushJudgement {
  const replayed = replayRushHour(net, evidence);
  if (!replayed || !replayed.complete) return { eligible: false, delivered: replayed?.delivered ?? 0, verdict: null };
  const verdict = verifyKeyLog(evidence.keylog, replayed.metrics.wpm, RUSH_KEYLOG_MAX_EVENTS);
  return { eligible: verdict.ok, delivered: replayed.delivered, verdict };
}
