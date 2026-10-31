import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { isLongName, type EvalContext } from './achievementDefs';
import { emptyAchievements, type AchievementState } from './achievementState';
import { backfill, localDay } from './achievements';
import { emptyProfile } from './progress';
import {
  recordLineRun, recordQuickRun, recordRunEnd, recordCareer, startAdventure, recordAdventureArrival,
  recordJunctionChoice, recordWalk, recordAdventureEnd,
  type LineRunFacts, type QuickRunFacts, type TypingFacts,
} from './achievementRuns';
import { emptyTally, type CareerTally, type ShiftRecord } from './dispatch';
import type { DispatchJudgement } from './dispatchJudge';
import { LINE_CODES } from '../data/types';

const net = buildNetwork(loadNetworkData());
const ctx: EvalContext = { visited: [], phone: false };
const longIds = [...net.stations.values()].filter((s) => isLongName(s.name)).map((s) => s.id);
const shortId = [...net.stations.values()].find((s) => !isLongName(s.name))!.id;

/** A local-time moment: month is 1-based. */
const when = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const NOON = when(11, 1);

const typing = (over: Partial<TypingFacts> = {}): TypingFacts => ({
  eligible: true,
  metrics: { wpm: 40, accuracy: 0.98, score: 38 },
  correctChars: 100,
  bestKeyStreak: 20,
  stations: [],
  ...over,
});
const lineFacts = (over: Partial<LineRunFacts> = {}): LineRunFacts => ({
  ...typing(), line: 'KJ', from: 'gombak', complete: true, ...over,
});
const quickFacts = (over: Partial<QuickRunFacts> = {}): QuickRunFacts => ({
  ...typing(), startLine: 'KJ', jumps: 0, lastStationLeftMs: 20_000, openedAt: NOON, ...over,
});
const stationsOf = (n: number) => Array.from({ length: n }, () => ({ id: shortId, ms: 1000, errors: 0 }));
const metricsOf = (score: number, accuracy = 0.98, wpm = score) => ({ wpm, accuracy, score });

const line = (state: AchievementState, facts: Partial<LineRunFacts>, at = NOON) =>
  recordLineRun(net, state, lineFacts(facts), ctx, at);
const quick = (state: AchievementState, facts: Partial<QuickRunFacts>, at = NOON) =>
  recordQuickRun(net, state, quickFacts(facts), ctx, at);
const tierOf = (state: AchievementState, id: string) => state.earned[id]?.award;

