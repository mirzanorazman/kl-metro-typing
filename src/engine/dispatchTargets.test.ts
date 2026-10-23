import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { LATE_FACTOR, TICK_MS, TRAVEL_MS, WRONG_KEY_STALL_MS } from './dispatchBalance';
import { STARTING_NETWORK } from './dispatchNetwork';
import { advanceFix } from './dispatchIncidents';
import * as sim from './dispatchSim';
import {
  aimKey, candidates, EMPTY_AIM, reconcileAim, sameRef, visibleTargets,
  type KeyOutcome, type Target, type TargetRef,
} from './dispatchTargets';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!.stations;
const quiet: sim.PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 1, escalation: 1 };
const signal = (train: number, text: string, delayMs = 0): Target => ({ ref: { kind: 'signal', train }, text, delayMs });
const narrowing = [signal(1, 'KLCC'), signal(2, 'KL Sentral'), signal(3, 'Kampung Baru'), signal(4, 'Kerinchi')];
function type(targets: Target[], text: string, aim = EMPTY_AIM): KeyOutcome {
  let outcome: KeyOutcome = { aim, counted: false, correct: false, completed: null };
  for (const key of text) outcome = aimKey(targets, outcome.aim, key, 1_000);
  return outcome;
}
function train(id: number, at = 7, dir: sim.Dir = 1): sim.Train {
  return { id, line: 'KJ', at, dir, stage: 'signal', ms: 0, skipTo: null, load: {} };
}
function fixture(first = train(1)): sim.SimState {
  const s = sim.startShiftSim(net, STARTING_NETWORK, 42);
  s.trains = [first, train(2, 12, -1), train(3, 16, -1)];
  return s;
}
function late(s: sim.SimState): void {
  s.shiftMs = LATE_FACTOR * sim.targetHeadwayMs(STARTING_NETWORK[0]!) + TICK_MS;
}
function run(s: sim.SimState, ms: number): void {
  for (let t = 0; t < ms; t += TICK_MS) sim.stepSim(net, s, quiet);
}
function incident(stations: string[], step = 0): sim.Incident {
  return { id: 1, kind: 'signal-fault', place: stations[0]!, stations, line: 'KJ',
    train: null, startedMs: 0, step };
}

