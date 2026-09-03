import { useEffect, useRef, useState } from 'react';
import type { Point } from '../data/types';
import { easeInOut } from '../geo/layout';
import { prefersReducedMotion } from './useLayoutMode';

const TRAVEL_MS = 400;

export function tweenPoint(from: Point, to: Point, t: number): Point {
  const c = Math.max(0, Math.min(1, t));
  return { x: from.x + (to.x - from.x) * c, y: from.y + (to.y - from.y) * c };
}

/**
 * Eases from the previous station to the current one whenever `to` changes,
 * so the train visibly travels rather than teleporting.
 */
export function TrainMarker({ from, to }: { from: Point | null; to: Point | null }) {
  const [pos, setPos] = useState<Point | null>(to);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!to) return;
    if (!from || prefersReducedMotion()) {
      setPos(to);
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / TRAVEL_MS);
      setPos(tweenPoint(from, to, easeInOut(t)));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // `from` is intentionally excluded: the tween is driven by arriving at a
    // new `to`, and re-running it when the origin changes would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to?.x, to?.y]);

  if (!pos) return null;
  return <circle data-train cx={pos.x} cy={pos.y} r={9} className="train" />;
}
