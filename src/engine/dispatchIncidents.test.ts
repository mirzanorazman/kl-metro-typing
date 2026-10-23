import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { STARTING_NETWORK, servedDistances } from './dispatchNetwork';
import { CROWD_SURGE_MULTIPLIER, INCIDENT_FIRST_MS, INCIDENT_LIMIT_MS, INCIDENT_MAX, PASSENGER_RATE, STRAIN_HELD_WEIGHT, TICK_MS } from './dispatchBalance';
import { clearSignal, cloneSim, crowdAt, heldStations, heldTrains, originWeight, startShiftSim, type Incident, type PhaseNow } from './dispatchSim';
import { advanceFix, fixItems, stepIncidents, stepWorld, strain } from './dispatchIncidents';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!.stations;
const phase: PhaseNow = { multiplier: 1, flow: 'none', trainFactor: 1, escalation: 1 };
const quiet: PhaseNow = { ...phase, multiplier: 0 };
const index = (id: string) => kj.indexOf(id);

function run(s: ReturnType<typeof startShiftSim>, ms: number, p = phase): void {
  for (let t = 0; t < ms; t += TICK_MS) stepWorld(net, s, p);
}

function incident(kind: Incident['kind'], overrides: Partial<Incident> = {}): Incident {
  return { id: 1, kind, place: 'klcc', stations: kind === 'signal-fault' ? ['klcc', 'kampung-baru', 'dang-wangi'] : kind === 'crowd-surge' ? ['klcc'] : [], line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0, ...overrides };
}

