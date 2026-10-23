import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { OOS_FAIL_SHARE, SHIFT_PHASES, TICK_MS } from './dispatchBalance';
import { servedStations } from './dispatchNetwork';
import { advanceFix } from './dispatchIncidents';
import { clearSignal, cloneSim, closeStation, startShiftSim } from './dispatchSim';
import { visibleTargets } from './dispatchTargets';
import {
  SHIFT_MS, advanceCareer, applyDispatchAction, careerMetrics, careerScore, careerTotals,
  dispatchOvercrowded, enterDispatchCharacter, shiftEscalation, shiftPhase, startCareer,
  type CareerState,
} from './dispatch';

const net = buildNetwork(loadNetworkData());
const firstKey = (s: CareerState) => visibleTargets(net, s.sim)[0]!.text[0]!;
const running = () => enterDispatchCharacter(net, startCareer(net, 1), firstKey(startCareer(net, 1)), 1_000);

function safeShift(s: CareerState, untilMs = SHIFT_MS): CareerState {
  for (let i = 0; i < untilMs / TICK_MS && s.status === 'running'; i++) {
    const sim = cloneSim(s.sim);
    for (const inc of [...sim.incidents]) {
      while (sim.incidents.some((item) => item.id === inc.id)) advanceFix(net, sim, inc.id);
    }
    for (const train of sim.trains) if (train.stage === 'signal') clearSignal(net, sim, train.id);
    s = advanceCareer(net, { ...s, sim }, 1_000 + (i + 1) * TICK_MS);
  }
  return s;
}

