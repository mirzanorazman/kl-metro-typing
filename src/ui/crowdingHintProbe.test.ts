import { it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { CareerState } from '../engine/dispatch';
import { drive } from '../engine/dispatchDrive.testutil';
import { visibleTargets } from '../engine/dispatchTargets';
import { buildNetwork } from '../engine/network';
import { crowdedStations, relievingTrains } from '../render/crowdingHint';

/**
 * How often the crowding hint shows, and whether it comes in time. A 60 WPM
 * typist at 96 % accuracy, seeds 1–5, 30 minutes each, with the hint's
 * default delay (5 s). Design: crowding hint spec (2026-10-28).
 */

const net = buildNetwork(loadNetworkData());
const DELAY_MS = 5_000;
/** A closure counts as warned if an amber chip showed in this long before it. */
const WARN_MS = 14_000;
const bands = ['Shifts 1–3', 'Shifts 4–8', 'Shift 9+'] as const;
const band = (s: CareerState) => (s.shift <= 3 ? bands[0] : s.shift <= 8 ? bands[1] : bands[2]);

interface Tally {
  runningMs: number;
  ringMs: number;
  ringSamples: number;
  ringSum: number;
  chipSamples: number;
  chipSum: number;
  closures: number;
  warned: number;
}
const blank = (): Tally => ({ runningMs: 0, ringMs: 0, ringSamples: 0, ringSum: 0, chipSamples: 0, chipSum: 0, closures: 0, warned: 0 });
const fixed = (n: number, d = 1) => n.toFixed(d);
const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${fixed((100 * a) / b)}%`);

// Opt-in survey for tuning: DISPATCH_PROBE=1 npx vitest run src/ui/crowdingHintProbe.test.ts
it.skipIf(!process.env.DISPATCH_PROBE)('prints how the crowding hint shows', () => {
  const tallies = new Map<string, Tally>(bands.map((b) => [b, blank()]));
  for (const seed of [1, 2, 3, 4, 5]) {
    let shift = 0;
    let lastMs = 0;
    let closed = 0;
    let lastChipMs = -Infinity;
    drive({ seed, msPerKey: 200, accuracy: 0.96, limitMs: 30 * 60_000, watch: (s) => {
      if (s.status !== 'running') return;
      const sim = s.sim;
      // Time-weight by Shift milliseconds; start afresh when the Shift changes.
      if (s.shift !== shift || sim.shiftMs < lastMs) {
        shift = s.shift;
        lastMs = sim.shiftMs;
        closed = sim.oosOrder.length;
        lastChipMs = -Infinity;
        return;
      }
      const t = tallies.get(band(s))!;
      const dt = sim.shiftMs - lastMs;
      lastMs = sim.shiftMs;
      const rings = crowdedStations(sim, DELAY_MS);
      const chips = relievingTrains(net, sim, rings, visibleTargets(net, sim));
      t.runningMs += dt;
      if (rings.length > 0) {
        t.ringMs += dt;
        t.ringSamples += 1;
        t.ringSum += rings.length;
        t.chipSamples += 1;
        t.chipSum += chips.size;
      }
      if (chips.size > 0) lastChipMs = sim.shiftMs;
      for (const id of sim.oosOrder.slice(closed)) {
        if (sim.outOfService[id] !== 'crowding') continue;
        t.closures += 1;
        if (sim.shiftMs - lastChipMs <= WARN_MS) t.warned += 1;
      }
      closed = sim.oosOrder.length;
    } });
  }
  console.log([
    `Crowding hint, 60 WPM at 96 %, seeds 1–5, 30 min, delay ${DELAY_MS / 1000} s`,
    ...bands.map((b) => {
      const t = tallies.get(b)!;
      return `  ${b}: running ${fixed(t.runningMs / 60_000)} min, ring showing ${pct(t.ringMs, t.runningMs)} of it, `
        + `${t.ringSamples ? fixed(t.ringSum / t.ringSamples, 2) : 'n/a'} rings and `
        + `${t.chipSamples ? fixed(t.chipSum / t.chipSamples, 2) : 'n/a'} amber chips when any, `
        + `${t.warned} of ${t.closures} crowding closures (${pct(t.warned, t.closures)}) had a chip in their last ${WARN_MS / 1000} s`;
    }),
  ].join('\n'));
}, 900_000);
