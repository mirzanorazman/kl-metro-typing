import { loadNetworkData } from '../data/load';
import {
  DISPATCH_EVIDENCE_VERSION, advanceCareer, applyDispatchAction, enterDispatchCharacter, startCareer,
  type CareerState, type DispatchAction, type DispatchActionBody,
} from './dispatch';
import { COMBO_EVERY, DISPATCH_KEYLOG_MAX_EVENTS, INCIDENT_LIMIT_MS } from './dispatchBalance';
import { sameRef, visibleTargets, type Target, type TargetRef } from './dispatchTargets';
import { nextRandom, seedRandom } from './rng';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { buildNetwork } from './network';
import type { SimState } from './dispatchSim';
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
  /** Share of keys typed right; the rest are seeded typos. Omitted: every 23rd key is a typo. */
  accuracy?: number;
  /** Ignores fix Targets until the Incident is past three-quarters of INCIDENT_LIMIT_MS. */
  inattentive?: boolean;
}

/** The Line a Target's completion happens on, which is where its Green wave would fire. */
function lineOf(sim: SimState, ref: TargetRef): string | undefined {
  if (ref.kind === 'fix') return sim.incidents.find((inc) => inc.id === ref.incident)?.line;
  return sim.trains.find((t) => t.id === ref.train)?.line;
}

/**
 * A fix whose Incident is nearly out of time first, then whatever has waited longest.
 * One completion short of a Green wave, it prefers a Target on the Line with the most waiting Signals.
 */
function chooseTarget(sim: SimState, targets: Target[], streak: number): Target | undefined {
  const urgent = targets.filter((t) => t.ref.kind === 'fix' && t.delayMs > INCIDENT_LIMIT_MS / 2);
  let pool = urgent.length > 0 ? urgent : targets;
  if (streak % COMBO_EVERY === COMBO_EVERY - 1 && pool.length > 1) {
    const waiting = new Map<string, number>();
    for (const t of targets) {
      if (t.ref.kind !== 'signal') continue;
      const line = lineOf(sim, t.ref)!;
      waiting.set(line, (waiting.get(line) ?? 0) + 1);
    }
    const best = Math.max(...pool.map((t) => waiting.get(lineOf(sim, t.ref) ?? '') ?? 0));
    pool = pool.filter((t) => (waiting.get(lineOf(sim, t.ref) ?? '') ?? 0) === best);
  }
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
  let typoRng = seedRandom(o.seed * 7_919 + 1);
  const typo = (): boolean => {
    // Every 23rd key is a typo unless an accuracy is given; jitter keeps the Verdict happy.
    if (o.accuracy === undefined) return keys % 23 === 0;
    let value: number;
    [value, typoRng] = nextRandom(typoRng);
    return value >= o.accuracy;
  };

  const act = (body: DispatchActionBody) => {
    const after = applyDispatchAction(net, state, body, now);
    if (after !== state) actions.push({ ...body, i: log.events.length, t: now });
    state = after;
  };

  /** The next thing to press: a character, Enter once the whole name is typed, or a release of a dead aim. */
  const nextInput = (): string | 'confirm' | 'unlock' => {
    const targets = visibleTargets(net, state.sim).filter((t) => !o.inattentive
      || t.ref.kind !== 'fix' || t.delayMs > 0.75 * INCIDENT_LIMIT_MS);
    const { aim } = state;
    let target = aim.lock ? targets.find((t) => sameRef(t.ref, aim.lock!))
      : aim.typed !== '' && chosen ? targets.find((t) => sameRef(t.ref, chosen!)) : undefined;
    if (!target) {
      // Part-way through a name, only a Target that continues it will do.
      const typed = aim.typed.toLowerCase();
      const pool = aim.typed === '' ? targets : targets.filter((t) => t.text.toLowerCase().startsWith(typed));
      if (pool.length === 0 && aim.typed !== '') return 'unlock';
      target = chooseTarget(state.sim, pool, state.streak);
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
        const key = typo() ? '#' : input;
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