describe('Dispatcher incidents', () => {
  it('waits through the first 20 seconds, then spawns within the simultaneous limit', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    run(s, INCIDENT_FIRST_MS - TICK_MS);
    expect(s.incidents).toHaveLength(0);
    let seen = false;
    for (let t = 0; t < 180_000; t += TICK_MS) {
      stepWorld(net, s, phase);
      seen ||= s.incidents.length > 0;
      expect(s.incidents.length).toBeLessThanOrEqual(INCIDENT_MAX);
    }
    expect(seen).toBe(true);
  });

  it('favours crowded places across seeded draws', () => {
    const hops = servedDistances(net, STARTING_NETWORK).get('klcc')!;
    let base = 0;
    let crowded = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const a = startShiftSim(net, STARTING_NETWORK, seed);
      const b = startShiftSim(net, STARTING_NETWORK, seed);
      b.platforms.klcc!.waiting[kj[4]!] = 70;
      expect(strain(net, b, 'klcc')).toBeGreaterThan(strain(net, a, 'klcc'));
      // Incident steps only: no Passengers spawn or move, so balance numbers play no part.
      const first = (sim: typeof a) => {
        while (sim.incidents.length === 0) { sim.shiftMs += TICK_MS; stepIncidents(net, sim, phase); }
      };
      first(a);
      first(b);
      base += Number((hops.get(a.incidents[0]!.place) ?? Infinity) <= 1);
      crowded += Number((hops.get(b.incidents[0]!.place) ?? Infinity) <= 1);
    }
    expect(crowded).toBeGreaterThan(base);
  });

  it('counts uncleared signals in station strain', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    const approaching = s.trains[0]!;
    const place = kj[approaching.at]!;
    expect(strain(net, s, place)).toBe(1 + STRAIN_HELD_WEIGHT);
    clearSignal(net, s, approaching.id);
    expect(strain(net, s, place)).toBe(1);
  });

  it('holds an approaching signal and a departure into the fault until all three fixes finish', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.incidents = [incident('signal-fault')];
    s.trains = [
      { id: 1, line: 'KJ', dir: 1, at: index('kampung-baru'), stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null },
      { id: 2, line: 'KJ', dir: 1, at: index('klcc'), stage: 'dwell', ms: TICK_MS, skipTo: null, load: {}, lastExchange: null },
    ];
    expect(heldStations(s)).toEqual(new Set(['klcc', 'kampung-baru', 'dang-wangi']));
    expect(heldTrains(net, s)).toEqual(new Set([1, 2]));
    expect(clearSignal(net, s, 1)).toBe(false);
    run(s, TICK_MS, quiet);
    expect(s.trains.slice(0, 2).map((t) => [t.stage, t.at, t.ms])).toEqual([['signal', index('kampung-baru'), 0], ['dwell', index('klcc'), TICK_MS]]);
    expect(fixItems(net, s.incidents[0]!, s)).toEqual(['KLCC', 'Kampung Baru', 'Dang Wangi']);
    expect(advanceFix(net, s, 1)).toBe(true);
    expect(advanceFix(net, s, 1)).toBe(true);
    expect(s.incidents[0]!.step).toBe(2);
    expect(clearSignal(net, s, 1)).toBe(false);
    expect(advanceFix(net, s, 1)).toBe(true);
    expect(s.incidents).toHaveLength(0);
    expect(clearSignal(net, s, 1)).toBe(true);
  });

  it('freezes only the train with a train fault and names its next station', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    const affected = s.trains[0]!;
    const other = s.trains[1]!;
    s.incidents = [incident('train-fault', { place: kj[affected.at]!, train: affected.id })];
    expect(fixItems(net, s.incidents[0]!, s)).toEqual([`Reset train at ${net.stations.get(kj[affected.at]!)!.name}`]);
    expect(clearSignal(net, s, other.id)).toBe(true);
    run(s, TICK_MS, quiet);
    expect(affected).toMatchObject({ stage: 'signal', ms: 0 });
    expect(other.stage).toBe('dwell');
  });

  it('quadruples passenger arrivals at a surge place', () => {
    const base = startShiftSim(net, STARTING_NETWORK, 42);
    const surged = cloneSim(base);
    surged.incidents = [incident('crowd-surge')];
    // Stop before the unfixed surge closes its Station.
    run(base, INCIDENT_LIMIT_MS - 2 * TICK_MS);
    run(surged, INCIDENT_LIMIT_MS - 2 * TICK_MS);
    expect(crowdAt(surged, 'klcc')).toBeGreaterThanOrEqual(crowdAt(base, 'klcc') * 4 - 1);
  });

  it('a surge\'s extras accumulate', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.incidents = [incident('crowd-surge')];
    run(s, 10_000);
    const spawned = PASSENGER_RATE * originWeight(net, 'klcc', phase.flow) * CROWD_SURGE_MULTIPLIER * 10;
    const extraShare = (CROWD_SURGE_MULTIPLIER - 1) / CROWD_SURGE_MULTIPLIER;
    expect(s.incidents[0]!.extra).toBeGreaterThan(0);
    expect(Math.abs(s.incidents[0]!.extra - extraShare * spawned)).toBeLessThan(1 + extraShare);
  });

  it('adds no extras for other incidents, and draws no rng', () => {
    const base = startShiftSim(net, STARTING_NETWORK, 42);
    const signal = cloneSim(base);
    signal.incidents = [incident('signal-fault', { startedMs: 0 })];
    run(signal, 10_000);
    expect(signal.incidents[0]!.extra).toBe(0);
    // Surge extras are bookkeeping only: the spawn stream ignores them.
    const marked = cloneSim(base);
    marked.incidents = [incident('crowd-surge', { extra: 123 })];
    const plain = cloneSim(base);
    plain.incidents = [incident('crowd-surge')];
    run(marked, 10_000);
    run(plain, 10_000);
    expect(marked.rng).toBe(plain.rng);
    expect(marked.platforms).toEqual(plain.platforms);
  });

  describe('fixing a surge', () => {
    function surged(extra: number, waiting: Record<string, number>) {
      const s = startShiftSim(net, STARTING_NETWORK, 42);
      s.shiftMs = 30_000;
      s.platforms.klcc!.waiting = { ...waiting };
      s.incidents = [incident('crowd-surge', { extra })];
      s.delivered = 11;
      s.stranded = 7;
      return s;
    }

    it('disperses its extras, in ascending destination order, without touching Delivered or Stranded', () => {
      const s = surged(7.9, { [kj[6]!]: 2, [kj[2]!]: 3, [kj[9]!]: 20 });
      const crowd = crowdAt(s, 'klcc');
      expect(advanceFix(net, s, 1)).toBe(true);
      const count = Math.min(Math.floor(7.9), crowd);
      expect(count).toBe(7);
      expect(crowdAt(s, 'klcc')).toBe(crowd - count);
      expect(s.dispersed).toBe(count);
      expect(s.lastDispersal).toEqual({ station: 'klcc', count, incident: 1, atMs: 30_000 });
      expect(s.delivered).toBe(11);
      expect(s.stranded).toBe(7);
      // Ids sort ascending: the first destinations in id order empty first.
      const have: Record<string, number> = { [kj[6]!]: 2, [kj[2]!]: 3, [kj[9]!]: 20 };
      const expected: Record<string, number> = {};
      let remaining = count;
      for (const id of Object.keys(have).sort()) {
        const taken = Math.min(remaining, have[id]!);
        remaining -= taken;
        if (have[id]! > taken) expected[id] = have[id]! - taken;
      }
      const left = s.platforms.klcc!.waiting;
      expect(left).toEqual(expected);
      expect(Object.values(left).every((n) => n > 0)).toBe(true);
      expect(s.incidents).toHaveLength(0);
    });

    it('disperses exactly the crowd when most extras already boarded', () => {
      const s = surged(30, { [kj[6]!]: 2, [kj[2]!]: 3 });
      advanceFix(net, s, 1);
      expect(crowdAt(s, 'klcc')).toBe(0);
      expect(s.platforms.klcc!.waiting).toEqual({});
      expect(s.dispersed).toBe(5);
      expect(s.lastDispersal).toMatchObject({ count: 5 });
      expect(s.stranded).toBe(7);
      expect(s.delivered).toBe(11);
    });

    it('leaves other platforms and other incident kinds alone', () => {
      const s = surged(5, { [kj[6]!]: 9 });
      s.platforms[kj[6]!]!.waiting.klcc = 4;
      const signal = startShiftSim(net, STARTING_NETWORK, 42);
      signal.platforms.klcc!.waiting = { [kj[6]!]: 9 };
      signal.incidents = [incident('signal-fault', { extra: 5 })];
      advanceFix(net, s, 1);
      expect(s.platforms[kj[6]!]!.waiting.klcc).toBe(4);
      for (let i = 0; i < 3; i++) advanceFix(net, signal, 1);
      expect(signal.dispersed).toBe(0);
      expect(signal.lastDispersal).toBeNull();
      expect(crowdAt(signal, 'klcc')).toBe(9);
    });
  });

  it('escalates at the limit through shared closure cleanup', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.incidents = [incident('signal-fault', { startedMs: 0 })];
    s.platforms.klcc!.waiting[kj[4]!] = 5;
    s.platforms[kj[4]!]!.waiting.klcc = 7;
    s.trains[0]!.load.klcc = 3;
    run(s, INCIDENT_LIMIT_MS, quiet);
    expect(s.outOfService.klcc).toBe('signal-fault');
    expect(s.oosOrder).toContain('klcc');
    expect(s.incidents).toHaveLength(0);
    expect(s.stranded).toBe(15);
    expect(crowdAt(s, 'klcc')).toBe(0);
    expect(s.platforms[kj[4]!]!.waiting.klcc).toBeUndefined();
    expect(s.trains[0]!.load.klcc).toBeUndefined();
  });

  it('avoids closed and overlapping stations when spawning', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.outOfService.klcc = 'crowding';
    s.incidents = [incident('signal-fault', { place: 'kampung-baru', startedMs: 100_000 })];
    s.shiftMs = 100_000;
    s.incidentDebt = 20;
    run(s, TICK_MS);
    const occupied = new Set(['klcc', 'kampung-baru', 'dang-wangi']);
    for (const inc of s.incidents.slice(1)) {
      expect(inc.place in s.outOfService).toBe(false);
      expect(inc.stations.some((id) => occupied.has(id))).toBe(false);
      inc.stations.forEach((id) => occupied.add(id));
    }
  });

  it('clones incidents and their station lists independently', () => {
    const s = startShiftSim(net, STARTING_NETWORK, 42);
    s.incidents = [incident('signal-fault')];
    const copy = cloneSim(s);
    copy.incidents[0]!.stations.push('extra');
    copy.incidents[0]!.step++;
    expect(s.incidents[0]!.stations).toHaveLength(3);
    expect(s.incidents[0]!.step).toBe(0);
    expect(copy).toEqual(JSON.parse(JSON.stringify(copy)));
  });
});
