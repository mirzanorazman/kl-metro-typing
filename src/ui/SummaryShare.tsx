import type { ReactNode } from 'react';
import type { EarnedTier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { canDrawBadge } from '../share/badgeCard';
import type { ShareCard } from '../share/shareCard';
import { SharePreview } from './ShareActions';
import { cardAlt, ShareButton, useCardPng } from './ShareButton';
import { ShareSheet, useSheetOpener, type ShareChoice } from './ShareSheet';
import './share.css';

/** "Share…", and the sheet it opens. Focus comes back to it on close. */
function AskWhat({ net, choices }: { net: NetworkIndex; choices: readonly ShareChoice[] }) {
  const sheet = useSheetOpener();
  return (
    <>
      <div className="share-result">
        <button ref={sheet.button} type="button" onClick={sheet.show}>Share…</button>
      </div>
      {sheet.open && <ShareSheet net={net} choices={choices} onClose={sheet.close} />}
    </>
  );
}

function badgeChoices(items: readonly EarnedTier[]): ShareChoice[] {
  return items.map((item) => ({ kind: 'badge', item: { id: item.id, award: item.award } }));
}

function WithRun({ net, card, items, showImage, fallback }: {
  net: NetworkIndex; card: ShareCard; items: readonly EarnedTier[]; showImage: boolean; fallback: ReactNode;
}) {
  // Drawn once, for the Summary's preview and the sheet's "This run" alike.
  const image = useCardPng(card);
  return (
    <>
      {showImage && <SharePreview image={image} alt={cardAlt(card)} fallback={fallback} />}
      <AskWhat net={net} choices={[{ kind: 'run', card, image }, ...badgeChoices(items)]} />
    </>
  );
}

/**
 * A Summary's share. With nothing new earned it is the run's share as it always
 * was; with new achievements it is one "Share…" that asks what to share: this
 * run, or one of the badges the Summary shows.
 */
export function SummaryShare({ net, card, items, showImage = false, fallback = null }: {
  net: NetworkIndex;
  /** The run's card; null where the run has none to share. */
  card: ShareCard | null;
  /** The new achievements the Summary shows, never the "+n more". */
  items: readonly EarnedTier[];
  /** Show the run's drawn card above the share. */
  showImage?: boolean;
  /** Shown in place of the drawn card where it cannot be drawn. */
  fallback?: ReactNode;
}) {
  const shareable = items.filter(canDrawBadge);
  if (shareable.length === 0) return card ? <ShareButton card={card} showImage={showImage} fallback={fallback} /> : null;
  if (!card) return <AskWhat net={net} choices={badgeChoices(shareable)} />;
  return <WithRun net={net} card={card} items={shareable} showImage={showImage} fallback={fallback} />;
}
