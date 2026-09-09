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
  /** Zoom compensation, so the marker keeps a constant on-screen size. */
  scale?: number;
  /** The current line's colour, worn on the nose cap. */
  colour?: string | null;
}

/**
 * The train sits between the station it left and the one being typed, placed
 * by typing progress — so it arrives exactly as the name is completed. Typing
 * *is* the throttle.
 *
 * Motion is a CSS transition on the outer group's transform rather than an
 * animation loop: it stays smooth between keystrokes, and the global
 * prefers-reduced-motion rule zeroes it for free.
 *
 * Position and shake live on two nested groups rather than one. A CSS
 * `transform` (the shake keyframes) overrides an SVG `transform` presentation
 * attribute outright rather than composing with it — putting both on the
 * same element would make the carriage lose its translate/rotate/scale and
 * teleport to the SVG origin for the animation's duration. The outer group
 * owns position; the inner one owns the shake.
 */
export function TrainMarker({
  from,
  to,
  progress = 1,
  errorTick = 0,
  scale = 1,
  colour = null,
}: TrainMarkerProps) {
  if (!to) return null;
  const pos = from ? tweenPoint(from, to, progress) : to;
  // The carriage is drawn nose-up, so a heading of due east is a quarter turn.
  const angle = from
    ? (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90
    : 0;

  return (
    <g
      // Remounting on each mistake is what replays the shake animation.
      key={`train-${errorTick}`}
      data-train
      className="train"
      transform={`translate(${pos.x} ${pos.y}) rotate(${angle}) scale(${scale})`}
    >
      <g className="train-shake" data-shake={errorTick > 0 ? 'true' : undefined}>
        <polygon className="train-beam" points="-5,-14 5,-14 22,-70 -22,-70" />
        <rect
          className="train-body"
          x={-6}
          y={-14}
          width={12}
          height={28}
          rx={3}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="train-nose"
          d="M -6,-9 L -6,-11 C -6,-13 -3.5,-14 0,-14 C 3.5,-14 6,-13 6,-11 L 6,-9 Z"
          fill={colour ?? undefined}
        />
        <circle className="train-window" cx={-3} cy={-10.5} r={1.1} />
        <circle className="train-window" cx={3} cy={-10.5} r={1.1} />
      </g>
    </g>
  );
}