describe('recordLineRun', () => {
  it('counts Long Line from every Line Run, complete or not', () => {
    const a = line(emptyAchievements(), { complete: false, stations: stationsOf(120) });
    const b = line(a.state, { complete: true, stations: stationsOf(80) });
    expect(b.state.counters.lineStations).toBe(200);
    expect(tierOf(a.state, 'line.stations')).toBeUndefined();
    expect(tierOf(b.state, 'line.stations')).toBe('bronze');
  });

  it('records End to End and Both Ways from complete Line Runs only', () => {
    const quit = line(emptyAchievements(), { complete: false, from: 'gombak' });
    expect(quit.state.sets.linesCompleted).toEqual([]);
    expect(quit.state.sets.lineDirections).toEqual([]);

    const one = line(quit.state, { from: 'gombak' });
    expect(one.state.sets.linesCompleted).toEqual(['KJ']);
    expect(one.state.sets.lineDirections).toEqual(['KJ:gombak']);
    expect(tierOf(one.state, 'line.completed')).toBe('bronze');
    expect(tierOf(one.state, 'line.bothWays')).toBeUndefined();

    const both = line(one.state, { from: 'putra-heights' });
    expect(both.state.sets.linesCompleted).toEqual(['KJ']);
    expect(both.state.sets.lineDirections).toEqual(['KJ:gombak', 'KJ:putra-heights']);
    expect(tierOf(both.state, 'line.bothWays')).toBe('bronze');
  });

  it('ignores an ineligible Line Run for Spotless and Line Speed', () => {
    const { state } = line(emptyAchievements(), { eligible: false, metrics: metricsOf(70, 1) });
    expect(state.bests.lineAccuracy).toBe(0);
    expect(state.bests.lineScore).toEqual({});
    expect(state.sets.linesCompleted).toEqual(['KJ']);
    expect(tierOf(state, 'line.accuracy')).toBeUndefined();
    expect(tierOf(state, 'line.score')).toBeUndefined();
  });

  it('records Spotless and Line Speed from an eligible complete Line Run only', () => {
    const quit = line(emptyAchievements(), { complete: false, metrics: metricsOf(70, 1) });
    expect(quit.state.bests.lineAccuracy).toBe(0);
    const done = line(quit.state, { metrics: metricsOf(70, 1) });
    expect(done.state.bests.lineAccuracy).toBe(1);
    expect(tierOf(done.state, 'line.accuracy')).toBe('gold');
    expect(tierOf(done.state, 'line.score')).toBe('gold');
  });

  it('counts a Personal Best only after a baseline exists', () => {
    const first = line(emptyAchievements(), { metrics: metricsOf(30) });
    expect(first.state.counters.linePersonalBests).toBe(0);
    expect(first.state.bests.lineScore).toEqual({ KJ: 30 });
    const second = line(first.state, { metrics: metricsOf(35) });
    expect(second.state.counters.linePersonalBests).toBe(1);
    const third = line(second.state, { metrics: metricsOf(34) });
    expect(third.state.counters.linePersonalBests).toBe(1);
    expect(third.state.bests.lineScore).toEqual({ KJ: 35 });
  });

  it('keeps a Personal Best baseline per Line', () => {
    const kj = line(emptyAchievements(), { metrics: metricsOf(30) });
    const ag = line(kj.state, { line: 'AG', from: 'sentul-timur', metrics: metricsOf(20) });
    expect(ag.state.counters.linePersonalBests).toBe(0);
    expect(ag.state.bests.lineScore).toEqual({ KJ: 30, AG: 20 });
  });

  it('Day Pass counts distinct Lines on one local day and restarts on the next', () => {
    const nov1 = when(11, 1, 10);
    const a = line(emptyAchievements(), { line: 'KJ', from: 'gombak' }, nov1);
    const b = line(a.state, { line: 'AG', from: 'sentul-timur' }, nov1 + 60_000);
    expect(b.state.dayPass).toEqual({ day: '2026-11-01', lines: ['KJ', 'AG'] });
    expect(b.state.earned['line.dayPass']!.at.bronze).toBe(nov1 + 60_000);

    const again = line(b.state, { line: 'KJ', from: 'putra-heights' }, nov1 + 120_000);
    expect(again.state.dayPass!.lines).toEqual(['KJ', 'AG']);

    const c = line(again.state, { line: 'SP', from: 'sentul-timur' }, when(11, 2, 9));
    expect(c.state.dayPass).toEqual({ day: '2026-11-02', lines: ['SP'] });
    expect(tierOf(c.state, 'line.dayPass')).toBe('bronze');
    expect(c.state.earned['line.dayPass']!.at.bronze).toBe(nov1 + 60_000);
  });

  it('counts a day once, even when the clock goes backwards', () => {
    let state = emptyAchievements();
    for (const at of [when(11, 1, 10), when(11, 1, 9), when(11, 1, 11)]) {
      state = line(state, {}, at).state;
    }
    expect(state.sets.days).toEqual(['2026-11-01']);
  });

  it('adds nothing to the typing craft when ineligible', () => {
    const { state } = line(emptyAchievements(), { eligible: false });
    expect(state.counters.characters).toBe(0);
    expect(state.bests.keyStreak).toBe(0);
    expect(state.runLog).toEqual({ count: 0, first: [], recent: [], lastAccuracy: null });
  });

  it('does not mutate the state it is given', () => {
    const state = emptyAchievements();
    line(state, { stations: stationsOf(3) });
    expect(state).toEqual(emptyAchievements());
  });
});

