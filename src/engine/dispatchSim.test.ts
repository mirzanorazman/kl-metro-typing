import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import {
  BUNCH_BLOCKS, DWELL_BASE_MS, STATIONS_PER_TRAIN, TICK_MS, TRAVEL_MS, TURNAROUND_MS,
} from './dispatchBalance';
import { STARTING_NETWORK, type Served } from './dispatchNetwork';
import {
  blockKey, bunchedTrains, clearSignal, cloneSim, startShiftSim, stepSim,
  targetHeadwayMs, trainPosition, trainsForLine,
  type PhaseNow, type SimState, type Train,
} from './dispatchSim';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!.stations;
const MIDDAY: PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 1, escalation: 1 };

function run(s: SimState, ms: number, phase = MIDDAY): void {
  for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) stepSim(net, s, phase);
}

function train(id: number, values: Partial<Train> = {}): Train {
  return { id, line: 'KJ', dir: 1, at: 7, stage: 'signal', ms: 0, skipTo: null, load: {}, ...values };
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
  it('starts three trains at distinct signals evenly spread over the directed cycle', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    expect(s.trains).toHaveLength(3);
    expect(s.trains.map((t) => [t.at, t.dir])).toEqual([[5, 1], [13, 1], [12, -1]]);
    expect(s.trains.every((t) => t.stage === 'signal' && t.ms === 0 && t.skipTo === null)).toBe(true);
    expect(s.trains.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(s.nextTrainId).toBe(4);
    expect(s.rng).toBe(42);
    expect(s.shiftMs).toBe(0);
    expect(startShiftSim(net, STARTING_NETWORK, 42)).toEqual(s);
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

  it('defers a fleet that cannot fit on short shared track and reinforces after blocks free', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 1 }, { line: 'SP', from: 0, to: 1 }];
    const s = startShiftSim(net, served, 1);
    expect(s.trains).toHaveLength(2);
    expect(s.trains.every((t) => t.line === 'AG')).toBe(true);
    expectNoConflicts(s);
    for (const t of s.trains) clearSignal(net, s, t.id);
    run(s, TICK_MS);
    expect(s.trains.filter((t) => t.line === 'SP')).toHaveLength(trainsForLine(served[1]!, 1));
    expectNoConflicts(s);
  });

  it('adds phase reinforcements only at free range-end platforms and departure blocks', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 1);
    const peak = { ...MIDDAY, trainFactor: 2 };
    run(s, TICK_MS, peak);
    expect(s.trains.length).toBeGreaterThan(3);
    for (const t of s.trains.filter((t) => t.id >= 4)) {
      expect([4, 17]).toContain(t.at);
      expect(t.stage).toBe('dwell');
    }
    expectNoConflicts(s);
    run(s, DWELL_BASE_MS, peak);
    expectNoConflicts(s);
    expect(s.trains.length).toBeLessThanOrEqual(trainsForLine(STARTING_NETWORK[0]!, peak.trainFactor));
    expect(new Set(s.trains.map((t) => t.id)).size).toBe(s.trains.length);
    expect(s.nextTrainId).toBeGreaterThan(Math.max(...s.trains.map((t) => t.id)));
  });

  it('defers reinforcements when both departure blocks are occupied', () => {
    const s = fixture(train(1, { at: 5 }), train(2, { at: 16, dir: -1 }));
    s.trains[2] = train(3, { at: 12 });
    run(s, TICK_MS, { ...MIDDAY, trainFactor: 2 });
    expect(s.trains).toHaveLength(3);
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
});
