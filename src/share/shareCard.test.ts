import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { startCareer, type CareerState } from '../engine/dispatch';
import { servedStations } from '../engine/dispatchNetwork';
import type { Metrics } from '../engine/metrics';
import { buildNetwork } from '../engine/network';
import type { QuickRunState } from '../engine/quickRun';
import { startRun, type RunState } from '../engine/run';
import { networkLayout } from '../geo/networkLayout';
import {
  adventureCard,
  CARD_MAP,
  cardView,
  careerCard,
  formatDuration,
  lineRunCard,
  quickRunCard,
  quickRunSteps,
  routePaths,
  type RouteStep,
} from './shareCard';

const net = buildNetwork(loadNetworkData());
const metrics: Metrics = { wpm: 71.6, accuracy: 0.964, score: 66.5 };
const steps = (ids: string[], line?: LineCode): RouteStep[] => ids.map((id) => ({ id, line }));
const lineOf = (code: LineCode) => net.lines.get(code)!;

function lineRun(code: LineCode, count = lineOf(code).stations.length): RunState {
  const ids = lineOf(code).stations.slice(0, count);
  return {
    ...startRun(net, ids[0]!, 0),
    line: code,
    phase: 'ended',
    stationTimes: ids.map((id) => ({ id, ms: 2_000 })),
  };
}

describe('routePaths', () => {
  it('draws one stroke per Line', () => {
    const paths = routePaths(net, steps(['gombak', 'taman-melati', 'wangsa-maju'], 'KJ'));
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ line: 'KJ', colour: lineOf('KJ').colour });
    expect(paths[0]!.points).toHaveLength(3);
  });

  it('keeps a known Line on a shared stretch', () => {
    const paths = routePaths(net, steps(['sentul-timur', 'sentul', 'titiwangsa'], 'SP'));
    expect(paths.map((p) => p.line)).toEqual(['SP']);
  });

  it('looks ahead on a shared stretch when the Line is not known', () => {
    const paths = routePaths(net, steps(['pudu', 'chan-sow-lin', 'cheras']));
    expect(paths.map((p) => p.line)).toEqual(['SP']);
    expect(paths[0]!.points).toHaveLength(3);
  });

  it('changes colour where the Run changes Line', () => {
    const paths = routePaths(net, steps(['pwtc', 'titiwangsa', 'chow-kit']));
    expect(paths.map((p) => p.line)).toEqual(['AG', 'MR']);
  });

  it('draws a Walk link as its own neutral stroke', () => {
    const paths = routePaths(net, steps(['bandaraya', 'sultan-ismail', 'medan-tuanku', 'chow-kit']));
    expect(paths.map((p) => p.line)).toEqual(['AG', null, 'MR']);
  });

  it('breaks the path at a Jump', () => {
    const paths = routePaths(net, steps(['gombak', 'taman-melati', 'stadium-kajang', 'kajang']));
    expect(paths.map((p) => p.line)).toEqual(['KJ', 'KG']);
  });
});

describe('quickRunSteps', () => {
  it('moves to the next Leg after its Terminus', () => {
    const run = {
      trace: {
        version: 1,
        legs: [
          { line: 'KJ', at: 'wangsa-maju', toward: 'gombak' },
          { line: 'KG', at: 'sungai-jernih', toward: 'kajang' },
        ],
      },
      completedStations: ['wangsa-maju', 'taman-melati', 'gombak', 'sungai-jernih', 'stadium-kajang']
        .map((id) => ({ id, ms: 900 })),
    } as unknown as QuickRunState;

    expect(quickRunSteps(run).map((s) => s.line)).toEqual(['KJ', 'KJ', 'KJ', 'KG', 'KG']);

    const card = quickRunCard(net, run, { metrics, verified: true, newBest: true });
    expect(card.title).toBe('5 stations in 30 s');
    expect(card.subtitle).toBe('Kelana Jaya → Kajang');
    expect(card.lines.map((l) => l.code)).toEqual(['KJ', 'KG']);
    expect(card.badges).toEqual(['Verified', 'New personal best']);
    expect(card.map.route.map((p) => p.line)).toEqual(['KJ', 'KG']);
    expect(card.stats.map((s) => s.value)).toEqual(['72', '96%', '67', '5']);
  });
});

