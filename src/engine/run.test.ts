import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, stationAt } from './network';
import { startRun, keyRun, chooseDirection, runMetrics } from './run';

const net = buildNetwork(loadNetworkData());

/** Types the current station's full name, one key at a time. */
function typeStation(state: ReturnType<typeof startRun>, at = 0) {
  const name = stationAt(net, state.at)!.name;
  return [...name].reduce((s, k, i) => keyRun(net, s, k, at + i), state);
}

describe('startRun', () => {
  it('starts by typing the chosen station name', () => {
    const s = startRun(net, 'raja-chulan', 0);
    expect(s.phase).toBe('typing');
    expect(s.typing.target).toBe('Raja Chulan');
    expect(s.visited).toEqual([]);
  });
});

describe('keyRun', () => {
  it('marks the station visited once its name is complete', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.visited).toContain('raja-chulan');
  });

  it('pauses for a junction choice when several directions exist', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.phase).toBe('junction');
    expect(s.options.length).toBeGreaterThan(1);
  });

  it('records how long the station took', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.stationTimes).toHaveLength(1);
    expect(s.stationTimes[0]!.id).toBe('raja-chulan');
  });

  it('counts keystrokes and errors across the run', () => {
    let s = startRun(net, 'imbi', 0);
    s = keyRun(net, s, 'z', 1);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(1);
  });
});

describe('chooseDirection', () => {
  it('moves to the chosen station and begins typing it', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    const dir = junction.options.find((o) => o.next === 'bukit-nanas')!;
    const s = chooseDirection(net, junction, dir, 100);
    expect(s.at).toBe('bukit-nanas');
    expect(s.arrivedFrom).toBe('raja-chulan');
    expect(s.line).toBe('MR');
    expect(s.phase).toBe('typing');
    expect(s.typing.target).toBe('Bukit Nanas');
    expect(s.typing.cursor).toBe(0);
  });

  it('auto-advances without a junction when only one direction remains', () => {
    const start = typeStation(startRun(net, 'raja-chulan', 0));
    const dir = start.options.find((o) => o.next === 'bukit-nanas')!;
    let s = chooseDirection(net, start, dir, 100);
    s = typeStation(s, 100);
    // Bukit Nanas continues on the Monorail with no branch, so it keeps going.
    expect(s.phase).toBe('typing');
    expect(s.at).toBe('medan-tuanku');
  });
});

describe('runMetrics', () => {
  it('reports metrics for the whole run', () => {
    const s = typeStation(startRun(net, 'imbi', 0));
    const m = runMetrics(s, 60_000);
    expect(m.accuracy).toBe(1);
    expect(m.wpm).toBeGreaterThan(0);
  });
});