describe('recordQuickRun', () => {
  it('records Quick Run counts for any completed Run but Score only when eligible', () => {
    const a = quick(emptyAchievements(), { eligible: false, metrics: metricsOf(70, 1), jumps: 3 }, NOON);
    expect(a.state.counters.quickCompleted).toBe(1);
    expect(a.state.sets.quickStarts).toEqual(['KJ']);
    expect(a.state.counters.quickClean).toBe(0);
    expect(a.state.bests.quickScore).toBe(0);
    expect(a.state.bests.quickFirstScore).toBeNull();
    expect(a.state.bests.quickJumps).toBe(0);

    const b = quick(a.state, { startLine: 'AG', metrics: metricsOf(45, 1), jumps: 2 }, NOON + 120_000);
    expect(b.state.counters.quickCompleted).toBe(2);
    expect(b.state.sets.quickStarts).toEqual(['KJ', 'AG']);
    expect(b.state.counters.quickClean).toBe(1);
    expect(b.state.bests.quickScore).toBe(45);
    expect(b.state.bests.quickJumps).toBe(2);
    expect(tierOf(b.state, 'quick.jumps')).toBe('silver');
    expect(tierOf(b.state, 'quick.score')).toBe('bronze');
  });

  it('does not count a Quick Run below 100% accuracy as clean', () => {
    const { state } = quick(emptyAchievements(), { metrics: metricsOf(50, 0.99) });
    expect(state.counters.quickClean).toBe(0);
  });

  it('Up the Line measures from the first eligible Quick Run', () => {
    const a = quick(emptyAchievements(), { metrics: metricsOf(40) });
    expect(a.state.bests.quickFirstScore).toBe(40);
    const b = quick(a.state, { metrics: metricsOf(52) }, NOON + 500_000);
    const c = quick(b.state, { metrics: metricsOf(30) }, NOON + 900_000);
    expect(c.state.bests.quickFirstScore).toBe(40);
    expect(c.state.bests.quickScore).toBe(52);
    expect(tierOf(c.state, 'quick.improved')).toBe('bronze');
  });

  it('Up the Line counts only Scores after a backfilled player\'s first eligible Quick Run', () => {
    const start = backfill(net, { ...emptyProfile(), quickBestOverall: 70 }, NOON - 1000);
    expect(start.bests.quickScore).toBe(70);
    const a = quick(start, { metrics: metricsOf(40) });
    expect(a.state.bests.quickFirstScore).toBe(40);
    expect(a.earned.some((e) => e.id === 'quick.improved')).toBe(false);
    expect(tierOf(a.state, 'quick.improved')).toBeUndefined();
    const b = quick(a.state, { metrics: metricsOf(52) }, NOON + 500_000);
    expect(b.state.bests.quickImproved).toBe(12);
    expect(tierOf(b.state, 'quick.improved')).toBe('bronze');
    const c = quick(b.state, { metrics: metricsOf(45) }, NOON + 900_000);
    expect(c.state.bests.quickImproved).toBe(12);
  });

  it('an ineligible Quick Run neither counts towards One More Go nor breaks a timely chain', () => {
    const a = quick(emptyAchievements(), { openedAt: NOON }, NOON + 30_000);
    const b = quick(a.state, { eligible: false, openedAt: NOON + 60_000 }, NOON + 90_000);
    expect(b.state.quickChain).toEqual({ count: 1, summaryAt: NOON + 90_000 });
    expect(b.state.bests.quickChain).toBe(1);
    const c = quick(b.state, { openedAt: NOON + 120_000 }, NOON + 150_000);
    expect(c.state.quickChain!.count).toBe(2);

    // Ineligible Runs alone never make a chain.
    let state = emptyAchievements();
    for (let i = 0; i < 4; i += 1) {
      state = quick(state, { eligible: false, openedAt: NOON + i * 40_000 }, NOON + i * 40_000 + 30_000).state;
    }
    expect(state.bests.quickChain).toBe(0);
    expect(tierOf(state, 'quick.backToBack')).toBeUndefined();

    // A late ineligible Run still breaks the chain: every Run must start in time.
    const late = quick(a.state, { eligible: false, openedAt: NOON + 600_000 }, NOON + 630_000);
    expect(late.state.quickChain).toEqual({ count: 0, summaryAt: NOON + 630_000 });
  });

  it('chains One More Go only within 60 s of the last Summary', () => {
    const a = quick(emptyAchievements(), { openedAt: NOON }, NOON + 30_000);
    expect(a.state.quickChain).toEqual({ count: 1, summaryAt: NOON + 30_000 });

    const b = quick(a.state, { openedAt: NOON + 90_000 }, NOON + 120_000); // exactly 60 s after
    expect(b.state.quickChain).toEqual({ count: 2, summaryAt: NOON + 120_000 });

    const c = quick(b.state, { openedAt: NOON + 180_000 }, NOON + 210_000);
    expect(c.state.quickChain!.count).toBe(3);
    expect(tierOf(c.state, 'quick.backToBack')).toBe('bronze');

    const d = quick(c.state, { openedAt: NOON + 270_001 }, NOON + 300_000); // 60.001 s after
    expect(d.state.quickChain).toEqual({ count: 1, summaryAt: NOON + 300_000 });
    expect(d.state.bests.quickChain).toBe(3);
  });

  it('awards Last Train Home with a second or less left', () => {
    expect(quick(emptyAchievements(), { lastStationLeftMs: 1000 }).state.flags).toContain('secret.lastTrain');
    expect(quick(emptyAchievements(), { lastStationLeftMs: 0 }).state.flags).toContain('secret.lastTrain');
    expect(tierOf(quick(emptyAchievements(), { lastStationLeftMs: 400 }).state, 'secret.lastTrain')).toBe('secret');
  });

  it('does not award Last Train Home at 1.2 s left, with no Station, or when ineligible', () => {
    expect(quick(emptyAchievements(), { lastStationLeftMs: 1200 }).state.flags).not.toContain('secret.lastTrain');
    expect(quick(emptyAchievements(), { lastStationLeftMs: null }).state.flags).not.toContain('secret.lastTrain');
    expect(quick(emptyAchievements(), { lastStationLeftMs: 500, eligible: false }).state.flags)
      .not.toContain('secret.lastTrain');
  });
});

