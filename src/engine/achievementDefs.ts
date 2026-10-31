import type { NetworkIndex } from './network';
import { ERAS } from './dispatchNetwork';
import { TIERS, type AchievementState, type Tier } from './achievementState';

export type Category = 'explorer' | 'line' | 'quick' | 'dispatch' | 'craft' | 'secret';

/** What the evaluator knows besides the stored state. */
export interface EvalContext {
  /** The Profile's Unlocked Stations. */
  visited: readonly string[];
  /** The phone layout: Dispatcher can't be played there, so All-Rounder skips it. */
  phone: boolean;
  /**
   * The local day ('YYYY-MM-DD') a display is for, so Day Pass reads 0 once its day has passed.
   * Left out at record time, where the stored day is always the Run's own.
   */
  today?: string;
}

export interface TieredDef {
  id: string;
  name: string;
  category: Exclude<Category, 'secret'>;
  /** One sentence on what the achievement asks of the player, shown when its row is opened. */
  description: string;
  /** Bronze, Silver, Gold. "All" thresholds come from the data. */
  thresholds: (net: NetworkIndex) => readonly [number, number, number];
  /** What the player has reached, in the same unit as the thresholds. */
  value: (s: AchievementState, ctx: EvalContext, net: NetworkIndex) => number;
  /** What a threshold means in words, e.g. "75 stations". */
  label: (threshold: number, tier: Tier, net: NetworkIndex) => string;
  /**
   * Progress reads as the next tier's label ("2015–17 for Silver"), not "n more": set where the
   * value is not a count of anything, such as an Era or a tier.
   */
  named?: true;
}
/** A Secret's description says what the player did, so it is shown only once earned. */
export interface SecretDef { id: string; name: string; category: 'secret'; description: string }
export type AchievementDef = TieredDef | SecretDef;

export const CATEGORY_ORDER: readonly Category[] = ['explorer', 'line', 'quick', 'dispatch', 'craft', 'secret'];

/** A Station name long enough to be a mouthful. */
export function isLongName(name: string): boolean {
  return name.length >= 20;
}

const countsCache = new WeakMap<NetworkIndex, ReturnType<typeof networkCounts>>();

/** The first and last Station of every Line, each counted once. */
function terminusIds(net: NetworkIndex): Set<string> {
  const ids = new Set<string>();
  for (const line of net.lines.values()) {
    ids.add(line.stations[0]!);
    ids.add(line.stations[line.stations.length - 1]!);
  }
  return ids;
}

export function networkCounts(net: NetworkIndex): {
  stations: number; interchanges: number; termini: number; walkLinks: number; lines: number; longNames: number;
} {
  const cached = countsCache.get(net);
  if (cached) return cached;
  const stations = [...net.stations.values()];
  let walkEnds = 0;
  for (const ids of net.walk.values()) walkEnds += ids.length;
  const counts = {
    stations: stations.length,
    interchanges: stations.filter((s) => Object.keys(s.codes).length > 1).length,
    termini: terminusIds(net).size,
    walkLinks: walkEnds / 2, // each link is stored from both ends
    lines: net.lines.size,
    longNames: stations.filter((s) => isLongName(s.name)).length,
  };
  countsCache.set(net, counts);
  return counts;
}

// --- helpers ---------------------------------------------------------------

type Counts = ReturnType<typeof networkCounts>;
type Threshold = readonly [number, number, number];

const fixed = (a: number, b: number, c: number) => (): Threshold => [a, b, c];
const withAll = (a: number, b: number, all: keyof Counts) => (net: NetworkIndex): Threshold =>
  [a, b, networkCounts(net)[all]];

const fmt = (n: number) => n.toLocaleString('en-US');
const percent = (n: number) => `${Math.round(n * 100)}%`;
const cap = (tier: Tier) => tier[0]!.toUpperCase() + tier.slice(1);

/** "5 Walk links", "1 Walk link", or "all 5 Walk links" for a Gold that is the whole set. */
function counted(one: string, many: string, all?: keyof Counts) {
  return (n: number, tier: Tier, net: NetworkIndex) => {
    const noun = n === 1 ? one : many;
    return all && tier === 'gold' && n === networkCounts(net)[all] ? `all ${fmt(n)} ${many}` : `${fmt(n)} ${noun}`;
  };
}
const plain = (suffix: string) => (n: number) => `${fmt(n)} ${suffix}`;

function visitedCount(ctx: EvalContext, net: NetworkIndex, qualifies: (id: string) => boolean): number {
  let n = 0;
  for (const id of new Set(ctx.visited)) if (net.stations.has(id) && qualifies(id)) n += 1;
  return n;
}

function mean(entries: readonly { wpm: number }[]): number {
  return entries.reduce((sum, e) => sum + e.wpm, 0) / entries.length;
}

