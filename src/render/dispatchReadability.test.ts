import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { servedStations } from '../engine/dispatchNetwork';
import { visibleTargets } from '../engine/dispatchTargets';
import { networkLayout } from '../geo/networkLayout';
import { fullNetworkPeak, measureReadability, sharedSegments } from './dispatchReadability';
import { markScaleFor, trackLines } from './mapMarks';

const net = buildNetwork(loadNetworkData());
const peak = fullNetworkPeak(net);

describe('the full-network peak', () => {
  it('serves every Station and has many Signals waiting', () => {
    expect(servedStations(net, peak.served)).toHaveLength(net.stations.size);
    expect(visibleTargets(net, peak.sim).filter((t) => t.ref.kind === 'signal').length).toBeGreaterThan(20);
  });

  it('finds the shared Ampang/Sri Petaling track, Sentul Timur to Chan Sow Lin', () => {
    const shared = sharedSegments(net);
    expect(shared.size).toBe(10);
    for (const lines of shared.values()) expect(lines.sort()).toEqual(['AG', 'SP']);
  });
});

describe('a readable map at full size', () => {
  for (const viewport of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }]) {
    it(`at ${viewport.w}×${viewport.h}: no chip overlaps, marks at least 6 px, no stacked shared track`, () => {
      const report = measureReadability(net, peak, viewport);
      expect(report.chipOverlaps).toBe(0);
      expect(report.minMarkPx).toBeGreaterThanOrEqual(6);
      expect(report.stackedSharedSegments).toBe(0);
    });
  }
});

describe('the pieces', () => {
  const view = { x: 0, y: 0, w: 1000, h: 1000 };

  it('a mark floor lifts the scale only when marks would draw smaller than it', () => {
    expect(markScaleFor(view)).toBe(1);
    // 1000 px for 1000 units: a plain stop is 8 px across, above the floor.
    expect(markScaleFor(view, { screen: { w: 1000, h: 1000 }, minPx: 6 })).toBe(1);
    // 500 px: it would be 4 px, so the scale grows to make it 6.
    expect(markScaleFor(view, { screen: { w: 500, h: 500 }, minPx: 6 })).toBeCloseTo(1.5);
  });

  it('shared track is drawn on top without lanes, and side by side with them', () => {
    const { geo } = networkLayout();
    const at = (lane: number, line: 'AG' | 'SP', id: string) =>
      trackLines(net, geo, lane).get(line)![net.lines.get(line)!.stations.indexOf(id)]!;
    expect(at(0, 'AG', 'masjid-jamek')).toEqual(at(0, 'SP', 'masjid-jamek'));
    const ag = at(8, 'AG', 'masjid-jamek');
    const sp = at(8, 'SP', 'masjid-jamek');
    expect(Math.hypot(ag.x - sp.x, ag.y - sp.y)).toBeCloseTo(8, 0);
    // Off the shared stretch a Line runs through its Stations.
    expect(at(8, 'AG', 'ampang')).toEqual(geo.get('ampang'));
  });
});
