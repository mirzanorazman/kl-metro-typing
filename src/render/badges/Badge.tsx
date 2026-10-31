import { ACHIEVEMENTS } from '../../engine/achievementDefs';
import type { Award } from '../../engine/achievementState';
import { BADGE_ART } from './art';
import { INK } from './art/ink';
import { BadgeFrame, type FrameMetal } from './BadgeFrame';
import './badges.css';

/** An achievement's award as a badge shows it; null is locked. */
export type BadgeAward = Award | null;

const AWARD_WORDS: Record<Award, string> = {
  bronze: 'Bronze', silver: 'Silver', gold: 'Gold', secret: 'Secret',
};

/** An unearned secret: a question mark, and nothing of the real drawing. */
function QuestionMark() {
  return (
    <g data-badge-hidden="">
      <path d="M76 76 Q76 46 100 46 Q124 46 124 72 Q124 88 110 96 Q100 102 100 116 V122"
        fill="none" stroke={INK.charcoal} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={100} cy={152} r={12} fill={INK.charcoal} />
    </g>
  );
}

/**
 * An achievement's badge at `size` px square. The accessible name carries the
 * award in words, so the frame's metal is never the only signal of the tier.
 * `hidden` draws an unearned secret: a "?" in the locked style, named only "Secret".
 */
export function Badge({ id, award, size, hidden = false }: {
  id: string; award: BadgeAward; size: number; hidden?: boolean;
}) {
  const name = ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
  const label = hidden ? 'Secret' : `${name}, ${award ? AWARD_WORDS[award] : 'Locked'}`;
  const locked = hidden || award === null;
  const metal: FrameMetal = award === null || hidden ? 'silver' : award;
  const Art = hidden ? QuestionMark : BADGE_ART[id];

  return (
    <svg
      className={locked ? 'badge badge--locked' : 'badge'}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      <BadgeFrame metal={metal}>
        {Art && <Art />}
      </BadgeFrame>
    </svg>
  );
}
