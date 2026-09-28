import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from './network';
import { drive } from './rushDrive.testutil';
import { deliverableAt, rushDayPhase, type RushState } from './rushHour';

const net = buildNetwork(loadNetworkData());

/** Picks the Direction whose next Station delivers most, then has most waiting. */
const greedy = (s: RushState) => {
  let best = s.options[0]!;
  let score = -1;
  for (const o of s.options) {
    const v = deliverableAt(net, s, o.next) * 3 + (s.queues[o.next]?.passengers.length ?? 0);
    if (v > score) {
      score = v;
      best = o;
    }
  }
  return { a: 'choose' as const, line: best.line, next: best.next };
};

describe('rush hour balance', () => {
  it('lets a 60 WPM typist on one Line survive the first Morning Peak, then overflow', () => {
    for (const seed of [1, 2, 3]) {
      const { state } = drive({ lineSet: ['MR'], start: 'hang-tuah', seed, msPerKey: 200, choose: greedy });
      expect(state.endReason).toBe('overflow');
      expect(state.gameMs).toBeGreaterThan(100_000);
    }
  });

  // Opt-in survey for tuning: RUSH_PROBE=1 npx vitest run src/engine/rushProbe.test.ts
  it.skipIf(!process.env.RUSH_PROBE)('prints survival across speeds and Line sets', () => {
    const sets: [LineCode[], string][] = [
      [['KJ'], 'masjid-jamek'],
      [['MR'], 'hang-tuah'],
      [['KJ', 'AG', 'SP'], 'masjid-jamek'],
      [['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY'], 'masjid-jamek'],
    ];
    for (const ms of [300, 200, 120]) {
      for (const [lineSet, start] of sets) {
        const rows = [1, 2, 3].map((seed) => {
          const { state } = drive({ lineSet, start, seed, msPerKey: ms, choose: greedy });
          const p = rushDayPhase(state.gameMs);
          return `${Math.round(state.gameMs / 1000)}s D${p.day} ${p.name} delivered=${state.delivered}`;
        });
        console.log(`${ms}ms/key ${lineSet.join('+')}: ${rows.join(' | ')}`);
      }
    }
  }, 300_000);
});
