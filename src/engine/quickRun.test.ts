import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { NetworkData } from '../data/types';
import { computeMetrics } from './metrics';
import { buildNetwork, type NetworkIndex } from './network';
import {
  QUICK_LEG_TRACE_VERSION,
  QUICK_RUN_MIN_ADVANCES,
  QUICK_RUN_MS,
  advanceQuickRun,
  eligibleQuickLegs,
  enterQuickCharacter,
  interruptQuickRun,
  isEligibleQuickLeg,
  prepareQuickRun,
  quickRunAt,
  quickRunMetrics,
  quickRunToward,
  type QuickLeg,
} from './quickRun';

function advancesToTerminus(net: NetworkIndex, leg: QuickLeg): number {
  const stations = net.lines.get(leg.line)!.stations;
  return Math.abs(stations.indexOf(leg.at) - stations.indexOf(leg.toward));
}

function network() {
  return buildNetwork(loadNetworkData());
}

function typeCurrent(state: ReturnType<typeof prepareQuickRun>, now: number) {
  return [...state.typing.target].reduce(
    (next, key) => enterQuickCharacter(network(), next, key, now),
    state,
  );
}

function twoStationNetwork() {
  const data: NetworkData = {
    lines: [
      {
        code: 'MR',
        name: 'Tiny Line',
        colour: '#000000',
        termini: ['Alpha', 'Beta'],
        stations: ['alpha', 'beta'],
        schematic: { start: { x: 0, y: 0 }, segments: [['E', 1]] },
      },
    ],
    stations: [
      { id: 'alpha', name: 'Alpha', codes: { MR: 'MR1' }, demand: 1, geo: { lat: 0, lng: 0 } },
      { id: 'beta', name: 'Beta', codes: { MR: 'MR2' }, demand: 1, geo: { lat: 0, lng: 1 } },
    ],
    links: [],
  };
  return buildNetwork(data);
}

function fiveStationNetwork() {
  const ids = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
  const data: NetworkData = {
    lines: [{
      code: 'MR',
      name: 'Boundary Line',
      colour: '#000000',
      termini: ['Alpha', 'Echo'],
      stations: ids,
      schematic: { start: { x: 0, y: 0 }, segments: [['E', 4]] },
    }],
    stations: ids.map((id, index) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      codes: { MR: `MR${index + 1}` },
      demand: 1,
      geo: { lat: 0, lng: index },
    })),
    links: [],
  };
  return buildNetwork(data);
}