describe('typing craft', () => {
  it('adds characters and the best key streak from eligible Runs', () => {
    const a = line(emptyAchievements(), { correctChars: 120, bestKeyStreak: 80 });
    const b = quick(a.state, { correctChars: 30, bestKeyStreak: 40 }, NOON + 1000);
    expect(b.state.counters.characters).toBe(150);
    expect(b.state.bests.keyStreak).toBe(80);
  });

  it('Mouthful counts distinct long names typed with no wrong key', () => {
    expect(longIds.length).toBeGreaterThanOrEqual(4);
    const clean = (id: string) => ({ id, ms: 4000, errors: 0 });
    const a = line(emptyAchievements(), {
      stations: [clean(longIds[0]!), { id: longIds[1]!, ms: 4000, errors: 1 }, clean(shortId)],
    });
    expect(a.state.sets.longNames).toEqual([longIds[0]]);
    const b = line(a.state, { stations: [clean(longIds[0]!), clean(longIds[1]!), clean(longIds[2]!)] });
    expect(b.state.sets.longNames).toEqual([longIds[0], longIds[1], longIds[2]]);
    expect(tierOf(b.state, 'craft.longNames')).toBe('bronze');
    const ineligible = line(emptyAchievements(), { eligible: false, stations: [clean(longIds[0]!)] });
    expect(ineligible.state.sets.longNames).toEqual([]);
  });

  it('Sweet Sixteen and Puchong need a clean, eligible Station', () => {
    const puchong = 'taman-perindustrian-puchong';
    const flags = (stations: { id: string; ms: number; errors: number }[], eligible = true) =>
      line(emptyAchievements(), { stations, eligible }).state.flags;

    expect(flags([{ id: '16-sierra', ms: 3000, errors: 0 }])).toContain('secret.sixteen');
    expect(flags([{ id: '16-sierra', ms: 3000, errors: 1 }])).not.toContain('secret.sixteen');
    expect(flags([{ id: '16-sierra', ms: 3000, errors: 0 }], false)).not.toContain('secret.sixteen');

    // 27 characters: 5 s is about 65 WPM, 6 s about 54 WPM.
    expect(flags([{ id: puchong, ms: 5000, errors: 0 }])).toContain('secret.puchong');
    expect(flags([{ id: puchong, ms: 6000, errors: 0 }])).not.toContain('secret.puchong');
    expect(flags([{ id: puchong, ms: 5000, errors: 2 }])).not.toContain('secret.puchong');
    expect(flags([{ id: puchong, ms: 5000, errors: 0 }], false)).not.toContain('secret.puchong');

    const earned = line(emptyAchievements(), { stations: [{ id: '16-sierra', ms: 3000, errors: 0 }] }).state;
    expect(tierOf(earned, 'secret.sixteen')).toBe('secret');
  });

  it('Back on Track needs 97% straight after under 90%', () => {
    const accuracies = (list: number[]) => {
      let state = emptyAchievements();
      list.forEach((accuracy, i) => {
        state = quick(state, { metrics: metricsOf(30, accuracy) }, NOON + i * 1000).state;
      });
      return state;
    };
    expect(accuracies([0.85, 0.97]).counters.comebacks).toBe(1);
    expect(accuracies([0.85, 0.96]).counters.comebacks).toBe(0);
    expect(accuracies([0.9, 0.99]).counters.comebacks).toBe(0);
    expect(accuracies([0.85, 0.96, 0.99]).counters.comebacks).toBe(0);
    expect(accuracies([0.97, 0.99]).counters.comebacks).toBe(0);
    const twice = accuracies([0.8, 0.98, 0.7, 0.99]);
    expect(twice.counters.comebacks).toBe(2);
    expect(twice.runLog.lastAccuracy).toBe(0.99);
    expect(tierOf(twice, 'craft.comeback')).toBe('bronze');
  });

  it('keeps the run log at 10 + 10 entries', () => {
    let state = emptyAchievements();
    for (let i = 1; i <= 500; i += 1) {
      state = (i % 2 ? line : quick)(state, { metrics: metricsOf(30, 0.98, i) }, NOON + i * 1000).state;
    }
    expect(state.runLog.count).toBe(500);
    expect(state.runLog.first.map((e) => e.wpm)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.runLog.recent.map((e) => e.wpm)).toEqual([491, 492, 493, 494, 495, 496, 497, 498, 499, 500]);
  });

  it('Picking Up Speed is 0 before 20 Runs and the mean difference after', () => {
    let state = emptyAchievements();
    for (let i = 1; i <= 19; i += 1) {
      state = quick(state, { metrics: metricsOf(30, 0.98, i <= 10 ? 20 : 40) }, NOON + i * 1000).state;
    }
    expect(tierOf(state, 'craft.speedUp')).toBeUndefined();

    state = quick(state, { metrics: metricsOf(30, 0.98, 40) }, NOON + 20_000).state;
    // first 10 average 20 WPM, latest 10 average 40 WPM
    expect(state.earned['craft.speedUp']!.award).toBe('gold');
  });
});

