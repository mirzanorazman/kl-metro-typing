import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { emptyProfile } from './progress';
import { emptyAchievements } from './achievementState';
import { isLongName, type EvalContext } from './achievementDefs';
import {
  backfill, evaluate, localDay, progressOf, recordUnlocks, takeAnnouncements,
} from './achievements';

const net = buildNetwork(loadNetworkData());
const allIds = [...net.stations.keys()];
// Plain Stations: not an Interchange, so other Explorer tiers stay out of the way.
const realIds = allIds.filter((id) => Object.keys(net.stations.get(id)!.codes).length === 1);
const ctxOf = (visited: string[], phone = false): EvalContext => ({ visited, phone });

describe('evaluate', () => {
  it('awards Bronze when 25 Stations are Unlocked', () => {
    const { earned } = evaluate(net, emptyAchievements(), ctxOf(realIds.slice(0, 25)), 1000);
    expect(earned).toContainEqual({ id: 'explorer.unlocked', award: 'bronze', at: 1000 });
  });

  it('announces only the highest tier crossed at once', () => {
    const { state, earned } = evaluate(net, emptyAchievements(), ctxOf(realIds.slice(0, 75)), 2000);
    const unlocked = earned.filter((e) => e.id === 'explorer.unlocked');
    expect(unlocked).toEqual([{ id: 'explorer.unlocked', award: 'silver', at: 2000 }]);
    expect(state.unannounced.filter((e) => e.id === 'explorer.unlocked')).toHaveLength(1);
    expect(state.earned['explorer.unlocked']!.award).toBe('silver');
    expect(state.earned['explorer.unlocked']!.at).toEqual({ bronze: 2000, silver: 2000 });
  });

  it('does not award the same tier twice', () => {
    const ctx = ctxOf(realIds.slice(0, 25));
    const first = evaluate(net, emptyAchievements(), ctx, 1000);
    const second = evaluate(net, first.state, ctx, 2000);
    expect(second.earned).toEqual([]);
    expect(second.state.unannounced).toEqual(first.state.unannounced);
  });

  it('replaces a pending lower tier with the upgrade instead of adding a second row', () => {
    const first = evaluate(net, emptyAchievements(), ctxOf(realIds.slice(0, 25)), 1000);
    const second = evaluate(net, first.state, ctxOf(realIds.slice(0, 75)), 2000);
    expect(second.state.unannounced.filter((e) => e.id === 'explorer.unlocked'))
      .toEqual([{ id: 'explorer.unlocked', award: 'silver', at: 2000 }]);
    expect(second.earned).toContainEqual({ id: 'explorer.unlocked', award: 'silver', at: 2000 });
  });

  it('keeps the time each tier was reached across evaluations', () => {
    const first = evaluate(net, emptyAchievements(), ctxOf(realIds.slice(0, 25)), 1000);
    const second = evaluate(net, first.state, ctxOf(realIds.slice(0, 75)), 2000);
    expect(second.state.earned['explorer.unlocked']!.at).toEqual({ bronze: 1000, silver: 2000 });
  });

  it('does not mutate the state it is given', () => {
    const state = emptyAchievements();
    evaluate(net, state, ctxOf(realIds.slice(0, 25)), 1000);
    expect(state).toEqual(emptyAchievements());
  });

  it('ignores Station ids the network does not have', () => {
    const unknown = ['nope-1', 'nope-2', 'nope-3', 'nope-4', 'nope-5'];
    const { state, earned } = evaluate(net, emptyAchievements(), ctxOf([...realIds.slice(0, 24), ...unknown]), 1);
    expect(earned).toEqual([]);
    expect(state.earned).toEqual({});
    expect(progressOf(net, state, ctxOf([...unknown]), 'explorer.interchanges').value).toBe(0);
    expect(() => evaluate(net, emptyAchievements(), ctxOf(unknown), 1)).not.toThrow();
  });

  it('counts only Walk links and long names the network has', () => {
    const longId = allIds.find((id) => isLongName(net.stations.get(id)!.name))!;
    const shortId = allIds.find((id) => !isLongName(net.stations.get(id)!.name))!;
    const base = emptyAchievements();
    const stale = {
      ...base,
      sets: { ...base.sets, walkLinks: ['nope-1|nope-2'], longNames: ['nope-1', 'nope-2', shortId, longId] },
    };
    expect(progressOf(net, stale, ctxOf([]), 'explorer.walk').value).toBe(0);
    expect(progressOf(net, stale, ctxOf([]), 'craft.longNames').value).toBe(1);
    expect(evaluate(net, stale, ctxOf([]), 1).earned).toEqual([]);

    const [from, to] = [...net.walk.entries()].map(([a, ids]) => [a, ids[0]!] as const)[0]!;
    const real = { ...stale, sets: { ...stale.sets, walkLinks: [[from, to].sort().join('|'), 'nope-1|nope-2'] } };
    expect(progressOf(net, real, ctxOf([]), 'explorer.walk').value).toBe(1);
  });

  it('reads Day Pass as 0 on another day when the context names today', () => {
    const state = { ...emptyAchievements(), dayPass: { day: '2026-10-30', lines: ['KJ', 'AG', 'SP'] as const } };
    const dayPass = { ...state, dayPass: { day: state.dayPass.day, lines: [...state.dayPass.lines] } };
    expect(progressOf(net, dayPass, { ...ctxOf([]), today: '2026-10-31' }, 'line.dayPass').value).toBe(0);
    expect(progressOf(net, dayPass, { ...ctxOf([]), today: '2026-10-30' }, 'line.dayPass').value).toBe(3);
    // Evaluation at record time has no `today` and reads the stored day.
    expect(progressOf(net, dayPass, ctxOf([]), 'line.dayPass').value).toBe(3);
  });

  it('awards a secret from its flag', () => {
    const state = { ...emptyAchievements(), flags: ['secret.ampang'] };
    const { state: next, earned } = evaluate(net, state, ctxOf([]), 5);
    expect(earned).toEqual([{ id: 'secret.ampang', award: 'secret', at: 5 }]);
    expect(next.earned['secret.ampang']).toEqual({ award: 'secret', at: { secret: 5 } });
    expect(evaluate(net, next, ctxOf([]), 6).earned).toEqual([]);
  });

  it('recordUnlocks is evaluate under another name', () => {
    const ctx = ctxOf(realIds.slice(0, 25));
    expect(recordUnlocks(net, emptyAchievements(), ctx, 1)).toEqual(evaluate(net, emptyAchievements(), ctx, 1));
  });

  it('All-Rounder needs Dispatcher on desktop but not on a phone', () => {
    const state = emptyAchievements();
    state.earned['explorer.unlocked'] = { award: 'bronze', at: { bronze: 1 } };
    state.earned['line.completed'] = { award: 'bronze', at: { bronze: 1 } };
    state.earned['quick.score'] = { award: 'bronze', at: { bronze: 1 } };
    const phone = evaluate(net, state, ctxOf([], true), 9);
    expect(phone.earned).toContainEqual({ id: 'craft.allRounder', award: 'bronze', at: 9 });
    const desktop = evaluate(net, state, ctxOf([], false), 9);
    expect(desktop.earned.some((e) => e.id === 'craft.allRounder')).toBe(false);
  });
});

