import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { lineRunRoute, terminiOf } from './lineRun';

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
