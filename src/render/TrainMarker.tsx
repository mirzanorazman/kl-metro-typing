import type { Point } from '../data/types';

export function tweenPoint(from: Point, to: Point, t: number): Point {
  const c = Math.max(0, Math.min(1, t));
  return { x: from.x + (to.x - from.x) * c, y: from.y + (to.y - from.y) * c };
}

export interface TrainMarkerProps {
  /** Station departed from. Null at the very start of a run. */
  from: Point | null;
  /** Station being typed towards. */
  to: Point | null;
  /** How far through the current station's name, 0..1. */
  progress?: number;
  /** Increments on every mistyped key; a change replays the shake. */
  errorTick?: number;
}

/**
 * The train sits between the station it left and the one being typed, placed
 * by typing progress — so it arrives exactly as the name is completed. Typing
 * *is* the throttle.
 *
 * Motion is a CSS transition on cx/cy rather than an animation loop: it stays
 * smooth between keystrokes, and the global prefers-reduced-motion rule
 * zeroes it for free.
 */
export function TrainMarker({ from, to, progress = 1, errorTick = 0 }: TrainMarkerProps) {
  if (!to) return null;
  const pos = from ? tweenPoint(from, to, progress) : to;

  return (
    <circle
      // Remounting on each mistake is what replays the shake animation.
      key={`train-${errorTick}`}
      data-train
      data-shake={errorTick > 0 ? 'true' : undefined}
      cx={pos.x}
      cy={pos.y}
      r={9}
      className="train"
    />
  );
}
