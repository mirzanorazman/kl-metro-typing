import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { startRun, type RunState } from './run';
import { stationAt } from './network';
import { keyLineRun, lineRunRoute, terminiOf } from './lineRun';

const net = buildNetwork(loadNetworkData());

describe('terminiOf', () => {
  it('gives both ends of a line as station ids', () => {
    const [a, b] = terminiOf(net, 'MR');
    expect(a).toBe('kl-sentral');
    expect(b).toBe('titiwangsa');
  });
});

describe('lineRunRoute', () => {
  it('runs in data order from the first terminus', () => {
    const route = lineRunRoute(net, 'MR', 'kl-sentral');
    expect(route[0]).toBe('kl-sentral');
    expect(route[route.length - 1]).toBe('titiwangsa');
  });

  it('reverses from the other terminus', () => {
    const route = lineRunRoute(net, 'MR', 'titiwangsa');
    expect(route[0]).toBe('titiwangsa');
    expect(route[route.length - 1]).toBe('kl-sentral');
  });

  it('covers every station on the line exactly once', () => {
    const route = lineRunRoute(net, 'KJ', 'gombak');
    expect(route).toHaveLength(net.lines.get('KJ')!.stations.length);
    expect(new Set(route).size).toBe(route.length);
  });

  it('returns an empty route for a station that is not a terminus', () => {
    expect(lineRunRoute(net, 'MR', 'imbi')).toEqual([]);
  });
});

/** Types `text` one character at a time, one millisecond apart. */
function type(route: readonly string[], state: RunState, text: string, from = 0): RunState {
  let next = state;
  [...text].forEach((character, i) => {
    next = keyLineRun(net, route, next, character, from + i + 1);
  });
  return next;
}

describe('keyLineRun', () => {
  const route = lineRunRoute(net, 'MR', 'kl-sentral');

  it('moves to the next station on the route once a name is finished', () => {
    const run = type(route, startRun(net, 'kl-sentral', 0), 'KL Sentral');
    expect(run.at).toBe('tun-sambanthan');
    expect(run.typing.target).toBe('Tun Sambanthan');
  });

  it('passes through an interchange without stopping to ask', () => {
    // KL Sentral is served by several lines, so the engine alone would offer a
    // junction here. A Line Run must never prompt.
    const run = type(route, startRun(net, 'kl-sentral', 0), 'KL Sentral');
    expect(run.phase).toBe('typing');
    expect(run.options).toEqual([]);
  });

  it('ends the run when the last station on the route is typed', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(run.phase).toBe('ended');
    expect(run.stationTimes).toHaveLength(route.length);
  });

  it('does not reverse at the terminus the way a free Run would', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(run.at).toBe('titiwangsa');
  });

  it('ignores keys once the run has ended', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(keyLineRun(net, route, run, 'x', 99_999)).toBe(run);
  });
});
