import { it } from 'vitest';
import type { Point } from '../data/types';
import { loadNetworkData } from '../data/load';
import type { CareerState } from '../engine/dispatch';
import { drive } from '../engine/dispatchDrive.testutil';
import { servedStations } from '../engine/dispatchNetwork';
import { visibleTargets } from '../engine/dispatchTargets';
import { lessonStations } from '../engine/dispatchLesson';
import { buildNetwork } from '../engine/network';
import { closeFrame, fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import { DISPATCH_FIT_PADDING } from '../render/dispatchLayout';
import { closeness, leanIn, subjectStations, withNeighbours } from './dispatchCamera';
import { tipSubject } from './dispatchTips';

/**
 * How far the Dispatcher's camera zooms, against the normal frame of the
 * Served network, on a 1440 × 900 screen. A 60 WPM typist, seeds 1–5, 30
 * minutes each. The method is in the close camera spec (2026-10-26).
 */

const net = buildNetwork(loadNetworkData());
const { geo: layout } = networkLayout();
const W = 1440;
const H = 900;
const points = (ids: Iterable<string>) => [...ids].map((id) => layout.get(id)).filter((p): p is Point => p !== undefined);
const score = (v: { w: number; h: number }) => Math.min(W / v.w, H / v.h);
const fitted = (ids: Iterable<string>) => score(fitViewBox(points(ids), DISPATCH_FIT_PADDING));
const closed = (normal: string[], subject: Iterable<string>) =>
  score(closeFrame(points(normal), points(subject), DISPATCH_FIT_PADDING, closeness(normal.length)));
const band = (s: CareerState) => (s.shift <= 3 ? 'Shifts 1–3' : s.shift <= 8 ? 'Shifts 4–8' : 'Shift 9+');
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]!.toFixed(2);

type Table = Map<string, number[]>;
const push = (t: Table, key: string, value: number) => t.set(key, [...(t.get(key) ?? []), value]);
const print = (title: string, t: Table) => [title, ...[...t].sort(([a], [b]) => a.localeCompare(b))
  .map(([key, xs]) => `  ${key}: n=${xs.length}, median ${pct(xs, 0.5)}×, p10 ${pct(xs, 0.1)}×, p90 ${pct(xs, 0.9)}×`)];

// Opt-in survey for tuning: DISPATCH_PROBE=1 npx vitest run src/ui/dispatchCameraProbe.test.ts
it.skipIf(!process.env.DISPATCH_PROBE)('prints the camera zooms', () => {
  const today: Table = new Map();
  const close: Table = new Map();
  for (const seed of [1, 2, 3, 4, 5]) {
    const seen = new Set<string>();
    let prev: CareerState | null = null;
    drive({ seed, msPerKey: 200, limitMs: 30 * 60_000, watch: (s) => {
      const before = prev;
      prev = s;
      if (s.status !== 'running') return;
      const servedList = servedStations(net, s.served);
      const served = new Set(servedList);
      const base = fitted(servedList);
      // Each Incident's lean-in, once, when the aim first locks onto its fix.
      const lock = s.aim.lock;
      const fixing = lock?.kind === 'fix' ? s.sim.incidents.find((inc) => inc.id === lock.incident) : undefined;
      if (fixing && !seen.has(`fix:${fixing.id}`)) {
        seen.add(`fix:${fixing.id}`);
        push(today, `lean-in, ${band(s)}`, fitted(leanIn(net, s.sim, fixing, visibleTargets(net, s.sim), served).stations) / base);
      }
      // A hold where the fix the aim was locked on has just gone, its place in service.
      const was = before?.aim.lock?.kind === 'fix' ? before.aim.lock.incident : null;
      const done = was === null ? undefined : before!.sim.incidents.find((inc) => inc.id === was);
      if (done && !s.sim.incidents.some((inc) => inc.id === was) && !s.sim.outOfService[done.place]) {
        push(close, `hold, ${band(s)}`, closed(servedList, withNeighbours(net, done.line, done.place, served)) / base);
      }
      // Each tip subject, once per Shift.
      for (const id of ['service-gap', 'late'] as const) {
        const subject = tipSubject(net, s, id);
        if (!subject) continue;
        const key = `${id}:${s.shift}:${subject.trains.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = subjectStations(net, s.sim, subject, served);
        push(today, `${id} tip, ${band(s)}`, fitted(ids) / base);
        push(close, `${id} tip, ${band(s)}`, closed(servedList, ids) / base);
      }
    } });
  }
  const shift1 = servedStations(net, drive({ seed: 1, msPerKey: 200, limitMs: 0 }).state.served);
  const lesson = (subject: number) => `  lesson against Shift 1: ${(subject / fitted(shift1)).toFixed(2)}×`;
  console.log([
    ...print('Today', today), lesson(fitted(lessonStations(net))),
    ...print('Close camera at its defaults', close), lesson(closed(shift1, lessonStations(net))),
  ].join('\n'));
}, 600_000);
