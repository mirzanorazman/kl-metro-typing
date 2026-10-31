import type { NetworkIndex } from './network';
import type { Profile } from './progress';
import { ACHIEVEMENTS, type EvalContext, type TieredDef } from './achievementDefs';
import { TIERS, emptyAchievements, type AchievementState, type EarnedTier, type Tier } from './achievementState';

export interface Recorded { state: AchievementState; earned: EarnedTier[] }

/** 'YYYY-MM-DD' in the player's local time. */
export function localDay(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** How many tiers a value has reached: 0 none … 3 Gold. */
function tiersReached(value: number, thresholds: readonly number[]): number {
  let reached = 0;
  thresholds.forEach((threshold, i) => {
    if (value >= threshold) reached = i + 1;
  });
  return reached;
}

/**
 * Award every tier the state now reaches that it hasn't been awarded yet.
 * Each tier gets a time in `earned[id].at`; only the highest tier newly reached
 * is announced. Never mutates `state`.
 */
export function evaluate(net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number): Recorded {
  let earnedMap = state.earned;
  const earned: EarnedTier[] = [];

  for (const def of ACHIEVEMENTS) {
    const current = earnedMap[def.id];
    if (def.category === 'secret') {
      if (current || !state.flags.includes(def.id)) continue;
      earnedMap = { ...earnedMap, [def.id]: { award: 'secret', at: { secret: at } } };
      earned.push({ id: def.id, award: 'secret', at });
      continue;
    }

    // `earnedMap` is rebuilt as we go, so All-Rounder sees tiers earned earlier in this pass.
    const reached = tiersReached(def.value({ ...state, earned: earnedMap }, ctx, net), def.thresholds(net));
    const had = current && current.award !== 'secret' ? TIERS.indexOf(current.award) + 1 : 0;
    if (reached <= had) continue;

    const times = { ...current?.at };
    for (let i = had; i < reached; i += 1) times[TIERS[i]!] = at;
    const top = TIERS[reached - 1]!;
    earnedMap = { ...earnedMap, [def.id]: { award: top, at: times } };
    earned.push({ id: def.id, award: top, at });
  }

  if (earned.length === 0) return { state, earned };
  // A tier upgrade shows the new tier, not a second row: drop any pending lower award for the same id.
  const pending = state.unannounced.filter((p) => !earned.some((e) => e.id === p.id));
  return { state: { ...state, earned: earnedMap, unannounced: [...pending, ...earned] }, earned };
}

/** `evaluate` under another name, so a screen that unlocks Stations can say what it's doing. */
export const recordUnlocks = evaluate;

/**
 * Takes up to `limit` waiting announcements, newest first, so a Run's own come before older
 * leftovers; the rest stay queued in their order for the next Summary or the achievements screen.
 * Without a limit, takes them all.
 */
export function takeAnnouncements(
  state: AchievementState, limit = Infinity,
): { state: AchievementState; items: EarnedTier[] } {
  // A stable sort: achievements earned at the same moment keep the table's order.
  const newestFirst = [...state.unannounced].sort((a, b) => b.at - a.at);
  const items = newestFirst.slice(0, limit);
  return { state: { ...state, unannounced: state.unannounced.filter((item) => !items.includes(item)) }, items };
}

/**
 * Achievements for a player who already has a history: what the Profile shows
 * on desktop, awarded quietly. Nothing is announced; `backfilled` names what was found.
 */
export function backfill(net: NetworkIndex, profile: Profile, at: number): AchievementState {
  const seed = profile.achievements ?? emptyAchievements();
  const start: AchievementState = {
    ...seed,
    bests: { ...seed.bests, quickScore: Math.max(seed.bests.quickScore, profile.quickBestOverall ?? 0) },
  };
  const { state, earned } = evaluate(net, start, { visited: profile.visited, phone: false }, at);
  return { ...state, unannounced: [], backfilled: earned.map((e) => e.id) };
}

export function progressOf(
  net: NetworkIndex, state: AchievementState, ctx: EvalContext, id: string,
): { value: number; tier: Tier | null; next: { tier: Tier; threshold: number } | null } {
  const def = ACHIEVEMENTS.find((a): a is TieredDef => a.id === id && a.category !== 'secret');
  if (!def) return { value: 0, tier: null, next: null };
  const value = def.value(state, ctx, net);
  const thresholds = def.thresholds(net);
  const reached = tiersReached(value, thresholds);
  return {
    value,
    tier: reached > 0 ? TIERS[reached - 1]! : null,
    next: reached < TIERS.length ? { tier: TIERS[reached]!, threshold: thresholds[reached]! } : null,
  };
}
