import { useCallback, useRef, useState } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_WIDTH = 20;
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

  return { view, setView, handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp } };
}
