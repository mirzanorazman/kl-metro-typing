import { describe, expect, it } from 'vitest';
import { careerScore, careerTotals } from './dispatch';
import { drive } from './dispatchDrive.testutil';

/** ≈ 40, 60 and 90 WPM. */
const SLOW = 300;
const MID = 200;
const FAST = 133;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const play = (seed: number, msPerKey: number) => drive({ seed, msPerKey, limitMs: 30 * 60_000 }).state;

describe('dispatcher balance', () => {
  it('rewards speed: 90 WPM clears more Shifts than 40 WPM', () => {
    const cleared = (ms: number) => median([1, 2, 3].map((seed) => play(seed, ms).cleared));
    expect(cleared(FAST)).toBeGreaterThan(cleared(SLOW));
  }, 300_000);

  it('the first Shift is winnable at 60 WPM', () => {
    for (const seed of [1, 2, 3]) expect(play(seed, MID).cleared).toBeGreaterThanOrEqual(1);
  }, 300_000);

  // Opt-in survey for tuning: DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts
  it.skipIf(!process.env.DISPATCH_PROBE)('prints Shifts cleared across speeds', () => {
    console.log('median of 5 seeds — shifts cleared / delivered / score / failure cause; columns 40, 60, 90 WPM');
    const cells = [SLOW, MID, FAST].map((ms) => {
      const runs = [1, 2, 3, 4, 5].map((seed) => play(seed, ms));
      const causes = runs.map((s) => s.failure?.closures[0]?.cause ?? s.status).join(',');
      return `${median(runs.map((s) => s.cleared))}c ${median(runs.map((s) => careerTotals(s).delivered))}d `
        + `${median(runs.map(careerScore))}pts [${causes}]`;
    });
    console.log(cells.join('  |  '));
  }, 900_000);
});
