import { useId, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../render/useLayoutMode';

/** One lap of the box, shared by the train, its glow and its headlight so they never drift apart. */
const LAP = '9s';

/** `.leaderboard-panel`'s border-radius, so the track follows its corners. */
const RADIUS = 10;

/**
 * The glow on the rails, in hundredths of the lap (the paths use pathLength
 * 100): it runs this far ahead of the train's centre, just past its nose.
 */
const GLOW_LENGTH = 9;
const GLOW_LEAD = 9;

/** Room around the box for the headlight, which only shows outside it. */
const BEAM_REACH = 80;

/**
 * The box's outline as one lap, starting at the middle of the top edge and
 * running clockwise. Coordinates are the box's border box, so the track sits
 * on its border.
 */
export function trackPath(w: number, h: number, r = RADIUS): string {
  return [
    `M ${w / 2},0 H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w},${r} V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r},${h} H ${r}`,
    `A ${r} ${r} 0 0 1 0,${h - r} V ${r}`,
    `A ${r} ${r} 0 0 1 ${r},0 Z`,
  ].join(' ');
}

/**
 * A train lapping the leaderboard box, with a glow running on the rails just
 * ahead of it and a headlight that lights only the space outside the box.
 * Drawn over the box's border; the box must be positioned. Under reduced
 * motion the train waits at the top with nothing moving.
 *
 * SMIL rather than CSS: a sprite that turns as it follows a rounded corner
 * needs `animateMotion`, and every part shares the document's animation
 * clock, so the glow stays at the train's nose without any syncing.
 */
export function LeaderboardTrack() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [still] = useState(prefersReducedMotion);
  const id = useId();
  const blur = `${id}-blur`;
  const beam = `${id}-beam`;
  const outside = `${id}-outside`;

  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const measure = () => setSize((was) => (
      was.w === box.offsetWidth && was.h === box.offsetHeight
        ? was
        : { w: box.offsetWidth, h: box.offsetHeight }
    ));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(box);
    return () => observer?.disconnect();
  }, []);

  const { w, h } = size;
  if (w === 0 || h === 0) {
    // Mounted empty until the box is measured: the effect finds the box through it.
    return <svg ref={ref} className="leaderboard-track" aria-hidden="true" focusable="false" width={0} height={0} />;
  }

  const d = trackPath(w, h);
  const lap = (from: number) => still ? null : (
    <animate attributeName="stroke-dashoffset" from={from} to={from - 100} dur={LAP} repeatCount="indefinite" />
  );
  const follow = still ? null : <animateMotion dur={LAP} repeatCount="indefinite" rotate="auto" path={d} />;
  const parked = still ? `translate(${w / 2} 0)` : undefined;
  const glowFrom = GLOW_LENGTH - GLOW_LEAD;

  return (
    <svg ref={ref} className="leaderboard-track" aria-hidden="true" focusable="false" width={w} height={h}>
      <defs>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        {/* In the carriage's own frame, nose up: the light fades from the nose out. */}
        <linearGradient id={beam} gradientUnits="userSpaceOnUse" x1="0" y1="-14" x2="0" y2="-72">
          <stop offset="0" className="leaderboard-track-beam-near" />
          <stop offset="1" className="leaderboard-track-beam-far" />
        </linearGradient>
        {/* Alpha-only mask: white keeps, black hides, so the light stops at the box's edge. */}
        <mask id={outside} maskUnits="userSpaceOnUse"
          x={-BEAM_REACH} y={-BEAM_REACH} width={w + 2 * BEAM_REACH} height={h + 2 * BEAM_REACH}>
          <rect x={-BEAM_REACH} y={-BEAM_REACH} width={w + 2 * BEAM_REACH} height={h + 2 * BEAM_REACH} fill="white" />
          <rect x={3} y={3} width={w - 6} height={h - 6} rx={RADIUS - 3} fill="black" />
        </mask>
      </defs>

      <path className="leaderboard-track-rail" d={d} />
      <path className="leaderboard-track-halo" d={d} pathLength={100} filter={`url(#${blur})`}
        strokeDasharray={`${GLOW_LENGTH} ${100 - GLOW_LENGTH}`} strokeDashoffset={glowFrom}>
        {lap(glowFrom)}
      </path>
      <path className="leaderboard-track-glow" d={d} pathLength={100}
        strokeDasharray={`${GLOW_LENGTH} ${100 - GLOW_LENGTH}`} strokeDashoffset={glowFrom}>
        {lap(glowFrom)}
      </path>

      <g mask={`url(#${outside})`}>
        <g className="leaderboard-track-beam" transform={parked}>
          <path d="M -4,-14 L -22,-68 A 72 72 0 0 1 22,-68 L 4,-14 Z" fill={`url(#${beam})`}
            transform="rotate(90)" />
          {follow}
        </g>
      </g>

      {/* The map's carriage, drawn nose up; a quarter turn points it along the track. */}
      <g className="leaderboard-track-train" transform={parked}>
        <g transform="rotate(90)">
          <rect className="leaderboard-track-body" x={-6} y={-14} width={12} height={28} rx={3} />
          <path className="leaderboard-track-nose"
            d="M -6,-9 L -6,-11 C -6,-13 -3.5,-14 0,-14 C 3.5,-14 6,-13 6,-11 L 6,-9 Z" />
          <circle className="leaderboard-track-window" cx={-3} cy={-10.5} r={1.1} />
          <circle className="leaderboard-track-window" cx={3} cy={-10.5} r={1.1} />
        </g>
        {follow}
      </g>
    </svg>
  );
}