describe('Dispatcher aim', () => {
  it('compares target identity by kind and numeric id', () => {
    expect(sameRef({ kind: 'signal', train: 1 }, { kind: 'signal', train: 1 })).toBe(true);
    expect(sameRef({ kind: 'skip', train: 1 }, { kind: 'signal', train: 1 })).toBe(false);
    expect(sameRef({ kind: 'fix', incident: 1 }, { kind: 'signal', train: 1 })).toBe(false);
    expect(sameRef({ kind: 'fix', incident: 1 }, { kind: 'fix', incident: 2 })).toBe(false);
  });

  it('narrows prefixes before locking and preserves canonical case', () => {
    const k = type(narrowing, 'k').aim;
    expect(k.typed).toBe('K');
    expect(k.lock).toBeNull();
    expect(candidates(narrowing, k)).toHaveLength(4);
    const kl = type(narrowing, 'kl').aim;
    expect(kl.lock).toBeNull();
    expect(candidates(narrowing, kl)).toHaveLength(2);
    const klc = type(narrowing, 'klc').aim;
    expect(klc.lock).toEqual(narrowing[0]!.ref);
    expect(candidates(narrowing, klc)).toEqual([narrowing[0]]);
  });

  it('counts a wrong key, preserves the prefix, stalls and clears the error on recovery', () => {
    const k = type(narrowing, 'k').aim;
    const wrong = aimKey(narrowing, k, 'x', 1_000);
    expect(wrong).toMatchObject({ counted: true, correct: false, completed: null,
      aim: { typed: 'K', mistyped: true, stallUntil: 1_000 + WRONG_KEY_STALL_MS } });
    expect(aimKey(narrowing, wrong.aim, 'l', wrong.aim.stallUntil - 1))
      .toEqual({ aim: wrong.aim, counted: false, correct: false, completed: null });
    const recovered = aimKey(narrowing, wrong.aim, 'l', wrong.aim.stallUntil);
    expect(recovered).toMatchObject({ counted: true, correct: true, aim: { typed: 'KL', mistyped: false } });
    expect(aimKey(narrowing, EMPTY_AIM, 'z', 0)).toMatchObject({ counted: true, correct: false, aim: { typed: '', mistyped: true } });
  });

  it('locks identical texts to the most delayed and breaks ties by lowest id', () => {
    const targets = [signal(3, 'Masjid Jamek', 3_000), signal(2, 'MASJID JAMEK', 9_000), signal(1, 'Masjid Jamek', 9_000)];
    expect(type(targets, 'masjid jamek')).toMatchObject({ completed: targets[2]!.ref, aim: EMPTY_AIM });
    const fixes: Target[] = [
      { ref: { kind: 'fix', incident: 3 }, text: 'Reset', delayMs: 100 },
      { ref: { kind: 'fix', incident: 2 }, text: 'Reset', delayMs: 100 },
    ];
    expect(type(fixes, 'reset').completed).toEqual(fixes[1]!.ref);
  });

  it('leaves a held train selectable while typing a less delayed different name', () => {
    const targets = [signal(1, 'Kerinchi', 30_000), signal(2, 'KL Sentral', 1_000)];
    expect(type(targets, 'kl sentral').completed).toEqual(targets[1]!.ref);
    expect(type(targets, 'kerinchi').completed).toEqual(targets[0]!.ref);
  });

  it('keeps fixes locked across changing items and releases vanished locks', () => {
    const ref: TargetRef = { kind: 'fix', incident: 1 };
    const first = type([{ ref, text: 'KLCC', delayMs: 1 }], 'klcc');
    expect(first).toMatchObject({ completed: ref, aim: { typed: '', lock: ref } });
    const next = [{ ref, text: 'Kampung Baru', delayMs: 2 }, signal(9, 'Kampung Baru', 9_000)];
    expect(type(next, 'kampung baru', reconcileAim(next, first.aim)).completed).toEqual(ref);
    expect(reconcileAim([], first.aim)).toEqual(EMPTY_AIM);
  });

  it('resets a disappeared lock or prefix with no remaining candidates', () => {
    expect(reconcileAim(narrowing.slice(1), type(narrowing, 'klc').aim)).toEqual(EMPTY_AIM);
    expect(reconcileAim(narrowing.slice(2), type(narrowing, 'kl').aim)).toEqual(EMPTY_AIM);
    const aim = type(narrowing, 'kl').aim;
    expect(reconcileAim(narrowing, aim)).toEqual(aim);
  });

  it('keeps an error and its stall when there are no targets and no prefix to discard', () => {
    const wrong = aimKey([], EMPTY_AIM, 'z', 1_000);
    expect(wrong).toMatchObject({ counted: true, correct: false, aim: { mistyped: true } });
    expect(reconcileAim([], wrong.aim)).toEqual(wrong.aim);
    expect(aimKey([], wrong.aim, 'x', 1_001)).toMatchObject({ aim: wrong.aim, counted: false });
  });

  it.each([['Ampang', 'Ampang Park'], ['Sentul', 'Sentul Timur'], ['Glenmarie', 'Glenmarie 2'], ['Subang', 'Subang Jaya']])(
    'keeps %s and %s reachable with Enter or continued typing', (short, long) => {
      const targets = [signal(3, short, 1), signal(2, short.toUpperCase(), 9), signal(1, long)];
      const partial = type(targets, short);
      expect(partial.completed).toBeNull();
      expect(partial.aim.lock).toBeNull();
      expect(partial.aim.typed.toLowerCase()).toBe(short.toLowerCase());
      expect(aimKey(targets, partial.aim, 'Enter', 1_000))
        .toEqual({ completed: targets[1]!.ref, counted: false, correct: false, aim: EMPTY_AIM });
      expect(type(targets, long).completed).toEqual(targets[2]!.ref);
    },
  );

  it('ignores other nonprintable keys and Enter without an exact match', () => {
    for (const key of ['Enter', 'Backspace', 'Escape', 'Tab', 'ArrowLeft', '\n', '\t']) {
      expect(aimKey(narrowing, EMPTY_AIM, key, 1_000))
        .toEqual({ aim: EMPTY_AIM, counted: false, correct: false, completed: null });
    }
    expect(type([signal(1, 'KLCC')], 'KLCC').completed).toEqual({ kind: 'signal', train: 1 });
  });

  it('does not accept Enter confirmation until a wrong-key stall ends', () => {
    const targets = [signal(1, 'Ampang'), signal(2, 'Ampang Park')];
    const wrong = aimKey(targets, type(targets, 'Ampang').aim, 'x', 1_000);
    expect(aimKey(targets, wrong.aim, 'Enter', wrong.aim.stallUntil - 1).completed).toBeNull();
    expect(aimKey(targets, wrong.aim, 'Enter', wrong.aim.stallUntil))
      .toMatchObject({ completed: targets[0]!.ref, counted: false, correct: false, aim: EMPTY_AIM });
  });
});

