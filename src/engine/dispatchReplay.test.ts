import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { careerMetrics, careerScore, careerTotals, SHIFT_MS, type CareerState, type Wave } from './dispatch';
import type { Train } from './dispatchSim';
import { drive } from './dispatchDrive.testutil';
import { DISPATCH_KEYLOG_MAX_EVENTS } from './dispatchBalance';
import { judgeCareer } from './dispatchJudge';
import { verifyKeyLog } from './integrity';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { buildNetwork } from './network';
import { replayDispatch, type DispatchEvidence } from './replay';

const net = buildNetwork(loadNetworkData());

const driven = () => drive({ seed: 5, msPerKey: 200, limitMs: 30 * 60_000 });
const expectSame = (state: ReturnType<typeof driven>['state'], evidence: DispatchEvidence) => {
  const replayed = replayDispatch(net, evidence)!;
  expect(replayed.complete).toBe(state.endReason === 'failed');
  expect(replayed.delivered).toBe(careerTotals(state).delivered);
  expect(replayed.cleared).toBe(state.cleared);
  expect(replayed.score).toBe(careerScore(state));
  expect(Math.abs(replayed.metrics.wpm - careerMetrics(state, evidence.endedAt).wpm)).toBeLessThan(1e-9);
};

describe('replayDispatch', () => {
  it('a driven Career replays to the same result', () => {
    const { state, evidence } = driven();
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('failed');
    expectSame(state, evidence);
  }, 120_000);

  it('pauses and Expansion picks replay', () => {
    const { state, evidence } = drive({
      seed: 3, msPerKey: 200, limitMs: 30 * 60_000, pauseAt: 20_000, resumeAt: 30_000,
      pick: (s) => s.offers.length - 1,
    });
    expect(state.endReason).toBe('failed');
    expect(evidence.actions.some((a) => a.a === 'pause')).toBe(true);
    expect(evidence.actions.some((a) => a.a === 'resume')).toBe(true);
    expect(evidence.actions.some((a) => a.a === 'expand')).toBe(true);
    expectSame(state, evidence);
  }, 120_000);

  it('waves replay', () => {
    const { state, evidence } = drive({ seed: 3, msPerKey: 200, limitMs: 30 * 60_000, accuracy: 0.99 });
    expect(state.endReason).toBe('failed');
    expect(state.waves).toBeGreaterThan(0);
    expectSame(state, evidence);
    expect(replayDispatch(net, evidence)!.waves).toBe(state.waves);
  }, 120_000);

  it('a Green wave from a Skip-stop fires on the skipped train\'s Line, from its Station, and replays', () => {
    const fromSkips: Array<{ wave: Wave; skipped: Train }> = [];
    let prev: CareerState | null = null;
    const { state, evidence } = drive({
      seed: 1, msPerKey: 200, limitMs: 10 * 60_000, accuracy: 0.995, skips: true,
      watch: (s) => {
        // One key or action between looks, so a wave that fires as a train
        // leaves its Signal on an express run came from that Skip-stop.
        if (prev && s.lastWave && s.lastWave.id !== prev.lastWave?.id) {
          const skipped = prev.sim.trains.filter((p) => p.stage === 'signal' && p.skipTo === null
            && s.sim.trains.some((t) => t.id === p.id && t.skipTo !== null));
          if (skipped.length === 1) fromSkips.push({ wave: s.lastWave, skipped: skipped[0]! });
        }
        prev = s;
      },
    });
    expect(fromSkips.length).toBeGreaterThan(0);
    for (const { wave, skipped } of fromSkips) {
      expect(wave.line).toBe(skipped.line);
      expect(wave.origin).toBe(net.lines.get(skipped.line)!.stations[skipped.at]);
    }
    expectSame(state, evidence);
    expect(replayDispatch(net, evidence)!.waves).toBe(state.waves);
  }, 120_000);

  it('confirm actions replay', () => {
    // Exact-prefix names only meet in a large late-Career network, so look further.
    for (let seed = 1; seed <= 25; seed++) {
      const { state, evidence } = drive({ seed, msPerKey: 133, limitMs: 60 * 60_000 });
      if (!evidence.actions.some((a) => a.a === 'confirm')) continue;
      expectSame(state, evidence);
      return;
    }
    throw new Error('no seed needed a confirm');
  }, 120_000);

  it('an abandoned Career replays but is never complete', () => {
    const { evidence } = drive({ seed: 3, msPerKey: 200, limitMs: 20_000 });
    const abandoned: DispatchEvidence = {
      ...evidence, actions: [...evidence.actions, { a: 'abandon', i: evidence.keylog.events.length, t: evidence.endedAt }],
    };
    const replayed = replayDispatch(net, abandoned)!;
    expect(replayed).not.toBeNull();
    expect(replayed.complete).toBe(false);
    expect(judgeCareer(net, abandoned).eligible).toBe(false);
  }, 120_000);

  it('a Career retired between Shifts replays complete and is judged eligible', () => {
    const { evidence } = drive({ seed: 3, msPerKey: 200, limitMs: SHIFT_MS + 5_000 });
    const expand = evidence.actions.findIndex((a) => a.a === 'expand');
    expect(expand).toBeGreaterThanOrEqual(0);
    const at = evidence.actions[expand]!;
    const keys = evidence.keylog.events.slice(0, at.i);
    const retired: DispatchEvidence = {
      ...evidence,
      keylog: { ...evidence.keylog, events: keys },
      actions: [...evidence.actions.slice(0, expand), { a: 'abandon', i: at.i, t: at.t }],
      endedAt: at.t,
    };
    const replayed = replayDispatch(net, retired)!;
    expect(replayed.complete).toBe(true);
    expect(replayed.cleared).toBe(1);
    expect(judgeCareer(net, retired).eligible).toBe(true);
  }, 120_000);

  it('forged evidence is refused', () => {
    const { evidence } = drive({
      seed: 3, msPerKey: 200, limitMs: 30 * 60_000, pauseAt: 20_000, resumeAt: 30_000,
    });
    expect(evidence.actions.length).toBeGreaterThan(2);
    const swapped = [...evidence.actions];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const expandAt = evidence.actions.findIndex((a) => a.a === 'expand');
    const badPick = evidence.actions.map((a, n) => (n === expandAt && a.a === 'expand' ? { ...a, pick: 99 } : a));
    const stray: DispatchEvidence = { ...evidence, actions: [{ a: 'resume', i: 0, t: evidence.keylog.t0 }, ...evidence.actions] };
    expect(replayDispatch(net, evidence)).not.toBeNull();
    expect(replayDispatch(net, { ...evidence, v: 99 })).toBeNull();
    expect(replayDispatch(net, { ...evidence, actions: swapped })).toBeNull();
    expect(replayDispatch(net, { ...evidence, actions: badPick })).toBeNull();
    expect(replayDispatch(net, stray)).toBeNull();
    expect(replayDispatch(net, { ...evidence, endedAt: Number.NaN })).toBeNull();
    expect(replayDispatch(net, { ...evidence, endedAt: Infinity })).toBeNull();
    expect(replayDispatch(net, { ...evidence, actions: [{ a: 'nope', i: 0, t: 0 } as never] })).toBeNull();
  }, 120_000);
});

