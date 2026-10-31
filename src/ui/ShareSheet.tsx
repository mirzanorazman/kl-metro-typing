import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { EarnedTier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { Badge } from '../render/badges/Badge';
import { badgeCard } from '../share/badgeCard';
import type { ShareCard } from '../share/shareCard';
import { renderBadgePng } from '../share/shareResult';
import { ShareActions, SharePreview } from './ShareActions';
import { cardAlt } from './ShareButton';
import { usePhoneLayout } from './usePhoneLayout';
import { usePng, type PngState } from './usePng';
import './share.css';

/** Something the sheet can share: the run, already drawn, or one earned badge. */
export type ShareChoice =
  | { kind: 'run'; card: ShareCard; image: PngState }
  | { kind: 'badge'; item: Pick<EarnedTier, 'id' | 'award'> };

const FAILED = <p className="share-sheet-failed">This image couldn&apos;t be drawn.</p>;

function RunPanel({ choice, hidden }: { choice: Extract<ShareChoice, { kind: 'run' }>; hidden: boolean }) {
  return (
    <div className="share-sheet-panel" data-testid="share-sheet-panel" hidden={hidden}>
      <SharePreview image={choice.image} alt={cardAlt(choice.card)} fallback={FAILED} />
      <ShareActions item={choice.card} image={choice.image} shareLabel="Share" />
    </div>
  );
}

function BadgePanel({ net, choice, hidden }: {
  net: NetworkIndex; choice: Extract<ShareChoice, { kind: 'badge' }>; hidden: boolean;
}) {
  const card = useMemo(() => badgeCard(net, choice.item), [net, choice.item]);
  const image = usePng(card, card.fileName, () => renderBadgePng(net, card));
  return (
    <div className="share-sheet-panel" data-testid="share-sheet-panel" hidden={hidden}>
      <SharePreview image={image} alt={card.alt} fallback={FAILED} />
      <ShareActions item={card} image={image} shareLabel="Share" />
    </div>
  );
}

function choiceName(choice: ShareChoice, net: NetworkIndex): string {
  return choice.kind === 'run' ? 'This run' : badgeCard(net, choice.item).name;
}

/** A route between two stops: the mark for "This run". */
function RunMark() {
  return (
    <svg className="share-choice-run" viewBox="0 0 40 40" width={40} height={40}>
      <path d="M9 30 L18 18 L31 10" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={9} cy={30} r={5} fill="var(--panel)" stroke="currentColor" strokeWidth={3} />
      <circle cx={31} cy={10} r={6} fill="currentColor" />
    </svg>
  );
}

/**
 * Open and close state for a button that opens the sheet. Focus goes back to
 * that button once the sheet has gone, after the sheet's own restore, which
 * cannot count on the button having taken focus from the click (Safari's
 * buttons do not).
 */
export function useSheetOpener() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return { open, button, show: () => setOpen(true), close: () => setOpen(false) };
}

const FOCUSABLE = 'button:not([disabled]), input[type="radio"]:checked';

/**
 * Share one thing: the run, or a badge. A bottom sheet on a phone, a centred
 * dialog otherwise. Every choice starts drawing on open, so Share is ready by
 * the time it is tapped; only the chosen one shows.
 */
export function ShareSheet({ net, choices, onClose }: {
  net: NetworkIndex;
  choices: readonly ShareChoice[];
  onClose: () => void;
}) {
  const headingId = useId();
  const group = useId();
  const phone = usePhoneLayout();
  const [chosen, setChosen] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);

  // Esc is the sheet's wherever focus is: Safari leaves a clicked button
  // unfocused, so focus can be on the page behind. Caught at the window in the
  // capture phase, it never reaches the achievements screen's own Esc.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, []);

  // Focus moves in on open and back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const start = dialog.current?.querySelector<HTMLElement>('input[type="radio"]:checked')
      ?? dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    start?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialog.current) return;
    const stops = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]'));
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="share-sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`share-sheet${phone ? ' share-sheet--phone' : ''}`}
        role="dialog"
        aria-modal="true"
        // A click on the sheet's own text keeps focus inside, so Tab stays trapped.
        tabIndex={-1}
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
      >
        <div className="share-sheet-head">
          <h2 id={headingId}>Share</h2>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="share-sheet-body">
          {choices.length > 1 && (
            <div className="share-sheet-choices" role="radiogroup" aria-label="What to share">
              {choices.map((choice, i) => (
                <label key={choice.kind === 'run' ? 'run' : choice.item.id} className="share-choice">
                  <input
                    type="radio"
                    name={group}
                    checked={chosen === i}
                    onChange={() => setChosen(i)}
                  />
                  <span className="share-choice-thumb" aria-hidden="true">
                    {choice.kind === 'run' ? <RunMark /> : <Badge id={choice.item.id} award={choice.item.award} size={40} />}
                  </span>
                  <span className="share-choice-name">{choiceName(choice, net)}</span>
                </label>
              ))}
            </div>
          )}

          <div className="share-sheet-panels">
            {choices.map((choice, i) => (choice.kind === 'run'
              ? <RunPanel key="run" choice={choice} hidden={chosen !== i} />
              : <BadgePanel key={choice.item.id} net={net} choice={choice} hidden={chosen !== i} />))}
          </div>
        </div>
      </div>
    </div>
  );
}
