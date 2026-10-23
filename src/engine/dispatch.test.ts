import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from './network';
import { COMBO_EVERY, COMBO_MAX_WAVE, OOS_FAIL_SHARE, PLATFORM_CAPACITY, SHIFT_PHASES, TICK_MS } from './dispatchBalance';
import { servedStations, type Served } from './dispatchNetwork';
import { advanceFix } from './dispatchIncidents';
import { clearSignal, cloneSim, closeStation, startShiftSim } from './dispatchSim';
import { visibleTargets } from './dispatchTargets';
import {
  SHIFT_MS, advanceCareer, applyDispatchAction, careerMetrics, careerScore, careerTotals,
  dispatchTense, enterDispatchCharacter, shiftEscalation, shiftPhase, startCareer,
  type CareerState,
} from './dispatch';

const net = buildNetwork(loadNetworkData());
const firstKey = (s: CareerState) => visibleTargets(net, s.sim)[0]!.text[0]!;
const running = () => enterDispatchCharacter(net, startCareer(net, 1), firstKey(startCareer(net, 1)), 1_000);

const stageOf = (s: CareerState, id: number) => s.sim.trains.find((t) => t.id === id)!.stage;
const KJ_RANGE = { line: 'KJ' as const, from: 4, to: 17 };
const AG_RANGE = { line: 'AG' as const, from: 0, to: 5 };

/** A ready Career whose only trains wait at Signals, ids 1, 2, 3… in the order given. */
function onSignals(trains: Array<[LineCode, number]>, served: Served = [KJ_RANGE]): CareerState {
  const sim = startShiftSim(net, served, 7);
  sim.trains = trains.map(([line, at], n) => ({ id: n + 1, line, at, dir: 1 as const,
    stage: 'signal' as const, ms: 0, skipTo: null, load: {} }));
  sim.nextTrainId = trains.length + 1;
  return { ...startCareer(net, 7), served: served.map((r) => ({ ...r })), sim };
}

function type(s: CareerState, text: string, now = 1_000): CareerState {
  for (const char of text) s = enterDispatchCharacter(net, s, char, now);
  return s;
}

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
    const closed = ids.slice(0, count);
    closeStation(sim, closed[0]!, 'signal-fault');
    for (const id of closed.slice(1)) closeStation(sim, id, 'crowding');
    const s = advanceCareer(net, { ...base, sim, gameMs: SHIFT_MS - TICK_MS,
      shiftStartMs: 0 }, 1_000 + SHIFT_MS);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('failed');
    // The first closure started the collapse; every closure follows, in order.
    expect(s.failure).toEqual({ shift: 1, closures: [
      { station: closed[0], cause: 'signal-fault' },
      ...closed.slice(1).map((station) => ({ station, cause: 'crowding' })),
    ] });
    expect(s.endedAt).toBe(1_000 + SHIFT_MS);
    expect(s.cleared).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.cleared).toBe(false);
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

  it('is tense only while an Incident is active or a platform is over half full', () => {
    const s = startCareer(net, 1);
    const incident = { id: 1, kind: 'crowd-surge' as const, place: 'klcc', stations: ['klcc'],
      line: 'KJ' as const, train: null, startedMs: 0, step: 0 };
    const crowd = (count: number) => ({ ...s, sim: { ...s.sim,
      platforms: { klcc: { waiting: { jelatek: count }, fullMs: 0, lastCall: {} } } } });
    expect(dispatchTense(s)).toBe(false);
    // An Out of service Station alone, with calm platforms, is not tense.
    expect(dispatchTense({ ...s, sim: { ...s.sim, outOfService: { klcc: 'crowding' } } })).toBe(false);
    expect(dispatchTense({ ...s, sim: { ...s.sim, incidents: [incident] } })).toBe(true);
    expect(dispatchTense(crowd(PLATFORM_CAPACITY / 2))).toBe(false);
    expect(dispatchTense(crowd(PLATFORM_CAPACITY / 2 + 1))).toBe(true);
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

  it('returns the original object for a refused confirm after a simulation tick', () => {
    const s = running();
    expect(s.aim.typed).not.toBe('');
    expect(advanceCareer(net, s, 1_100)).not.toBe(s);
    expect(applyDispatchAction(net, s, { a: 'confirm' }, 1_100)).toBe(s);
  });
});

