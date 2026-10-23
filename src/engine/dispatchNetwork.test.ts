import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { EXPANSION_OFFERS, SHIFTS_PER_ERA } from './dispatchBalance';
import {
  applyExpansion,
  drawOffers,
  eraFor,
  ERAS,
  expansionCandidates,
  isServed,
  servedDistances,
  servedKey,
  servedLines,
  servedStations,
  STARTING_NETWORK,
  type Expansion,
  type Served,
} from './dispatchNetwork';
import { nextRandom } from './rng';

const net = buildNetwork(loadNetworkData());
const kj = net.lines.get('KJ')!;

function endKey(e: Expansion): string {
  return `${e.line}:${net.order.get(e.line)!.get(e.farEnd) === e.from ? 'from' : 'to'}`;
}

describe('Dispatcher served network', () => {
  it('starts with the central Kelana Jaya stretch, with unique sorted station ids', () => {
    expect(STARTING_NETWORK).toEqual([{ line: 'KJ', from: 4, to: 17 }]);
    expect(kj.stations[4]).toBe('setiawangsa');
    expect(kj.stations[17]).toBe('kerinchi');
    const stations = servedStations(net, STARTING_NETWORK);
    expect(stations).toHaveLength(14);
    expect(stations).toEqual([...stations].sort());
    expect(stations).toEqual(expect.arrayContaining(['masjid-jamek', 'klcc', 'kl-sentral', 'kerinchi']));
    expect(servedLines(STARTING_NETWORK)).toEqual(['KJ']);
    expect(isServed(net, STARTING_NETWORK, 'klcc')).toBe(true);
    expect(isServed(net, STARTING_NETWORK, 'gombak')).toBe(false);
    expect(isServed(net, STARTING_NETWORK, 'missing')).toBe(false);
  });

  it('uses canonical keys and counts shared-track stations once', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 10 }, { line: 'SP', from: 0, to: 10 }];
    expect(servedKey([{ line: 'KJ', from: 4, to: 17 }, served[0]!])).toBe('AG:0-10|KJ:4-17');
    expect(servedStations(net, served)).toHaveLength(11);
    expect(servedLines(served)).toEqual(['AG', 'SP']);
  });

  it('opens eras in historical order', () => {
    const whole = (line: 'AG' | 'MR' | 'KG' | 'PY' | 'SA') => ({
      line, from: net.lines.get(line)!.stations[0], to: net.lines.get(line)!.stations.slice(-1)[0],
    });
    expect(ERAS).toEqual([
      { label: '1990s', opens: [
        { line: 'KJ', from: 'gombak', to: 'kelana-jaya' }, whole('AG'),
        { line: 'SP', from: 'sentul-timur', to: 'sri-petaling' },
      ] },
      { label: '2003', opens: [whole('MR')] },
      { label: '2015–17', opens: [
        { line: 'KJ', from: 'kelana-jaya', to: 'putra-heights' },
        { line: 'SP', from: 'sri-petaling', to: 'putra-heights' }, whole('KG'),
      ] },
      { label: '2022–23', opens: [whole('PY')] },
      { label: 'Latest', opens: [whole('SA')] },
    ]);
    expect(eraFor(0)).toBe(0);
    expect(eraFor(SHIFTS_PER_ERA - 1)).toBe(0);
    expect(eraFor(SHIFTS_PER_ERA)).toBe(1);
    expect(eraFor(99)).toBe(4);
  });

  it.each([0, 4])('keeps every candidate connected in era %i', (era) => {
    const candidates = expansionCandidates(net, STARTING_NETWORK, era);
    expect(candidates.length).toBeGreaterThan(0);
    for (const e of candidates) {
      const served = applyExpansion(STARTING_NETWORK, e);
      const distances = servedDistances(net, served);
      const stations = servedStations(net, served);
      for (const from of stations) {
        expect(distances.get(from)?.size).toBe(stations.length);
        for (const to of stations) expect(Number.isFinite(distances.get(from)?.get(to))).toBe(true);
      }
    }
  });

  it('restricts candidates to opened stretches and unions later openings', () => {
    for (const e of expansionCandidates(net, STARTING_NETWORK, 0)) {
      expect(['KJ', 'AG', 'SP']).toContain(e.line);
      if (e.line === 'KJ') expect(e.to).toBeLessThanOrEqual(kj.stations.indexOf('kelana-jaya'));
    }
    const atOriginalEnd: Served = [{ line: 'KJ', from: 0, to: kj.stations.indexOf('kelana-jaya') }];
    expect(expansionCandidates(net, atOriginalEnd, 0).some((e) => e.line === 'KJ')).toBe(false);
    expect(expansionCandidates(net, atOriginalEnd, 2).some((e) => e.line === 'KJ' && e.to > 23)).toBe(true);
  });

  it('attaches ranges of 2–5 stations, including the anchor for a new line', () => {
    const candidates = expansionCandidates(net, STARTING_NETWORK, 4);
    const originalStations = new Set(servedStations(net, STARTING_NETWORK));
    expect(new Set(candidates.map((e) => `${e.line}:${e.from}-${e.to}`)).size).toBe(candidates.length);
    for (const e of candidates) {
      const line = net.lines.get(e.line)!;
      expect(e.added).toEqual(line.stations.slice(e.from, e.to + 1).filter((id) => !originalStations.has(id)));
      expect(e.added.length).toBeLessThanOrEqual(5);
      if (e.line === 'KJ') {
        expect((e.from < 4 && e.to === 17) || (e.from === 4 && e.to > 17)).toBe(true);
        expect(e.added.length).toBeGreaterThanOrEqual(2);
      } else {
        expect(e.to - e.from + 1).toBeGreaterThanOrEqual(2);
        expect(e.to - e.from + 1).toBeLessThanOrEqual(5);
        const anchor = e.farEnd === line.stations[e.from] ? e.to : e.from;
        expect(originalStations.has(line.stations[anchor]!)).toBe(true);
      }
      expect([line.stations[e.from], line.stations[e.to]]).toContain(e.farEnd);
    }
  });

  it('clips an extension to the opened end when only one station remains', () => {
    const served: Served = [{ line: 'KJ', from: 1, to: 23 }];
    expect(expansionCandidates(net, served, 0).filter((e) => e.line === 'KJ')).toEqual([
      { line: 'KJ', from: 0, to: 23, farEnd: 'gombak', added: ['gombak'] },
    ]);
  });

  it('allows Sri Petaling over served Ampang even with no new stations', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 10 }];
    expect(expansionCandidates(net, served, 0).some((e) => e.line === 'SP' && e.added.length === 0)).toBe(true);
  });

  it('draws seeded offers with distinct line ends and far-end station names', () => {
    const [offers, rng] = drawOffers(net, STARTING_NETWORK, 0, 42);
    expect(drawOffers(net, STARTING_NETWORK, 0, 42)).toEqual([offers, rng]);
    expect(offers).toHaveLength(EXPANSION_OFFERS);
    expect(new Set(offers.map(endKey)).size).toBe(offers.length);
    expect(new Set(offers.map((e) => net.stations.get(e.farEnd)!.name)).size).toBe(offers.length);
    let expectedRng = 42;
    for (let i = expansionCandidates(net, STARTING_NETWORK, 0).length - 1; i > 0; i--) {
      expectedRng = nextRandom(expectedRng)[1];
    }
    expect(rng).toBe(expectedRng);
  });

  it('applies an expansion immutably, preserving one sorted range per line', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 10 }, ...STARTING_NETWORK];
    const expanded = applyExpansion(served, { line: 'AG', from: 0, to: 14, farEnd: 'x', added: [] });
    expect(expanded).toEqual([{ line: 'AG', from: 0, to: 14 }, { line: 'KJ', from: 4, to: 17 }]);
    expect(served[0]).toEqual({ line: 'AG', from: 0, to: 10 });
    expect(applyExpansion(STARTING_NETWORK, { line: 'AG', from: 4, to: 7, farEnd: 'x', added: [] }))
      .toEqual([{ line: 'AG', from: 4, to: 7 }, ...STARTING_NETWORK]);
  });

  it('offers nothing on the full network and leaves the RNG untouched', () => {
    const served: Served = [...net.lines.values()].map((line) => ({ line: line.code, from: 0, to: line.stations.length - 1 }));
    expect(expansionCandidates(net, served, 4)).toEqual([]);
    expect(drawOffers(net, served, 4, 42)).toEqual([[], 42]);
  });

  it('measures rail distances across interchanges and shared track', () => {
    const served: Served = [{ line: 'AG', from: 0, to: 10 }, ...STARTING_NETWORK];
    const distances = servedDistances(net, served);
    expect(distances.get('setiawangsa')!.get('sentul-timur')).toBe(14);
    expect(distances.get('setiawangsa')!.get('setiawangsa')).toBe(0);
    expect(distances.get('setiawangsa')!.has('gombak')).toBe(false);
    expect(servedDistances(net, [...served].reverse())).toBe(distances);
    expect(servedDistances(buildNetwork(loadNetworkData()), served)).not.toBe(distances);
  });

  it('does not use walk links between otherwise disconnected served ranges', () => {
    const served: Served = [{ line: 'KJ', from: 11, to: 11 }, { line: 'MR', from: 7, to: 7 }];
    expect(net.lines.get('MR')!.stations[7]).toBe('bukit-nanas');
    expect(servedDistances(net, served).get('dang-wangi')!.has('bukit-nanas')).toBe(false);
  });
});