describe('recordRunEnd', () => {
  it('adds the local day and does nothing else on an ordinary afternoon', () => {
    const state = recordRunEnd(emptyAchievements(), when(11, 1, 15));
    expect(state.sets.days).toEqual([localDay(when(11, 1, 15))]);
    expect(state.flags).toEqual([]);
  });

  it('Night Owl at 02:30 local, not at 04:00', () => {
    expect(recordRunEnd(emptyAchievements(), when(11, 1, 2, 30)).flags).toContain('secret.nightOwl');
    expect(recordRunEnd(emptyAchievements(), when(11, 1, 0, 0)).flags).toContain('secret.nightOwl');
    expect(recordRunEnd(emptyAchievements(), when(11, 1, 3, 59)).flags).toContain('secret.nightOwl');
    expect(recordRunEnd(emptyAchievements(), when(11, 1, 4, 0)).flags).not.toContain('secret.nightOwl');
    expect(tierOf(line(emptyAchievements(), {}, when(11, 1, 2, 30)).state, 'secret.nightOwl')).toBe('secret');
  });

  it('Merdeka! on 31 August and 16 September only', () => {
    expect(recordRunEnd(emptyAchievements(), when(8, 31)).flags).toContain('secret.merdeka');
    expect(recordRunEnd(emptyAchievements(), when(9, 16)).flags).toContain('secret.merdeka');
    expect(recordRunEnd(emptyAchievements(), when(8, 30)).flags).not.toContain('secret.merdeka');
    expect(recordRunEnd(emptyAchievements(), when(9, 15)).flags).not.toContain('secret.merdeka');
    expect(recordRunEnd(emptyAchievements(), when(10, 31)).flags).not.toContain('secret.merdeka');
    expect(tierOf(quick(emptyAchievements(), {}, when(9, 16)).state, 'secret.merdeka')).toBe('secret');
  });

  it('keeps a flag once set and does not mutate its input', () => {
    const state = emptyAchievements();
    const once = recordRunEnd(state, when(9, 16, 1));
    expect(state).toEqual(emptyAchievements());
    expect(recordRunEnd(once, when(9, 16, 1)).flags).toEqual(['secret.nightOwl', 'secret.merdeka']);
  });
});

