import { useEffect } from 'react';

/**
 * Captures every keystroke for the game. Suppresses the browser default for
 * printable keys and space so the page never scrolls mid-run.
 */
export function useKeyboard(onKey: (key: string) => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || [...e.key].length === 1) e.preventDefault();
      onKey(e.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, active]);
}
