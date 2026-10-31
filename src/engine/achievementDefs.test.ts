import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { emptyAchievements, type AchievementState } from './achievementState';
import {
  ACHIEVEMENTS, CATEGORY_ORDER, isLongName, networkCounts,
  type EvalContext, type TieredDef,
} from './achievementDefs';

const net = buildNetwork(loadNetworkData());
const ctx: EvalContext = { visited: [], phone: false };

function def(id: string): TieredDef {
  const found = ACHIEVEMENTS.find((a) => a.id === id);
  if (!found || found.category === 'secret') throw new Error(`no tiered ${id}`);
  return found;
}

const SPEC_IDS = [
  'explorer.unlocked', 'explorer.interchanges', 'explorer.termini', 'explorer.walk',
  'explorer.junctions', 'explorer.longRide', 'explorer.lines',
  'line.completed', 'line.accuracy', 'line.score', 'line.bothWays',
  'line.stations', 'line.personalBest', 'line.dayPass',
  'quick.score', 'quick.jumps', 'quick.completed', 'quick.clean',
  'quick.improved', 'quick.starts', 'quick.backToBack',
  'dispatch.era', 'dispatch.delivered', 'dispatch.clears', 'dispatch.incidents',
  'dispatch.gaps', 'dispatch.perfect', 'dispatch.onTime', 'dispatch.express',
  'craft.streak', 'craft.longNames', 'craft.comeback', 'craft.days',
  'craft.characters', 'craft.speedUp', 'craft.allRounder',
  'secret.ampang', 'secret.roundTrip', 'secret.rushHour', 'secret.sevenColours',
  'secret.lastTrain', 'secret.sixteen', 'secret.puchong', 'secret.closeCall',
  'secret.againstOdds', 'secret.nightOwl', 'secret.merdeka',
];

