import { takeAnnouncements, type Recorded } from '../engine/achievements';
import { emptyAchievements, type AchievementState, type EarnedTier } from '../engine/achievementState';
import { loadProfile, saveProfile } from '../engine/progress';

/**
 * The one place a screen changes the achievements: loads the Profile, applies
 * `apply` to its achievements with its Unlocked Stations, saves, and returns
 * what was newly earned. Loading here, immediately before saving, keeps a
 * screen's own stale copy of the Profile from overwriting another's write. A
 * screen that keeps a Profile ref must refresh it from `loadProfile()` after.
 */
export function updateAchievements(
  apply: (state: AchievementState, visited: readonly string[]) => Recorded | AchievementState,
): EarnedTier[] {
  const profile = loadProfile();
  const before = profile.achievements ?? emptyAchievements();
  const result = apply(before, profile.visited);
  const { state, earned } = 'state' in result ? result : { state: result, earned: [] };
  if (state !== before) saveProfile({ ...profile, achievements: state });
  return earned;
}

/** Announcements taken to show, and how many are still waiting after them. */
export interface Claimed { items: EarnedTier[]; more: number }
export const NOTHING_CLAIMED: Claimed = { items: [], more: 0 };

/**
 * Takes what is waiting to be announced from the saved achievements, so each
 * shows once: up to `limit`, newest first, leaving the rest queued for the
 * next Summary or the achievements screen. Without a limit, takes them all.
 */
export function claimAnnouncements(limit = Infinity): Claimed {
  const profile = loadProfile();
  if (!profile.achievements || profile.achievements.unannounced.length === 0) return NOTHING_CLAIMED;
  const { state, items } = takeAnnouncements(profile.achievements, limit);
  saveProfile({ ...profile, achievements: state });
  return { items, more: state.unannounced.length };
}
