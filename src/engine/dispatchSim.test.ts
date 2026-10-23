import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import {
  BUNCH_BLOCKS, CENTRAL_PULL, CENTRAL_STATIONS, DWELL_BASE_MS, DWELL_PER_PASSENGER_MS,
  LATE_FACTOR, ON_TIME_FACTOR, OOS_CROWD_MS, PASSENGER_RATE, PLATFORM_CAPACITY,
  SHIFT_PHASES, STATIONS_PER_TRAIN, TICK_MS, TRAIN_CAPACITY, TRAVEL_MS, TURNAROUND_MS,
} from './dispatchBalance';
import { applyDispatchAction } from './dispatch';
import { drive } from './dispatchDrive.testutil';
import { servedStations, STARTING_NETWORK, type Served } from './dispatchNetwork';
import {
  blockKey, bunchedTrains, clearSignal, cloneSim, crowdAt, destinationWeight, isLate, originWeight, outerEnds,
  startShiftSim, stepSim, targetHeadwayMs, trainPosition, trainsForLine,
  type PhaseNow, type SimState, type Train,
} from './dispatchSim';
import { visibleTargets } from './dispatchTargets';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!.stations;
const MIDDAY: PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 1, escalation: 1 };

function run(s: SimState, ms: number, phase = MIDDAY): void {
  for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) stepSim(net, s, phase);
}

function train(id: number, values: Partial<Train> = {}): Train {
  return { id, line: 'KJ', dir: 1, at: 7, stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null, ...values };
}

/** Keep a full fleet so phase reinforcements do not interfere with hand-set cases. */
function fixture(first: Train, second = train(2, { at: 12, dir: -1 })): SimState {
  return { ...startShiftSim(net, STARTING_NETWORK, 42), trains: [first, second, train(3, { at: 16, dir: -1 })] };
}

function expectNoConflicts(s: SimState): void {
  const occupied = new Set<string>();
  for (const t of s.trains) {
    const key = t.stage === 'dwell' || t.stage === 'turnaround'
      ? `platform:${net.lines.get(t.line)!.stations[t.at]}:${t.dir}`
      : `block:${blockKey(net, t.line, t.stage === 'running' ? t.at : t.at - t.dir,
        t.stage === 'running' ? t.at + t.dir : t.at)}`;
    expect(occupied.has(key), key).toBe(false);
    occupied.add(key);
  }
}

