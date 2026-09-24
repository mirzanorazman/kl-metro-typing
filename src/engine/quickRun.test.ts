import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode, NetworkData } from '../data/types';
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
  quickRunMetrics,
  quickRunToward,
  type QuickLeg,
  type QuickRunState,
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

function multiLineNetwork(lengths: [LineCode, number][] = [['MR', 5], ['KG', 6], ['PY', 9]]) {
  const lines: NetworkData['lines'] = lengths.map(([code, length]) => ({
    code,
    name: `${code} Line`,
    colour: '#000000',
    termini: [`${code}0`, `${code}${length - 1}`],
    stations: Array.from({ length }, (_, index) => `${code}${index}`),
    schematic: { start: { x: 0, y: 0 }, segments: [['E', length - 1]] },
  }));
  return buildNetwork({
    lines,
    stations: lines.flatMap((line) => line.stations.map((id, index) => ({
      id, name: id, codes: { [line.code]: id }, demand: 1, geo: { lat: 0, lng: index },
    }))),
    links: [],
  });
}

function typePrompt(net: NetworkIndex, state: QuickRunState, now: number, random = () => 0) {
  return [...state.typing.target.slice(state.typing.cursor)].reduce(
    (next, key) => enterQuickCharacter(net, next, key, now, random), state,
  );
}

function finishLeg(net: NetworkIndex, state: QuickRunState, now: number, random = () => 0) {
  const toward = state.activeLeg.toward;
  const maxAdvances = net.lines.get(state.line)!.stations.length - 1;
  let next = state;
  for (let advances = 0; advances < maxAdvances && next.at !== toward; advances += 1) {
    next = typePrompt(net, next, now, random);
  }
  expect(next.at, `Expected ${state.line} to reach ${toward} within ${maxAdvances} advances`).toBe(toward);
  return typePrompt(net, next, now, random);
}