describe('ACHIEVEMENTS', () => {
  it('has 36 tiered and 11 secret achievements with unique ids', () => {
    expect(ACHIEVEMENTS.filter((a) => a.category !== 'secret')).toHaveLength(36);
    expect(ACHIEVEMENTS.filter((a) => a.category === 'secret')).toHaveLength(11);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(47);
  });

  it('describes every achievement in one sentence', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.description, def.id).toMatch(/^[A-Z0-9].*\.$/);
      expect(def.description.length, def.id).toBeLessThanOrEqual(120);
    }
  });

  it('has at least 7 per category', () => {
    for (const category of CATEGORY_ORDER) {
      expect(ACHIEVEMENTS.filter((a) => a.category === category).length).toBeGreaterThanOrEqual(7);
    }
  });

  it('lists the ids in the spec', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(SPEC_IDS);
  });

  it('orders categories as the achievements screen shows them', () => {
    expect(CATEGORY_ORDER).toEqual(['explorer', 'line', 'quick', 'dispatch', 'craft', 'secret']);
  });

  it('counts the network', () => {
    expect(networkCounts(net)).toEqual({
      stations: 154, interchanges: 21, termini: 11, walkLinks: 5, lines: 7, longNames: 9,
    });
  });

  it('derives "all" thresholds from the data', () => {
    expect(def('explorer.unlocked').thresholds(net)).toEqual([25, 75, 154]);
    expect(def('explorer.termini').thresholds(net)).toEqual([3, 7, 11]);
    expect(def('craft.longNames').thresholds(net)).toEqual([3, 6, 9]);
  });

  it('labels tiers in words', () => {
    expect(def('explorer.unlocked').label(154, 'gold', net)).toBe('all 154 stations');
    expect(def('explorer.unlocked').label(75, 'silver', net)).toBe('75 stations');
    expect(def('line.accuracy').label(0.99, 'silver', net)).toBe('99% accuracy');
    expect(def('dispatch.era').label(2, 'silver', net)).toBe('2015–17');
    expect(def('dispatch.era').label(1, 'bronze', net)).toBe('2003');
    expect(def('dispatch.era').label(4, 'gold', net)).toBe('Latest');
    expect(def('line.stations').label(1000, 'silver', net)).toBe('1,000 stations typed');
  });

  it('measures unlocked Stations, Interchanges and Termini, ignoring unknown ids', () => {
    const visited = ['masjid-jamek', 'gombak', 'imbi', 'masjid-jamek', 'no-such-station'];
    const c: EvalContext = { visited, phone: false };
    const s = emptyAchievements();
    expect(def('explorer.unlocked').value(s, c, net)).toBe(3);
    expect(def('explorer.interchanges').value(s, c, net)).toBe(1);
    expect(def('explorer.termini').value(s, c, net)).toBe(1);
  });

  it('counts a Line as ridden both ways only with both end Station ids', () => {
    const s = emptyAchievements();
    s.sets.lineDirections = ['KJ:gombak', 'AG:sentul-timur'];
    expect(def('line.bothWays').value(s, ctx, net)).toBe(0);
    s.sets.lineDirections.push('KJ:putra-heights');
    expect(def('line.bothWays').value(s, ctx, net)).toBe(1);
  });

  it('reads Line Speed, Day Pass and Up the Line from their own fields', () => {
    const s = emptyAchievements();
    expect(def('line.score').value(s, ctx, net)).toBe(0);
    expect(def('line.dayPass').value(s, ctx, net)).toBe(0);
    expect(def('quick.improved').value(s, ctx, net)).toBe(0);
    s.bests.lineScore = { KJ: 31, AG: 52 };
    s.dayPass = { day: '2026-11-01', lines: ['KJ', 'AG'] };
    s.bests.quickScore = 70;
    expect(def('line.score').value(s, ctx, net)).toBe(52);
    expect(def('line.dayPass').value(s, ctx, net)).toBe(2);
    // Up the Line reads the improvement recorded since the baseline, never the best minus it:
    // a backfilled best predates the baseline.
    s.bests.quickFirstScore = 45;
    expect(def('quick.improved').value(s, ctx, net)).toBe(0);
    s.bests.quickImproved = 25;
    expect(def('quick.improved').value(s, ctx, net)).toBe(25);
  });

  it('measures Picking Up Speed only once 20 Runs are logged', () => {
    const entry = (wpm: number) => ({ at: 0, wpm, accuracy: 1 });
    const s = emptyAchievements();
    s.runLog = {
      count: 19,
      first: [entry(30), entry(40)],
      recent: [entry(50), entry(60)],
      lastAccuracy: null,
    };
    expect(def('craft.speedUp').value(s, ctx, net)).toBe(0);
    s.runLog.count = 20;
    expect(def('craft.speedUp').value(s, ctx, net)).toBe(20);
  });

  describe('All-Rounder', () => {
    const earnedAt = (ids: string[], award: 'bronze' | 'silver' | 'gold'): AchievementState => {
      const s = emptyAchievements();
      for (const id of ids) s.earned[id] = { award, at: { [award]: 1 } };
      return s;
    };
    const three = ['explorer.unlocked', 'line.completed', 'quick.score'];

    it('needs the tier in Dispatcher too on a desktop', () => {
      const s = earnedAt(three, 'bronze');
      expect(def('craft.allRounder').value(s, { visited: [], phone: false }, net)).toBe(0);
      s.earned['dispatch.era'] = { award: 'bronze', at: { bronze: 1 } };
      expect(def('craft.allRounder').value(s, { visited: [], phone: false }, net)).toBe(1);
    });

    it('skips Dispatcher on a phone', () => {
      expect(def('craft.allRounder').value(earnedAt(three, 'silver'), { visited: [], phone: true }, net)).toBe(2);
    });

    it('is limited by the weakest category', () => {
      const s = earnedAt(three, 'gold');
      s.earned['quick.score'] = { award: 'bronze', at: { bronze: 1 } };
      expect(def('craft.allRounder').value(s, { visited: [], phone: true }, net)).toBe(1);
    });

    it('labels its tiers "all Bronze", "all Silver", "all Gold"', () => {
      expect(def('craft.allRounder').label(2, 'silver', net)).toBe('all Silver');
    });
  });
});

describe('isLongName', () => {
  it('is true from 20 characters', () => {
    expect(isLongName('x'.repeat(20))).toBe(true);
    expect(isLongName('x'.repeat(19))).toBe(false);
  });
});