describe('Dispatcher Green wave', () => {
  it('starts a Career with no streak and no waves', () => {
    expect(startCareer(net, 1)).toMatchObject({ streak: 0, clean: true, waves: 0, lastWave: null });
    expect([COMBO_EVERY, COMBO_MAX_WAVE]).toEqual([3, 4]);
  });

  it('a clean third completion fires a wave of one', () => {
    // Jelatek 5, Damai 7, Pasar Seni 13, Bangsar 15, Abdullah Hukum 16.
    let s = onSignals([['KJ', 5], ['KJ', 7], ['KJ', 13], ['KJ', 15], ['KJ', 16]]);
    s = type(s, 'Jelatek');
    expect(s).toMatchObject({ streak: 1, waves: 0, lastWave: null });
    s = type(s, 'Damai');
    expect(s).toMatchObject({ streak: 2, waves: 0, lastWave: null });
    s = type(s, 'Pasar Seni');
    expect(s.streak).toBe(3);
    expect(s.waves).toBe(1);
    expect(s.lastWave).toEqual({ id: 1, line: 'KJ', origin: net.lines.get('KJ')!.stations[13],
      cleared: [4], atMs: s.gameMs });
    expect(stageOf(s, 4)).toBe('cleared');
    expect(stageOf(s, 5)).toBe('signal');
  });

  it('waves grow with the streak and cap at 4', () => {
    // Trigger at Jelatek 5; Signals wait at 7, 9, 11, 13, 15 and 16.
    const trains: Array<[LineCode, number]> = [['KJ', 5], ['KJ', 7], ['KJ', 9], ['KJ', 11],
      ['KJ', 13], ['KJ', 15], ['KJ', 16]];
    const sizes = [3, 6, 9, 12, 15].map((streak) => {
      const s = type({ ...onSignals(trains), streak: streak - 1 }, 'Jelatek');
      expect(s.streak).toBe(streak);
      expect(s.waves).toBe(1);
      expect(s.lastWave!.cleared).toEqual([2, 3, 4, 5, 6, 7].slice(0, s.lastWave!.cleared.length));
      for (const id of s.lastWave!.cleared) expect(stageOf(s, id)).toBe('cleared');
      return s.lastWave!.cleared.length;
    });
    expect(sizes).toEqual([1, 2, 3, 4, 4]);
  });

  it('breaks distance ties towards the lower train id', () => {
    // KLCC 9 triggers; Damai 7 (id 3) and Dang Wangi 11 (id 2) are both two blocks away.
    const s = type({ ...onSignals([['KJ', 9], ['KJ', 11], ['KJ', 7]]), streak: 2 }, 'KLCC');
    expect(s.lastWave!.cleared).toEqual([2]);
  });

  it('a wrong key resets the streak', () => {
    let s: CareerState = { ...onSignals([['KJ', 7], ['KJ', 9], ['KJ', 13]]), streak: 2 };
    s = type(s, '#');
    expect(s).toMatchObject({ streak: 0, clean: false, errors: 1 });
    // After the stall: this completion was not clean, so it does not count.
    s = type(s, 'Damai', 1_600);
    expect(stageOf(s, 1)).toBe('cleared');
    expect(s).toMatchObject({ streak: 0, clean: true, waves: 0 });
    s = type(s, 'KLCC', 1_600);
    expect(s).toMatchObject({ streak: 1, clean: true });
  });

  it('Enter-confirm, stall-dropped keys and unlock don\'t reset it', () => {
    // A key dropped by the wrong-key stall is not counted.
    const stalled: CareerState = { ...onSignals([['KJ', 7], ['KJ', 9]]), streak: 2,
      aim: { typed: '', lock: null, mistyped: true, stallUntil: 500 } };
    const dropped = type(stalled, '#');
    expect(dropped).toMatchObject({ streak: 2, clean: true, errors: 0 });

    // Unlock makes the next Target clean again and leaves the streak alone.
    let s: CareerState = { ...onSignals([['KJ', 7], ['KJ', 9]]), streak: 2, clean: false };
    s = type(s, 'Da');
    s = applyDispatchAction(net, s, { a: 'unlock' }, 1_000);
    expect(s).toMatchObject({ streak: 2, clean: true });
    s = type(s, 'Damai');
    expect(s).toMatchObject({ streak: 3, waves: 1 });

    // Enter confirms a shorter exact name without counting a mistake.
    const ampang = net.order.get('AG')!.get('ampang')!;
    const park = net.order.get('KJ')!.get('ampang-park')!;
    const served = [{ line: 'AG' as const, from: ampang - 1, to: ampang },
      { line: 'KJ' as const, from: park, to: park + 1 }];
    let c: CareerState = { ...onSignals([['AG', ampang], ['KJ', park]], served), streak: 1 };
    c = type(c, 'Ampang');
    c = applyDispatchAction(net, c, { a: 'confirm' }, 1_000);
    expect(stageOf(c, 1)).toBe('cleared');
    expect(c).toMatchObject({ streak: 2, clean: true, errors: 0 });
  });

  it('an Incident fix counts once, on its final item', () => {
    const first = net.lines.get('KJ')!.stations[6]!;
    const second = net.lines.get('KJ')!.stations[7]!;
    // Signals wait at Setiawangsa 4, Dang Wangi 11 and Pasar Seni 13.
    let s: CareerState = { ...onSignals([['KJ', 4], ['KJ', 11], ['KJ', 13]]), streak: 2 };
    s.sim.incidents = [{ id: 1, kind: 'signal-fault', place: first, stations: [first, second],
      line: 'KJ', train: null, startedMs: 0, step: 0 }];
    s = type(s, net.stations.get(first)!.name);
    expect(s.sim.incidents[0]!.step).toBe(1);
    expect(s).toMatchObject({ streak: 2, waves: 0 });
    s = type(s, net.stations.get(second)!.name);
    expect(s.sim.incidents).toEqual([]);
    expect(s.streak).toBe(3);
    // The ripple starts from the Incident's place on its Line.
    expect(s.lastWave).toMatchObject({ line: 'KJ', origin: first, cleared: [1] });
  });

  it('a wave never crosses its bounds', () => {
    const kj = net.lines.get('KJ')!.stations;
    const s0 = onSignals([
      ['KJ', 9],   // 1: KLCC, the trigger
      ['AG', 2],   // 2: another Line, deliberately held
      ['KJ', 14],  // 3: Held by the signal fault
      ['KJ', 7],   // 4: approaching an Out-of-service Station
      ['KJ', 11],  // 5: plain
      ['KJ', 5],   // 6: plain
    ], [KJ_RANGE, AG_RANGE]);
    s0.sim.incidents = [{ id: 1, kind: 'signal-fault', place: kj[14]!, stations: [kj[13]!, kj[14]!, kj[15]!],
      line: 'KJ', train: null, startedMs: 0, step: 0 }];
    s0.sim.outOfService = { [kj[7]!]: 'crowding' };
    s0.sim.oosOrder = [kj[7]!];
    const s = type({ ...s0, streak: 11 }, 'KLCC');
    expect(s.streak).toBe(12);
    expect(s.lastWave!.cleared).toEqual([5, 6]);
    expect([2, 3, 4].map((id) => stageOf(s, id))).toEqual(['signal', 'signal', 'signal']);
    expect(s.sim.incidents).toHaveLength(1);
    expect(s.sim.incidents[0]!.step).toBe(0);
  });

  it('a wave on a Line with fewer waiting Signals clears what there is', () => {
    let s: CareerState = { ...onSignals([['KJ', 5], ['KJ', 9]]), streak: 5 };
    s = type(s, 'Jelatek');
    expect(s).toMatchObject({ streak: 6, waves: 1 });
    expect(s.lastWave!.cleared).toEqual([2]);
    const wave = s.lastWave;
    // Nothing carries over: the next completion fires no wave and clears only itself.
    const sim = cloneSim(s.sim);
    sim.trains.push({ id: 3, line: 'KJ', at: 13, dir: 1, stage: 'signal', ms: 0, skipTo: null, load: {} },
      { id: 4, line: 'KJ', at: 15, dir: 1, stage: 'signal', ms: 0, skipTo: null, load: {} });
    s = type({ ...s, sim }, 'Pasar Seni');
    expect(s).toMatchObject({ streak: 7, waves: 1 });
    expect(s.lastWave).toBe(wave);
    expect(stageOf(s, 4)).toBe('signal');

    // A wave with nothing to clear is still recorded.
    const empty = type({ ...onSignals([['KJ', 5]]), streak: 2 }, 'Jelatek');
    expect(empty).toMatchObject({ streak: 3, waves: 1 });
    expect(empty.lastWave).toMatchObject({ id: 1, cleared: [] });
  });

  it('numbers waves within the Career', () => {
    let s: CareerState = { ...onSignals([['KJ', 5], ['KJ', 9], ['KJ', 13]]), streak: 2, waves: 4 };
    s = type(s, 'Jelatek');
    expect(s.lastWave!.id).toBe(5);
    expect(s.waves).toBe(5);
  });

  it('the streak carries across Shifts', () => {
    const between = { ...safeShift(running()), streak: 4, clean: true, waves: 1 };
    const next = applyDispatchAction(net, between, { a: 'expand', pick: 0 }, between.stoppedAt! + 1_000);
    expect(next.shift).toBe(2);
    expect(next).toMatchObject({ streak: 4, clean: true, waves: 1 });
  });
});
