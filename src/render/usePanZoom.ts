import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point, ViewBox } from '../data/types';
import { easeInOut } from '../geo/layout';
import { prefersReducedMotion } from './useLayoutMode';

export type { ViewBox };

const FIT_MS = 500;

// Roughly three station gaps (grid STEP is 44), which is as far in as the
// map stays useful. The whole network spans about 1364 x 1100 units.
const MIN_WIDTH = 120;
const MAX_WIDTH = 6000;

/** Zooms by `factor` about the point (fx, fy) in view-box coordinates. */
export function zoomAt(v: ViewBox, factor: number, fx: number, fy: number): ViewBox {
  const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v.w * factor));
  const applied = w / v.w;
  const h = v.h * applied;
  return {
    w,
    h,
    x: fx - (fx - v.x) * applied,
    y: fy - (fy - v.y) * applied,
  };
}

export function panBy(v: ViewBox, dx: number, dy: number): ViewBox {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

export function viewBoxString(v: ViewBox): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

export function usePanZoom(initial: ViewBox) {
  const [view, setView] = useState<ViewBox>(initial);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const viewRef = useRef(initial);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const fitFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);
  }, []);

  const fit = useCallback((box: ViewBox, opts?: { animate?: boolean }) => {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);

    const animate = (opts?.animate ?? true) && !prefersReducedMotion();
    if (!animate) {
      setView(box);
      return;
    }

    const from = viewRef.current;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / FIT_MS);
      const e = easeInOut(t);
      setView({
        x: from.x + (box.x - from.x) * e,
        y: from.y + (box.y - from.y) * e,
        w: from.w + (box.w - from.w) * e,
        h: from.h + (box.h - from.h) * e,
      });
      if (t < 1) fitFrame.current = requestAnimationFrame(step);
    };
    fitFrame.current = requestAnimationFrame(step);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    setView((v) => {
      const fx = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
      const fy = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
      return zoomAt(v, e.deltaY > 0 ? 1.1 : 0.9, fx, fy);
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const from = dragging.current;
    if (!from) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setView((v) => {
      const dx = ((e.clientX - from.x) / rect.width) * v.w;
      const dy = ((e.clientY - from.y) / rect.height) * v.h;
      return panBy(v, -dx, -dy);
    });
    dragging.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  /**
   * Recentres on a point at the current zoom. `biasY` says where in the frame
   * the point should sit vertically (0.5 = middle); play screens bias it
   * upward so the train centres in the area the typing panel does not cover.
   */
  const centreOn = useCallback(
    (p: Point, opts?: { animate?: boolean; biasY?: number }) => {
      const v = viewRef.current;
      const biasY = opts?.biasY ?? 0.5;
      fit({ x: p.x - v.w / 2, y: p.y - v.h * biasY, w: v.w, h: v.h }, opts);
    },
    [fit],
  );

  return {
    view,
    setView,
    fit,
    centreOn,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp },
  };
}