/** The mean-WPM climb needs this many logged Runs before it means anything. */
const SPEED_UP_MIN_RUNS = 20;

/** Highest tier index (0 none, 1 Bronze … 3 Gold) earned among a category's achievements. */
function bestTierIn(s: AchievementState, category: Category): number {
  let best = 0;
  for (const def of ACHIEVEMENTS) {
    if (def.category !== category) continue;
    const award = s.earned[def.id]?.award;
    if (award && award !== 'secret') best = Math.max(best, TIERS.indexOf(award) + 1);
  }
  return best;
}

function secret(id: string, name: string, description: string): SecretDef {
  return { id, name, category: 'secret', description };
}

// --- the table -------------------------------------------------------------

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Explorer
  { id: 'explorer.unlocked', name: 'Jalan-Jalan', category: 'explorer',
    description: 'Unlock Stations by reaching them in a Line Run, a Quick Run or Adventure.',
    thresholds: withAll(25, 75, 'stations'),
    value: (_s, ctx, net) => visitedCount(ctx, net, () => true),
    label: counted('station', 'stations', 'stations') },
  { id: 'explorer.interchanges', name: 'All Change', category: 'explorer',
    description: 'Reach Interchanges, the Stations where two or more Lines meet.',
    thresholds: withAll(5, 12, 'interchanges'),
    value: (_s, ctx, net) => visitedCount(ctx, net, (id) => Object.keys(net.stations.get(id)!.codes).length > 1),
    label: counted('Interchange', 'Interchanges', 'interchanges') },
  { id: 'explorer.termini', name: 'End of the Line', category: 'explorer',
    description: 'Reach the Terminus at either end of a Line.',
    thresholds: withAll(3, 7, 'termini'),
    value: (_s, ctx, net) => {
      const ends = terminusIds(net);
      return visitedCount(ctx, net, (id) => ends.has(id));
    },
    label: counted('Terminus', 'Termini', 'termini') },
  { id: 'explorer.walk', name: 'Walk It Off', category: 'explorer',
    description: 'In Adventure, take the walkways that join two differently named Stations.',
    thresholds: (net) => [1, 3, networkCounts(net).walkLinks],
    // A link counts only while the network still has it, as Both Ways checks its ends.
    value: (s, _ctx, net) => s.sets.walkLinks.filter((key) => {
      const [from, to] = key.split('|');
      return from !== undefined && to !== undefined && net.walk.get(from)?.includes(to) === true;
    }).length,
    label: counted('Walk link', 'Walk links', 'walkLinks') },
  { id: 'explorer.junctions', name: 'Crossroads', category: 'explorer',
    description: 'In Adventure, choose your Direction whenever a Junction offers more than one.',
    thresholds: fixed(25, 100, 500),
    value: (s) => s.counters.junctions,
    label: plain('Junction choices') },
  { id: 'explorer.longRide', name: 'Long Ride', category: 'explorer',
    description: 'Visit this many different Stations in a single Adventure, resumes included.',
    thresholds: fixed(20, 50, 100),
    value: (s) => s.bests.longRide,
    label: plain('stations in one ride') },
  { id: 'explorer.lines', name: 'Every Line', category: 'explorer',
    description: 'Ride each Line at least once in Adventure.',
    thresholds: withAll(3, 5, 'lines'),
    value: (s) => s.sets.adventureLines.length,
    label: counted('Line', 'Lines', 'lines') },

  // Line Run
  { id: 'line.completed', name: 'End to End', category: 'line',
    description: 'Type a Line from one Terminus to the other.',
    thresholds: withAll(1, 4, 'lines'),
    value: (s) => s.sets.linesCompleted.length,
    label: counted('Line', 'Lines', 'lines') },
  { id: 'line.accuracy', name: 'Spotless', category: 'line',
    description: 'Finish a whole Line with this Accuracy or better.',
    thresholds: fixed(0.97, 0.99, 1),
    value: (s) => s.bests.lineAccuracy,
    label: (n) => `${percent(n)} accuracy` },
  { id: 'line.score', name: 'Line Speed', category: 'line',
    description: 'Reach this Score on a whole Line. Score is WPM multiplied by Accuracy squared.',
    thresholds: fixed(30, 45, 60),
    value: (s) => Math.max(0, ...Object.values(s.bests.lineScore)),
    label: plain('Score') },
  { id: 'line.bothWays', name: 'Both Ways', category: 'line',
    description: 'Complete a Line starting from each of its two Termini.',
    thresholds: withAll(1, 4, 'lines'),
    value: (s, _ctx, net) => {
      let n = 0;
      for (const line of net.lines.values()) {
        // Line.termini holds display names; a direction is keyed by the end Station's id.
        const ends = [line.stations[0]!, line.stations[line.stations.length - 1]!];
        if (ends.every((id) => s.sets.lineDirections.includes(`${line.code}:${id}`))) n += 1;
      }
      return n;
    },
    label: counted('Line', 'Lines', 'lines') },
  { id: 'line.stations', name: 'Long Line', category: 'line',
    description: 'Every Station you type in a Line Run counts, whether you finish the Line or not.',
    thresholds: fixed(200, 1000, 5000),
    value: (s) => s.counters.lineStations,
    label: plain('stations typed') },
  { id: 'line.personalBest', name: 'Personal Best', category: 'line',
    description: 'Beat your own best Score on a Line you have completed before.',
    thresholds: fixed(3, 10, 30),
    value: (s) => s.counters.linePersonalBests,
    label: plain('personal bests') },
  { id: 'line.dayPass', name: 'Day Pass', category: 'line',
    description: 'Complete this many different Lines on the same day.',
    thresholds: withAll(2, 4, 'lines'),
    value: (s, ctx) => (!s.dayPass || (ctx.today !== undefined && s.dayPass.day !== ctx.today) ? 0 : s.dayPass.lines.length),
    label: (n, tier, net) => `${counted('Line', 'Lines', 'lines')(n, tier, net)} in one day` },

  // Quick Run
  { id: 'quick.score', name: 'Express Service', category: 'quick',
    description: 'Reach this Score in a 30-second Quick Run.',
    thresholds: fixed(40, 60, 80),
    value: (s) => s.bests.quickScore,
    label: plain('Score') },
  { id: 'quick.jumps', name: 'Line Hopper', category: 'quick',
    description: 'Reach the end of a Line inside one Quick Run and Jump to another, this many times.',
    thresholds: fixed(1, 2, 3),
    value: (s) => s.bests.quickJumps,
    label: counted('Jump', 'Jumps') },
  { id: 'quick.completed', name: 'Tapau Run', category: 'quick',
    description: 'Play Quick Runs through to the end of the clock.',
    thresholds: fixed(10, 50, 250),
    value: (s) => s.counters.quickCompleted,
    label: plain('Quick Runs') },
  { id: 'quick.clean', name: 'Clean Thirty', category: 'quick',
    description: 'Finish a Quick Run without a single wrong key.',
    thresholds: fixed(1, 5, 20),
    value: (s) => s.counters.quickClean,
    label: counted('flawless Quick Run', 'flawless Quick Runs') },
  { id: 'quick.improved', name: 'Up the Line', category: 'quick',
    description: 'Raise your best Quick Run Score above your first. It rewards getting better, not starting fast.',
    thresholds: fixed(10, 25, 50),
    value: (s) => s.bests.quickImproved,
    label: (n) => `+${fmt(n)} Score` },
  { id: 'quick.starts', name: 'Every Start', category: 'quick',
    description: 'Start Quick Runs on different Lines.',
    thresholds: withAll(3, 5, 'lines'),
    value: (s) => s.sets.quickStarts.length,
    label: counted('starting Line', 'starting Lines', 'lines') },
  { id: 'quick.backToBack', name: 'One More Go', category: 'quick',
    description: 'Start each Quick Run within a minute of the last one finishing.',
    thresholds: fixed(3, 5, 10),
    value: (s) => s.bests.quickChain,
    label: plain('Quick Runs in a row') },

  // Dispatcher
  { id: 'dispatch.era', name: 'Through the Eras', category: 'dispatch',
    description: 'Keep one Career going into later Eras of KL rail history. A new Era opens every 3 Shifts.',
    thresholds: fixed(1, 2, 4),
    value: (s) => s.bests.era,
    label: (n) => ERAS[n]?.label ?? `Era ${n}`,
    named: true },
  { id: 'dispatch.delivered', name: 'Packed In', category: 'dispatch',
    description: 'Deliver this many Passengers in a single Career.',
    thresholds: fixed(500, 1500, 4000),
    value: (s) => s.bests.delivered,
    label: plain('Passengers in one Career') },
  { id: 'dispatch.clears', name: 'All Clear', category: 'dispatch',
    description: 'Clear Signals by typing their Station names, across all your Careers.',
    thresholds: fixed(100, 1000, 10000),
    value: (s) => s.counters.clears,
    label: plain('Signals cleared') },
  { id: 'dispatch.incidents', name: 'On It', category: 'dispatch',
    description: 'Fix signal faults, train faults and crowd surges before they close a Station.',
    thresholds: fixed(10, 50, 200),
    value: (s) => s.counters.fixes,
    label: plain('Incidents fixed') },
  { id: 'dispatch.gaps', name: 'Mind the Gap', category: 'dispatch',
    description: 'Fix Service gaps by holding the rear Train.',
    thresholds: fixed(5, 25, 100),
    value: (s) => s.counters.gapsHeld,
    label: plain('Service gaps held') },
  { id: 'dispatch.perfect', name: 'Perfect Service', category: 'dispatch',
    description: 'Clear Shifts in a row without a single Station going Out of service.',
    thresholds: fixed(1, 3, 5),
    value: (s) => s.bests.perfectShifts,
    label: counted('perfect Shift in a row', 'perfect Shifts in a row') },
  { id: 'dispatch.onTime', name: 'Right on Time', category: 'dispatch',
    description: 'Keep this share of calls on time across a Shift you clear.',
    thresholds: fixed(0.7, 0.8, 0.9),
    value: (s) => s.bests.onTime,
    label: (n) => `${percent(n)} on time` },
  { id: 'dispatch.express', name: 'Express Stopper', category: 'dispatch',
    description: 'Take express offers by typing their skip chip.',
    thresholds: fixed(10, 50, 200),
    value: (s) => s.counters.express,
    label: plain('express stops') },

  // Typing craft
  { id: 'craft.streak', name: 'Steady Hands', category: 'craft',
    description: 'Type this many correct keys in a row in one Run.',
    thresholds: fixed(100, 250, 500),
    value: (s) => s.bests.keyStreak,
    label: plain('correct keys in a row') },
  { id: 'craft.longNames', name: 'Mouthful', category: 'craft',
    description: 'Type Station names of 20 or more characters without a wrong key.',
    thresholds: withAll(3, 6, 'longNames'),
    value: (s, _ctx, net) => s.sets.longNames.filter((id) => {
      const name = net.stations.get(id)?.name;
      return name !== undefined && isLongName(name);
    }).length,
    label: counted('long name', 'long names', 'longNames') },
  { id: 'craft.comeback', name: 'Back on Track', category: 'craft',
    description: 'Follow a Run under 90% Accuracy with one at 97% or better.',
    thresholds: fixed(1, 5, 20),
    value: (s) => s.counters.comebacks,
    label: counted('comeback', 'comebacks') },
  { id: 'craft.days', name: 'Regular Commuter', category: 'craft',
    description: 'Play on this many different days. They do not need to be in a row.',
    thresholds: fixed(7, 30, 100),
    value: (s) => s.sets.days.length,
    label: plain('days') },
  { id: 'craft.characters', name: 'Mileage', category: 'craft',
    description: 'Every correct character you type adds to the total.',
    thresholds: fixed(10000, 100000, 1000000),
    value: (s) => s.counters.characters,
    label: plain('characters') },
  { id: 'craft.speedUp', name: 'Picking Up Speed', category: 'craft',
    description: 'Raise the average WPM of your last 10 Line Runs and Quick Runs above your first 10.',
    thresholds: fixed(5, 10, 20),
    value: (s) => {
      const { count, first, recent } = s.runLog;
      if (count < SPEED_UP_MIN_RUNS || first.length === 0 || recent.length === 0) return 0;
      return mean(recent) - mean(first);
    },
    label: (n) => `+${fmt(n)} WPM` },
  { id: 'craft.allRounder', name: 'All-Rounder', category: 'craft',
    description: 'Earn at least this tier in Explorer, Line Run, Quick Run and Dispatcher. On a phone, Dispatcher is not needed.',
    thresholds: fixed(1, 2, 3),
    value: (s, ctx) => {
      const required: Category[] = ['explorer', 'line', 'quick'];
      if (!ctx.phone) required.push('dispatch');
      return Math.min(...required.map((c) => bestTierIn(s, c)));
    },
    label: (_n, tier) => `all ${cap(tier)}`,
    named: true },

  // Secrets
  secret('secret.ampang', 'Not That Ampang',
    'You pressed Enter to Clear Ampang while Ampang Park still matched.'),
  secret('secret.roundTrip', 'Round Trip',
    'You came back to where an Adventure began, after 20 other Stations.'),
  secret('secret.rushHour', 'Rush Hour Survivor',
    'Three Incidents at once, and you fixed every one before it closed a Station.'),
  secret('secret.sevenColours', 'Seven Colours',
    'You rode all seven Lines in one Adventure.'),
  secret('secret.lastTrain', 'Last Train Home',
    'You finished a Station in the last second of a Quick Run.'),
  secret('secret.sixteen', 'Sweet Sixteen',
    'You typed 16 Sierra without a wrong key.'),
  secret('secret.puchong', 'Puchong in One Breath',
    'You typed Taman Perindustrian Puchong without a wrong key, at 60 WPM or faster.'),
  secret('secret.closeCall', 'Close Call',
    'You fixed an Incident with 3 seconds or less to spare.'),
  secret('secret.againstOdds', 'Against the Odds',
    'You cleared a Shift after three or more Stations went Out of service in it.'),
  secret('secret.nightOwl', 'Night Owl',
    'You finished a Run between midnight and 4 a.m.'),
  secret('secret.merdeka', 'Merdeka!',
    'You played on Merdeka Day or Malaysia Day.'),
];
