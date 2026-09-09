import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { NetworkData } from '../data/types';
import { buildNetwork } from './network';
import {
  advanceQuickRun,
  enterQuickCharacter,
  interruptQuickRun,
  prepareQuickRun,
  quickRunMetrics,
  quickRunToward,
} from './quickRun';

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

describe('prepareQuickRun', () => {
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
    const state = prepareQuickRun(twoStationNetwork(), 'MR', 'beta', 'alpha', () => 0);

    expect(state.at).toBe('alpha');
  });

  it('travels toward the first terminus and displays its name', () => {
    const state = prepareQuickRun(network(), 'MR', 'kl-sentral', null, () => 0);

    expect(state.direction).toBe(-1);
    expect(quickRunToward(network(), state)).toBe('KL Sentral');
  });

  it('clamps a random value of exactly one to the final eligible candidate', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 1);

    expect(state.at).toBe('chow-kit');
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
    expect(state.deadline).toBe(46_000);
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
    const first = prepareQuickRun(net, 'MR', 'beta', null, () => 0);
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
    const state = enterQuickCharacter(network(), started, 'L', 46_000);

    expect(state.status).toBe('completed');
    expect(state.endedAt).toBe(46_000);
    expect(state.typing.cursor).toBe(1);
  });

  it('is a no-op before the deadline and completes when advanced at the deadline', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);

    expect(advanceQuickRun(running, 45_999)).toBe(running);
    expect(advanceQuickRun(running, 46_000)).toMatchObject({ status: 'completed', endedAt: 46_000 });
  });

  it('counts correct characters from an incomplete station in metrics', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const partial = enterQuickCharacter(network(), enterQuickCharacter(network(), ready, 'K', 1000), 'L', 1000);

    expect(quickRunMetrics(partial, 2000).wpm).toBeGreaterThan(0);
    expect(partial.completedStations).toEqual([]);
  });

  it('uses cumulative wrong and correct key totals for accuracy', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const wrong = enterQuickCharacter(network(), ready, 'x', 1000);
    const state = enterQuickCharacter(network(), wrong, 'K', 1000);

    expect(quickRunMetrics(state, 2000).accuracy).toBeCloseTo(0.5);
  });

  it('interrupts a running run before its deadline and remains idempotent', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const interrupted = interruptQuickRun(running, 2000);

    expect(interrupted).toMatchObject({ status: 'interrupted', endedAt: 2000 });
    expect(interruptQuickRun(interrupted, 3000)).toBe(interrupted);
  });

  it('completes instead when interruption is observed after the deadline', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);

    expect(interruptQuickRun(running, 46_000)).toMatchObject({ status: 'completed', endedAt: 46_000 });
  });

  it('ignores input, ticks, and interruption after becoming terminal', () => {
    const running = enterQuickCharacter(network(), prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 'K', 1000);
    const terminal = advanceQuickRun(running, 46_000);

    expect(enterQuickCharacter(network(), terminal, 'L', 46_001)).toBe(terminal);
    expect(advanceQuickRun(terminal, 46_001)).toBe(terminal);
    expect(interruptQuickRun(terminal, 46_001)).toBe(terminal);
  });

  it('records a non-negative station duration and creates fresh traversal state', () => {
    const ready = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);
    const state = typeCurrent(ready, 1000);

    expect(state.completedStations[0]?.ms).toBeGreaterThanOrEqual(0);
    expect(state.completedStations).not.toBe(ready.completedStations);
    expect(state.typing).not.toBe(ready.typing);
  });

  it('returns zero WPM and score before a run starts', () => {
    const metrics = quickRunMetrics(prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0), 1000);

    expect(metrics.wpm).toBe(0);
    expect(metrics.score).toBe(0);
  });
});
