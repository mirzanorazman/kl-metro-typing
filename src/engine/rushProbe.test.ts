import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from './network';
import { drive } from './rushDrive.testutil';
import { queueCapacity, rushDayPhase, rushGeometry, type RushState } from './rushHour';
import { greedyChoose, plannerChoose, plannerSteer } from './rushTypists.testutil';

const net = buildNetwork(loadNetworkData());
const ALL: LineCode[] = ['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY'];
/** ≈ 40, 60 and 90 WPM. */
const SLOW = 300;
const MID = 200;
const FAST = 133;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const halfFull = (s: RushState) =>
  rushGeometry(net, s.lineSet).stations.some((id) => s.queues[id]!.passengers.length * 2 >= queueCapacity(net, id));

function play(lineSet: LineCode[], start: string, seed: number, msPerKey: number) {
  let firstCrowdMs = Infinity;
  const { state } = drive({
    lineSet, start, seed, msPerKey, limitMs: 20 * 60_000,
    choose: plannerChoose,
    steer: plannerSteer,
    watch: (s) => {
      if (firstCrowdMs === Infinity && halfFull(s)) firstCrowdMs = s.gameMs;
    },
  });
  return { state, firstCrowdMs };
}

const survival = (lineSet: LineCode[], start: string, msPerKey: number) =>
  median([1, 2, 3].map((seed) => play(lineSet, start, seed, msPerKey).state.gameMs));

describe('rush hour balance', () => {
  it('rewards speed: 90 WPM outlasts 40 WPM on a long Line and on every Line', () => {
    expect(survival(['KJ'], 'masjid-jamek', FAST)).toBeGreaterThan(survival(['KJ'], 'masjid-jamek', SLOW));
    expect(survival(ALL, 'masjid-jamek', FAST)).toBeGreaterThan(survival(ALL, 'masjid-jamek', SLOW));
  }, 120_000);

  it('crowds some Queue to half its Capacity within the first minute', () => {
    for (const seed of [1, 2, 3]) {
      expect(play(['KJ'], 'masjid-jamek', seed, MID).firstCrowdMs).toBeLessThan(60_000);
    }
  }, 120_000);

  // Opt-in survey for tuning: RUSH_PROBE=1 npx vitest run src/engine/rushProbe.test.ts
  it.skipIf(!process.env.RUSH_PROBE)('prints survival across speeds and Line sets', () => {
    const sets: [LineCode[], string][] = [
      [['KJ'], 'masjid-jamek'],
      [['MR'], 'hang-tuah'],
      [['KJ', 'AG', 'SP'], 'masjid-jamek'],
      [ALL, 'masjid-jamek'],
    ];
    console.log('median of 5 seeds — run s / delivered / first half-full Queue s; columns 40, 60, 90 WPM');
    for (const [lineSet, start] of sets) {
      const cells = [SLOW, MID, FAST].map((ms) => {
        const runs = [1, 2, 3, 4, 5].map((seed) => play(lineSet, start, seed, ms));
        const secs = median(runs.map((r) => r.state.gameMs)) / 1000;
        const delivered = median(runs.map((r) => r.state.delivered));
        const crowd = median(runs.map((r) => r.firstCrowdMs)) / 1000;
        const day = rushDayPhase(median(runs.map((r) => r.state.gameMs))).day;
        return `${Math.round(secs)}s D${day} ${delivered}d c${Math.round(crowd)}`.padEnd(22);
      });
      console.log(`${lineSet.length === ALL.length ? 'ALL' : lineSet.join('+')}`.padEnd(10) + cells.join(''));
    }
    // The greedy typist never turns around: a floor for what thoughtless routing gets.
    const greedy = drive({ lineSet: ['KJ'], start: 'masjid-jamek', seed: 1, msPerKey: MID, choose: greedyChoose });
    console.log(`greedy KJ 60 WPM: ${Math.round(greedy.state.gameMs / 1000)}s ${greedy.state.delivered}d`);
  }, 600_000);
});
