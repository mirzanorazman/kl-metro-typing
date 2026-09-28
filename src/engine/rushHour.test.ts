import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork, linesOf, stationAt } from './network';
import {
  CARRIAGE_CAPACITY,
  OVERFLOW_MS,
  QUEUE_CAPACITY,
  SPAWN_FALLOFF_HOPS,
  TICK_MS,
  WALK_PENALTY_MS,
} from './rushBalance';
import {
  abandonRush,
  advanceRush,
  chooseRushDirection,
  deliverableAt,
  enterRushCharacter,
  pauseRush,
  queueCapacity,
  railHops,
  resumeRush,
  rushDayPhase,
  rushGeometry,
  rushMetrics,
  rushSpawnWeights,
  startRush,
  turnRushAround,
  walkRush,
  type Passenger,
  type RushState,
} from './rushHour';

const net = buildNetwork(loadNetworkData());

function typeAll(state: RushState, text: string, now: number, gap = 200): [RushState, number] {
  for (const ch of text) {
    state = enterRushCharacter(net, state, ch, now);
    now += gap;
  }
  return [state, now];
}

/** Types the current Station's name; returns the state and the time after. */
function typeStation(state: RushState, now: number, gap = 200): [RushState, number] {
  return typeAll(state, state.typing.target.slice(state.typing.cursor), now, gap);
}

function passengers(targets: LineCode[], firstId = 1000): Passenger[] {
  return targets.map((target, i) => ({ id: firstId + i, target }));
}

function withQueue(state: RushState, at: string, targets: LineCode[]): RushState {
  return {
    ...state,
    queues: { ...state.queues, [at]: { passengers: passengers(targets), overflowMs: 0 } },
  };
}

/** A running Run with spawning effectively disabled, for isolating mechanics. */
function quiet(state: RushState): RushState {
  return { ...state, spawnDebt: -1e9 };
}

describe('startRush', () => {
  it('starts ready, with a sorted de-duplicated Line set', () => {
    const s = startRush(net, ['SP', 'KJ', 'SP'], 'masjid-jamek', 5);
    expect(s.status).toBe('ready');
    expect(s.lineSet).toEqual(['KJ', 'SP']);
    expect(s.at).toBe('masjid-jamek');
    expect(s.typing.target).toBe('Masjid Jamek');
    expect(s.gameMs).toBe(0);
  });

  it('refuses a start Station off the Line set', () => {
    expect(() => startRush(net, ['KJ'], 'titiwangsa', 1)).toThrow();
  });

  it('refuses an empty Line set', () => {
    expect(() => startRush(net, [], 'gombak', 1)).toThrow();
  });
});

describe('rushDayPhase', () => {
  it('walks the day and escalates later Days', () => {
    expect(rushDayPhase(0)).toMatchObject({ day: 1, name: 'Off-Peak', multiplier: 0.5 });
    expect(rushDayPhase(40_000)).toMatchObject({ day: 1, name: 'Morning Peak', multiplier: 1.6 });
    expect(rushDayPhase(239_999)).toMatchObject({ day: 1, name: 'Late Night' });
    const day2 = rushDayPhase(240_000);
    expect(day2).toMatchObject({ day: 2, name: 'Off-Peak' });
    expect(day2.multiplier).toBeCloseTo(0.5 * 1.3);
    expect(rushDayPhase(20_000).progress).toBeCloseTo(0.5);
  });
});

describe('rushGeometry', () => {
  it('lets a one-Line set target the Lines its Interchanges reach', () => {
    const geo = rushGeometry(net, ['KJ']);
    const targets = new Set(geo.spawns.flatMap((s) => s.targets));
    expect(targets.has('KJ')).toBe(false);
    expect(targets.has('AG')).toBe(true);
    expect(targets.has('MR')).toBe(true);
    for (const spawn of geo.spawns) {
      const served = linesOf(stationAt(net, spawn.station)!);
      for (const t of spawn.targets) expect(served).not.toContain(t);
    }
  });

  it('weights spawn Stations by demand', () => {
    const geo = rushGeometry(net, ['KJ']);
    expect(geo.spawns.find((s) => s.station === 'kl-sentral')?.weight).toBe(3);
    expect(geo.spawns.find((s) => s.station === 'gombak')?.weight).toBe(1);
  });

  it('gives Interchanges the larger Queue Capacity', () => {
    expect(queueCapacity(net, 'gombak')).toBe(QUEUE_CAPACITY);
    expect(queueCapacity(net, 'masjid-jamek')).toBeGreaterThan(QUEUE_CAPACITY);
  });
});

