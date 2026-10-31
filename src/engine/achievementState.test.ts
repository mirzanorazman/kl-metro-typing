import { describe, it, expect } from 'vitest';
import { cleanAchievements, emptyAchievements } from './achievementState';

describe('cleanAchievements', () => {
  it('cleans a malformed value to undefined', () => {
    expect(cleanAchievements(null)).toBeUndefined();
    expect(cleanAchievements('x')).toBeUndefined();
    expect(cleanAchievements({ v: 2 })).toBeUndefined();
    expect(cleanAchievements([])).toBeUndefined();
  });

  it('keeps a valid state unchanged', () => {
    const s = emptyAchievements();
    s.earned['explorer.unlocked'] = { award: 'silver', at: { bronze: 1, silver: 2 } };
    s.unannounced = [{ id: 'explorer.unlocked', award: 'silver', at: 2 }];
    s.backfilled = ['explorer.unlocked'];
    s.counters.clears = 12;
    s.sets.linesCompleted = ['KJ', 'AG'];
    s.bests.lineScore = { KJ: 31 };
    s.bests.quickFirstScore = 40;
    s.bests.quickImproved = 12;
    s.dayPass = { day: '2026-11-01', lines: ['KJ'] };
    s.quickChain = { count: 2, summaryAt: 99 };
    s.runLog = { count: 1, first: [{ at: 1, wpm: 40, accuracy: 0.9 }], recent: [{ at: 1, wpm: 40, accuracy: 0.9 }], lastAccuracy: 0.9 };
    s.adventureRun = { start: 'imbi', visited: ['imbi'], lines: ['KJ'] };
    s.flags = ['secret.sixteen'];
    expect(cleanAchievements(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('degrades a record with no other fields to an empty state', () => {
    expect(cleanAchievements({ v: 1 })).toEqual(emptyAchievements());
  });

  it('reads a missing or malformed Up the Line improvement as 0', () => {
    const old = emptyAchievements() as unknown as { bests: Record<string, unknown> };
    delete old.bests.quickImproved;
    expect(cleanAchievements(JSON.parse(JSON.stringify(old)))?.bests.quickImproved).toBe(0);
    expect(cleanAchievements({ v: 1, bests: { quickImproved: 'x' } })?.bests.quickImproved).toBe(0);
    expect(cleanAchievements({ v: 1, bests: { quickImproved: 9 } })?.bests.quickImproved).toBe(9);
  });

  it('drops malformed entries in sets', () => {
    const cleaned = cleanAchievements({
      v: 1,
      sets: { walkLinks: ['a|b', 7, null, 'a|b'], linesCompleted: ['KJ', 'ZZ', 3] },
    });
    expect(cleaned?.sets.walkLinks).toEqual(['a|b']);
    expect(cleaned?.sets.linesCompleted).toEqual(['KJ']);
  });

  it('replaces wrong-typed counters, bests and earned entries without throwing', () => {
    const cleaned = cleanAchievements({
      v: 1,
      counters: { clears: 'many', fixes: -3, express: 4 },
      bests: { lineScore: { KJ: 'high', XX: 5, AG: 40 }, quickFirstScore: 'x' },
      earned: { good: { award: 'gold', at: { gold: 5 } }, bad: { award: 'platinum', at: {} }, worse: 4 },
      unannounced: [{ id: 'a', award: 'bronze', at: 1 }, { id: 'b' }, 'c'],
      runLog: { first: Array.from({ length: 15 }, (_, i) => ({ at: i, wpm: i, accuracy: 1 })), recent: 'x' },
      dayPass: { day: 5 },
      quickChain: 'x',
      adventureRun: { visited: ['a'] },
    });
    expect(cleaned?.counters).toMatchObject({ clears: 0, fixes: 0, express: 4 });
    expect(cleaned?.bests.lineScore).toEqual({ AG: 40 });
    expect(cleaned?.bests.quickFirstScore).toBeNull();
    expect(Object.keys(cleaned!.earned)).toEqual(['good']);
    expect(cleaned?.unannounced).toEqual([{ id: 'a', award: 'bronze', at: 1 }]);
    expect(cleaned?.runLog.first).toHaveLength(10);
    expect(cleaned?.runLog.recent).toEqual([]);
    expect(cleaned?.dayPass).toBeNull();
    expect(cleaned?.quickChain).toBeNull();
    expect(cleaned?.adventureRun).toBeNull();
  });
});
