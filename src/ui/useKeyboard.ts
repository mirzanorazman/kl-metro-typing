import { useEffect } from 'react';
import type { KeySource } from '../engine/keylog';

export type KeyListener = (key: string, source: KeySource) => void;

/**
 * Desktop keyboard event primitive. Suppresses the browser default for
 * printable keys and space so the page never scrolls mid-run. Mobile typing
 * is bridged through TypingInputProvider and useGameInput.
 *
 * Every keystroke carries its Source. This layer never rejects one: blocking
 * an untrusted event here would silently break any assistive tool that
 * dispatches its own, and a player who cannot type has a worse problem than a
 * leaderboard they cannot enter. The Verdict decides; this only reports.
 */
export function useKeyboard(onKey: KeyListener, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || [...e.key].length === 1) e.preventDefault();
      onKey(e.key, { trusted: e.isTrusted, batch: 1 });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, active]);
}
