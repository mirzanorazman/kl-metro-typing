import { describe, expect, it } from 'vitest';
import type { LineCode } from '../data/types';
import type { CareerState } from '../engine/dispatch';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { servedStations } from '../engine/dispatchNetwork';
import { visibleTargets } from '../engine/dispatchTargets';
import { networkLayout } from '../geo/networkLayout';
import { chipBox, hits, layoutChips, overlayFrame, type ChipWant } from './dispatchLayout';
import {
  dispatchPanels, fullNetworkPeak, measureReadability, readabilityDetail, sharedSegments,
} from './dispatchReadability';
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

const idOf = (name: string) => [...net.stations.values()].find((s) => s.name === name)!.id;

/**
 * The Career with Crowd surges added until `cards` Incidents are listed, at
 * central Stations still in service: a taller Incidents panel, and more fix
 * chips in the crowded centre.
 */
function withCards(career: CareerState, cards: number): CareerState {
  const sim = { ...career.sim, incidents: [...career.sim.incidents] };
  const listed = () => sim.incidents.filter((inc) => !sim.outOfService[inc.place]).length;
  const places: Array<[string, LineCode]> = [['Masjid Jamek', 'AG'], ['Hang Tuah', 'AG'], ['Pasar Seni', 'KJ'],
    ['Ampang Park', 'KJ'], ['Bukit Nanas', 'MR'], ['Sentul', 'AG'], ['Maluri', 'KG'], ['Cochrane', 'KG'], ['Pudu', 'AG'],
    ['Plaza Rakyat', 'AG']];
  let id = 1_000;
  for (const [name, line] of places) {
    if (listed() >= cards) break;
    const place = idOf(name);
    if (sim.outOfService[place] || sim.incidents.some((inc) => inc.place === place)) continue;
    sim.incidents.push({ id: id++, kind: 'crowd-surge', place, stations: [place], line, train: null,
      startedMs: sim.shiftMs, step: 0, extra: 0 });
  }
  expect(listed()).toBe(cards);
  return { ...career, sim };
}

// The default peak; a longer one with more held; a heavier peak; and that
// peak with three and four Incidents listed, whose Incidents panel is taller.
const heavy = fullNetworkPeak(net, 2, 90_000, 40_000);
const peaks = [
  { name: 'seed 7, 60 s + 20 s', career: peak },
  { name: 'seed 3, 60 s + 30 s', career: fullNetworkPeak(net, 3, 60_000, 30_000) },
  { name: 'seed 2, 90 s + 40 s', career: heavy },
  { name: 'seed 2, 90 s + 40 s, 3 Incidents', career: withCards(heavy, 3) },
  { name: 'seed 2, 90 s + 40 s, 4 Incidents', career: withCards(heavy, 4) },
];

describe('a readable map at full size', () => {
  for (const { name, career } of peaks) {
    for (const viewport of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }]) {
      it(`${name}, at ${viewport.w}×${viewport.h}: no chip overlaps or hidden chips, marks at least 6 px, no stacked shared track`, () => {
        const report = measureReadability(net, career, viewport);
        const detail = readabilityDetail(net, career, viewport);
        expect({ ...report, chipHidden: detail.chipHidden, chipOnChip: detail.chipOnChip })
          .toMatchObject({ chipOverlaps: 0, chipHidden: 0, chipOnChip: 0, stackedSharedSegments: 0 });
        expect(report.minMarkPx).toBeGreaterThanOrEqual(6);
      });
    }
  }
});

describe('panels over the map', () => {
  it('the Incidents panel grows with its cards', () => {
    const viewport = { w: 1024, h: 768 };
    const calm = { ...peak, sim: { ...peak.sim, incidents: [] } };
    const [, side] = dispatchPanels(net, calm, viewport);
    const [, busy] = dispatchPanels(net, peaks[3]!.career, viewport);
    expect(busy!.h).toBeGreaterThan(side!.h);
    expect(busy!.y + busy!.h).toBeLessThanOrEqual(viewport.h - 256);
  });

  it('the frame is the whole letterboxed screen in layout units, with each panel in it', () => {
    // A 200×100 viewBox on a 400×400 screen: 2 px a unit, and 100 more units
    // of map show above and below it.
    const frame = overlayFrame({ x: 0, y: 0, w: 200, h: 100 }, { w: 400, h: 400 },
      [{ x: 300, y: 0, w: 100, h: 40 }], 0)!;
    expect(frame.view).toEqual({ x0: 0, y0: -50, x1: 200, y1: 150 });
    expect(frame.panels).toEqual([{ x0: 150, y0: -50, x1: 200, y1: -30 }]);
  });

  it('a chip whose usual spot is under a panel, or off the screen, is placed clear of both', () => {
    const want: ChipWant = {
      key: 'a', ref: { kind: 'signal', train: 1 }, text: 'Masjid Jamek', kind: 'signal',
      from: { x: 90, y: 10 }, side: { x: 1, y: 0 },
    };
    const free = layoutChips([want], 1, 13)[0]!;
    // A panel over the spot it takes on an empty map, and the screen's edge
    // just past its right side.
    const panel = chipBox(free);
    const frame = { view: { x0: -400, y0: -400, x1: 160, y1: 400 }, panels: [panel] };
    const chip = layoutChips([want], 1, 13, [], frame)[0]!;
    const box = chipBox(chip);
    expect(hits(box, panel)).toBe(false);
    expect(box.x1).toBeLessThanOrEqual(160);
  });
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
