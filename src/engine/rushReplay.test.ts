import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { verifyKeyLog } from './integrity';
import { buildNetwork } from './network';
import { replayRushHour, type RushEvidence } from './replay';
import { RUSH_KEYLOG_MAX_EVENTS } from './rushBalance';
import {
  RUSH_EVIDENCE_VERSION,
  advanceRush,
  applyRushAction,
  enterRushCharacter,
  rushMetrics,
  startRush,
  type RushAction,
  type RushActionBody,
  type RushState,
} from './rushHour';

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

describe('replayRushHour', () => {
  const run = () => drive({
    lineSet: ['KJ', 'AG'],
    start: 'masjid-jamek',
    seed: 99,
    msPerKey: 350,
    pauseAt: 30_000,
    resumeAt: 50_000,
  });

  it('reproduces a live Run exactly', () => {
    const { state, evidence } = run();
    expect(state.endReason).toBe('overflow');
    expect(evidence.actions.some((a) => a.a === 'pause')).toBe(true);
    expect(evidence.actions.some((a) => a.a === 'choose')).toBe(true);
    const replayed = replayRushHour(net, evidence)!;
    expect(replayed.complete).toBe(true);
    expect(replayed.delivered).toBe(state.delivered);
    expect(replayed.overflowedAt).toBe(state.overflowedAt);
    expect(replayed.metrics).toEqual(rushMetrics(state, state.endedAt!));
    expect(verifyKeyLog(evidence.keylog, replayed.metrics.wpm, RUSH_KEYLOG_MAX_EVENTS)).toEqual({ ok: true });
  });

  it('does not complete with a different seed', () => {
    const { evidence } = run();
    const replayed = replayRushHour(net, { ...evidence, seed: 100 });
    expect(replayed?.complete ?? false).toBe(false);
  });

  it('does not complete with a claimed later end', () => {
    const { evidence } = run();
    expect(replayRushHour(net, { ...evidence, endedAt: evidence.endedAt + 60_000 })?.complete).toBe(false);
  });

  it('refuses an action the engine would not take', () => {
    const { evidence } = run();
    const actions = evidence.actions.map((a) => (a.a === 'choose' ? { ...a, next: 'gombak' } : a));
    expect(replayRushHour(net, { ...evidence, actions })).toBeNull();
  });

  it('refuses dropped or reordered actions', () => {
    const { evidence } = run();
    expect(replayRushHour(net, { ...evidence, actions: evidence.actions.slice(1) })).toBeNull();
    const shifted = evidence.actions.map((a) => ({ ...a, i: a.i + 100_000 }));
    expect(replayRushHour(net, { ...evidence, actions: shifted })).toBeNull();
  });

  it('never completes an abandoned Run', () => {
    let { state, evidence } = drive({ lineSet: ['KJ'], start: 'gombak', seed: 1, msPerKey: 200, limitMs: 20_000 });
    const t = evidence.endedAt;
    state = applyRushAction(net, state, { a: 'abandon' }, t);
    const actions = [...evidence.actions, { a: 'abandon' as const, i: evidence.keylog.events.length, t }];
    const replayed = replayRushHour(net, { ...evidence, actions, endedAt: state.endedAt! })!;
    expect(replayed.complete).toBe(false);
  });

  it('refuses malformed evidence', () => {
    const { evidence } = run();
    expect(replayRushHour(net, { ...evidence, v: 9 })).toBeNull();
    expect(replayRushHour(net, { ...evidence, lineSet: [] })).toBeNull();
    expect(replayRushHour(net, { ...evidence, start: 'nowhere' })).toBeNull();
    expect(replayRushHour(net, null as unknown as RushEvidence)).toBeNull();
  });
});