function sequence(...values: number[]) {
  let index = 0;
  return () => values[index++]!;
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

  it('advances from a starting terminus toward the selected destination', () => {
    const state = typeCurrent(prepareQuickRun(network(), 'MR', 'kl-sentral', null, () => 1), 1000);

    expect(state.at).toBe('chow-kit');
    expect(state.arrivedFrom).toBe('titiwangsa');
    expect(quickRunToward(network(), state)).toBe('KL Sentral');
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

describe('Quick Run Line jumps', () => {
  it('records the completed terminus and immediately activates a different Line without a rail arrival', () => {
    const net = multiLineNetwork();
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    let terminus = ready;
    for (let i = 0; i < 4; i += 1) terminus = typePrompt(net, terminus, 1000);
    const jumped = typePrompt(net, terminus, 1500, sequence(0, 1));

    expect(jumped.completedStations[jumped.completedStations.length - 1]).toEqual({ id: 'MR4', ms: 500 });
    expect(jumped).toMatchObject({
      status: 'running', line: 'KG', at: 'KG5', direction: -1, arrivedFrom: null,
      activeLeg: { line: 'KG', at: 'KG5', toward: 'KG0' },
      jumpRevision: 1, stationStartedAt: 1500,
    });
    expect(jumped.typing).toMatchObject({ target: 'KG5', cursor: 0, done: false });
    expect(quickRunToward(net, jumped)).toBe('KG0');
    expect(jumped.deadline).toBe(31_000);
    expect(ready.jumpRevision).toBe(0);
    expect(terminus.trace.legs).toEqual([ready.activeLeg]);
  });

  it('prefers unused eligible Lines before reusing a Line', () => {
    const net = multiLineNetwork();
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    const second = finishLeg(net, ready, 1000);
    const third = finishLeg(net, second, 2000);
    const fourth = finishLeg(net, third, 3000);

    expect([second.line, third.line, fourth.line]).toEqual(['KG', 'PY', 'MR']);
    expect(fourth.jumpRevision).toBe(3);
    expect(fourth.trace.legs).toEqual([ready.activeLeg, second.activeLeg, third.activeLeg, fourth.activeLeg]);
  });

  it('treats the just-completed terminus as typed when it is also a candidate landing', () => {
    const base = multiLineNetwork([['MR', 5], ['KG', 5]]);
    const net = buildNetwork({
      lines: [...base.lines.values()].map((line) => line.code === 'KG'
        ? { ...line, termini: ['MR4', line.termini[1]], stations: ['MR4', ...line.stations.slice(1)] }
        : line),
      stations: [...base.stations.values()]
        .filter((station) => station.id !== 'KG0')
        .map((station) => station.id === 'MR4'
          ? { ...station, codes: { ...station.codes, KG: 'KG0' } }
          : station),
      links: [],
    });
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    const jumped = finishLeg(net, ready, 1000);
    expect(jumped.activeLeg).toEqual({ line: 'KG', at: 'KG4', toward: 'MR4' });
    expect(quickRunToward(net, jumped)).toBe('MR4');
    expect(jumped.completedStations[jumped.completedStations.length - 1]?.id).toBe('MR4');
  });

  it('prefers an untyped landing on the chosen Line, then permits typed landings when exhausted', () => {
    const net = multiLineNetwork();
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    const second = finishLeg(net, ready, 1000, sequence(0, 0.3));
    expect(second.at).toBe('KG1');
    const third = finishLeg(net, second, 2000);
    const fourth = finishLeg(net, third, 3000, sequence(1, 1));
    expect(fourth.activeLeg).toEqual({ line: 'KG', at: 'KG0', toward: 'KG5' });
    const fifth = finishLeg(net, fourth, 4000, sequence(0, 1));
    expect(fifth.activeLeg).toEqual({ line: 'MR', at: 'MR4', toward: 'MR0' });
  });

  it.each([[0, 'KG'], [0.49, 'KG'], [0.5, 'PY'], [1, 'PY']] as const)(
    'weights Lines equally before legs when random=%s', (lineRandom, expectedLine) => {
      const net = multiLineNetwork();
      expect(eligibleQuickLegs(net, 'KG').length).toBe(4);
      expect(eligibleQuickLegs(net, 'PY').length).toBe(10);
      const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
      const jumped = finishLeg(net, ready, 1000, sequence(lineRandom, 0));
      expect(jumped.line).toBe(expectedLine);
    },
  );

  it('appends only activated legs and does not sample randomness on ordinary station advances', () => {
    const net = multiLineNetwork();
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    let samples = 0;
    const random = () => { samples += 1; return 0; };
    const next = typePrompt(net, ready, 1000, random);
    expect(next.trace).toBe(ready.trace);
    expect(next.jumpRevision).toBe(0);
    expect(samples).toBe(0);
    const jumped = finishLeg(net, next, 2000, random);
    expect(samples).toBe(2);
    expect(jumped.trace.legs).toEqual([ready.activeLeg, jumped.activeLeg]);
    expect(ready.trace.legs).toEqual([ready.activeLeg]);
  });

  it('interrupts with a continuation error when all other Lines are ineligible', () => {
    const net = multiLineNetwork([['MR', 5], ['KG', 4]]);
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    const ended = finishLeg(net, ready, 1000);
    expect(ended).toMatchObject({
      status: 'interrupted', interruptionReason: 'continuation-error', endedAt: 1000,
      line: 'MR', at: 'MR4', jumpRevision: 0,
    });
    expect(ended.completedStations.map(({ id }) => id)).toEqual(['MR0', 'MR1', 'MR2', 'MR3', 'MR4']);
    expect(ended.trace).toBe(ready.trace);
    expect(enterQuickCharacter(net, ended, 'M', 2000)).toBe(ended);
  });

  it.each([31_000, 31_001])('rejects the final terminus character at %s without a jump', (now) => {
    const net = multiLineNetwork();
    let state = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    for (let i = 0; i < 4; i += 1) state = typePrompt(net, state, 1000);
    state = enterQuickCharacter(net, state, 'M', 1000);
    state = enterQuickCharacter(net, state, 'R', 1000);
    const ended = enterQuickCharacter(net, state, '4', now, () => { throw new Error('Unexpected jump'); });
    expect(ended).toMatchObject({ status: 'completed', endedAt: 31_000, jumpRevision: 0 });
    expect(ended.typing).toBe(state.typing);
    expect(ended.completedStations).toBe(state.completedStations);
    expect(ended.trace).toBe(state.trace);
  });

  it('jumps on a final terminus character immediately before the deadline', () => {
    const net = multiLineNetwork();
    let state = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    for (let i = 0; i < 4; i += 1) state = typePrompt(net, state, 1000);
    const jumped = typePrompt(net, state, 30_999);
    expect(jumped).toMatchObject({ status: 'running', line: 'KG', jumpRevision: 1 });
  });

  it('keeps every sampled landing at least four advances from its new terminus', () => {
    const net = multiLineNetwork();
    const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
    for (const lineRandom of [0, 0.5, 1]) {
      for (let i = 0; i <= 20; i += 1) {
        const jumped = finishLeg(net, ready, 1000, sequence(lineRandom, i / 20));
        expect(jumped.line).not.toBe('MR');
        expect(advancesToTerminus(net, jumped.activeLeg)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('reproduces both Line and leg choices from the injected random sequence', () => {
    const net = multiLineNetwork();
    const run = () => {
      const ready = prepareQuickRun(net, 'MR', 'MR4', null, () => 0);
      const random = sequence(0.9, 0.7, 0.1, 0.4);
      return finishLeg(net, finishLeg(net, ready, 1000, random), 2000, random);
    };
    expect(run()).toEqual(run());
    expect(run().trace.legs).toEqual([
      { line: 'MR', at: 'MR0', toward: 'MR4' },
      { line: 'PY', at: 'PY6', toward: 'PY0' },
      { line: 'KG', at: 'KG1', toward: 'KG5' },
    ]);
  });
});