describe('spawns centre on the train', () => {
  it('counts rail hops over the Line set only', () => {
    const hops = railHops(net, ['KJ'], 'gombak');
    expect(hops.get('gombak')).toBe(0);
    expect(hops.get('taman-melati')).toBe(1);
    expect(hops.has('titiwangsa')).toBe(false);
  });

  it('weights a spawn Station by demand, falling off with hops from the train', () => {
    const geo = rushGeometry(net, ['KJ']);
    const hops = railHops(net, ['KJ'], 'gombak');
    const weights = rushSpawnWeights(net, ['KJ'], 'gombak');
    expect(weights).toHaveLength(geo.spawns.length);
    geo.spawns.forEach((p, i) => {
      expect(weights[i]).toBeCloseTo(p.weight * Math.exp(-hops.get(p.station)! / SPAWN_FALLOFF_HOPS));
    });
    const at = (id: string) => weights[geo.spawns.findIndex((p) => p.station === id)]!;
    expect(at('taman-melati')).toBeGreaterThan(at('putra-heights'));
  });

  it('fills Queues near the train, not at the far end of the Line', () => {
    const started = enterRushCharacter(net, startRush(net, ['KJ'], 'gombak', 11), 'g', 1_000);
    const s = advanceRush(net, started, 1_000 + 60_000);
    const hops = railHops(net, ['KJ'], 'gombak');
    let near = 0;
    let far = 0;
    for (const [id, q] of Object.entries(s.queues)) {
      const h = hops.get(id)!;
      if (h <= 5) near += q.passengers.length;
      else if (h >= 20) far += q.passengers.length;
    }
    expect(near).toBeGreaterThan(far);
  });
});

describe('the sim', () => {
  const started = () => enterRushCharacter(net, startRush(net, ['KJ'], 'gombak', 11), 'g', 1_000);

  it('does not run until the first printable key', () => {
    const ready = startRush(net, ['KJ'], 'gombak', 11);
    expect(advanceRush(net, ready, 60_000)).toBe(ready);
    expect(enterRushCharacter(net, ready, 'Shift', 500)).toBe(ready);
    const s = started();
    expect(s.status).toBe('running');
    expect(s.startedAt).toBe(1_000);
    expect(s.typing.cursor).toBe(1);
  });

  it('steps in whole ticks of game time', () => {
    const s = advanceRush(net, started(), 1_000 + 3 * TICK_MS + 50);
    expect(s.gameMs).toBe(3 * TICK_MS);
  });

  it('spawns valid passengers on the Line set and never overfills a Queue', () => {
    const s = advanceRush(net, started(), 1_000 + 30_000);
    const all = Object.entries(s.queues);
    expect(s.spawned).toBeGreaterThan(0);
    for (const [station, queue] of all) {
      expect(linesOf(stationAt(net, station)!)).toContain('KJ');
      expect(queue.passengers.length).toBeLessThanOrEqual(queueCapacity(net, station));
      for (const p of queue.passengers) expect(linesOf(stationAt(net, station)!)).not.toContain(p.target);
    }
  });

  it('is deterministic for a seed', () => {
    const a = advanceRush(net, started(), 60_000);
    const b = advanceRush(net, started(), 60_000);
    expect(a).toEqual(b);
    const other = enterRushCharacter(net, startRush(net, ['KJ'], 'gombak', 12), 'g', 1_000);
    expect(advanceRush(net, other, 60_000).queues).not.toEqual(a.queues);
  });

  it('drops spawns at a full Queue and fills its Overflow ring', () => {
    let s = quiet(withQueue(started(), 'wangsa-maju', Array(QUEUE_CAPACITY).fill('AG')));
    s = advanceRush(net, s, 1_000 + 5_000);
    expect(s.queues['wangsa-maju']!.overflowMs).toBe(5_000);
    expect(s.status).toBe('running');
  });

  it('ends the Run when a ring fills, at a deterministic time', () => {
    let s = quiet(withQueue(started(), 'wangsa-maju', Array(QUEUE_CAPACITY).fill('AG')));
    s = advanceRush(net, s, 1_000 + OVERFLOW_MS + 5_000);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('overflow');
    expect(s.overflowedAt).toBe('wangsa-maju');
    expect(s.endedAt).toBe(1_000 + OVERFLOW_MS);
    expect(s.gameMs).toBe(OVERFLOW_MS);
  });

  it('drains a ring below Capacity at twice the fill rate', () => {
    let s = quiet(withQueue(started(), 'wangsa-maju', ['AG']));
    s = { ...s, queues: { ...s.queues, 'wangsa-maju': { ...s.queues['wangsa-maju']!, overflowMs: 10_000 } } };
    s = advanceRush(net, s, 1_000 + 1_000);
    expect(s.queues['wangsa-maju']!.overflowMs).toBe(8_000);
  });
});

