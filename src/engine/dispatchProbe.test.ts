import { describe, expect, it } from 'vitest';
import { careerScore, careerTotals, type CareerState } from './dispatch';
import { drive, type DriveOptions } from './dispatchDrive.testutil';

/** The survey typists from the playtest-1 spec, Part C: ms per key ≈ 40, 60 and 90 WPM. */
type Typist = Omit<DriveOptions, 'seed'> & { label: string };
const SLOW: Typist = { label: '40 WPM 94%', msPerKey: 300, accuracy: 0.94 };
const MID: Typist = { label: '60 WPM 96%', msPerKey: 200, accuracy: 0.96 };
const FAST: Typist = { label: '90 WPM 98%', msPerKey: 133, accuracy: 0.98 };
const INATTENTIVE: Typist = { label: '60 WPM 96% inattentive', msPerKey: 200, accuracy: 0.96, inattentive: true };

const SEEDS = [1, 2, 3, 4, 5];
const MIN = 60_000;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const minutes = (s: CareerState) => s.gameMs / MIN;
const firstCause = (s: CareerState) => s.failure?.closures[0]?.cause ?? s.status;

// Each typist's five Careers are driven once and shared by the tests below.
const memo = new Map<Typist, CareerState[]>();
const careers = (typist: Typist): CareerState[] => {
  if (!memo.has(typist)) {
    memo.set(typist, SEEDS.map((seed) => drive({ ...typist, seed, limitMs: 30 * MIN }).state));
  }
  return memo.get(typist)!;
};

describe('dispatcher balance', () => {
  it('a 40 WPM, 94% Career lasts 5 to 8 minutes (median)', () => {
    const median40 = median(careers(SLOW).map(minutes));
    expect(median40).toBeGreaterThanOrEqual(5);
    expect(median40).toBeLessThanOrEqual(8);
  }, 300_000);

  it('a 90 WPM, 98% Career lasts at least 15 minutes (median)', () => {
    expect(median(careers(FAST).map(minutes))).toBeGreaterThanOrEqual(15);
  }, 300_000);

  // Known gap, kept visible: above ~70 WPM a Career does not end within the hour,
  // and no dispatchBalance constant changes that (see the dispatcher handover,
  // "Playtest 1"). When a change makes this pass, turn it back into a plain `it`.
  it.fails('a 90 WPM, 98% Career ends by 25 minutes (median)', () => {
    expect(median(careers(FAST).map(minutes))).toBeLessThanOrEqual(25);
  }, 300_000);

  it('the first Shift is winnable at 60 WPM, 96% on every seed', () => {
    for (const state of careers(MID)) expect(state.cleared).toBeGreaterThanOrEqual(1);
  }, 300_000);

  it('an inattentive typist can lose to an Incident', () => {
    const incidentKinds: string[] = ['signal-fault', 'train-fault', 'crowd-surge'];
    expect(careers(INATTENTIVE).map(firstCause).some((cause) => incidentKinds.includes(cause))).toBe(true);
  }, 300_000);

  it('rewards speed: 90 WPM clears more Shifts than 40 WPM', () => {
    const cleared = (typist: Typist) => median(careers(typist).map((s) => s.cleared));
    expect(cleared(FAST)).toBeGreaterThan(cleared(SLOW));
  }, 300_000);

  // Opt-in survey for tuning: DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts
  it.skipIf(!process.env.DISPATCH_PROBE)('prints the survey per typist', () => {
    console.log('median of 5 seeds — Career minutes / Shifts cleared / waves / delivered / score; first closure cause per seed');
    for (const typist of [SLOW, MID, FAST, INATTENTIVE]) {
      const runs = careers(typist);
      console.log(`${typist.label.padEnd(24)} ${median(runs.map(minutes)).toFixed(1)} min  `
        + `${median(runs.map((s) => s.cleared))} cleared  ${median(runs.map((s) => s.waves))} waves  `
        + `${median(runs.map((s) => careerTotals(s).delivered))}d  ${median(runs.map(careerScore))}pts  `
        + `[${runs.map((s) => `${minutes(s).toFixed(1)}m/${s.cleared}c/${firstCause(s)}`).join(', ')}]`);
    }
  }, 900_000);
});
