import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ACHIEVEMENTS, CATEGORY_ORDER,
  type AchievementDef, type Category, type EvalContext, type TieredDef,
} from '../engine/achievementDefs';
import { localDay, progressOf } from '../engine/achievements';
import { TIERS, emptyAchievements, type AchievementState, type Tier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { Badge } from '../render/badges/Badge';
import { shareableBadge } from '../share/badgeCard';
import { claimAnnouncements, updateAchievements } from './achievementsStore';
import { ShareSheet, useSheetOpener } from './ShareSheet';
import { usePhoneLayout } from './usePhoneLayout';
import './achievements.css';

export interface AchievementsScreenProps {
  net: NetworkIndex;
  onExit?: () => void;
  embedded?: boolean;
}

const SECTION_TITLES: Record<Category, string> = {
  explorer: 'Explorer',
  line: 'Line Run',
  quick: 'Quick Run',
  dispatch: 'Dispatcher',
  craft: 'Typing craft',
  secret: 'Secrets',
};

const TIER_WORDS: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

const fmt = (n: number) => n.toLocaleString('en-US');
const dateOf = (at: number) => new Date(at).toLocaleDateString();

/** What a tiered row says: its subtitle, and how far the next tier is. */
function describe(net: NetworkIndex, state: AchievementState, ctx: EvalContext, def: TieredDef) {
  const thresholds = def.thresholds(net);
  const earned = state.earned[def.id];
  const reached = earned && earned.award !== 'secret' ? TIERS.indexOf(earned.award) : -1;
  const { value } = progressOf(net, state, ctx, def.id);

  const subtitle = reached >= 0
    ? `${TIER_WORDS[TIERS[reached]!]} · ${def.label(thresholds[reached]!, TIERS[reached]!, net)}`
    : `Locked · ${def.label(thresholds[0], 'bronze', net)} for Bronze`;

  // The progress is towards the tier after the one earned, from the value now:
  // Day Pass's falls back to 0 on a new day, below the tier it already earned.
  // A locked row with nothing done yet already says what Bronze needs.
  const next = reached + 1 < TIERS.length ? { tier: TIERS[reached + 1]!, threshold: thresholds[reached + 1]! } : null;
  let toNext: string | null = null;
  if (next && value < next.threshold && (reached >= 0 || value > 0)) {
    // Decided per achievement: accuracy and on-time are 0-1 fractions even where
    // a threshold (Gold's 100%) happens to be a whole number; an Era or a tier
    // is not a count, so it is named too.
    const fractional = thresholds.some((t) => !Number.isInteger(t));
    toNext = fractional || def.named
      ? `${def.label(next.threshold, next.tier, net)} for ${TIER_WORDS[next.tier]}`
      : `${fmt(Math.ceil(next.threshold - value))} more to ${TIER_WORDS[next.tier]}`;
  }
  return { thresholds, earned, reached, subtitle, toNext };
}

function Row({ net, state, ctx, def, isNew, open, onToggle }: {
  net: NetworkIndex;
  state: AchievementState;
  ctx: EvalContext;
  def: AchievementDef;
  isNew: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const detailId = `${useId()}-detail`;
  const earned = state.earned[def.id];
  const sheet = useSheetOpener();

  if (def.category === 'secret' && !earned) {
    // Nothing to open and nothing to say: not even the name is in the page.
    return (
      <li className="achievement-row" data-state="locked">
        <span className="achievement-face">
          <span className="achievement-badge" aria-hidden="true">
            <Badge id={def.id} award={null} size={56} hidden />
          </span>
          <span className="achievement-text">
            <span className="achievement-name">Secret</span>
          </span>
        </span>
      </li>
    );
  }

  const tiered = def.category === 'secret' ? null : describe(net, state, ctx, def);
  // Only what has been earned, at its highest award: never a locked badge or a Secret's name.
  const shareable = shareableBadge(state, def.id);
  const status = tiered && tiered.reached < 0 ? 'locked' : tiered && tiered.reached === 2 ? 'gold' : 'earned';

  return (
    <li className="achievement-row" data-state={status}>
      <button
        type="button" className="achievement-face" aria-expanded={open}
        aria-controls={open ? detailId : undefined} onClick={onToggle}
      >
        <span className="achievement-badge" aria-hidden="true">
          <Badge id={def.id} award={earned?.award ?? null} size={56} />
        </span>
        <span className="achievement-text">
          <span className="achievement-name">
            {def.name}
            {isNew && <span className="achievement-new">New</span>}
          </span>
          <span className="achievement-sub">{tiered ? tiered.subtitle : 'Secret'}</span>
          {tiered?.toNext && <span className="achievement-next">{tiered.toNext}</span>}
        </span>
      </button>
      {open && (
        <div id={detailId} className="achievement-detail">
          <p className="achievement-desc">{def.description}</p>
          {tiered && def.category !== 'secret' ? (
            <ol>
              {TIERS.map((tier, i) => {
                const at = tiered.earned?.at[tier];
                return (
                  <li key={tier} data-earned={i <= tiered.reached ? 'true' : undefined}>
                    <span className="achievement-tier">{TIER_WORDS[tier]}</span>
                    <span>{def.label(tiered.thresholds[i]!, tier, net)}</span>
                    <span className="achievement-date">
                      {at !== undefined ? `Earned ${dateOf(at)}` : i <= tiered.reached ? 'Earned' : 'Not yet'}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="achievement-date">
              {earned?.at.secret !== undefined ? `Earned ${dateOf(earned.at.secret)}` : 'Earned'}
            </p>
          )}
          {shareable && (
            <button ref={sheet.button} type="button" className="achievement-share" onClick={sheet.show}>
              Share badge
            </button>
          )}
        </div>
      )}
      {shareable && sheet.open && (
        <ShareSheet net={net} choices={[{ kind: 'badge', item: shareable }]} onClose={sheet.close} />
      )}
    </li>
  );
}

export function AchievementsScreen({ net, onExit, embedded = false }: AchievementsScreenProps) {
  const [profile] = useState(() => loadProfile());
  const state = useMemo(() => profile.achievements ?? emptyAchievements(), [profile]);
  const phone = usePhoneLayout();
  // `today` makes Day Pass read 0 once its day has passed; the screen is read on the day it opens.
  const [today] = useState(() => localDay(Date.now()));
  const ctx = useMemo<EvalContext>(() => ({ visited: profile.visited, phone, today }), [profile, phone, today]);
  const [backfilled] = useState(() => state.backfilled?.length ?? 0);
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = useRef(false);

  // Opening the screen is what announces the achievements: the ones waiting
  // are marked New for this visit and cleared, and a backfill note is shown
  // once. A ref rather than the effect's deps, so a StrictMode remount cannot
  // claim twice.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const { items } = claimAnnouncements();
    if (items.length > 0) setClaimed(new Set(items.map((item) => item.id)));
    if (backfilled > 0) updateAchievements((s) => ({ ...s, backfilled: null }));
  }, [backfilled]);

  useEffect(() => {
    if (embedded || !onExit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded, onExit]);

  const earnedCount = ACHIEVEMENTS.filter((a) => state.earned[a.id]).length;
  const secrets = ACHIEVEMENTS.filter((a) => a.category === 'secret');
  const secretsFound = secrets.filter((a) => state.earned[a.id]).length;

  return (
    <div className={`achievements-screen${embedded ? ' achievements-screen--embedded' : ''}`}>
      <header className="achievements-head">
        <div>
          <h2>Achievements</h2>
          <p className="achievements-count">{earnedCount} of {ACHIEVEMENTS.length}</p>
        </div>
        {!embedded && <button type="button" onClick={onExit}>Back to the map</button>}
      </header>

      {backfilled > 0 && (
        <p className="achievements-note" role="status">
          We found {backfilled} {backfilled === 1 ? 'achievement' : 'achievements'} from your earlier travels
        </p>
      )}

      {CATEGORY_ORDER.map((category) => (
        <Section
          key={category}
          category={category}
          meta={category === 'secret' ? `${secretsFound} of ${secrets.length} found` : null}
          note={category === 'dispatch' && phone ? 'Dispatcher is played on a larger screen.' : null}
        >
          {ACHIEVEMENTS.filter((a) => a.category === category).map((def) => (
            <Row
              key={def.id}
              net={net}
              state={state}
              ctx={ctx}
              def={def}
              isNew={claimed.has(def.id)}
              open={openId === def.id}
              onToggle={() => setOpenId((id) => (id === def.id ? null : def.id))}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ category, meta, note, children }: {
  category: Category; meta: string | null; note: string | null; children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="achievements-section" aria-labelledby={headingId}>
      <div className="achievements-section-head">
        <h3 id={headingId}>{SECTION_TITLES[category]}</h3>
        {meta && <span className="achievements-meta">{meta}</span>}
      </div>
      {note && <p className="achievements-section-note">{note}</p>}
      <ul className="achievement-list">{children}</ul>
    </section>
  );
}