describe('typing and movement', () => {
  const begin = (lineSet: LineCode[], at: string) => quiet(startRush(net, lineSet, at, 3));

  it('arriving delivers matching Load, then boards the Queue first-in-first-out', () => {
    let s = begin(['KJ'], 'gombak');
    s = { ...s, load: passengers(['KJ', 'AG'], 1) };
    s = withQueue(s, 'gombak', ['AG', 'MR', 'SP', 'AG', 'MR', 'SP']);
    const [after] = typeStation(s, 1_000);
    expect(after.delivered).toBe(1);
    expect(after.load.map((p) => p.id)).toEqual([2, 1000, 1001, 1002]);
    expect(after.load).toHaveLength(CARRIAGE_CAPACITY);
    expect(after.queues['gombak']!.passengers.map((p) => p.id)).toEqual([1003, 1004, 1005]);
  });

  it("arriving resets the Station's Overflow ring even when nobody can board", () => {
    let s = begin(['KJ'], 'gombak');
    s = { ...s, load: passengers(Array(CARRIAGE_CAPACITY).fill('AG'), 1) };
    s = withQueue(s, 'gombak', Array(QUEUE_CAPACITY).fill('MR'));
    s = { ...s, queues: { ...s.queues, gombak: { ...s.queues['gombak']!, overflowMs: 10_000 } } };
    const [after] = typeStation(s, 1_000);
    expect(after.queues['gombak']!.passengers).toHaveLength(QUEUE_CAPACITY);
    expect(after.queues['gombak']!.overflowMs).toBe(0);
  });

  it('rolls on when only one Direction exists', () => {
    const [s] = typeStation(begin(['KJ'], 'gombak'), 1_000);
    expect(s.stage).toBe('typing');
    expect(s.at).toBe('taman-melati');
    expect(s.line).toBe('KJ');
  });

  it('offers only Directions on the Line set at a Junction', () => {
    const [s] = typeStation(begin(['KJ'], 'masjid-jamek'), 1_000);
    expect(s.stage).toBe('junction');
    expect(s.options.every((d) => d.line === 'KJ')).toBe(true);
    expect(s.options).toHaveLength(2);
  });

  it('ignores keys at a Junction, and a choice moves the train', () => {
    let [s, now] = typeStation(begin(['KJ'], 'masjid-jamek'), 1_000);
    expect(enterRushCharacter(net, s, 'x', now).keystrokes).toBe(s.keystrokes);
    const dir = s.options[0]!;
    s = chooseRushDirection(net, s, dir, now);
    expect(s.stage).toBe('typing');
    expect(s.at).toBe(dir.next);
    expect(s.arrivedFrom).toBe('masjid-jamek');
  });

  it('refuses a Direction that was not offered', () => {
    const [s, now] = typeStation(begin(['KJ'], 'masjid-jamek'), 1_000);
    expect(chooseRushDirection(net, s, { line: 'AG', next: 'bandaraya', toward: 'x' }, now)).toBe(s);
  });

  it('turns around mid-Line', () => {
    let [s, now] = typeStation(begin(['KJ'], 'gombak'), 1_000);
    s = turnRushAround(net, s, now);
    expect(s.at).toBe('gombak');
    expect(s.arrivedFrom).toBe('taman-melati');
  });

  it('offers Walk links only within the Line set, and locks typing while walking', () => {
    const [kjOnly] = typeStation(begin(['KJ'], 'kl-sentral'), 1_000);
    expect(kjOnly.walks).toEqual([]);

    let [s, now] = typeStation(begin(['KJ', 'KG'], 'kl-sentral'), 1_000);
    expect(s.walks).toEqual(['muzium-negara']);
    s = walkRush(net, s, 'muzium-negara', now);
    expect(s.stage).toBe('walking');
    expect(s.at).toBe('muzium-negara');
    expect(enterRushCharacter(net, s, 'M', now + 1_000).typing.cursor).toBe(0);
    s = advanceRush(net, s, now + WALK_PENALTY_MS + TICK_MS);
    expect(s.stage).toBe('typing');
    expect(enterRushCharacter(net, s, 'M', now + WALK_PENALTY_MS + TICK_MS).typing.cursor).toBe(1);
  });

  it('shows how much Load a Direction would deliver at its next Station', () => {
    let [s] = typeStation(begin(['KJ'], 'masjid-jamek'), 1_000);
    s = { ...s, load: passengers(['KG', 'AG', 'KG']) };
    const toPasarSeni = s.options.find((d) => d.next === 'pasar-seni')!;
    expect(deliverableAt(net, s, toPasarSeni.next)).toBe(2);
  });
});

describe('pause, abandon, metrics', () => {
  const running = () => quiet(enterRushCharacter(net, startRush(net, ['KJ'], 'gombak', 3), 'g', 1_000));

  it('freezes game time while paused', () => {
    let s = pauseRush(net, running(), 2_000);
    expect(s.status).toBe('paused');
    s = advanceRush(net, s, 12_000);
    expect(s.gameMs).toBe(1_000);
    expect(enterRushCharacter(net, s, 'o', 12_000)).toBe(s);
    s = resumeRush(s, 12_000);
    s = advanceRush(net, s, 13_000);
    expect(s.gameMs).toBe(2_000);
  });

  it('abandons a Run', () => {
    const s = abandonRush(net, running(), 5_000);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('abandoned');
    expect(s.endedAt).toBe(5_000);
  });

  it('measures WPM over typing time, excluding pauses', () => {
    let [s, now] = typeAll(running(), 'ombak', 1_200);
    s = pauseRush(net, s, now);
    s = resumeRush(s, now + 60_000);
    const m = rushMetrics(s, now + 60_000);
    expect(m.accuracy).toBe(1);
    // 6 correct chars over ~1.2 s of game time, not 61 s.
    expect(m.wpm).toBeGreaterThan(30);
  });
});
