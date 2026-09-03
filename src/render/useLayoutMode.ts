import { useCallback, useEffect, useRef, useState } from 'react';
import { easeInOut, lerpLayouts, type Layout, type LayoutMode } from '../geo/layout';

const MORPH_MS = 600;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useLayoutMode(geo: Layout, schematic: Layout, initial: LayoutMode) {
  const layoutFor = useCallback(
    (m: LayoutMode) => (m === 'geo' ? geo : schematic),
    [geo, schematic],
  );

  const [mode, setModeState] = useState<LayoutMode>(initial);
  const [layout, setLayout] = useState<Layout>(() => layoutFor(initial));
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const setMode = useCallback(
    (next: LayoutMode, opts?: { animate?: boolean }) => {
      const animate = (opts?.animate ?? true) && !prefersReducedMotion();
      const from = layout;
      const to = layoutFor(next);
      setModeState(next);

      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (!animate) {
        setLayout(to);
        return;
      }

      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / MORPH_MS);
        setLayout(lerpLayouts(from, to, easeInOut(t)));
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [layout, layoutFor],
  );

  return { mode, layout, setMode };
}