describe('prepareQuickRun', () => {
  it('uses a 30-second duration and a four-advance minimum', () => {
    expect(QUICK_RUN_MS).toBe(30_000);
    expect(QUICK_RUN_MIN_ADVANCES).toBe(4);
    expect(QUICK_LEG_TRACE_VERSION).toBe(1);
  });

  it('enumerates only legs at least four advances from their terminus', () => {
    const net = fiveStationNetwork();

    expect(eligibleQuickLegs(net, 'MR', 'echo')).toEqual([
      { line: 'MR', at: 'alpha', toward: 'echo' },
    ]);
    expect(eligibleQuickLegs(net, 'MR')).toEqual([
      { line: 'MR', at: 'alpha', toward: 'echo' },
      { line: 'MR', at: 'echo', toward: 'alpha' },
    ]);
    expect(eligibleQuickLegs(net, 'MR', 'charlie')).toEqual([]);
  });

  it('recognizes only valid legs with the minimum distance', () => {
    const net = fiveStationNetwork();

    expect(isEligibleQuickLeg(net, { line: 'MR', at: 'alpha', toward: 'echo' })).toBe(true);
    expect(isEligibleQuickLeg(net, { line: 'MR', at: 'bravo', toward: 'echo' })).toBe(false);
    expect(isEligibleQuickLeg(net, { line: 'MR', at: 'outside', toward: 'echo' })).toBe(false);
    expect(isEligibleQuickLeg(net, { line: 'MR', at: 'alpha', toward: 'charlie' })).toBe(false);
    expect(isEligibleQuickLeg(net, { line: 'KG', at: 'alpha', toward: 'echo' })).toBe(false);
  });

  it('prepares only starts at least four advances from either selected terminus', () => {
    const net = network();
    for (const toward of ['kl-sentral', 'titiwangsa']) {
      for (let index = 0; index <= 100; index += 1) {
        const state = prepareQuickRun(net, 'MR', toward, null, () => index / 100);
        expect(advancesToTerminus(net, { line: state.line, at: state.at, toward })).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps the active first leg as the sole trace entry', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const firstLeg = { line: 'MR', at: 'kl-sentral', toward: 'titiwangsa' };

    expect(state.activeLeg).toEqual(firstLeg);
    expect(state.trace).toEqual({ version: 1, legs: [firstLeg] });
  });

  it('starts a Monorail run at KL Sentral when choosing toward Titiwangsa', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);

    expect(state.status).toBe('ready');
    expect(state.at).toBe('kl-sentral');
    expect(state.typing.target).toBe('KL Sentral');
    expect(state.startedAt).toBeNull();
    expect(state.stationStartedAt).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.endedAt).toBeNull();
  });

  it('never chooses the destination terminus as the starting station', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0.999);

    expect(state.at).not.toBe('titiwangsa');
  });

  it('excludes the previous starting station when alternatives exist', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', 'kl-sentral', () => 0);

    expect(state.at).toBe('tun-sambanthan');
  });

  it('rejects a non-terminus destination', () => {
    expect(() => prepareQuickRun(network(), 'MR', 'imbi', null, () => 0)).toThrow(
      'Quick Run destination must be a terminus',
    );
  });

  it('rejects a missing or invalid Line with the valid-Line error', () => {
    expect(() => prepareQuickRun(network(), 'invalid' as never, 'titiwangsa', null, () => 0)).toThrow(
      'Quick Run needs a valid Line',
    );
  });

  it('allows the only eligible start even when it matches the previous start', () => {
    const state = prepareQuickRun(fiveStationNetwork(), 'MR', 'echo', 'alpha', () => 0);

    expect(state.at).toBe('alpha');
  });

  it('reports an unavailable line when it has fewer than four advances', () => {
    expect(() => prepareQuickRun(twoStationNetwork(), 'MR', 'beta', null, () => 0)).toThrow(
      /Quick Run unavailable.*four station advances/,
    );
  });

  it('travels toward the first terminus and displays its name', () => {
    const state = prepareQuickRun(network(), 'MR', 'kl-sentral', null, () => 0);

    expect(state.direction).toBe(-1);
    expect(quickRunToward(network(), state)).toBe('KL Sentral');
  });

  it('clamps a random value of exactly one to the final eligible candidate', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 1);

    expect(state.at).toBe('raja-chulan');
  });

  it('clamps negative and non-finite random values to the first eligible candidate', () => {
    expect(prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => -1).at).toBe('kl-sentral');
    expect(prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => Number.NaN).at).toBe('kl-sentral');
  });

  it('returns fresh arrays and typing state for each preparation', () => {
    const net = network();
    const first = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    const second = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);

    expect(second.completedStations).not.toBe(first.completedStations);
    expect(second.typing).not.toBe(first.typing);
    first.completedStations.push({ id: 'kl-sentral', ms: 1 });
    first.typing.cursor = 2;
    expect(second.completedStations).toEqual([]);
    expect(second.typing.cursor).toBe(0);
  });
});