describe('Dispatcher trains, blocks and signals', () => {
  it('names both ends outer for a range through the centre, otherwise the end further from Masjid Jamek', () => {
    expect(outerEnds(net, STARTING_NETWORK[0]!)).toEqual(['from', 'to']);
    // Bangsar to Asia Jaya and Gombak to Jelatek include no central Station.
    expect(outerEnds(net, { line: 'KJ', from: 15, to: 20 })).toEqual(['to']);
    expect(outerEnds(net, { line: 'KJ', from: 0, to: 5 })).toEqual(['from']);
    // A central Station at an end is not inside the range: Sentul Timur is the outer end.
    expect(outerEnds(net, { line: 'AG', from: 0, to: 4 })).toEqual(['from']);
    const ag = net.lines.get('AG')!.stations;
    expect(outerEnds(net, { line: 'AG', from: 0, to: ag.length - 1 })).toEqual(['from', 'to']);
  });

  it('a Shift opens with a train waiting one block in from each outer end, heading inward', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    const range = STARTING_NETWORK[0]!;
    expect(s.trains).toHaveLength(2);
    expect(s.trains.every((t) => t.stage === 'signal' && t.ms === 0 && t.skipTo === null)).toBe(true);
    expect(s.trains.map((t) => [t.at, t.dir])).toEqual([[range.from + 1, 1], [range.to - 1, -1]]);
    expect(s.trains.map((t) => t.id)).toEqual([1, 2]);
    expect(s.nextTrainId).toBe(3);
    expect(s.rng).toBe(42);
    expect(s.shiftMs).toBe(0);
    expect(visibleTargets(net, s).length).toBeGreaterThan(0);
    expect(startShiftSim(net, STARTING_NETWORK, 42)).toEqual(s);
    expect(startShiftSim(net, [{ line: 'KJ', from: 15, to: 20 }], 1).trains.map((t) => [t.at, t.dir]))
      .toEqual([[19, -1]]);
  });

  it.each([
    { name: 'the starting network', served: STARTING_NETWORK },
    { name: 'a single outer end', served: [{ line: 'KJ' as const, from: 15, to: 30 }] },
  ])('the rest of the fleet enters at outer ends, spaced by headway: $name', ({ served }) => {
    const range = served[0]!;
    const ends = outerEnds(net, range);
    const spacing = targetHeadwayMs(range) / ends.length;
    const s = startShiftSim(net, served, 7);
    const entries: Record<string, number[]> = { from: [], to: [] };
    for (const t of s.trains) entries[t.dir === 1 ? 'from' : 'to']!.push(0);
    const seen = new Set(s.trains.map((t) => t.id));
    const morning: PhaseNow = { ...SHIFT_PHASES[0]!, escalation: 1 };
    const desired = trainsForLine(range, morning.trainFactor);
    for (let tick = 0; s.trains.length < desired; tick++) {
      expect(tick, 'fleet never filled').toBeLessThan(6_000);
      for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
      stepSim(net, s, morning);
      expectNoConflicts(s);
      for (const t of s.trains.filter((t) => !seen.has(t.id))) {
        seen.add(t.id);
        const end = t.at === range.from && t.dir === 1 ? 'from' : t.at === range.to && t.dir === -1 ? 'to' : null;
        expect(end, `train ${t.id} at ${t.at} heading ${t.dir}`).not.toBeNull();
        expect(ends).toContain(end);
        entries[end!]!.push(s.shiftMs);
      }
    }
    expect(seen.size).toBe(desired);
    for (const times of Object.values(entries)) {
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(spacing);
    }
  });

  it('after an Expansion the next Shift\'s ready still has a typeable Signal', () => {
    let betweens = 0;
    drive({ seed: 3, msPerKey: 110, limitMs: 12 * 60_000, watch: (state) => {
      if (state.status !== 'between') return;
      betweens++;
      const picks = state.offers.length === 0 ? [-1] : state.offers.map((_, i) => i);
      for (const pick of picks) {
        const next = applyDispatchAction(net, state, { a: 'expand', pick }, state.stoppedAt! + 1_000);
        expect(next.status).toBe('ready');
        expect(visibleTargets(net, next.sim).length, `Shift ${next.shift}, offer ${pick}`).toBeGreaterThan(0);
      }
    } });
    expect(betweens).toBeGreaterThan(0);
  });

  it('calculates phase fleet sizes and the full cycle headway from balance constants', () => {
    const range = STARTING_NETWORK[0]!;
    const base = Math.max(2, Math.round((range.to - range.from + 1) / STATIONS_PER_TRAIN));
    expect(trainsForLine(range, 1)).toBe(base);
    expect(trainsForLine(range, 0.6)).toBe(Math.round(base * 0.6));
    expect(trainsForLine(range, 0)).toBe(1);
    const cycle = 2 * (range.to - range.from) * TRAVEL_MS
      + 2 * (range.to - range.from - 1) * DWELL_BASE_MS + 2 * TURNAROUND_MS;
    expect(targetHeadwayMs(range)).toBe(cycle / base);
  });

  it('keeps uncleared trains held and counts game time and wait time', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 1);
    run(s, 10_000);
    expect(s.trains.every((t) => t.stage === 'signal' && t.ms === 10_000)).toBe(true);
    expect(s.shiftMs).toBe(10_000);
    expect(s.rng).toBe(1);
  });

  it('clears, dwells, runs and waits at the next signal', () => {
    const s = fixture(train(1));
    expect(clearSignal(net, s, 1)).toBe(true);
    expect(s.trains[0]!.stage).toBe('cleared');
    expect(clearSignal(net, s, 1)).toBe(false);
    expect(clearSignal(net, s, 999)).toBe(false);
    run(s, TICK_MS);
    expect(s.trains[0]).toMatchObject({ stage: 'dwell', at: 7, ms: DWELL_BASE_MS });
    run(s, DWELL_BASE_MS);
    expect(s.trains[0]).toMatchObject({ stage: 'running', at: 7, ms: 0 });
    run(s, TRAVEL_MS);
    expect(s.trains[0]).toMatchObject({ stage: 'signal', at: 8, ms: 0 });
  });

  it('holds a departing train behind an uncleared incoming block until it frees', () => {
    const s = fixture(train(1), train(2, { at: 6, stage: 'dwell', ms: TICK_MS }));
    run(s, DWELL_BASE_MS);
    expect(s.trains[1]).toMatchObject({ stage: 'dwell', at: 6, ms: 0 });
    clearSignal(net, s, 1);
    run(s, 2 * TICK_MS);
    expect(s.trains[1]).toMatchObject({ stage: 'running', at: 6 });
    expectNoConflicts(s);
  });

  it('keeps a cleared train in its incoming block until its directional platform frees', () => {
    const s = fixture(train(1, { at: 7, stage: 'cleared' }),
      train(2, { at: 7, stage: 'dwell', ms: DWELL_BASE_MS }));
    run(s, TICK_MS);
    expect(s.trains[0]!.stage).toBe('cleared');
    run(s, DWELL_BASE_MS);
    expect(s.trains[0]!.stage).toBe('dwell');
    expectNoConflicts(s);
  });

  it('allows opposite-direction platforms and blocks independently', () => {
    const s = fixture(train(1, { stage: 'cleared' }),
      train(2, { at: 7, dir: -1, stage: 'dwell', ms: DWELL_BASE_MS }));
    run(s, TICK_MS);
    expect(s.trains[0]!.stage).toBe('dwell');
    expect(s.trains[1]!.stage).toBe('dwell');
    expectNoConflicts(s);
  });

  it.each([{ at: 17, dir: 1 as const }, { at: 4, dir: -1 as const }])(
    'turns around at a served end: $at, $dir', ({ at, dir }) => {
      const s = fixture(train(1, { at, dir, stage: 'cleared' }));
      s.trains[2] = train(3, { at: 10, dir: -1 });
      run(s, TICK_MS);
      expect(s.trains[0]).toMatchObject({ stage: 'turnaround', at, dir, ms: TURNAROUND_MS });
      run(s, TURNAROUND_MS);
      expect(s.trains[0]).toMatchObject({ stage: 'running', at, dir: -dir, ms: 0 });
      run(s, TRAVEL_MS);
      expect(s.trains[0]).toMatchObject({ stage: 'signal', at: at - dir });
    },
  );

  it('waits at turnaround when the return block is occupied', () => {
    const s = fixture(train(1, { at: 17, stage: 'turnaround', ms: TICK_MS }),
      train(2, { at: 16, dir: -1 }));
    s.trains[2] = train(3, { at: 12, dir: -1 });
    run(s, TURNAROUND_MS);
    expect(s.trains[0]).toMatchObject({ stage: 'turnaround', at: 17, dir: 1, ms: 0 });
    clearSignal(net, s, 2);
    run(s, 2 * TICK_MS);
    expect(s.trains[0]).toMatchObject({ stage: 'running', at: 17, dir: -1 });
    expectNoConflicts(s);
  });

  it('shares directional blocks and platforms across AG and SP', () => {
    expect(blockKey(net, 'AG', 0, 1)).toBe(blockKey(net, 'SP', 0, 1));
    expect(blockKey(net, 'AG', 0, 1)).not.toBe(blockKey(net, 'AG', 1, 0));
    const served: Served = [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 0, to: 4 }];
    const s = startShiftSim(net, served, 1);
    expectNoConflicts(s);
    s.trains = [train(1, { line: 'AG', at: 2 }), train(2, { line: 'AG', at: 4 }),
      train(3, { line: 'SP', at: 1, stage: 'dwell', ms: 0 }), train(4, { line: 'SP', at: 0, dir: -1 })];
    run(s, TICK_MS);
    expect(s.trains[2]!.stage).toBe('dwell');
    s.trains[0] = train(1, { line: 'AG', at: 1, stage: 'dwell', ms: DWELL_BASE_MS });
    s.trains[2] = train(3, { line: 'SP', at: 1, stage: 'cleared' });
    run(s, TICK_MS);
    expect(s.trains[2]!.stage).toBe('cleared');
    expectNoConflicts(s);
  });

  it('removes surplus trains only during terminal turnaround', () => {
    const s = fixture(train(1, { at: 17, stage: 'cleared' }));
    const offPeak = { ...MIDDAY, trainFactor: 0.6 };
    run(s, TICK_MS, offPeak);
    expect(s.trains).toHaveLength(3);
    expect(s.trains[0]!.stage).toBe('turnaround');
    run(s, TICK_MS, offPeak);
    expect(s.trains.map((t) => t.id)).toEqual([2, 3]);
    run(s, 10_000, offPeak);
    expect(s.trains).toHaveLength(2);
  });

  it('keeps short shared-track trains circulating when the desired fleets cannot fit safely', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 1 }, { line: 'SP', from: 0, to: 1 }];
    const s = startShiftSim(net, served, 1);
    // Both Lines' only outer end is Sentul Timur, over one shared opening block.
    expect(s.trains).toHaveLength(1);
    expect(s.trains.every((t) => t.line === 'AG')).toBe(true);
    expectNoConflicts(s);
    for (let window = 0; window < 10; window++) {
      const advances = new Map(s.trains.map((t) => [t.id, 0]));
      for (let tick = 0; tick < 400; tick++) {
        for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
        const before = new Map(s.trains.map((t) => [t.id, t.at]));
        stepSim(net, s, MIDDAY);
        for (const t of s.trains) if (before.has(t.id) && before.get(t.id) !== t.at) {
          advances.set(t.id, (advances.get(t.id) ?? 0) + 1);
        }
        expectNoConflicts(s);
      }
      for (const [id, count] of advances) expect(count, `train ${id}, 40-second window ${window}`).toBeGreaterThan(0);
    }
  });

  it('adds phase reinforcements only at free outer-end platforms and departure blocks, then waits a spacing', () => {
    const range = STARTING_NETWORK[0]!;
    const spacing = targetHeadwayMs(range) / outerEnds(net, range).length;
    const s = startShiftSim(net, STARTING_NETWORK, 1);
    s.trains = [train(1, { at: 8 }), train(2, { at: 12, dir: -1 })];
    s.nextTrainId = 3;
    const peak = { ...MIDDAY, trainFactor: 2 };
    s.shiftMs = spacing - 2 * TICK_MS;
    run(s, TICK_MS, peak);
    expect(s.trains).toHaveLength(2);
    run(s, TICK_MS, peak);
    expect(s.trains.filter((t) => t.id >= 3).map((t) => [t.at, t.dir, t.stage]))
      .toEqual([[4, 1, 'dwell'], [17, -1, 'dwell']]);
    expectNoConflicts(s);
    // The departure blocks free again well before the next entry is due.
    run(s, DWELL_BASE_MS + TRAVEL_MS + TICK_MS, peak);
    expect(s.trains).toHaveLength(4);
    for (let elapsed = 0; elapsed < spacing; elapsed += TICK_MS) {
      for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
      stepSim(net, s, peak);
      expectNoConflicts(s);
    }
    expect(s.trains.length).toBeGreaterThan(4);
    expectNoConflicts(s);
    expect(s.trains.length).toBeLessThanOrEqual(trainsForLine(range, peak.trainFactor));
    expect(new Set(s.trains.map((t) => t.id)).size).toBe(s.trains.length);
    expect(s.nextTrainId).toBeGreaterThan(Math.max(...s.trains.map((t) => t.id)));
  });

  it('defers reinforcements when both departure blocks are occupied', () => {
    const s = fixture(train(1, { at: 5 }), train(2, { at: 16, dir: -1 }));
    s.trains[2] = train(3, { at: 12 });
    s.shiftMs = targetHeadwayMs(STARTING_NETWORK[0]!);
    run(s, TICK_MS, { ...MIDDAY, trainFactor: 2 });
    expect(s.trains).toHaveLength(3);
    expectNoConflicts(s);
  });

  it('keeps terminal capacity for arriving trains instead of inserting beside an opposite-direction platform', () => {
    const s = fixture(train(1, { at: 17, stage: 'turnaround', ms: TURNAROUND_MS }));
    s.trains[2] = train(3, { at: 10, dir: -1 });
    s.shiftMs = targetHeadwayMs(STARTING_NETWORK[0]!);
    run(s, TICK_MS, { ...MIDDAY, trainFactor: 2 });
    expect(s.trains.filter((t) => t.id >= 4 && t.at === 17)).toHaveLength(0);
    expectNoConflicts(s);
  });

  it('detects nearby trains only on the same line and direction, including fractional blocks', () => {
    const s = fixture(train(1, { at: 7 }), train(2, { at: 7 + BUNCH_BLOCKS }));
    expect(bunchedTrains(net, s)).toEqual(new Set([1, 2]));
    s.trains[1]!.dir = -1;
    expect(bunchedTrains(net, s)).toEqual(new Set());
    s.trains[1] = train(2, { line: 'SP', at: 7 });
    expect(bunchedTrains(net, s)).toEqual(new Set());
    s.trains[1] = train(2, { at: 7 + BUNCH_BLOCKS, stage: 'running', ms: TRAVEL_MS / 2 });
    expect(bunchedTrains(net, s)).toEqual(new Set());
    s.trains[0] = train(1, { at: 7, stage: 'running', ms: TRAVEL_MS / 2 });
    expect(bunchedTrains(net, s)).toEqual(new Set([1, 2]));
  });

  it('reports positions for both directions and clamps running interpolation', () => {
    expect(trainPosition(net, train(1, { at: 7, stage: 'running', ms: TRAVEL_MS / 2 })))
      .toEqual({ from: kj[7], to: kj[8], t: 0.5 });
    expect(trainPosition(net, train(1, { at: 7, dir: -1, stage: 'running', ms: TRAVEL_MS / 2 })))
      .toEqual({ from: kj[7], to: kj[6], t: 0.5 });
    expect(trainPosition(net, train(1, { at: 7, stage: 'running', ms: TRAVEL_MS * 2 })).t).toBe(1);
    expect(trainPosition(net, train(1, { at: 7, stage: 'running', ms: -TICK_MS })).t).toBe(0);
    for (const stage of ['signal', 'cleared', 'dwell', 'turnaround'] as const) {
      expect(trainPosition(net, train(1, { at: 7, stage }))).toEqual({ from: kj[7], to: kj[7], t: 0 });
    }
  });

  it('clones served ranges, trains and destination loads deeply and stays JSON-safe', () => {
    const s = fixture(train(1, { load: { klcc: 5 } }));
    const copy = cloneSim(s);
    copy.trains[0]!.load.klcc = 10;
    copy.trains[0]!.at++;
    copy.served[0]!.from++;
    expect(s.trains[0]!.load.klcc).toBe(5);
    expect(s.trains[0]!.at).toBe(7);
    expect(s.served[0]!.from).toBe(4);
    expect(copy).toEqual(JSON.parse(JSON.stringify(copy)));
    const served = [{ line: 'KJ' as const, from: 4, to: 17 }];
    const started = startShiftSim(net, served, 1);
    served[0]!.from = 0;
    expect(started.served[0]!.from).toBe(4);
  });

  it('keeps shared-track fleets conflict-free while running and changing phase', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 12 }, { line: 'SP', from: 0, to: 14 }];
    const s = startShiftSim(net, served, 1);
    for (let tick = 0; tick < 1_000; tick++) {
      for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
      stepSim(net, s, { ...MIDDAY, trainFactor: tick < 500 ? 0.6 : 1 });
      expectNoConflicts(s);
      for (const t of s.trains) {
        const range = served.find((r) => r.line === t.line)!;
        expect(t.at).toBeGreaterThanOrEqual(range.from);
        expect(t.at).toBeLessThanOrEqual(range.to);
        expect(Number.isFinite(trainPosition(net, t).t)).toBe(true);
      }
    }
  });

  it('keeps block exclusivity when AG and SP enter from shared outer ends through a whole Shift', () => {
    const ag = net.lines.get('AG')!.stations;
    const served: Served = [{ line: 'AG', from: 0, to: ag.length - 1 }, { line: 'SP', from: 0, to: 17 }];
    const s = startShiftSim(net, served, 5);
    expectNoConflicts(s);
    // Both Lines start inward from Sentul Timur over the same block; only one opening train fits there.
    expect(s.trains.filter((t) => t.at === 1 && t.dir === 1)).toHaveLength(1);
    expect(s.trains.map((t) => t.line).sort()).toEqual(['AG', 'AG', 'SP']);
    for (const spec of SHIFT_PHASES) {
      for (let elapsed = 0; elapsed < spec.ms; elapsed += TICK_MS) {
        for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
        stepSim(net, s, { ...spec, escalation: 1 });
        expectNoConflicts(s);
      }
    }
    expect(s.trains.some((t) => t.line === 'SP' && t.id > 3)).toBe(true);
    expect(s.trains.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps longer shared-track fleets advancing throughout sustained all-clear operation', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 0, to: 4 }];
    const s = startShiftSim(net, served, 1);
    for (let window = 0; window < 10; window++) {
      const advances = new Map(s.trains.map((t) => [t.id, 0]));
      for (let tick = 0; tick < 400; tick++) {
        for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
        const before = new Map(s.trains.map((t) => [t.id, t.at]));
        stepSim(net, s, MIDDAY);
        for (const t of s.trains) if (before.has(t.id) && before.get(t.id) !== t.at) {
          advances.set(t.id, (advances.get(t.id) ?? 0) + 1);
        }
        expectNoConflicts(s);
      }
      for (const [id, count] of advances) expect(count, `train ${id}, 40-second window ${window}`).toBeGreaterThan(0);
    }
  });

  it.each([[2, 1], [4, 1], [4, 2], [12, 14]])(
    'keeps through trains advancing past shared turnback platforms: AG 0..%i, SP 0..%i', (agTo, spTo) => {
      const served: Served = [{ line: 'AG', from: 0, to: agTo }, { line: 'SP', from: 0, to: spTo }];
      const s = startShiftSim(net, served, 1);
      for (let window = 0; window < 10; window++) {
        const advances = new Map(s.trains.map((t) => [t.id, 0]));
        for (let tick = 0; tick < 400; tick++) {
          for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
          const before = new Map(s.trains.map((t) => [t.id, t.at]));
          stepSim(net, s, MIDDAY);
          for (const t of s.trains) if (before.has(t.id) && before.get(t.id) !== t.at) {
            advances.set(t.id, (advances.get(t.id) ?? 0) + 1);
          }
          expectNoConflicts(s);
        }
        for (const [id, count] of advances) expect(count, `train ${id}, 40-second window ${window}`).toBeGreaterThan(0);
      }
    },
  );

  it('leaves an escape block for through trains when a departure would close a shared turnback circle', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 2 }, { line: 'SP', from: 0, to: 1 }];
    const s = startShiftSim(net, served, 1);
    s.trains = [
      train(1, { line: 'AG', at: 0, dir: -1, stage: 'turnaround', ms: TURNAROUND_MS }),
      train(2, { line: 'AG', at: 0, dir: -1, stage: 'cleared' }),
      train(3, { line: 'SP', at: 1, dir: 1, stage: 'turnaround', ms: TURNAROUND_MS }),
      train(4, { line: 'SP', at: 0, dir: 1, stage: 'dwell', ms: TICK_MS }),
    ];
    s.nextTrainId = 5;
    run(s, TICK_MS);
    expect(s.trains[3]).toMatchObject({ stage: 'dwell', at: 0, ms: 0 });
    const advances = new Map(s.trains.map((t) => [t.id, 0]));
    for (let tick = 0; tick < 400; tick++) {
      for (const t of s.trains) if (t.stage === 'signal') clearSignal(net, s, t.id);
      const before = new Map(s.trains.map((t) => [t.id, t.at]));
      stepSim(net, s, MIDDAY);
      for (const t of s.trains) if (before.get(t.id) !== t.at) {
        advances.set(t.id, advances.get(t.id)! + 1);
      }
      expectNoConflicts(s);
    }
    for (const [id, count] of advances) expect(count, `train ${id}`).toBeGreaterThan(0);
  });
});


