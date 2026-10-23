import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { STARTING_NETWORK, servedDistances } from './dispatchNetwork';
import { INCIDENT_FIRST_MS, INCIDENT_LIMIT_MS, INCIDENT_MAX, STRAIN_HELD_WEIGHT, TICK_MS } from './dispatchBalance';
import { clearSignal, cloneSim, crowdAt, heldStations, heldTrains, startShiftSim, type Incident, type PhaseNow } from './dispatchSim';
import { advanceFix, fixItems, stepWorld, strain } from './dispatchIncidents';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!.stations;
const phase: PhaseNow = { multiplier: 1, flow: 'none', trainFactor: 1, escalation: 1 };
const quiet: PhaseNow = { ...phase, multiplier: 0 };
const index = (id: string) => kj.indexOf(id);

function run(s: ReturnType<typeof startShiftSim>, ms: number, p = phase): void {
  for (let t = 0; t < ms; t += TICK_MS) stepWorld(net, s, p);
}

function incident(kind: Incident['kind'], overrides: Partial<Incident> = {}): Incident {
  return { id: 1, kind, place: 'klcc', stations: kind === 'signal-fault' ? ['klcc', 'kampung-baru', 'dang-wangi'] : kind === 'crowd-surge' ? ['klcc'] : [], line: 'KJ', train: null, startedMs: 0, step: 0, ...overrides };
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
      while (a.incidents.length === 0) stepWorld(net, a, phase);
      while (b.incidents.length === 0) stepWorld(net, b, phase);
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
      { id: 1, line: 'KJ', dir: 1, at: index('kampung-baru'), stage: 'signal', ms: 0, skipTo: null, load: {} },
      { id: 2, line: 'KJ', dir: 1, at: index('klcc'), stage: 'dwell', ms: TICK_MS, skipTo: null, load: {} },
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
    run(base, 20_000);
    run(surged, 20_000);
    expect(crowdAt(surged, 'klcc')).toBeGreaterThanOrEqual(crowdAt(base, 'klcc') * 4 - 1);
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
