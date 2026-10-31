import { useMemo, type ReactNode } from 'react';
import type { ShareCard } from '../share/shareCard';
import { renderCardPng } from '../share/shareResult';
import { SharePreview, ShareActions } from './ShareActions';
import { usePng } from './usePng';

/** What the card says, for the image's alt text: it stands in for the stats it replaces. */
export function cardAlt(card: ShareCard): string {
  const stats = card.stats.map((s) => `${s.label} ${s.value}`).join(', ');
  return `Result card: ${card.title}. ${card.subtitle}. ${stats}.`;
}

/** Draws a run's card, redrawing only when the card changes. */
export function useCardPng(card: ShareCard) {
  // Callers rebuild the card on every render; only a changed card is redrawn.
  const key = useMemo(() => JSON.stringify(card), [card]);
  return usePng(card, key, () => renderCardPng(card));
}

export interface ShareButtonProps {
  card: ShareCard;
  /** Show the drawn card above the buttons. */
  showImage?: boolean;
  /** Shown instead, when `showImage` is set and the card cannot be drawn. */
  fallback?: ReactNode;
}

/** Share this result as an image. */
export function ShareButton({ card, showImage = false, fallback = null }: ShareButtonProps) {
  const image = useCardPng(card);
  if (image.status === 'none') return <>{showImage ? fallback : null}</>;
  return (
    <>
      {showImage && <SharePreview image={image} alt={cardAlt(card)} />}
      <ShareActions item={card} image={image} shareLabel="Share result" />
    </>
  );
}