describe('passengers', () => {
  it('appears by demand and phase only for served non-origin destinations', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    run(s, 60_000, { ...MIDDAY, multiplier: 1 });
    const ids = servedStations(net, s.served);
    for (const id of ids) {
      expect(Math.abs(crowdAt(s, id) - Math.floor(60 * PASSENGER_RATE * net.stations.get(id)!.demand)))
        .toBeLessThanOrEqual(1);
      for (const destination of Object.keys(s.platforms[id]!.waiting)) {
        expect(ids).toContain(destination);
        expect(destination).not.toBe(id);
      }
    }
    expect(startShiftSim(net, STARTING_NETWORK, 42).platforms).not.toBe(s.platforms);
  });

  it('weights morning origins outward and destinations inward, reversing in the evening', () => {
    for (const id of ['setiawangsa', 'klcc']) {
      const demand = net.stations.get(id)!.demand;
      const central = CENTRAL_STATIONS.includes(id);
      expect(originWeight(net, id, 'none')).toBe(demand);
      expect(destinationWeight(net, id, 'none')).toBe(demand);
      expect(originWeight(net, id, 'inbound')).toBe(demand * (central ? 1 : CENTRAL_PULL));
      expect(originWeight(net, id, 'outbound')).toBe(demand * (central ? CENTRAL_PULL : 1));
      expect(destinationWeight(net, id, 'inbound')).toBe(demand * (central ? CENTRAL_PULL : 1));
      expect(destinationWeight(net, id, 'outbound')).toBe(demand * (central ? 1 : CENTRAL_PULL));
    }
    const centralShare = (flow: PhaseNow['flow']) => {
      const s = startShiftSim(net, STARTING_NETWORK, 42);
      run(s, 200_000, { ...MIDDAY, multiplier: 1, flow });
      let central = 0;
      let total = 0;
      for (const platform of Object.values(s.platforms)) for (const [id, count] of Object.entries(platform.waiting)) {
        total += count;
        if (CENTRAL_STATIONS.includes(id)) central += count;
      }
      return central / total;
    };
    expect(centralShare('inbound')).toBeGreaterThan(centralShare('outbound'));
  });

  it('transfers at Masjid Jamek and delivers on another line', () => {
    const s = startShiftSim(net, [{ line: 'KJ', from: 4, to: 17 }, { line: 'AG', from: 0, to: 10 }], 42);
    s.platforms.setiawangsa!.waiting['sultan-ismail'] = 10;
    let transferred = false;
    for (let elapsed = 0; elapsed < 600_000 && s.delivered < 10; elapsed += TICK_MS) {
      for (const t of s.trains) clearSignal(net, s, t.id);
      stepSim(net, s, MIDDAY);
      transferred ||= crowdAt(s, 'masjid-jamek') > 0;
    }
    expect(transferred).toBe(true);
    expect(s.delivered).toBe(10);
  });

  it.each([50, TRAIN_CAPACITY + 10])('adds dwell for boarding up to train capacity: %i waiting', (waiting) => {
    const s = fixture(train(1, { stage: 'cleared' }));
    s.platforms[kj[7]!]!.waiting[kj[8]!] = waiting;
    stepSim(net, s, MIDDAY);
    const boarded = Math.min(waiting, TRAIN_CAPACITY);
    expect(s.trains[0]!.load[kj[8]!]).toBe(boarded);
    expect(s.trains[0]!.ms).toBe(DWELL_BASE_MS + boarded * DWELL_PER_PASSENGER_MS);
    expect(crowdAt(s, kj[7]!)).toBe(waiting - boarded);
  });

  it('exchanges only once on an accepted entry, never on clear or a blocked attempt', () => {
    const s = fixture(train(1), train(2, { at: 7, stage: 'dwell', ms: DWELL_BASE_MS }));
    s.platforms[kj[7]!]!.waiting[kj[8]!] = 5;
    clearSignal(net, s, 1);
    expect(crowdAt(s, kj[7]!)).toBe(5);
    stepSim(net, s, MIDDAY);
    expect(crowdAt(s, kj[7]!)).toBe(5);
    expect(s.calls).toBe(0);
    run(s, DWELL_BASE_MS);
    expect(s.calls).toBe(1);
    expect(s.trains[0]!.load[kj[8]!]).toBe(5);
    run(s, TICK_MS);
    expect(s.calls).toBe(1);
  });

  it('alights at terminals and boards in the outgoing direction with turnaround base time', () => {
    const s = fixture(train(1, { at: 17, stage: 'cleared', load: { [kj[17]!]: 3, [kj[16]!]: 2 } }));
    s.trains[2] = train(3, { at: 10, dir: -1 });
    s.platforms[kj[17]!]!.waiting[kj[16]!] = 4;
    stepSim(net, s, MIDDAY);
    expect(s.delivered).toBe(3);
    expect(s.trains[0]!.load).toEqual({ [kj[16]!]: 6 });
    expect(s.trains[0]!.ms).toBe(TURNAROUND_MS + 7 * DWELL_PER_PASSENGER_MS);
  });

  it('strands waiting and destination-bound riders when a full platform closes for the shift', () => {
    const s = fixture(train(1, { load: { klcc: 7, [kj[8]!]: 2 } }));
    s.platforms.klcc!.waiting[kj[4]!] = PLATFORM_CAPACITY;
    run(s, OOS_CROWD_MS - TICK_MS);
    expect(s.outOfService.klcc).toBeUndefined();
    stepSim(net, s, MIDDAY);
    expect(s.outOfService.klcc).toBe('crowding');
    expect(s.oosOrder[s.oosOrder.length - 1]).toBe('klcc');
    expect(crowdAt(s, 'klcc')).toBe(0);
    expect(s.stranded).toBe(PLATFORM_CAPACITY + 7);
    expect(s.trains[0]!.load).toEqual({ [kj[8]!]: 2 });
    run(s, 30_000, { ...MIDDAY, multiplier: 1 });
    expect(s.outOfService.klcc).toBe('crowding');
    expect(crowdAt(s, 'klcc')).toBe(0);
    for (const p of Object.values(s.platforms)) expect(p.waiting.klcc).toBeUndefined();
  });

  it('resets the full-platform timer after crowding falls below capacity', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.platforms.klcc!.waiting[kj[4]!] = PLATFORM_CAPACITY;
    run(s, OOS_CROWD_MS - TICK_MS);
    s.platforms.klcc!.waiting[kj[4]!] = PLATFORM_CAPACITY - 1;
    stepSim(net, s, MIDDAY);
    expect(s.platforms.klcc!.fullMs).toBe(0);
    s.platforms.klcc!.waiting[kj[4]!] = PLATFORM_CAPACITY;
    stepSim(net, s, MIDDAY);
    expect(s.platforms.klcc!.fullMs).toBe(TICK_MS);
  });

  it.each(['signal', 'cleared', 'running'] as const)('bypasses an OOS station from %s without calls or dwell', (stage) => {
    const s = fixture(train(1, { at: stage === 'running' ? 6 : 7, stage, ms: stage === 'running' ? TRAVEL_MS - TICK_MS : 0 }));
    s.outOfService[kj[7]!] = 'crowding';
    stepSim(net, s, MIDDAY);
    for (let ticks = 0; ticks < 2; ticks++) {
      expect(s.trains[0]!.stage).not.toBe('signal');
      expect(s.trains[0]!.stage).not.toBe('dwell');
      stepSim(net, s, MIDDAY);
    }
    expect(s.trains[0]).toMatchObject({ at: 7, stage: 'running' });
    expect(s.calls).toBe(0);
  });

  it('turns safely at an OOS endpoint without calling there', () => {
    const s = fixture(train(1, { at: 17 }));
    s.trains[2] = train(3, { at: 10, dir: -1 });
    s.outOfService[kj[17]!] = 'crowding';
    run(s, 2 * TICK_MS);
    expect(s.trains[0]).toMatchObject({ at: 17, stage: 'running', dir: -1 });
    expect(s.calls).toBe(0);
    expectNoConflicts(s);
  });

  it('uses the next actual in-service stop to decide boarding', () => {
    const s = fixture(train(1, { at: 7, stage: 'cleared' }));
    s.outOfService[kj[8]!] = 'crowding';
    s.platforms[kj[7]!]!.waiting[kj[9]!] = 5;
    stepSim(net, s, MIDDAY);
    expect(s.trains[0]!.load[kj[9]!]).toBe(5);
  });

  it('preserves riders when a surplus train retires at the terminal', () => {
    const s = fixture(train(1, { at: 17, stage: 'turnaround', ms: 1, load: { [kj[4]!]: 5 } }));
    stepSim(net, s, { ...MIDDAY, trainFactor: 0.6 });
    expect(s.trains.some((t) => t.id === 1)).toBe(false);
    expect(s.delivered + s.stranded + Object.keys(s.platforms).reduce((n, id) => n + crowdAt(s, id), 0)).toBe(5);
  });

  it('counts actual calls against the directional headway and observes the inclusive on-time boundary', () => {
    const threshold = ON_TIME_FACTOR * targetHeadwayMs(STARTING_NETWORK[0]!);
    for (const over of [0, 1]) {
      const s = fixture(train(1, { stage: 'cleared' }));
      s.shiftMs = threshold - TICK_MS + over;
      // The fixture's three trains are the whole fleet: no reinforcement call is counted.
      stepSim(net, s, { ...MIDDAY, trainFactor: 3 / trainsForLine(STARTING_NETWORK[0]!, 1) });
      expect(s.calls).toBe(1);
      expect(s.onTimeCalls).toBe(over === 0 ? 1 : 0);
      expect(s.platforms[kj[7]!]!.lastCall['KJ:1']).toBe(s.shiftMs);
    }
  });

  it('is late only after the directional platform wait exceeds its threshold', () => {
    const s = fixture(train(1));
    s.platforms[kj[7]!]!.lastCall['KJ:1'] = 200;
    s.platforms[kj[7]!]!.lastCall['KJ:-1'] = 0;
    s.shiftMs = 200 + LATE_FACTOR * targetHeadwayMs(STARTING_NETWORK[0]!);
    expect(isLate(net, s, s.trains[0]!)).toBe(false);
    s.shiftMs++;
    expect(isLate(net, s, s.trains[0]!)).toBe(true);
    s.outOfService[kj[7]!] = 'crowding';
    expect(isLate(net, s, s.trains[0]!)).toBe(false);
  });

  it('handles a sole in-service station without creating self destinations or accumulating arrivals', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    for (const id of Object.keys(s.platforms)) if (id !== 'klcc') s.outOfService[id] = 'crowding';
    run(s, 60_000, { ...MIDDAY, multiplier: 1 });
    expect(crowdAt(s, 'klcc')).toBe(0);
    expect(s.spawnDebt.klcc).toBeLessThan(1);
  });

  it('strands waiting trips to a newly closed destination and conserves every passenger', () => {
    const s = fixture(train(1, { load: { klcc: 7, [kj[8]!]: 2 } }));
    s.platforms.klcc!.waiting[kj[4]!] = PLATFORM_CAPACITY;
    s.platforms[kj[4]!]!.waiting.klcc = 11;
    run(s, OOS_CROWD_MS);
    expect(s.platforms[kj[4]!]!.waiting.klcc).toBeUndefined();
    expect(s.stranded).toBe(PLATFORM_CAPACITY + 18);
    const aboard = s.trains.reduce((n, t) => n + Object.values(t.load).reduce((sum, count) => sum + count, 0), 0);
    const waiting = Object.keys(s.platforms).reduce((n, id) => n + crowdAt(s, id), 0);
    expect(s.delivered + s.stranded + aboard + waiting).toBe(PLATFORM_CAPACITY + 20);
  });

  it('respects remaining capacity after alighting and adds both movements to dwell', () => {
    const s = fixture(train(1, { at: 7, stage: 'cleared', load: { [kj[7]!]: 5, [kj[9]!]: TRAIN_CAPACITY - 5 } }));
    s.platforms[kj[7]!]!.waiting[kj[8]!] = 10;
    stepSim(net, s, MIDDAY);
    expect(s.delivered).toBe(5);
    expect(s.trains[0]!.load).toEqual({ [kj[9]!]: TRAIN_CAPACITY - 5, [kj[8]!]: 5 });
    expect(crowdAt(s, kj[7]!)).toBe(5);
    expect(s.trains[0]!.ms).toBe(DWELL_BASE_MS + 10 * DWELL_PER_PASSENGER_MS);
  });

  it('does not insert a dwelling reinforcement at an OOS endpoint', () => {
    const open = startShiftSim(net, STARTING_NETWORK, 42);
    open.trains = [train(1, { at: 8 }), train(2, { at: 12, dir: -1 })];
    open.shiftMs = targetHeadwayMs(STARTING_NETWORK[0]!);
    const s = cloneSim(open);
    stepSim(net, open, { ...MIDDAY, trainFactor: 2 });
    expect(open.trains).toHaveLength(4);
    s.outOfService[kj[4]!] = 'crowding';
    s.outOfService[kj[17]!] = 'crowding';
    stepSim(net, s, { ...MIDDAY, trainFactor: 2 });
    expect(s.trains).toHaveLength(2);
    expect(s.trains.some((t) => t.stage === 'dwell' && s.outOfService[kj[t.at]!])).toBe(false);
  });

  it('keeps shared-track trains circulating safely through closed Stations and endpoints', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 4 }, { line: 'SP', from: 0, to: 2 }];
    const s = startShiftSim(net, served, 42);
    const ag = net.lines.get('AG')!.stations;
    for (const at of [0, 1, 2]) s.outOfService[ag[at]!] = 'crowding';
    for (let window = 0; window < 10; window++) {
      const advances = new Map(s.trains.map((t) => [t.id, 0]));
      for (let tick = 0; tick < 400; tick++) {
        for (const t of s.trains) clearSignal(net, s, t.id);
        const before = new Map(s.trains.map((t) => [t.id, t.at]));
        stepSim(net, s, MIDDAY);
        for (const t of s.trains) if (before.get(t.id) !== t.at) advances.set(t.id, (advances.get(t.id) ?? 0) + 1);
        expectNoConflicts(s);
      }
      for (const [id, count] of advances) expect(count, `train ${id}, OOS window ${window}`).toBeGreaterThan(0);
    }
  });

  it('every call records its exchange', () => {
    const s = fixture(train(1, { stage: 'cleared', load: { [kj[7]!]: 4, [kj[12]!]: 3 } }));
    s.platforms[kj[7]!]!.waiting[kj[8]!] = 6;
    const load = (t: Train) => Object.values(t.load).reduce((sum, n) => sum + n, 0);
    const before = load(s.trains[0]!);
    const delivered = s.delivered;
    expect(s.trains[0]!.lastExchange).toBeNull();
    stepSim(net, s, MIDDAY);
    const t = s.trains[0]!;
    expect(t.stage).toBe('dwell');
    expect(t.lastExchange).toEqual({
      station: kj[7]!, boarded: 6, alighted: 4, delivered: 4, atMs: s.shiftMs,
    });
    expect(t.lastExchange!.boarded - t.lastExchange!.alighted).toBe(load(t) - before);
    expect(t.lastExchange!.delivered).toBe(s.delivered - delivered);
  });

  it('counts transfers as alighted but not delivered', () => {
    const s = fixture(train(1, { stage: 'cleared', load: { [kj[3]!]: 5 } }));
    s.trains[0]!.at = 7;
    // Heading away from their destination, so they alight at this Station without arriving.
    stepSim(net, s, MIDDAY);
    const exchange = s.trains[0]!.lastExchange!;
    expect(exchange.delivered).toBe(0);
    expect(exchange.alighted).toBe(5);
    expect(s.delivered).toBe(0);
  });

  it('clones all passenger and OOS state independently', () => {
    const s = fixture(train(1));
    s.platforms.klcc!.waiting[kj[4]!] = 3;
    s.platforms.klcc!.lastCall['KJ:1'] = 100;
    s.outOfService[kj[5]!] = 'crowding';
    s.oosOrder.push(kj[5]!);
    s.spawnDebt.klcc = 0.5;
    const copy = cloneSim(s);
    copy.platforms.klcc!.waiting[kj[4]!] = 4;
    copy.platforms.klcc!.lastCall['KJ:1'] = 101;
    copy.platforms.klcc!.fullMs++;
    copy.outOfService[kj[5]!] = 'train-fault';
    copy.oosOrder.push('klcc');
    copy.spawnDebt.klcc = 1.5;
    expect(s.platforms.klcc).toEqual({ waiting: { [kj[4]!]: 3 }, lastCall: { 'KJ:1': 100 }, fullMs: 0 });
    expect(s.outOfService[kj[5]!]).toBe('crowding');
    expect(s.oosOrder).toHaveLength(1);
    expect(s.spawnDebt.klcc).toBe(0.5);
    expect(copy).toEqual(JSON.parse(JSON.stringify(copy)));
  });

  it('clones exchange and dispersal records independently', () => {
    const s = fixture(train(1, { lastExchange: { station: 'klcc', boarded: 1, alighted: 2, delivered: 3, atMs: 4 } }));
    s.dispersed = 5;
    s.lastDispersal = { station: 'klcc', count: 5, incident: 1, atMs: 9 };
    const copy = cloneSim(s);
    copy.trains[0]!.lastExchange!.boarded = 99;
    copy.lastDispersal!.count = 99;
    expect(s.trains[0]!.lastExchange!.boarded).toBe(1);
    expect(s.lastDispersal!.count).toBe(5);
    expect(copy).toEqual(JSON.parse(JSON.stringify(copy)));
  });

  it('exposing exchanges changes nothing else', () => {
    const watched = startShiftSim(net, STARTING_NETWORK, 42);
    const blind = startShiftSim(net, STARTING_NETWORK, 42);
    const morning: PhaseNow = { ...SHIFT_PHASES[0]!, escalation: 1 };
    let seen = 0;
    for (let elapsed = 0; elapsed < 60_000; elapsed += TICK_MS) {
      for (const sim of [watched, blind]) {
        for (const t of sim.trains) if (t.stage === 'signal') clearSignal(net, sim, t.id);
        stepSim(net, sim, morning);
      }
      for (const t of watched.trains) seen += t.lastExchange?.boarded ?? 0;
    }
    expect(seen).toBeGreaterThan(0);
    expect([watched.delivered, watched.stranded, watched.calls, watched.rng])
      .toEqual([blind.delivered, blind.stranded, blind.calls, blind.rng]);
  });
});