const judgement = (over: Partial<DispatchJudgement> = {}, tally: Partial<CareerTally> = {}): DispatchJudgement => ({
  eligible: true, score: 100, delivered: 0, cleared: 0, verdict: null,
  metrics: { wpm: 40, accuracy: 0.98, score: 100 }, correctChars: 200, history: [],
  ...over, tally: { ...emptyTally(), ...tally },
});
const career = (state: AchievementState, j: Partial<DispatchJudgement>, tally: Partial<CareerTally> = {}, at = NOON) =>
  recordCareer(net, state, judgement(j, tally), ctx, at);
const shift = (n: number, calls: number, onTimeCalls: number, cleared = true): ShiftRecord =>
  ({ shift: n, delivered: 0, calls, onTimeCalls, cleared });

describe('recordCareer', () => {
  it('ignores an ineligible Career', () => {
    const state = emptyAchievements();
    const result = career(state, { eligible: false, delivered: 9000, cleared: 30 }, { clears: 500, closeCall: true });
    expect(result.state).toBe(state);
    expect(result.earned).toEqual([]);
  });

  it('adds a Career tally to the lifetime counts', () => {
    const a = career(emptyAchievements(), {}, { clears: 40, fixes: 3, gapsHeld: 2, express: 11 });
    const b = career(a.state, {}, { clears: 70, fixes: 4, gapsHeld: 1, express: 5 }, NOON + 1000);
    expect(b.state.counters).toMatchObject({ clears: 110, fixes: 7, gapsHeld: 3, express: 16 });
    expect(tierOf(b.state, 'dispatch.express')).toBe('bronze');
    expect(tierOf(b.state, 'dispatch.clears')).toBe('bronze');
    expect(b.state.sets.days).toEqual(['2026-11-01']);
  });

  it('Through the Eras reads the Era from Shifts cleared', () => {
    const era = (cleared: number) => career(emptyAchievements(), { cleared }).state;
    expect(era(3).bests.era).toBe(1);
    expect(era(6).bests.era).toBe(2);
    expect(era(12).bests.era).toBe(4);
    expect(tierOf(era(3), 'dispatch.era')).toBe('bronze');
    expect(tierOf(era(6), 'dispatch.era')).toBe('silver');
    expect(tierOf(era(12), 'dispatch.era')).toBe('gold');
    expect(career(era(12), { cleared: 3 }).state.bests.era).toBe(4);
  });

  it('keeps the best Passengers delivered and perfect Shifts in a row', () => {
    const a = career(emptyAchievements(), { delivered: 600 }, { bestPerfectRun: 4 });
    const b = career(a.state, { delivered: 200 }, { bestPerfectRun: 2 }, NOON + 1000);
    expect(b.state.bests.delivered).toBe(600);
    expect(b.state.bests.perfectShifts).toBe(4);
    expect(tierOf(b.state, 'dispatch.delivered')).toBe('bronze');
  });

  it('Right on Time takes the best cleared Shift', () => {
    const history = [shift(1, 10, 7), shift(2, 10, 8), shift(3, 10, 10, false), shift(4, 0, 0), shift(5, 10, 6)];
    const { state } = career(emptyAchievements(), { history });
    expect(state.bests.onTime).toBe(0.8);
    expect(tierOf(state, 'dispatch.onTime')).toBe('silver');
    expect(career(state, { history: [shift(1, 10, 5)] }).state.bests.onTime).toBe(0.8);
  });

  it('sets the Dispatcher secrets from the tally', () => {
    const flags = (tally: Partial<CareerTally>) => career(emptyAchievements(), {}, tally).state.flags;
    expect(flags({})).toEqual([]);
    expect(flags({ closeCall: true })).toEqual(['secret.closeCall']);
    expect(flags({ againstOdds: true })).toEqual(['secret.againstOdds']);
    expect(flags({ ampang: true })).toEqual(['secret.ampang']);
    expect(flags({ survivedTrio: true })).toEqual(['secret.rushHour']);
    expect(tierOf(career(emptyAchievements(), {}, { closeCall: true }).state, 'secret.closeCall')).toBe('secret');
  });

  it('feeds characters, key streak and Back on Track', () => {
    const a = career(emptyAchievements(), { correctChars: 500, metrics: metricsOf(50, 0.85) }, { bestKeyStreak: 120 });
    expect(a.state.counters.characters).toBe(500);
    expect(a.state.bests.keyStreak).toBe(120);
    const b = career(a.state, { metrics: metricsOf(50, 0.98) }, {}, NOON + 1000);
    expect(b.state.counters.comebacks).toBe(1);
  });

  it('a Career does not feed Picking Up Speed', () => {
    const a = career(emptyAchievements(), {});
    expect(a.state.runLog).toEqual({ count: 0, first: [], recent: [], lastAccuracy: 0.98 });
    const b = quick(a.state, {}, NOON + 1000);
    expect(b.state.runLog.count).toBe(1);
    expect(b.state.runLog.first).toHaveLength(1);
  });

  it('does not mutate the state it is given', () => {
    const state = emptyAchievements();
    career(state, { cleared: 6, history: [shift(1, 4, 4)] }, { clears: 3, closeCall: true });
    expect(state).toEqual(emptyAchievements());
  });
});

