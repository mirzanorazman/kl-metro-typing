import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode, Point } from '../data/types';
import { buildNetwork } from '../engine/network';
import { easeInOut, type Layout } from '../geo/layout';
import { networkLayout } from '../geo/networkLayout';
import { timeToReach } from './entrance';
import { trackLines } from './mapMarks';
import type { TrackReveal } from './trackReveal';
import { REVEAL_EASE, trackRevealTiming } from './trackReveal';

const net = buildNetwork(loadNetworkData());
const { geo } = networkLayout();
const fullTracks = trackLines(net, geo, 7);

function point(x: number, y = 0) { return { x, y }; }

/** When the reveal's stroke has covered `progress` of its path, as a fraction of the draw. */
const reach = (progress: number) => timeToReach(progress, REVEAL_EASE);

function layoutFor(line: 'KJ' | 'KG', positions: readonly { x: number; y: number }[]): Layout {
  return new Map(net.lines.get(line)!.stations.map((id, index) => [id, positions[index - 4] ?? point(index)]));
}

describe('partial track reveal timing', () => {
  it('times stations by cumulative path distance rather than station index', () => {
    const ids = net.lines.get('KJ')!.stations.slice(4, 7);
    const layout = layoutFor('KJ', [point(0), point(1), point(10)]);
    const reveal: TrackReveal = {
      id: 1, before: [], stations: new Set(ids.slice(1)), duration: 800,
      segments: [{ line: 'KJ', from: 4, to: 6, reverse: false }],
    };

    const timing = trackRevealTiming(net, layout, null, reveal);
    const draw = 480;
    expect(timing.draw).toBe(draw);
    expect(timing.total).toBe(800);
    expect(timing.station.get(ids[0]!)).toBeUndefined();
    expect(timing.station.get(ids[1]!)).toBeCloseTo(reach(1 / 10) * draw);
    expect(timing.station.get(ids[2]!)).toBeCloseTo(reach(1) * draw);
  });

  it('follows reversed travel order and gives the shared anchor no pop delay', () => {
    const ids = net.lines.get('KJ')!.stations.slice(4, 7);
    const layout = layoutFor('KJ', [point(0), point(1), point(10)]);
    const reveal: TrackReveal = {
      id: 2, before: [{ line: 'KJ', from: 4, to: 6 }], stations: new Set(ids.slice(0, 2)), duration: 1000,
      segments: [{ line: 'KJ', from: 4, to: 6, reverse: true }],
    };

    const timing = trackRevealTiming(net, layout, null, reveal);
    const draw = 680;
    expect(timing.station.get(ids[2]!)).toBeUndefined();
    expect(timing.station.get(ids[1]!)).toBeCloseTo(reach(9 / 10) * draw);
    expect(timing.station.get(ids[0]!)).toBeCloseTo(reach(1) * draw);
  });

  it('uses the earliest arrival for an interchange reached by concurrent segments', () => {
    const interchange = 'masjid-jamek';
    const kj = net.lines.get('KJ')!.stations;
    const ag = net.lines.get('AG')!.stations;
    const kjAt = kj.indexOf(interchange);
    const agAt = ag.indexOf(interchange);
    const positions = (line: 'KJ' | 'AG', at: number, prior: number, target: number, next: number) => {
      const points = net.lines.get(line)!.stations.map((_, i) => point(1000 + i));
      points[at - 1] = point(prior);
      points[at] = point(target);
      points[at + 1] = point(next);
      return points;
    };
    const tracks = new Map<LineCode, Point[]>([
      ['KJ', positions('KJ', kjAt, 0, 10, 20)],
      ['AG', positions('AG', agAt, 11, 1, 0)],
    ]);
    const layout = new Map([...kj, ...ag].map((id) => [id, point(0)]));
    const reveal: TrackReveal = {
      id: 3, before: [], stations: new Set([interchange]), duration: 800,
      segments: [
        { line: 'KJ', from: kjAt - 1, to: kjAt + 1, reverse: false },
        { line: 'AG', from: agAt - 1, to: agAt + 1, reverse: true },
      ],
    };

    const timing = trackRevealTiming(net, layout, tracks, reveal);
    expect(timing.station.get(interchange)).toBeCloseTo(Math.min(reach(1 / 2), reach(1 / 11)) * 480);
  });

  it('keeps zero-length paths finite and reserves the final 320ms in both reveal windows', () => {
    const ids = net.lines.get('KJ')!.stations.slice(4, 7);
    const layout = layoutFor('KJ', [point(5), point(5), point(5)]);
    const forDuration = (duration: number): TrackReveal => ({
      id: duration, before: [], stations: new Set(ids), duration,
      segments: [{ line: 'KJ', from: 4, to: 6, reverse: false }],
    });

    const expansion = trackRevealTiming(net, layout, null, forDuration(800));
    const entry = trackRevealTiming(net, layout, null, forDuration(1000));
    for (const [timing, duration] of [[expansion, 800], [entry, 1000]] as const) {
      expect(timing.draw).toBe(duration - 320);
      expect(timing.total).toBe(duration);
      expect([...timing.station.values()].every(Number.isFinite)).toBe(true);
      expect(Math.max(...timing.station.values()) + 320).toBeLessThanOrEqual(duration);
    }
    expect([...expansion.station.values()].every((delay) => Math.abs(delay) < 0.001)).toBe(true);
  });

  it('uses supplied full-lane offsets when timing a segment subset', () => {
    const ids = net.lines.get('KJ')!.stations.slice(4, 7);
    const customTracks = new Map(fullTracks);
    customTracks.set('KJ', net.lines.get('KJ')!.stations.map((_, index) => point(index === 4 ? 0 : index === 5 ? 1 : index === 6 ? 10 : 1000 + index)));
    const reveal: TrackReveal = {
      id: 4, before: [], stations: new Set(ids.slice(1)), duration: 800,
      segments: [{ line: 'KJ', from: 4, to: 6, reverse: false }],
    };
    const timing = trackRevealTiming(net, geo, customTracks, reveal);
    expect(timing.station.get(ids[1]!)).toBeCloseTo(reach(1 / 10) * 480);
    expect(timing.station.get(ids[2]!)).toBeCloseTo(480);
  });
});

describe('the reveal curve', () => {
  it('draws at a steady pace instead of flashing most of the line in at once', () => {
    // The home map's curve had 55 % of a lone line out by 15 % of its time.
    expect(reach(0.25)).toBeGreaterThanOrEqual(0.2);
    expect(reach(0.75)).toBeLessThanOrEqual(0.8);
  });

  it("keeps pace with the camera's ease, so an Expansion's draw and refit move as one", () => {
    for (let progress = 0; progress <= 1.0001; progress += 0.05) {
      expect(Math.abs(easeInOut(reach(progress)) - progress)).toBeLessThan(0.01);
    }
  });

  it('publishes the curve in the form CSS wants', () => {
    expect(REVEAL_EASE.css).toBe(`cubic-bezier(${REVEAL_EASE.control.join(', ')})`);
  });
});
