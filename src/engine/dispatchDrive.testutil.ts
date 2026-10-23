import { loadNetworkData } from '../data/load';
import {
  DISPATCH_EVIDENCE_VERSION, advanceCareer, applyDispatchAction, enterDispatchCharacter, startCareer,
  type CareerState, type DispatchAction, type DispatchActionBody,
} from './dispatch';
import { DISPATCH_KEYLOG_MAX_EVENTS, INCIDENT_LIMIT_MS } from './dispatchBalance';
import { sameRef, visibleTargets, type Target, type TargetRef } from './dispatchTargets';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { buildNetwork } from './network';
import type { DispatchEvidence } from './replay';

/** Test support: a scripted typist driving a Dispatcher Career. */

const net = buildNetwork(loadNetworkData());

export interface DriveOptions {
  seed: number;
  /** Mean milliseconds per keystroke. 200 ≈ 60 WPM. */
  msPerKey: number;
  /** Stop driving at this Career-clock time even if the Career has not ended. */
  limitMs?: number;
  /** Chooses the Expansion offer between Shifts; default takes the first. */
  pick?: (s: CareerState) => number;
  /** Sees the state after every sim advance. */
  watch?: (s: CareerState) => void;
  pauseAt?: number;
  resumeAt?: number;
}

/** A fix whose Incident is nearly out of time first, then whatever has waited longest. */
function chooseTarget(targets: Target[]): Target | undefined {
  const urgent = targets.filter((t) => t.ref.kind === 'fix' && t.delayMs > INCIDENT_LIMIT_MS / 2);
  const pool = urgent.length > 0 ? urgent : targets;
  return pool.reduce<Target | undefined>((best, t) => (!best || t.delayMs > best.delayMs ? t : best), undefined);
}

/** Plays a Career the way the screen does: ticks advance, keys and actions are logged. */
export function drive(o: DriveOptions): { state: CareerState; evidence: DispatchEvidence } {
  const t0 = 1_000;
  let log: KeyLog = beginLog(t0);
  const actions: DispatchAction[] = [];
  let state = startCareer(net, o.seed);
  let now = t0;
  let keys = 0;
  let chosen: TargetRef | null = null;
  const limit = o.limitMs ?? 60 * 60_000;

  const act = (body: DispatchActionBody) => {
    const after = applyDispatchAction(net, state, body, now);
    if (after !== state) actions.push({ ...body, i: log.events.length, t: now });
    state = after;
  };

  /** The next thing to press: a character, Enter once the whole name is typed, or a release of a dead aim. */
  const nextInput = (): string | 'confirm' | 'unlock' => {
    const targets = visibleTargets(net, state.sim);
    const { aim } = state;
    let target = aim.lock ? targets.find((t) => sameRef(t.ref, aim.lock!))
      : aim.typed !== '' && chosen ? targets.find((t) => sameRef(t.ref, chosen!)) : undefined;
    if (!target) {
      // Part-way through a name, only a Target that continues it will do.
      const typed = aim.typed.toLowerCase();
      const pool = aim.typed === '' ? targets : targets.filter((t) => t.text.toLowerCase().startsWith(typed));
      if (pool.length === 0 && aim.typed !== '') return 'unlock';
      target = chooseTarget(pool);
      chosen = target?.ref ?? null;
    }
    // Nothing to type: only the first key of a Shift is worth spending, to start the clock.
    if (!target) return state.status === 'ready' ? '#' : '';
    if (aim.typed.length >= target.text.length) return 'confirm';
    return target.text[aim.typed.length]!;
  };

  while (state.status !== 'ended' && now < limit) {
    state = advanceCareer(net, state, now);
    o.watch?.(state);
    if (state.status === 'ended') break;
    if (o.pauseAt !== undefined && state.status === 'running' && now >= o.pauseAt && now < (o.resumeAt ?? Infinity)) {
      act({ a: 'pause' });
    } else if (state.status === 'paused' && o.resumeAt !== undefined && now >= o.resumeAt) {
      act({ a: 'resume' });
    } else if (state.status === 'between') {
      act({ a: 'expand', pick: state.offers.length === 0 ? -1 : o.pick?.(state) ?? 0 });
    } else if (state.status === 'ready' || state.status === 'running') {
      const input = nextInput();
      if (input === 'confirm' || input === 'unlock') {
        act({ a: input });
      } else if (input !== '') {
        keys += 1;
        // Every 23rd key is a typo; human-ish jitter keeps the Verdict happy.
        const key = keys % 23 === 0 ? '#' : input;
        log = appendKey(log, key, PLAIN_SOURCE, now, DISPATCH_KEYLOG_MAX_EVENTS);
        state = enterDispatchCharacter(net, state, key, now);
      }
    }
    now += Math.round(o.msPerKey * (0.6 + ((keys * 7919) % 97) / 97 * 0.8));
  }
  if (state.status !== 'ended') state = advanceCareer(net, state, now);
  return {
    state,
    evidence: { v: DISPATCH_EVIDENCE_VERSION, seed: o.seed, keylog: log, actions, endedAt: state.endedAt ?? now },
  };
}