describe('judgeCareer', () => {
  it('is eligible for a driven Career whose Keylog passes its Verdict', () => {
    const { state, evidence } = driven();
    const judged = judgeCareer(net, evidence);
    expect(judged.eligible).toBe(true);
    expect(judged.verdict?.ok).toBe(true);
    expect(judged.delivered).toBe(careerTotals(state).delivered);
    expect(judged.cleared).toBe(state.cleared);
    expect(judged.score).toBe(careerScore(state));
  }, 120_000);

  it('is ineligible for forged evidence, without throwing', () => {
    const { evidence } = driven();
    for (const forged of [{ ...evidence, v: 0 }, { ...evidence, endedAt: Number.NaN }, null, {}] as DispatchEvidence[]) {
      const judged = judgeCareer(net, forged);
      expect(judged.eligible).toBe(false);
      expect(judged.verdict).toBeNull();
    }
  }, 120_000);
});

describe('the Dispatcher Keylog ceiling', () => {
  // 120 WPM is 10 characters a second. An honest Career of four hours at that
  // pace must neither truncate nor be refused as malformed.
  const honest = 120 * 5 * 240;
  const longLog = (length: number): KeyLog => {
    const events = Array.from({ length }, (_, i) => ({ k: 'a', dt: 70 + ((i * 37) % 61) }));
    return { ...beginLog(0), ms: events.reduce((sum, e) => sum + e.dt, 0), events };
  };

  it('holds a four-hour Career at 120 WPM without truncating', () => {
    expect(DISPATCH_KEYLOG_MAX_EVENTS).toBeGreaterThanOrEqual(honest);
    const log = appendKey(longLog(honest - 1), 'a', PLAIN_SOURCE, 1e9, DISPATCH_KEYLOG_MAX_EVENTS);
    expect(log.events).toHaveLength(honest);
    expect(log.truncated).toBeUndefined();
    expect(verifyKeyLog(log, 120, DISPATCH_KEYLOG_MAX_EVENTS)).toEqual({ ok: true });
  });

  it('still refuses a log past the ceiling', () => {
    const full = longLog(DISPATCH_KEYLOG_MAX_EVENTS);
    const capped = appendKey(full, 'a', PLAIN_SOURCE, 1e9, DISPATCH_KEYLOG_MAX_EVENTS);
    expect(capped.truncated).toBe(true);
    expect(verifyKeyLog(capped, 120, DISPATCH_KEYLOG_MAX_EVENTS)).toEqual({ ok: false, reason: 'malformed-log' });
  });
});