describe('Dispatcher visible targets', () => {
  it('suppresses Incident-held and OOS signals and exposes only the current fix item', () => {
    const s = fixture();
    s.incidents = [incident([kj[7]!, kj[8]!, kj[9]!], 1)];
    s.outOfService[kj[12]!] = 'crowding';
    s.trains[2]!.stage = 'running';
    s.shiftMs = 3_000;
    expect(visibleTargets(net, s)).toEqual([{ ref: { kind: 'fix', incident: 1 },
      text: net.stations.get(kj[8]!)!.name, delayMs: 3_000 }]);
    advanceFix(net, s, 1);
    expect(visibleTargets(net, s)[0]!.text).toBe(net.stations.get(kj[9]!)!.name);
  });

  it('offers skips only for late signals, two ahead and then three on a name collision', () => {
    const s = fixture();
    expect(visibleTargets(net, s).filter((t) => t.ref.kind === 'skip')).toEqual([]);
    late(s);
    const offer = () => visibleTargets(net, s).find((t) => sameRef(t.ref, { kind: 'skip', train: 1 }));
    expect(offer()?.text).toBe(net.stations.get(kj[9]!)!.name);
    s.trains[1] = train(2, 9, -1);
    expect(offer()?.text).toBe(net.stations.get(kj[10]!)!.name);
    s.trains[2] = train(3, 10, -1);
    expect(offer()).toBeUndefined();
  });

  it('does not offer a skip beyond served ends or to a closed station', () => {
    const s = fixture(train(1, 16));
    late(s);
    expect(visibleTargets(net, s).some((t) => sameRef(t.ref, { kind: 'skip', train: 1 }))).toBe(false);
    s.trains[0]!.at = 7;
    s.outOfService[kj[9]!] = 'crowding';
    // A third-station fallback is for a name collision, not a closed first option.
    expect(visibleTargets(net, s).some((t) => sameRef(t.ref, { kind: 'skip', train: 1 }))).toBe(false);
    s.outOfService[kj[10]!] = 'crowding';
    expect(visibleTargets(net, s).some((t) => sameRef(t.ref, { kind: 'skip', train: 1 }))).toBe(false);
  });

  it('reserves a duplicate skip name for the lower train id before trying the fallback', () => {
    const s = fixture();
    late(s);
    s.trains[1] = train(2, 11, -1);
    const targets = visibleTargets(net, s);
    expect(targets.find((t) => sameRef(t.ref, { kind: 'skip', train: 1 }))?.text)
      .toBe(net.stations.get(kj[9]!)!.name);
    expect(targets.find((t) => sameRef(t.ref, { kind: 'skip', train: 2 }))?.text)
      .toBe(net.stations.get(kj[8]!)!.name);
  });

  it('treats differently cased normal names as collisions and reports Held milliseconds', () => {
    const s = fixture();
    late(s);
    s.trains[0]!.ms = 3_000;
    const stations = new Map(net.stations);
    stations.set(kj[9]!, { ...stations.get(kj[9]!)!, name: stations.get(kj[12]!)!.name.toUpperCase() });
    const targets = visibleTargets({ ...net, stations }, s);
    expect(targets.find((t) => sameRef(t.ref, { kind: 'signal', train: 1 }))?.delayMs).toBe(3_000);
    expect(targets.find((t) => sameRef(t.ref, { kind: 'skip', train: 1 })))
      .toMatchObject({ text: net.stations.get(kj[10]!)!.name, delayMs: 3_000 });
  });

  it('avoids fix and other skip names case insensitively with stable order', () => {
    const s = fixture();
    late(s);
    s.incidents = [incident([kj[9]!])];
    const targets = visibleTargets(net, s);
    expect(targets.find((t) => sameRef(t.ref, { kind: 'skip', train: 1 }))?.text)
      .toBe(net.stations.get(kj[10]!)!.name);
    const skips = targets.filter((t) => t.ref.kind === 'skip').map((t) => t.text.toLowerCase());
    expect(new Set(skips).size).toBe(skips.length);
    s.trains.reverse();
    s.incidents.reverse();
    expect(visibleTargets(net, s)).toEqual(targets);
  });
});

