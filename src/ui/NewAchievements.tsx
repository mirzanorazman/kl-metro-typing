import { useEffect, useId, useRef } from 'react';
import { sound } from '../audio/sound';
import { ACHIEVEMENTS } from '../engine/achievementDefs';
import type { EarnedTier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { Badge } from '../render/badges/Badge';
import { tierLine } from '../share/badgeCard';
import './summary.css';

/** How many rows a Summary claims and shows; the rest stay queued as "+n more". */
export const SUMMARY_SHOWN = 3;

/**
 * What a Run just earned, on its Summary: the rows claimed for it (up to
 * SUMMARY_SHOWN), then a count of those still waiting, which the achievements
 * screen marks New. Plays the achievement cue the first time there is
 * something to show.
 */
export function NewAchievements({ net, items, more = 0, onMore }: {
  net: NetworkIndex;
  items: readonly EarnedTier[];
  /** How many are still waiting to be announced after these. */
  more?: number;
  /** Opens the achievements screen; without it "+n more" is plain text. */
  onMore?: () => void;
}) {
  const headingId = useId();
  const chimed = useRef(false);
  const any = items.length > 0;

  useEffect(() => {
    if (!any || chimed.current) return;
    chimed.current = true;
    sound.achievement();
  }, [any]);

  if (!any) return null;

  const moreText = `+${more} more`;

  return (
    <section className="new-achievements" aria-labelledby={headingId}>
      <h3 id={headingId}>New achievements</h3>
      <ul>
        {items.map((item, i) => (
          <li key={item.id} style={{ animationDelay: `${i * 90}ms` }}>
            {/* The row's text names the achievement and its tier, so the badge is decoration here. */}
            <span className="new-achievement-badge" aria-hidden="true">
              <Badge id={item.id} award={item.award} size={56} />
            </span>
            <span className="new-achievement-text">
              <span className="new-achievement-name">{ACHIEVEMENTS.find((a) => a.id === item.id)?.name ?? item.id}</span>
              <span className="new-achievement-tier">{tierLine(net, item)}</span>
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (onMore
        ? <button type="button" className="new-achievements-more" onClick={onMore}>{moreText}</button>
        : <p className="new-achievements-more">{moreText}</p>)}
    </section>
  );
}
