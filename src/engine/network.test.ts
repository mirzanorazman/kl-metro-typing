import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, linesOf, neighboursOf, stationAt } from './network';

const net = buildNetwork(loadNetworkData());

describe('buildNetwork', () => {
  it('indexes every station by id', () => {
    expect(stationAt(net, 'kl-sentral')?.name).toBe('KL Sentral');
  });
});

describe('linesOf', () => {
  it('reads the lines a station serves from its codes', () => {
    const jamek = stationAt(net, 'masjid-jamek')!;
    expect(linesOf(jamek).sort()).toEqual(['AG', 'KJ', 'SP']);
  });
});

describe('neighboursOf', () => {
  it('gives a mid-line station two rail neighbours on one line', () => {
    const n = neighboursOf(net, 'raja-chulan').filter((x) => x.line === 'MR');
    expect(n.map((x) => x.station).sort()).toEqual(['bukit-bintang', 'bukit-nanas']);
  });

  it('gives a terminus exactly one rail neighbour on that line', () => {
    const n = neighboursOf(net, 'gombak').filter((x) => x.line === 'KJ');
    expect(n).toHaveLength(1);
  });

  it('includes walk links with a null line', () => {
    const walk = neighboursOf(net, 'dang-wangi').filter((x) => x.line === null);
    expect(walk.map((x) => x.station)).toContain('bukit-nanas');
  });
});