describe('Dispatcher career', () => {
  it('starts on the first printable key and applies that key to a visible target', () => {
    const ready = startCareer(net, 1);
    const first = visibleTargets(net, ready.sim)[0]!.text[0]!;
    expect(ready.status).toBe('ready');
    expect(enterDispatchCharacter(net, ready, 'Shift', 1_000)).toBe(ready);
    const running = enterDispatchCharacter(net, ready, first, 1_000);
    expect(running.status).toBe('running');
    expect(running.startedAt).toBe(1_000);
    expect(running.correctChars).toBe(1);
    expect(running.keystrokes).toBe(1);
    expect(ready.status).toBe('ready');
  });

  it('types a whole Signal name to Clear its Train', () => {
    let s = startCareer(net, 2);
    const target = visibleTargets(net, s.sim)[0]!;
    for (const char of target.text) s = enterDispatchCharacter(net, s, char, 1_000);
    expect(s.sim.trains.find((t) => t.id === (target.ref.kind === 'signal' ? target.ref.train : -1))?.stage).toBe('cleared');
    expect(s.keystrokes).toBe(target.text.length);
  });

  it('unlocks an active aim and refuses to unlock an empty aim', () => {
    const s = running();
    expect(s.aim.typed).not.toBe('');
    const unlocked = applyDispatchAction(net, s, { a: 'unlock' }, 1_100);
    expect(unlocked.aim).toEqual({ typed: '', lock: null, mistyped: false, stallUntil: 0 });
    expect(applyDispatchAction(net, unlocked, { a: 'unlock' }, 1_200)).toBe(unlocked);
  });

  it('unlocks a mistyped aim even before any prefix is entered', () => {
    const s = enterDispatchCharacter(net, startCareer(net, 1), '\t', 1_000);
    expect(s.status).toBe('ready');
    const wrong = enterDispatchCharacter(net, s, '#', 1_000);
    expect(wrong.status).toBe('running');
    expect(wrong.aim).toMatchObject({ typed: '', mistyped: true });
    const unlocked = applyDispatchAction(net, wrong, { a: 'unlock' }, 1_000);
    expect(unlocked.aim).toEqual({ typed: '', lock: null, mistyped: false, stallUntil: 0 });
  });

  it('uses consecutive phases and reaches the exact Shift boundary', () => {
    expect(SHIFT_MS).toBe(SHIFT_PHASES.reduce((n, p) => n + p.ms, 0));
    expect(shiftPhase(0)).toMatchObject({ name: 'Morning peak', progress: 0 });
    expect(shiftPhase(SHIFT_PHASES[0]!.ms)).toMatchObject({ name: 'Midday', progress: 0 });
    expect(shiftPhase(SHIFT_MS).progress).toBe(1);
    const almost = safeShift(running(), SHIFT_MS - TICK_MS);
    const sim = cloneSim(almost.sim);
    for (const inc of [...sim.incidents]) {
      while (sim.incidents.some((item) => item.id === inc.id)) advanceFix(net, sim, inc.id);
    }
    for (const train of sim.trains) if (train.stage === 'signal') clearSignal(net, sim, train.id);
    const s = advanceCareer(net, { ...almost, sim }, 1_000 + SHIFT_MS + 50_000);
    expect(s.status).toBe('between');
    expect(s.gameMs).toBe(SHIFT_MS);
    expect(s.cleared).toBe(1);
    expect(s.offers.length).toBeGreaterThanOrEqual(1);
    expect(s.history).toEqual([{ shift: 1, delivered: s.sim.delivered, calls: s.sim.calls,
      onTimeCalls: s.sim.onTimeCalls, cleared: true }]);
    expect(s.stoppedAt).toBe(1_000 + SHIFT_MS);
    expect(advanceCareer(net, s, 1_000 + SHIFT_MS + 100_000)).toBe(s);
  });

  it('freezes between Shifts and in the next ready state, then resumes on its first key', () => {
    const between = safeShift(running());
    expect(advanceCareer(net, between, between.stoppedAt! + 60_000)).toBe(between);
    expect(applyDispatchAction(net, between, { a: 'expand', pick: -1 }, between.stoppedAt! + 60_000)).toBe(between);
    expect(applyDispatchAction(net, between, { a: 'expand', pick: 1.5 }, between.stoppedAt! + 60_000)).toBe(between);
    const offer = between.offers[0]!;
    const next = applyDispatchAction(net, between, { a: 'expand', pick: 0 }, between.stoppedAt! + 60_000);
    expect(next.status).toBe('ready');
    expect(next.shift).toBe(2);
    expect(next.shiftStartMs).toBe(SHIFT_MS);
    expect(next.gameMs).toBe(SHIFT_MS);
    expect(next.sim.outOfService).toEqual({});
    expect(next.served.some((r) => r.line === offer.line && r.from <= offer.from && r.to >= offer.to)).toBe(true);
    expect(advanceCareer(net, next, between.stoppedAt! + 90_000)).toBe(next);
    const started = enterDispatchCharacter(net, next, firstKey(next), between.stoppedAt! + 90_000);
    expect(started.status).toBe('running');
    expect(started.gameMs).toBe(SHIFT_MS);
    expect(started.pausedMs).toBe(90_000);
    expect(started.stoppedAt).toBeNull();
    expect(started.sim.shiftMs).toBe(0);
    expect(careerTotals(started).delivered).toBe(between.sim.delivered);
  });

  it('accepts skipping an Expansion only when no offers remain', () => {
    const between = safeShift(running());
    const none = { ...between, offers: [], filledAt: between.shift };
    const next = applyDispatchAction(net, none, { a: 'expand', pick: -1 }, none.stoppedAt! + 1_000);
    expect(next.status).toBe('ready');
    expect(next.served).toEqual(none.served);
    expect(next.filledAt).toBe(1);
    expect(shiftEscalation(next)).toBeGreaterThan(1);
    expect(shiftEscalation(between)).toBe(1);
  });

  it('fails on the last closure before clearing a Shift at the same tick', () => {
    const base = running();
    const sim = cloneSim(base.sim);
    const ids = servedStations(net, base.served);
    const count = Math.ceil(OOS_FAIL_SHARE * ids.length);
    for (const id of ids.slice(0, count)) closeStation(sim, id, 'crowding');
    const s = advanceCareer(net, { ...base, sim, gameMs: SHIFT_MS - TICK_MS,
      shiftStartMs: 0 }, 1_000 + SHIFT_MS);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('failed');
    expect(s.failure).toEqual({ shift: 1, station: ids[count - 1], cause: 'crowding' });
    expect(s.endedAt).toBe(1_000 + SHIFT_MS);
    expect(s.cleared).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.cleared).toBe(false);
    expect(dispatchOvercrowded(s)).toBe(true);
  });

  it('pauses at a non-tick instant and resumes with only running time counted', () => {
    const base = running();
    const paused = applyDispatchAction(net, base, { a: 'pause' }, 1_055);
    expect(paused.status).toBe('paused');
    expect(paused.gameMs).toBe(0);
    expect(advanceCareer(net, paused, 6_055)).toBe(paused);
    const resumed = applyDispatchAction(net, paused, { a: 'resume' }, 6_055);
    expect(resumed.pausedMs).toBe(5_000);
    expect(careerMetrics(resumed, 6_155).wpm).toBeCloseTo(1 / 5 / (0.155 / 60));
    expect(advanceCareer(net, resumed, 6_155).gameMs).toBe(100);
    expect(applyDispatchAction(net, startCareer(net, 1), { a: 'abandon' }, 1_000).status).toBe('ready');
    for (const s of [base, paused, safeShift(running()), { ...base, status: 'ready' as const, shift: 2 }]) {
      const ended = applyDispatchAction(net, s, { a: 'abandon' }, 1_000 + s.gameMs);
      expect(ended.status).toBe('ended');
      expect(ended.endReason).toBe('abandoned');
    }
  });

  it('totals recorded and live Shifts exactly once and scores delivered by accuracy', () => {
    const base = running();
    const s = { ...base, sim: { ...base.sim, delivered: 100, calls: 10, onTimeCalls: 8 },
      correctChars: 9, keystrokes: 10, errors: 1 };
    expect(careerScore(s)).toBe(90);
    expect(careerTotals(s)).toMatchObject({ delivered: 100, calls: 10, onTimeCalls: 8, onTimePct: 80 });
    const archived = { ...s, status: 'between' as const, history: [{ shift: 1, delivered: 100,
      calls: 10, onTimeCalls: 8, cleared: true }] };
    expect(careerTotals(archived).delivered).toBe(100);
    expect(careerTotals({ ...s, status: 'ended', endReason: 'abandoned', history: [] }).delivered).toBe(100);
  });

  it('marks any active Incident or Out of service Station as overcrowded', () => {
    const s = startCareer(net, 1);
    expect(dispatchOvercrowded(s)).toBe(false);
    expect(dispatchOvercrowded({ ...s, sim: { ...s.sim, incidents: [{ id: 1, kind: 'crowd-surge',
      place: 'klcc', stations: ['klcc'], line: 'KJ', train: null, startedMs: 0, step: 0 }] } })).toBe(true);
    expect(dispatchOvercrowded({ ...s, sim: { ...s.sim, outOfService: { klcc: 'crowding' } } })).toBe(true);
  });

  it('keeps previous nested state immutable across ticks and typing', () => {
    const s = running();
    const before = structuredClone(s);
    const later = advanceCareer(net, s, 1_500);
    expect(s).toEqual(before);
    expect(later).not.toBe(s);
    const target = visibleTargets(net, later.sim)[0];
    if (target) enterDispatchCharacter(net, later, target.text[0]!, 1_500);
    expect(s).toEqual(before);
  });

  it('keeps a repair lock across items and releases it after the last item', () => {
    const first = net.lines.get('KJ')!.stations[6]!;
    const second = net.lines.get('KJ')!.stations[7]!;
    const sim = cloneSim(startCareer(net, 4).sim);
    sim.trains = [];
    sim.incidents = [{ id: 1, kind: 'signal-fault', place: first, stations: [first, second],
      line: 'KJ', train: null, startedMs: 0, step: 0 }];
    let s: CareerState = { ...startCareer(net, 4), sim };
    for (const char of net.stations.get(first)!.name) s = enterDispatchCharacter(net, s, char, 1_000);
    expect(s.aim.lock).toEqual({ kind: 'fix', incident: 1 });
    expect(s.sim.incidents[0]!.step).toBe(1);
    for (const char of net.stations.get(second)!.name) s = enterDispatchCharacter(net, s, char, 1_000);
    expect(s.sim.incidents).toEqual([]);
    expect(s.aim).toEqual({ typed: '', lock: null, mistyped: false, stallUntil: 0 });
  });

  it('confirms a shorter exact name with Enter while its longer neighbour stays reachable', () => {
    const ampang = net.order.get('AG')!.get('ampang')!;
    const park = net.order.get('KJ')!.get('ampang-park')!;
    const served = [{ line: 'AG' as const, from: ampang - 1, to: ampang },
      { line: 'KJ' as const, from: park, to: park + 1 }];
    const sim = startShiftSim(net, served, 3);
    sim.trains = [
      { id: 1, line: 'AG', at: ampang, dir: 1, stage: 'signal', ms: 0, skipTo: null, load: {} },
      { id: 2, line: 'KJ', at: park, dir: 1, stage: 'signal', ms: 0, skipTo: null, load: {} },
    ];
    let s: CareerState = { ...startCareer(net, 3), served, sim };
    expect(applyDispatchAction(net, s, { a: 'confirm' }, 1_000)).toBe(s);
    for (const char of 'Ampang') s = enterDispatchCharacter(net, s, char, 1_000);
    expect(s.aim.typed).toBe('Ampang');
    const count = s.keystrokes;
    const confirmed = applyDispatchAction(net, s, { a: 'confirm' }, 1_000);
    expect(confirmed.sim.trains[0]!.stage).toBe('cleared');
    expect(confirmed.keystrokes).toBe(count);
    expect(confirmed.correctChars).toBe(s.correctChars);
    expect(applyDispatchAction(net, confirmed, { a: 'confirm' }, 1_000)).toBe(confirmed);
    s = confirmed;
    for (const char of 'Ampang Park') s = enterDispatchCharacter(net, s, char, 1_000);
    expect(s.sim.trains[1]!.stage).toBe('cleared');
    const stale = { ...confirmed, aim: { typed: 'Missing', lock: null, mistyped: false, stallUntil: 0 } };
    expect(applyDispatchAction(net, stale, { a: 'confirm' }, 1_000)).toBe(stale);
  });
});
