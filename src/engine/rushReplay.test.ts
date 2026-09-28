import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { verifyKeyLog } from './integrity';
import { buildNetwork } from './network';
import { replayRushHour, type RushEvidence } from './replay';
import { RUSH_KEYLOG_MAX_EVENTS } from './rushBalance';
import { drive } from './rushDrive.testutil';
import { applyRushAction, rushMetrics } from './rushHour';

const net = buildNetwork(loadNetworkData());

describe('replayRushHour', () => {
  const run = () => drive({
    lineSet: ['KJ', 'AG'],
    start: 'masjid-jamek',
    seed: 99,
    msPerKey: 350,
    pauseAt: 5_000,
    resumeAt: 10_000,
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