describe('Dispatcher express moves', () => {
  it('provides skipSignal', () => {
    expect(sim).toHaveProperty('skipSignal');
  });

  it.each([1, -1] as const)('passes the original and intermediate stations without calls in direction %s', (dir) => {
    const s = fixture(train(1, dir === 1 ? 7 : 10, dir));
    late(s);
    const t = s.trains[0]!;
    const from = t.at;
    const to = from + 2 * dir;
    s.platforms[kj[from]!]!.waiting[kj[to]!] = 10;
    t.load[kj[from]!] = 4;
    expect(sim.skipSignal(net, s, t.id, to)).toBe(true);
    expect(t).toMatchObject({ stage: 'cleared', skipTo: to, at: from });
    run(s, TICK_MS);
    expect(t).toMatchObject({ stage: 'running', at: from, load: { [kj[from]!]: 4 } });
    expect(s.platforms[kj[from]!]!.waiting[kj[to]!]).toBe(10);
    run(s, TRAVEL_MS);
    expect(t).toMatchObject({ stage: 'cleared', at: from + dir, skipTo: to });
    run(s, TICK_MS + TRAVEL_MS);
    expect(t).toMatchObject({ stage: 'signal', at: to, skipTo: null });
    expect(s.calls).toBe(0);
    expect(s.delivered).toBe(0);
  });

  it('rejects invalid skips without mutating simulation state', () => {
    const s = fixture();
    const reject = (id: number, to: number) => {
      const before = sim.cloneSim(s);
      expect(sim.skipSignal(net, s, id, to)).toBe(false);
      expect(s).toEqual(before);
    };
    reject(1, 9);
    late(s);
    for (const to of [5, 7, 8, 11, 100, 9.5]) reject(1, to);
    reject(999, 9);
    s.outOfService[kj[9]!] = 'crowding';
    reject(1, 9);
    delete s.outOfService[kj[9]!];
    s.incidents = [incident([kj[7]!])];
    reject(1, 9);
    s.incidents = [];
    s.trains[0]!.at = 16;
    reject(1, 18);
  });

  it('waits behind occupied physical blocks rather than jumping to its destination', () => {
    const s = fixture();
    late(s);
    s.trains[1] = train(2, 8);
    const t = s.trains[0]!;
    expect(sim.skipSignal(net, s, 1, 9)).toBe(true);
    run(s, TRAVEL_MS);
    expect(t).toMatchObject({ stage: 'cleared', at: 7, skipTo: 9 });
    expect(sim.clearSignal(net, s, 2)).toBe(true);
    run(s, 2 * TICK_MS);
    expect(t).toMatchObject({ stage: 'running', at: 7 });
    expect(s.calls).toBe(1);
  });

  it('uses the next express block rather than a skipped platform when checking a shared terminal cycle', () => {
    const s = sim.startShiftSim(net, [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 2, to: 3 }], 1);
    const t = { ...train(1, 2), line: 'AG' as const };
    const sp = (id: number, at: number, dir: sim.Dir, stage: sim.TrainStage): sim.Train =>
      ({ ...train(id, at, dir), line: 'SP', stage, ms: 0 });
    // The occupied platform at 3 is in an existing SP turnaround cycle. AG
    // bypasses it: its next block is 3→4, which is free.
    s.trains = [t, sp(2, 3, 1, 'turnaround'), sp(3, 2, -1, 'signal'), sp(4, 2, -1, 'turnaround')];
    s.shiftMs = 200_000;
    expect(sim.skipSignal(net, s, 1, 4)).toBe(true);
    sim.stepSim(net, s, { ...quiet, trainFactor: 0.5 });
    expect(t).toMatchObject({ at: 2, stage: 'running', skipTo: 4 });
  });

  it('rejects an express move that closes a shared terminal cycle without exchanging passengers', () => {
    const s = sim.startShiftSim(net, [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 2, to: 4 }], 1);
    const t = { ...train(1, 2), line: 'AG' as const };
    const sp = (id: number, at: number, dir: sim.Dir, stage: sim.TrainStage): sim.Train =>
      ({ ...train(id, at, dir), line: 'SP', stage, ms: 0 });
    // The platform at 3 is free, but bypassing it would close a wait through
    // 3→4, terminal 4, the reverse track, terminal 2, and the new 2→3 block.
    s.trains = [t, sp(2, 4, 1, 'signal'), sp(3, 4, 1, 'turnaround'),
      sp(4, 3, -1, 'signal'), sp(5, 3, -1, 'dwell'), sp(6, 2, -1, 'signal'), sp(7, 2, -1, 'turnaround')];
    s.shiftMs = 200_000;
    const origin = net.lines.get('AG')!.stations[2]!;
    const destination = net.lines.get('AG')!.stations[4]!;
    s.platforms[origin]!.waiting[destination] = 5;
    t.load[origin] = 3;
    expect(sim.skipSignal(net, s, 1, 4)).toBe(true);
    sim.stepSim(net, s, { ...quiet, trainFactor: 0.5 });
    expect(t).toMatchObject({ at: 2, stage: 'cleared', ms: 0, skipTo: 4, load: { [origin]: 3 } });
    expect(s.platforms[origin]!.waiting[destination]).toBe(5);
    expect(s.calls).toBe(0);
    expect(s.delivered).toBe(0);
  });

  it('bypasses occupied intermediate platforms but waits for the destination platform after clearance', () => {
    const s = fixture();
    late(s);
    s.trains[1] = { ...train(2, 8), stage: 'dwell', ms: 100_000 };
    s.trains[2] = { ...train(3, 9), stage: 'dwell', ms: 100_000 };
    const t = s.trains[0]!;
    expect(sim.skipSignal(net, s, 1, 9)).toBe(true);
    run(s, 2 * (TRAVEL_MS + TICK_MS));
    expect(t).toMatchObject({ at: 9, stage: 'signal', skipTo: null });
    sim.clearSignal(net, s, 1);
    run(s, TICK_MS);
    expect(t.stage).toBe('cleared');
    expect(s.calls).toBe(0);
  });

  it('freezes express movement for signal and train faults and resumes after repair', () => {
    const s = fixture();
    late(s);
    const t = s.trains[0]!;
    sim.skipSignal(net, s, 1, 9);
    run(s, TICK_MS);
    s.incidents = [incident([kj[8]!])];
    run(s, TRAVEL_MS);
    expect(t).toMatchObject({ at: 7, stage: 'running', ms: 0 });
    advanceFix(net, s, 1);
    run(s, TRAVEL_MS);
    expect(t).toMatchObject({ at: 8, stage: 'cleared' });
    s.incidents = [{ ...incident([]), kind: 'train-fault', train: 1, place: kj[8]! }];
    run(s, TRAVEL_MS);
    expect(t).toMatchObject({ at: 8, stage: 'cleared' });
    advanceFix(net, s, 1);
    run(s, TICK_MS + TRAVEL_MS);
    expect(t).toMatchObject({ at: 9, stage: 'signal', skipTo: null });
  });

  it('clones active express state and runs deterministically without mutating the original', () => {
    const s = fixture();
    late(s);
    sim.skipSignal(net, s, 1, 10);
    const before = sim.cloneSim(s);
    const a = sim.cloneSim(s);
    const b = sim.cloneSim(s);
    run(a, TICK_MS + TRAVEL_MS);
    run(b, TICK_MS + TRAVEL_MS);
    expect(a).toEqual(b);
    expect(a.trains[0]).toMatchObject({ at: 8, stage: 'cleared', skipTo: 10 });
    expect(s).toEqual(before);
  });

  it('keeps existing closed-station bypass behavior if the express destination closes en route', () => {
    const s = fixture();
    late(s);
    const t = s.trains[0]!;
    t.load[kj[11]!] = 5;
    sim.skipSignal(net, s, 1, 9);
    sim.closeStation(s, kj[9]!, 'crowding');
    run(s, 3 * (TICK_MS + TRAVEL_MS));
    expect(t).toMatchObject({ at: 10, stage: 'signal', skipTo: null, load: { [kj[11]!]: 5 } });
    expect(s.calls).toBe(0);
    expect(s.stranded).toBe(0);
  });

  it('keeps shared-track express fleets circulating without duplicate reservations or lost passengers', () => {
    const s = sim.startShiftSim(net, [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 0, to: 4 }], 13);
    s.shiftMs = 200_000;
    s.trains[0]!.load[net.lines.get('AG')!.stations[3]!] = 5;
    const moved = new Map<number, number>();
    let skips = 0;
    for (let tick = 0; tick < 2_000; tick++) {
      const targets = visibleTargets(net, s);
      for (const t of s.trains) {
        if (t.stage !== 'signal') continue;
        const offer = targets.find((target) => sameRef(target.ref, { kind: 'skip', train: t.id }));
        const to = offer && net.lines.get(t.line)!.stations.findIndex((id) => net.stations.get(id)!.name === offer.text);
        if (typeof to === 'number' && sim.skipSignal(net, s, t.id, to)) skips++;
        else sim.clearSignal(net, s, t.id);
      }
      const before = new Map(s.trains.map((t) => [t.id, t.at]));
      sim.stepSim(net, s, quiet);
      const resources = new Set<string>();
      for (const t of s.trains) {
        if (before.get(t.id) !== t.at) moved.set(t.id, (moved.get(t.id) ?? 0) + 1);
        const key = t.stage === 'dwell' || t.stage === 'turnaround'
          ? `platform:${net.lines.get(t.line)!.stations[t.at]}:${t.dir}`
          : sim.blockKey(net, t.line, t.stage === 'running' ? t.at : t.at - t.dir,
            t.stage === 'running' ? t.at + t.dir : t.at);
        expect(resources.has(key), `duplicate reservation at tick ${tick}: ${key}`).toBe(false);
        resources.add(key);
      }
      const passengers = s.delivered + s.stranded
        + s.trains.reduce((sum, t) => sum + Object.values(t.load).reduce((a, b) => a + b, 0), 0)
        + Object.keys(s.platforms).reduce((sum, id) => sum + sim.crowdAt(s, id), 0);
      expect(passengers).toBe(5);
    }
    expect(skips).toBeGreaterThan(0);
    for (const t of s.trains) expect(moved.get(t.id) ?? 0, `train ${t.id}`).toBeGreaterThan(10);
  });
});
