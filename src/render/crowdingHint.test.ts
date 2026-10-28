import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { OOS_CROWD_MS } from '../engine/dispatchBalance';
import { STARTING_NETWORK, type Served } from '../engine/dispatchNetwork';
import { crowdAt, startShiftSim, type Incident, type Train } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';
import { buildNetwork } from '../engine/network';
import { crowdedStations, declutteredLabels, hintLive, relievingTrains } from './crowdingHint';

describe('the crowding hint rules', () => {
  const net = buildNetwork(loadNetworkData());
  const ag = net.lines.get('AG')!.stations;

  function sim(served: Served = STARTING_NETWORK) {
    return startShiftSim(net, served, 1);
  }
  /** A Train waiting at the Signal before `id`, on `line` heading `dir`. */
  function waiting(n: number, id: string, dir: 1 | -1 = 1, line: LineCode = 'KJ'): Train {
    return { id: n, line, dir, at: net.lines.get(line)!.stations.indexOf(id), stage: 'signal', ms: 0,
      skipTo: null, load: {}, lastExchange: null };
  }
  function crowd(s: ReturnType<typeof sim>, id: string, fullMs = OOS_CROWD_MS / 2) {
    const platform = s.platforms[id]!;
    platform.waiting = { gombak: 60 };
    platform.fullMs = fullMs;
  }
  /** The Trains the hint would name for a crowded KLCC, given these Trains. */
  function relieving(s: ReturnType<typeof sim>) {
    return relievingTrains(net, s, crowdedStations(s, 0), visibleTargets(net, s));
  }

  it('a platform counts as crowded once its countdown reaches the delay', () => {
    const s = sim();
    crowd(s, 'klcc', 4_900);
    expect(crowdedStations(s, 5_000)).toEqual([]);
    s.platforms.klcc!.fullMs = 5_000;
    expect(crowdedStations(s, 5_000)).toEqual([
      { id: 'klcc', share: 5_000 / OOS_CROWD_MS, waiting: crowdAt(s, 'klcc') },
    ]);
    expect(crowdAt(s, 'klcc')).toBe(60);
  });

  it('a platform below 55 is never crowded, even with no delay', () => {
    const s = sim();
    s.platforms.klcc!.waiting = { gombak: 54 };
    s.platforms.klcc!.fullMs = 0;
    expect(crowdedStations(s, 0)).toEqual([]);
  });

  it('a Station Out of service is not crowded', () => {
    const s = sim();
    crowd(s, 'klcc');
    s.outOfService.klcc = 'crowding';
    expect(crowdedStations(s, 0)).toEqual([]);
  });

  it('crowded Stations come sorted by id, their share capped at one', () => {
    const s = sim();
    crowd(s, 'klcc');
    crowd(s, 'bangsar', OOS_CROWD_MS * 2);
    crowd(s, 'damai');
    const crowded = crowdedStations(s, 0);
    expect(crowded.map((c) => c.id)).toEqual(['bangsar', 'damai', 'klcc']);
    expect(crowded[0]!.share).toBe(1);
  });

  it('a Train Held up to three blocks before a crowded Station relieves it', () => {
    const s = sim();
    crowd(s, 'klcc');
    s.trains = [
      waiting(1, 'ampang-park'), waiting(2, 'klcc'), waiting(3, 'damai'), waiting(4, 'dato-keramat'),
      waiting(5, 'jelatek'), waiting(6, 'kampung-baru'),
    ];
    expect(relieving(s)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('a Train heading the other way toward the Station also relieves it', () => {
    const s = sim();
    crowd(s, 'klcc');
    s.trains = [waiting(1, 'dang-wangi', -1), waiting(2, 'pasar-seni', -1)];
    expect(relieving(s)).toEqual(new Set([1]));
  });

  it('a closed Station in between still counts as one of the three blocks', () => {
    const s = sim();
    crowd(s, 'klcc');
    s.outOfService['ampang-park'] = 'crowding';
    s.trains = [waiting(1, 'dato-keramat'), waiting(2, 'jelatek')];
    expect(relieving(s)).toEqual(new Set([1]));
  });

  it('a Train that must reverse first does not count', () => {
    const s = sim();
    crowd(s, 'klcc');
    s.trains = [waiting(1, 'kerinchi'), waiting(2, 'setiawangsa', -1)];
    expect(relieving(s)).toEqual(new Set());
  });

  it('only Signal Targets count: a fix-held Train and a skip Target do not add Trains', () => {
    const s = sim();
    crowd(s, 'klcc');
    // Train 1 is late, so it also has a Skip Target.
    s.shiftMs = 600_000;
    s.trains = [waiting(1, 'damai'), waiting(2, 'ampang-park')];
    s.platforms['ampang-park']!.lastCall['KJ:1'] = 590_000;
    const targets = visibleTargets(net, s);
    expect(targets.filter((t) => t.ref.kind === 'skip').length).toBeGreaterThan(0);
    expect(relievingTrains(net, s, crowdedStations(s, 0), targets)).toEqual(new Set([1, 2]));
    // A signal fault holds Train 2 at its Signal: it has no Target at all.
    const fault: Incident = { id: 1, kind: 'signal-fault', place: 'ampang-park',
      stations: ['ampang-park', 'klcc'], line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0 };
    s.incidents = [fault];
    const held = visibleTargets(net, s);
    expect(held.some((t) => t.ref.kind === 'signal' && t.ref.train === 2)).toBe(false);
    expect(relievingTrains(net, s, crowdedStations(s, 0), held).has(2)).toBe(false);
  });

  it('an Interchange counts Trains only on Lines that serve it', () => {
    const train = waiting(1, 'sultan-ismail', 1, 'AG');
    expect(ag.indexOf('masjid-jamek') - train.at).toBe(2);
    const reach = (agTo: number) => {
      const s = sim([{ line: 'AG', from: 0, to: agTo }, { line: 'KJ', from: 4, to: 17 }]);
      crowd(s, 'masjid-jamek');
      s.trains = [train, waiting(2, 'pasar-seni', -1)];
      return relieving(s);
    };
    expect(reach(8)).toEqual(new Set([1, 2]));
    expect(reach(5)).toEqual(new Set([2]));
  });

  it('the hint is live only while a Shift is ready, running or paused, outside the lesson', () => {
    expect(hintLive('running', false)).toBe(true);
    expect(hintLive('paused', false)).toBe(true);
    expect(hintLive('ready', false)).toBe(true);
    expect(hintLive('between', false)).toBe(false);
    expect(hintLive('ended', false)).toBe(false);
    expect(hintLive('running', true)).toBe(false);
  });

  it('decluttered labels keep Held Trains’ Stations, Incident places and ringed Stations only', () => {
    const s = sim();
    s.trains = [waiting(1, 'damai')];
    s.incidents = [{ id: 1, kind: 'train-fault', place: 'bangsar', stations: [], line: 'KJ', train: 2,
      startedMs: 0, step: 0, extra: 0 }];
    expect(declutteredLabels(net, s, visibleTargets(net, s), ['klcc']))
      .toEqual(new Set(['damai', 'bangsar', 'klcc']));
  });
});
