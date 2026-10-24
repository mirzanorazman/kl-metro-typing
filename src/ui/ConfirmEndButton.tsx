import { useEffect, useState, type KeyboardEvent } from 'react';

/** How long the "End Career?" question stays up before it quietly goes away. A UI timing, not game balance. */
export const END_CONFIRM_MS = 4_000;

/**
 * End Career asks first: a click shows "End Career?" with "Yes, end it" and
 * "Keep playing", and the question goes away on its own after
 * `END_CONFIRM_MS`. The Career is never paused while it shows. Only "Yes, end
 * it" calls `onConfirm`.
 *
 * Enter and Space never answer the question: they are game keys, and a stray
 * one must not end a Career. The screen's button shield cancels them while it
 * owns the keys, but between Shifts the Expansion picker owns them and the
 * shield is off, so the answer buttons cancel them themselves. The question is
 * words, not just colour, and answering is by click or tap. `note` says what
 * ending now means for the leaderboard.
 */
export function ConfirmEndButton({ onConfirm, note }: { onConfirm: () => void; note: string }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), END_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" className="dispatch-end" onClick={() => setAsking(true)}>
        End Career
      </button>
    );
  }
  const noKeyAnswers = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
  };
  return (
    <div className="dispatch-end dispatch-end-ask" role="group" aria-label="End Career?">
      <p className="dispatch-end-question">End Career?</p>
      <p className="dispatch-end-note">{note}</p>
      <button type="button" className="dispatch-end-yes" onKeyDown={noKeyAnswers} onClick={onConfirm}>
        Yes, end it
      </button>
      <button type="button" onKeyDown={noKeyAnswers} onClick={() => setAsking(false)}>
        Keep playing
      </button>
    </div>
  );
}
