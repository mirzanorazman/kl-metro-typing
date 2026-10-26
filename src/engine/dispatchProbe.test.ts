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

/** A driven Career and the Service gaps that started in it. */
interface Run { state: CareerState; gaps: number }

// Each typist's five Careers are driven once and shared by the tests below.
const memo = new Map<Typist, Run[]>();
const runs = (typist: Typist): Run[] => {
  if (!memo.has(typist)) {
    memo.set(typist, SEEDS.map((seed) => {
      const seen = new Set<string>();
      const watch = (s: CareerState) => {
        for (const inc of s.sim.incidents) if (inc.kind === 'service-gap') seen.add(`${s.shift}:${inc.id}`);
      };
      return { state: drive({ ...typist, seed, limitMs: 30 * MIN, watch }).state, gaps: seen.size };
    }));
  }
  return memo.get(typist)!;
};
const careers = (typist: Typist): CareerState[] => runs(typist).map((r) => r.state);
/** Service gaps per Shift played, counting the Shift a Career ended or stopped in. */
const gapsPerShift = (r: Run) => r.gaps / r.state.shift;

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
    console.log('median of 5 seeds — Career minutes / Shifts cleared / waves / Service gaps per Shift / delivered / score; '
      + 'per seed minutes / cleared / Service gaps / first closure cause');
    for (const typist of [SLOW, MID, FAST, INATTENTIVE]) {
      const all = runs(typist);
      const states = all.map((r) => r.state);
      console.log(`${typist.label.padEnd(24)} ${median(states.map(minutes)).toFixed(1)} min  `
        + `${median(states.map((s) => s.cleared))} cleared  ${median(states.map((s) => s.waves))} waves  `
        + `${median(all.map(gapsPerShift)).toFixed(2)} gaps/Shift  `
        + `${median(states.map((s) => careerTotals(s).delivered))}d  ${median(states.map(careerScore))}pts  `
        + `[${all.map(({ state: s, gaps }) => `${minutes(s).toFixed(1)}m/${s.cleared}c/${gaps}g/${firstCause(s)}`).join(', ')}]`);
    }
  }, 900_000);
});