/** Station ids reachable by walking, as a linked pair; and a pair that is not linked. */
const walkPair = (() => {
  for (const [from, tos] of net.walk) if (tos.length > 0) return [from, tos[0]!] as const;
  throw new Error('no walk link in the data');
})();
const unlinked = [...net.stations.keys()].find((id) => id !== walkPair[0] && !net.walk.get(walkPair[0])?.includes(id))!;
const allIds = [...net.stations.keys()];

describe('Adventure', () => {
  it('a resumed Adventure continues its record and a new one replaces it', () => {
    const a = recordAdventureArrival(net, startAdventure(emptyAchievements(), 'gombak', false), 'gombak', 'KJ', ctx, NOON).state;
    expect(a.adventureRun).toEqual({ start: 'gombak', visited: ['gombak'], lines: ['KJ'] });

    expect(startAdventure(a, 'ampang', true)).toBe(a);
    expect(startAdventure(a, 'ampang', false).adventureRun).toEqual({ start: 'ampang', visited: [], lines: [] });
    expect(startAdventure(emptyAchievements(), 'ampang', true).adventureRun)
      .toEqual({ start: 'ampang', visited: [], lines: [] });
  });

  it('starts a record at the Station when there is none', () => {
    const { state } = recordAdventureArrival(net, emptyAchievements(), 'gombak', 'KJ', ctx, NOON);
    expect(state.adventureRun).toEqual({ start: 'gombak', visited: ['gombak'], lines: ['KJ'] });
  });

  it('adds a Station and Line once, and a walk arrival adds no Line', () => {
    let state = startAdventure(emptyAchievements(), allIds[0]!, false);
    state = recordAdventureArrival(net, state, allIds[0]!, 'KJ', ctx, NOON).state;
    state = recordAdventureArrival(net, state, allIds[1]!, 'KJ', ctx, NOON).state;
    state = recordAdventureArrival(net, state, allIds[0]!, null, ctx, NOON).state;
    expect(state.adventureRun!.visited).toEqual([allIds[0], allIds[1]]);
    expect(state.adventureRun!.lines).toEqual(['KJ']);
    expect(state.sets.adventureLines).toEqual(['KJ']);
    expect(state.sets.days).toEqual(['2026-11-01']);
  });

  it('Long Ride, Seven Colours and Round Trip are awarded on arrival', () => {
    let state = startAdventure(emptyAchievements(), allIds[0]!, false);
    for (let i = 0; i < 19; i += 1) state = recordAdventureArrival(net, state, allIds[i]!, null, ctx, NOON).state;
    expect(state.bests.longRide).toBe(19);
    expect(tierOf(state, 'explorer.longRide')).toBeUndefined();

    // the 20th Station
    state = recordAdventureArrival(net, state, allIds[19]!, LINE_CODES[0]!, ctx, NOON).state;
    expect(state.bests.longRide).toBe(20);
    expect(tierOf(state, 'explorer.longRide')).toBe('bronze');
    expect(state.flags).not.toContain('secret.roundTrip');

    // back at the start with only 19 other Stations visited: the start does not count toward the 20
    state = recordAdventureArrival(net, state, allIds[0]!, null, ctx, NOON).state;
    expect(state.flags).not.toContain('secret.roundTrip');

    state = recordAdventureArrival(net, state, allIds[20]!, null, ctx, NOON).state;
    state = recordAdventureArrival(net, state, allIds[0]!, null, ctx, NOON).state;
    expect(state.flags).toContain('secret.roundTrip');
    expect(tierOf(state, 'secret.roundTrip')).toBe('secret');

    for (const code of LINE_CODES.slice(1, 6)) {
      state = recordAdventureArrival(net, state, allIds[30]!, code, ctx, NOON).state;
    }
    expect(state.flags).not.toContain('secret.sevenColours');
    state = recordAdventureArrival(net, state, allIds[31]!, LINE_CODES[6]!, ctx, NOON).state;
    expect(state.adventureRun!.lines).toHaveLength(7);
    expect(state.flags).toContain('secret.sevenColours');
    expect(state.sets.adventureLines).toHaveLength(7);
  });

  it('counts a Walk link once in either direction', () => {
    const [a, b] = walkPair;
    const there = recordWalk(net, emptyAchievements(), a, b, ctx, NOON);
    expect(there.state.sets.walkLinks).toEqual([[a, b].sort().join('|')]);
    const back = recordWalk(net, there.state, b, a, ctx, NOON);
    expect(back.state.sets.walkLinks).toEqual(there.state.sets.walkLinks);
    expect(tierOf(back.state, 'explorer.walk')).toBe('bronze');
  });

  it('ignores a walk between Stations that are not linked', () => {
    const state = emptyAchievements();
    const result = recordWalk(net, state, walkPair[0], unlinked, ctx, NOON);
    expect(result.state.sets.walkLinks).toEqual([]);
    expect(result.earned).toEqual([]);
  });

  it('counts Junction choices', () => {
    let state = emptyAchievements();
    for (let i = 0; i < 25; i += 1) state = recordJunctionChoice(net, state, ctx, NOON).state;
    expect(state.counters.junctions).toBe(25);
    expect(tierOf(state, 'explorer.junctions')).toBe('bronze');
  });

  it('ends an Adventure with the day and the late-night secrets', () => {
    const { state } = recordAdventureEnd(net, emptyAchievements(), ctx, when(9, 16, 2, 30));
    expect(state.sets.days).toEqual(['2026-09-16']);
    expect(tierOf(state, 'secret.nightOwl')).toBe('secret');
    expect(tierOf(state, 'secret.merdeka')).toBe('secret');
  });
});
