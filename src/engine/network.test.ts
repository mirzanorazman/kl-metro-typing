import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import {
  buildNetwork,
  linesOf,
  neighboursOf,
  stationAt,
  onwardOptions,
  walkOptions,
} from './network';

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

describe('onwardOptions', () => {
  it('excludes the station just arrived from', () => {
    const opts = onwardOptions(net, 'raja-chulan', 'bukit-bintang');
    expect(opts.map((o) => o.next)).not.toContain('bukit-bintang');
    expect(opts.map((o) => o.next)).toContain('bukit-nanas');
  });

  it('offers both directions when starting a run', () => {
    const opts = onwardOptions(net, 'raja-chulan', null);
    expect(opts.map((o) => o.next).sort()).toEqual(['bukit-bintang', 'bukit-nanas']);
  });

  it('reverses at a terminus rather than returning nothing', () => {
    const line = net.lines.get('MR')!;
    const secondLast = line.stations[line.stations.length - 2]!;
    const opts = onwardOptions(net, 'titiwangsa', secondLast).filter((o) => o.line === 'MR');
    expect(opts.map((o) => o.next)).toEqual([secondLast]);
  });

  it('reverses on a line that ends here while still offering the other lines', () => {
    // Titiwangsa is the Monorail terminus AND an AG/SP/PY interchange.
    const opts = onwardOptions(net, 'titiwangsa', 'chow-kit');
    expect(opts.some((o) => o.line === 'MR' && o.next === 'chow-kit')).toBe(true);
    expect(opts.some((o) => o.line !== 'MR')).toBe(true);
  });

  it('offers both lines out of the Ampang / Sri Petaling trunk split', () => {
    const opts = onwardOptions(net, 'chan-sow-lin', null);
    const codes = new Set(opts.map((o) => o.line));
    expect(codes.has('AG')).toBe(true);
    expect(codes.has('SP')).toBe(true);
  });

  it('labels each option with the terminus it heads toward', () => {
    const opts = onwardOptions(net, 'raja-chulan', 'bukit-bintang');
    expect(opts[0]!.toward).toBeTruthy();
  });
});

describe('walkOptions', () => {
  it('lists walk transfers separately from rail directions', () => {
    expect(walkOptions(net, 'dang-wangi')).toContain('bukit-nanas');
    expect(onwardOptions(net, 'dang-wangi', null).map((o) => o.next)).not.toContain(
      'bukit-nanas',
    );
  });
});
