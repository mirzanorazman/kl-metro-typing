/** Degrees of arc the needle travels, from rest to full scale. */
export const GAUGE_SWEEP = 240;

/**
 * Full scale. A gauge only reads as a gauge if the needle sits somewhere in
 * the middle most of the time, so the ceiling is set well above a typical
 * run rather than at a record — 120 puts a comfortable 40-60 WPM on the
 * left-of-centre sweep, the way a car's dial sits at cruising speed.
 */
export const GAUGE_MAX = 120;

/** Where a tick is drawn, in WPM. */
const TICK_STEP = 20;

const CX = 48;
const CY = 44;
const R = 32;

/**
 * The needle's angle in degrees, measured from straight up, clockwise.
 *
 * Values outside the dial pin to its ends: a needle that swung past its stop
 * would read as a bug, and a burst of fast typing overshooting 120 WPM is
 * ordinary.
 */
export function gaugeAngle(wpm: number, max: number = GAUGE_MAX): number {
  const fraction = max > 0 ? Math.min(1, Math.max(0, wpm / max)) : 0;
  return fraction * GAUGE_SWEEP - GAUGE_SWEEP / 2;
}

/** A point on the dial, at `radius` out along `deg` from straight up. */
function point(deg: number, radius: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

function arc(fromDeg: number, toDeg: number, radius: number): string {
  const [x1, y1] = point(fromDeg, radius);
  const [x2, y2] = point(toDeg, radius);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

const START = -GAUGE_SWEEP / 2;
const END = GAUGE_SWEEP / 2;

const TICKS = Array.from(
  { length: Math.floor(GAUGE_MAX / TICK_STEP) + 1 },
  (_, i) => gaugeAngle(i * TICK_STEP),
);

/**
 * WPM as a dial. The figure below it stays the thing you read; the needle is
 * what you catch out of the corner of an eye while typing, which is the only
 * attention a typing game can spare for a statistic.
 *
 * The value is expected to arrive already eased (see `useRolling`), so the
 * needle inherits the panel's smoothing and its reduced-motion behaviour
 * without a second animation of its own.
 */
export function Speedometer({ wpm }: { wpm: number }) {
  const shown = Math.round(wpm);
  const angle = gaugeAngle(wpm);
  const [nx, ny] = point(angle, R - 7);

  return (
    <div className="hud-cell hud-gauge">
      <svg
        className="gauge"
        viewBox="0 0 96 64"
        role="img"
        aria-label={`${shown} words per minute`}
      >
        <path className="gauge-track" d={arc(START, END, R)} />
        {/* A zero-length arc would still paint a round cap, reading as a
            needle's worth of speed before a single key is pressed. */}
        {angle > START && <path className="gauge-fill" d={arc(START, angle, R)} />}
        {TICKS.map((deg) => {
          const [x1, y1] = point(deg, R + 1);
          const [x2, y2] = point(deg, R + 5);
          return <line key={deg} className="gauge-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        <line className="gauge-needle" x1={CX} y1={CY} x2={nx} y2={ny} />
        <circle className="gauge-hub" cx={CX} cy={CY} r={3} />
      </svg>
      {/* Caption and figure are grouped so the cell can lay them out beside
          the dial rather than under it: stacked, the dial's own height was
          a third tier the other two cells did not have, and the panel it
          sits in only has the lower third of the screen to spend. */}
      <div className="hud-readout">
        <span className="hud-label">speed</span>
        <span className="hud-figure">
          {shown}
          <small>WPM</small>
        </span>
      </div>
    </div>
  );
}