describe('Quick Run transitions', () => {
  it('starts the clock and counts a first wrong printable character', () => {
    const state = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'x', 1000);

    expect(state.status).toBe('running');
    expect(state.startedAt).toBe(1000);
    expect(state.stationStartedAt).toBe(1000);
    expect(state.deadline).toBe(31_000);
    expect(state.errors).toBe(1);
  });

  it('ignores Shift while ready without starting the clock', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);

    expect(enterQuickCharacter(network(), ready, 'Shift', 1000)).toBe(ready);
  });

  it('moves from KL Sentral to Tun Sambanthan toward Titiwangsa after completion', () => {
    const state = typeCurrent(prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 1000);

    expect(state.at).toBe('tun-sambanthan');
    expect(state.arrivedFrom).toBe('kl-sentral');
    expect(state.typing.target).toBe('Tun Sambanthan');
    expect(state.completedStations).toEqual([{ id: 'kl-sentral', ms: 0 }]);
    expect(quickRunToward(network(), state)).toBe('Titiwangsa');
  });

  it('reverses at Titiwangsa and displays KL Sentral as the new destination', () => {
    const state = typeCurrent(prepareQuickRun(network(), 'MR', 'kl-sentral', null, () => 1), 1000);

    expect(state.at).toBe('chow-kit');
    expect(state.arrivedFrom).toBe('titiwangsa');
    expect(quickRunToward(network(), state)).toBe('KL Sentral');
  });

  it('reverses repeatedly at both termini', () => {
    const net = twoStationNetwork();
    const first = quickRunAt(net, 'MR', 'alpha', 'beta')!;
    const second = [...first.typing.target].reduce((s, key) => enterQuickCharacter(net, s, key, 1000), first);
    const third = [...second.typing.target].reduce((s, key) => enterQuickCharacter(net, s, key, 2000), second);
    const fourth = [...third.typing.target].reduce((s, key) => enterQuickCharacter(net, s, key, 3000), third);

    expect([second.at, third.at, fourth.at]).toEqual(['beta', 'alpha', 'beta']);
    expect([quickRunToward(net, second), quickRunToward(net, third), quickRunToward(net, fourth)]).toEqual([
      'Beta',
      'Alpha',
      'Beta',
    ]);
  });

  it('rejects input exactly at the deadline and completes at that deadline', () => {
    const started = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const state = enterQuickCharacter(network(), started, 'L', 31_000);

    expect(state.status).toBe('completed');
    expect(state.endedAt).toBe(31_000);
    expect(state.typing.cursor).toBe(1);
  });

  it('is a no-op before the deadline and completes when advanced at the deadline', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);

    expect(advanceQuickRun(running, 30_999)).toBe(running);
    expect(advanceQuickRun(running, 31_000)).toMatchObject({ status: 'completed', endedAt: 31_000 });
  });

  it('counts correct characters from an incomplete station in metrics', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const partial = enterQuickCharacter(network(), enterQuickCharacter(network(), ready, 'K', 1000), 'L', 1000);

    expect(quickRunMetrics(partial, 2000).wpm).toBeGreaterThan(0);
    expect(partial.completedStations).toEqual([]);
  });

  it('caps running metrics at the deadline even without a tick', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);

    expect(quickRunMetrics(running, 100_000).wpm).toBeCloseTo(computeMetrics(1, 1, 30_000).wpm);
  });

  it('keeps completed metrics fixed to the 30-second run duration', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const completed = advanceQuickRun(running, 31_000);

    expect(quickRunMetrics(completed, 100_000).wpm).toBeCloseTo(computeMetrics(1, 1, 30_000).wpm);
  });

  it('keeps interrupted metrics frozen at the interruption timestamp', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const interrupted = interruptQuickRun(running, 2000);

    expect(quickRunMetrics(interrupted, 100_000).wpm).toBeCloseTo(computeMetrics(1, 1, 1000).wpm);
  });

  it('uses cumulative wrong and correct key totals for accuracy', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const wrong = enterQuickCharacter(network(), ready, 'x', 1000);
    const state = enterQuickCharacter(network(), wrong, 'K', 1000);

    expect(quickRunMetrics(state, 2000).accuracy).toBeCloseTo(0.5);
  });

  it('interrupts a running run before its deadline and remains idempotent', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const interrupted = interruptQuickRun(running, 2000);

    expect(interruptQuickRun(ready, 1000)).toBe(ready);
    expect(interrupted).toMatchObject({ status: 'interrupted', endedAt: 2000 });
    expect(interruptQuickRun(interrupted, 3000)).toBe(interrupted);
  });

  it('ignores input, ticks, and interruption after interruption', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const interrupted = interruptQuickRun(running, 2000);

    expect(enterQuickCharacter(network(), interrupted, 'L', 3000)).toBe(interrupted);
    expect(advanceQuickRun(interrupted, 3000)).toBe(interrupted);
    expect(interruptQuickRun(interrupted, 3000)).toBe(interrupted);
  });

  it('completes instead when interruption is observed after the deadline', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);

    expect(interruptQuickRun(running, 31_000)).toMatchObject({ status: 'completed', endedAt: 31_000 });
  });

  it('ignores input, ticks, and interruption after becoming terminal', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const terminal = advanceQuickRun(running, 31_000);

    expect(enterQuickCharacter(network(), terminal, 'L', 31_001)).toBe(terminal);
    expect(advanceQuickRun(terminal, 31_001)).toBe(terminal);
    expect(interruptQuickRun(terminal, 31_001)).toBe(terminal);
  });

  it('records each station duration from its own start and creates fresh traversal state', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const firstKey = enterQuickCharacter(network(), ready, 'K', 1000);
    const firstComplete = [...firstKey.typing.target.slice(1)].reduce(
      (state, key) => enterQuickCharacter(network(), state, key, 1500),
      firstKey,
    );
    const secondKey = enterQuickCharacter(network(), firstComplete, 'T', 1600);
    const secondComplete = [...secondKey.typing.target.slice(1)].reduce(
      (state, key) => enterQuickCharacter(network(), state, key, 2200),
      secondKey,
    );

    expect(firstComplete.completedStations[0]).toEqual({ id: 'kl-sentral', ms: 500 });
    expect(firstComplete.stationStartedAt).toBe(1500);
    expect(secondComplete.completedStations[1]).toEqual({ id: 'tun-sambanthan', ms: 700 });
    expect(firstComplete.completedStations).not.toBe(ready.completedStations);
    expect(secondComplete.completedStations).not.toBe(firstComplete.completedStations);
    expect(firstComplete.typing).not.toBe(ready.typing);
    expect(secondComplete.typing).not.toBe(firstComplete.typing);
  });

  it('returns zero WPM and score before a run starts', () => {
    const metrics = quickRunMetrics(prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 1000);

    expect(metrics.wpm).toBe(0);
    expect(metrics.score).toBe(0);
  });
});
