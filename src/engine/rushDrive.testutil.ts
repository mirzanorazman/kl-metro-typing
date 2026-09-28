import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { buildNetwork } from './network';
import type { RushEvidence } from './replay';
import { RUSH_KEYLOG_MAX_EVENTS } from './rushBalance';
import {
  RUSH_EVIDENCE_VERSION,
  advanceRush,
  applyRushAction,
  enterRushCharacter,
  startRush,
  type RushAction,
  type RushActionBody,
  type RushState,
} from './rushHour';

/** Test support: a scripted typist driving a Rush Hour Run. */

const net = buildNetwork(loadNetworkData());

export interface DriveOptions {
  lineSet: LineCode[];
  start: string;
  seed: number;
  /** Mean milliseconds per keystroke. 200 ≈ 60 WPM. */
  msPerKey: number;
  /** Stop driving at this Run-clock time even if the Run has not ended. */
  limitMs?: number;
  pauseAt?: number;
  resumeAt?: number;
  /** Chooses among Junction options; default takes the first. */
  choose?: (s: RushState) => RushActionBody;
}

/** Plays a Run the way the screen does: rAF advances, keys and actions logged. */
export function drive(o: DriveOptions): { state: RushState; evidence: RushEvidence } {
  const t0 = 1_000;
  let log: KeyLog = beginLog(t0);
  const actions: RushAction[] = [];
  let state = startRush(net, o.lineSet, o.start, o.seed);
  let now = t0;
  let keys = 0;
  const limit = o.limitMs ?? 60 * 60_000;

  const act = (body: RushActionBody) => {
    const after = applyRushAction(net, state, body, now);
    if (after !== state) actions.push({ ...body, i: log.events.length, t: now });
    state = after;
  };

  while (state.status !== 'ended' && now < limit) {
    state = advanceRush(net, state, now);
    if (state.status === 'ended') break;
    if (o.pauseAt !== undefined && state.status === 'running' && now >= o.pauseAt && now < (o.resumeAt ?? Infinity)) {
      act({ a: 'pause' });
    } else if (state.status === 'paused' && o.resumeAt !== undefined && now >= o.resumeAt) {
      act({ a: 'resume' });
    } else if (state.status !== 'paused' && state.stage === 'junction') {
      act(o.choose ? o.choose(state) : { a: 'choose', line: state.options[0]!.line, next: state.options[0]!.next });
    } else if (state.status !== 'paused' && state.stage === 'typing') {
      keys += 1;
      // Every 23rd key is a typo; human-ish jitter keeps the Verdict happy.
      const key = keys % 23 === 0 ? '#' : state.typing.target[state.typing.cursor]!;
      log = appendKey(log, key, PLAIN_SOURCE, now, RUSH_KEYLOG_MAX_EVENTS);
      state = enterRushCharacter(net, state, key, now);
    }
    now += Math.round(o.msPerKey * (0.6 + ((keys * 7919) % 97) / 97 * 0.8));
  }
  if (state.status !== 'ended') {
    state = advanceRush(net, state, now);
  }
  return {
    state,
    evidence: {
      v: RUSH_EVIDENCE_VERSION,
      lineSet: state.lineSet,
      start: o.start,
      seed: o.seed,
      keylog: log,
      actions,
      endedAt: state.endedAt ?? now,
    },
  };
}
