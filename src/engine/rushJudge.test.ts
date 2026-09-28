import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { emptyProfile, recordRushBest } from './progress';
import { drive } from './rushDrive.testutil';
import { judgeRushRun } from './rushJudge';

const net = buildNetwork(loadNetworkData());

describe('judgeRushRun', () => {
  it('accepts an honest Overflow-ended Run with Replay-derived Delivered', () => {
    const { state, evidence } = drive({ lineSet: ['MR'], start: 'hang-tuah', seed: 4, msPerKey: 220 });
    const j = judgeRushRun(net, evidence);
    expect(j.eligible).toBe(true);
    expect(j.delivered).toBe(state.delivered);
  });

  it('refuses a Run typed by a metronome', () => {
    const { evidence } = drive({ lineSet: ['MR'], start: 'hang-tuah', seed: 4, msPerKey: 220 });
    const keylog = { ...evidence.keylog, events: evidence.keylog.events.map((e, i) => ({ ...e, dt: i === 0 ? e.dt : 30 })) };
    expect(judgeRushRun(net, { ...evidence, keylog }).eligible).toBe(false);
  });

  it('refuses a Run that did not end by Overflow', () => {
    const { evidence } = drive({ lineSet: ['MR'], start: 'hang-tuah', seed: 4, msPerKey: 220, limitMs: 30_000 });
    expect(judgeRushRun(net, evidence).eligible).toBe(false);
  });
});

describe('recordRushBest', () => {
  it('keeps the higher Delivered per Line set', () => {
    let p = recordRushBest(emptyProfile(), 'AG+KJ', 12);
    expect(p.rushHigh['AG+KJ']).toBe(12);
    expect(recordRushBest(p, 'AG+KJ', 10)).toBe(p);
    p = recordRushBest(p, 'AG+KJ', 20);
    expect(p.rushHigh).toEqual({ 'AG+KJ': 20 });
    expect(recordRushBest(p, 'MR', -1)).toBe(p);
    expect(recordRushBest(p, 'MR', 1.5)).toBe(p);
  });
});
