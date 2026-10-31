import { ACHIEVEMENTS } from '../engine/achievementDefs';
import { TIERS, type AchievementState, type Award, type EarnedTier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { slug } from './shareCard';

/** One earned achievement, shared on its own: the badge on the map. */
export interface BadgeCard {
  id: string;
  award: Award;
  name: string;
  /** "Silver · 75 stations", or "Secret". */
  tier: string;
  /** What the image shows, for its alt text. */
  alt: string;
  /** The line of text sent alongside the image. */
  text: string;
  fileName: string;
}

export type BadgeAwarded = Pick<EarnedTier, 'id' | 'award'>;

const AWARD_WORDS: Record<Award, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', secret: 'Secret' };

/** "Silver · 75 stations" for a tier; "Secret" for a secret. */
export function tierLine(net: NetworkIndex, item: BadgeAwarded): string {
  const def = ACHIEVEMENTS.find((a) => a.id === item.id);
  if (!def || def.category === 'secret' || item.award === 'secret') return 'Secret';
  const threshold = def.thresholds(net)[TIERS.indexOf(item.award)]!;
  return `${AWARD_WORDS[item.award]} · ${def.label(threshold, item.award, net)}`;
}

/**
 * True where `badgeCard` can draw `item`: an achievement this version knows, with
 * an award of its kind. A stored state can name one renamed or removed since.
 */
export function canDrawBadge(item: BadgeAwarded): boolean {
  const def = ACHIEVEMENTS.find((a) => a.id === item.id);
  return def !== undefined && (def.category === 'secret') === (item.award === 'secret');
}

/**
 * The card for an earned award. Throws on an achievement that does not exist
 * or an award of the wrong kind, so nothing unearned can be dressed up as one.
 */
export function badgeCard(net: NetworkIndex, item: BadgeAwarded): BadgeCard {
  const def = ACHIEVEMENTS.find((a) => a.id === item.id);
  if (!def || !canDrawBadge(item)) throw new Error(`${item.id} cannot be shared as ${item.award}`);
  const word = AWARD_WORDS[item.award];
  return {
    id: def.id,
    award: item.award,
    name: def.name,
    tier: tierLine(net, item),
    alt: `Achievement card: ${def.name}, ${word}`,
    text: item.award === 'secret'
      ? `I found a secret in KL-Metro Typing: ${def.name}.`
      : `I earned ${def.name} (${word}) in KL-Metro Typing.`,
    fileName: `kl-metro-typing-${slug(def.name)}-${item.award}.png`,
  };
}

/** What `id` can be shared as: its highest award, or null until it is earned (or if it cannot be drawn). */
export function shareableBadge(state: AchievementState, id: string): BadgeAwarded | null {
  const earned = state.earned[id];
  const item = earned ? { id, award: earned.award } : null;
  return item && canDrawBadge(item) ? item : null;
}