describe('lineRunCard', () => {
  it('shares a completed line end to end', () => {
    const card = lineRunCard(net, lineRun('KJ'), { metrics, verified: true, overallRank: 3, lineRank: 1 });
    expect(card.mode).toBe('LINE RUN');
    expect(card.title).toBe('Gombak → Putra Heights');
    expect(card.subtitle).toBe('Kelana Jaya Line · 37 stations');
    expect(card.badges).toEqual(['Verified', '#3 overall']);
    expect(card.stats.find((s) => s.label === 'Time')?.value).toBe('1:14');
    expect(card.text).toContain('end to end at 72 WPM');
    expect(card.map.start).not.toBeNull();
    expect(card.map.end).not.toBeNull();
  });

  it('shares an early end as the stretch covered, unverified and unranked', () => {
    const card = lineRun('KJ', 5);
    const shared = lineRunCard(net, card, { metrics, verified: false });
    expect(shared.subtitle).toBe('Kelana Jaya Line · 5 of 37 stations');
    expect(shared.badges).toEqual([]);
    expect(shared.text).toContain('5 stations of the Kelana Jaya Line');
  });

  it('shows a line rank when there is no overall one', () => {
    const card = lineRunCard(net, lineRun('MR'), { metrics, verified: true, overallRank: null, lineRank: 2 });
    expect(card.badges).toEqual(['Verified', '#2 on the line']);
  });
});

describe('adventureCard', () => {
  it('counts the stations explored and never claims verification', () => {
    const run: RunState = {
      ...startRun(net, 'pwtc', 0),
      stationTimes: ['pwtc', 'titiwangsa', 'chow-kit'].map((id) => ({ id, ms: 1_500 })),
    };
    const card = adventureCard(net, run, { metrics, unlocked: 87, total: 154 });
    expect(card.title).toBe('3 stations explored');
    expect(card.subtitle).toBe('PWTC to Chow Kit');
    expect(card.lines.map((l) => l.code)).toEqual(['AG', 'MR']);
    expect(card.stats.find((s) => s.label === 'Unlocked')?.value).toBe('87/154');
    expect(card.badges).toEqual([]);
  });
});

describe('careerCard', () => {
  it('draws the Served network and crosses its Out of service Stations', () => {
    const base = startCareer(net, 1);
    const career: CareerState = {
      ...base,
      status: 'ended',
      endReason: 'failed',
      cleared: 4,
      failure: { shift: 5, closures: [{ station: 'masjid-jamek', cause: 'signal-fault' }] },
      sim: { ...base.sim, outOfService: { 'masjid-jamek': 'signal-fault', 'pasar-seni': 'crowding' } },
    } as CareerState;

    const card = careerCard(net, career, { metrics, verified: true, rank: 2 });
    expect(card.title).toBe('4 Shifts cleared');
    expect(card.subtitle).toBe(`${servedStations(net, career.served).length} Stations · fell at Masjid Jamek`);
    expect(card.map.closed).toHaveLength(2);
    expect(card.map.route.map((p) => p.line)).toEqual(['KJ']);
    expect(card.badges).toEqual(['Verified', '#2 on the board']);
  });
});

describe('cardView', () => {
  it('matches the map box shape and contains every point', () => {
    const { geo } = networkLayout();
    const pts = lineOf('PY').stations.map((id) => geo.get(id)!);
    const view = cardView(pts);
    expect(view.w / view.h).toBeCloseTo(CARD_MAP.w / CARD_MAP.h);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(view.x);
      expect(p.x).toBeLessThanOrEqual(view.x + view.w);
      expect(p.y).toBeGreaterThanOrEqual(view.y);
      expect(p.y).toBeLessThanOrEqual(view.y + view.h);
    }
  });
});

describe('formatDuration', () => {
  it('writes minutes and padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(74_000)).toBe('1:14');
    expect(formatDuration(600_400)).toBe('10:00');
  });
});