describe('takeAnnouncements', () => {
  it('returns and clears the unannounced list', () => {
    const { state } = evaluate(net, emptyAchievements(), ctxOf(realIds.slice(0, 25)), 1000);
    const taken = takeAnnouncements(state);
    expect(taken.items).toEqual(state.unannounced);
    expect(taken.items.length).toBeGreaterThan(0);
    expect(taken.state.unannounced).toEqual([]);
    expect(taken.state.earned).toEqual(state.earned);
    expect(takeAnnouncements(taken.state).items).toEqual([]);
  });
});

describe('takeAnnouncements with a limit', () => {
  it('takes the newest up to the limit and leaves the rest queued in order', () => {
    const queue = [
      { id: 'explorer.unlocked', award: 'bronze' as const, at: 1 },
      { id: 'line.completed', award: 'bronze' as const, at: 2 },
      { id: 'quick.score', award: 'bronze' as const, at: 3 },
      { id: 'craft.days', award: 'bronze' as const, at: 5 },
      { id: 'secret.nightOwl', award: 'secret' as const, at: 5 },
    ];
    const taken = takeAnnouncements({ ...emptyAchievements(), unannounced: queue }, 3);
    expect(taken.items).toEqual([queue[3], queue[4], queue[2]]);
    expect(taken.state.unannounced).toEqual([queue[0], queue[1]]);
    expect(takeAnnouncements(taken.state, 3).items).toEqual([queue[1], queue[0]]);
  });
});

describe('backfill', () => {
  it('backfills from visited and the Quick Run best, without announcing', () => {
    const profile = { ...emptyProfile(), visited: realIds.slice(0, 30), quickBestOverall: 65 };
    const state = backfill(net, profile, 5000);
    expect(state.earned['explorer.unlocked']!.award).toBe('bronze');
    expect(state.earned['quick.score']!.award).toBe('silver');
    expect(state.unannounced).toEqual([]);
    expect(state.backfilled).toEqual(['explorer.unlocked', 'quick.score']);
    expect(state.bests.quickScore).toBe(65);
  });

  it('records an empty list when nothing is earned', () => {
    const state = backfill(net, emptyProfile(), 5000);
    expect(state.backfilled).toEqual([]);
    expect(state.unannounced).toEqual([]);
  });
});

describe('progressOf', () => {
  it('reports the next tier', () => {
    const result = progressOf(net, emptyAchievements(), ctxOf(realIds.slice(0, 48)), 'explorer.unlocked');
    expect(result).toEqual({ value: 48, tier: 'bronze', next: { tier: 'silver', threshold: 75 } });
  });

  it('has no next tier at Gold and no tier below Bronze', () => {
    const all = progressOf(net, emptyAchievements(), ctxOf(allIds), 'explorer.unlocked');
    expect(all.tier).toBe('gold');
    expect(all.next).toBeNull();
    const none = progressOf(net, emptyAchievements(), ctxOf([]), 'explorer.unlocked');
    expect(none).toEqual({ value: 0, tier: null, next: { tier: 'bronze', threshold: 25 } });
  });
});

describe('localDay', () => {
  it('uses local time', () => {
    expect(localDay(new Date(2026, 7, 31, 23, 59).getTime())).toBe('2026-08-31');
  });

  it('zero-pads month and day', () => {
    expect(localDay(new Date(2026, 0, 5, 8, 0).getTime())).toBe('2026-01-05');
  });
});
