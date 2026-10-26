import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { networkLayout } from '../geo/networkLayout';
import { trackLines } from './mapMarks';
import { rangeAdditions, rangeIds, rangeStations, trackPoints } from './trackRanges';

const net = buildNetwork(loadNetworkData());
const { geo: layout } = networkLayout();
const tracks = trackLines(net, layout, 7);
describe('shared served range geometry', () => {
  it('returns inclusive ids and counts a shared interchange once', () => {
    const ag = net.lines.get('AG')!.stations.slice(0, 6);
    const sp = net.lines.get('SP')!.stations.slice(0, 6);
    expect(ag).toEqual(sp);
    const ranges = [{ line: 'AG' as const, from: 0, to: 5 }, { line: 'SP' as const, from: 0, to: 5 }];
    expect(rangeIds(net, ranges[0]!)).toEqual(ag);
    expect(rangeStations(net, ranges).size).toBe(6);
  });

  it('uses full-line lane offsets for a requested subset and preserves reversed order', () => {
    const ids = net.lines.get('SP')!.stations.slice(1, 4);
    const forward = trackPoints(net, layout, tracks, 'SP', ids);
    expect(forward).toEqual(tracks.get('SP')!.slice(1, 4));
    expect(trackPoints(net, layout, tracks, 'SP', [...ids].reverse())).toEqual([...forward].reverse());
  });
});

describe('directed range additions', () => {
  it('includes the shared old endpoint when a range extends lower', () => {
    expect(rangeAdditions(net, [{ line: 'KJ', from: 4, to: 17 }], [{ line: 'KJ', from: 1, to: 17 }]))
      .toEqual([{ line: 'KJ', from: 1, to: 4, reverse: true }]);
  });

  it('includes the shared old endpoint when a range extends upper', () => {
    expect(rangeAdditions(net, [{ line: 'KJ', from: 4, to: 17 }], [{ line: 'KJ', from: 4, to: 20 }]))
      .toEqual([{ line: 'KJ', from: 17, to: 20, reverse: false }]);
  });

  it('reports a newly served line even when its stations are already globally served', () => {
    const before = [{ line: 'AG' as const, from: 0, to: 5 }];
    const after = [...before, { line: 'SP' as const, from: 0, to: 5 }];
    expect(rangeStations(net, before)).toEqual(rangeStations(net, after));
    expect(rangeAdditions(net, before, after)).toEqual([{ line: 'SP', from: 0, to: 5, reverse: false }]);
  });

  it('returns no additions for unchanged ranges', () => {
    const served = [{ line: 'KJ' as const, from: 4, to: 17 }];
    expect(rangeAdditions(net, served, served)).toEqual([]);
  });

  it('reverses a new line when its upper endpoint is served but its lower endpoint is not', () => {
    expect(rangeAdditions(net, [{ line: 'AG', from: 5, to: 5 }], [{ line: 'AG', from: 5, to: 5 }, { line: 'SP', from: 0, to: 5 }]))
      .toEqual([{ line: 'SP', from: 0, to: 5, reverse: true }]);
  });
});
