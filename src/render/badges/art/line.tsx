import { arcPath, polar, sparklePath, spokePath } from './geometry';
import { INK } from './ink';

/** End to End: a ticket with a Line across it, punched at both Termini. */
function PunchedTicket() {
  return (
    <g transform="rotate(-8 100 100)">
      <path
        d="M32 58 H168 A12 12 0 0 0 180 70 V130 A12 12 0 0 0 168 142 H32 A12 12 0 0 0 20 130 V70 A12 12 0 0 0 32 58 Z"
        fill={INK.cream}
      />
      <rect x={20} y={118} width={160} height={10} fill={INK.orange} />
      <path d="M56 90 H144" fill="none" stroke={INK.teal} strokeWidth={11} strokeLinecap="round" />
      {[78, 100, 122].map((x) => (
        <circle key={x} cx={x} cy={90} r={4} fill={INK.cream} />
      ))}
      <circle cx={42} cy={90} r={13} fill={INK.charcoal} />
      <circle cx={158} cy={90} r={13} fill={INK.charcoal} />
    </g>
  );
}

/** Spotless: the front of a train, its windscreen gleaming with a sparkle. */
function GleamingCab() {
  return (
    <g>
      <rect x={60} y={162} width={80} height={8} rx={2} fill={INK.charcoal} />
      <path d="M48 56 Q48 30 74 30 H126 Q152 30 152 56 V150 Q152 164 138 164 H62 Q48 164 48 150 Z" fill={INK.cream} />
      <rect x={48} y={116} width={104} height={16} fill={INK.orange} />
      <rect x={60} y={44} width={80} height={58} rx={10} fill={INK.charcoal} />
      <path d="M68 98 L98 48 H114 L84 98 Z" fill={INK.mint} />
      <path d="M92 98 L122 48 H130 L100 98 Z" fill={INK.mint} />
      <circle cx={70} cy={146} r={8} fill={INK.yellow} />
      <circle cx={130} cy={146} r={8} fill={INK.yellow} />
      <path d={sparklePath(146, 40, 24)} fill={INK.cream} />
      <path d={sparklePath(52, 116, 12)} fill={INK.cream} />
    </g>
  );
}

/** Line Speed: a speedometer with its needle well into the fast end. */
function Speedometer() {
  const cx = 100;
  const cy = 106;
  const ticks = [210, 180, 150, 120, 90, 60, 30, 0, -30];
  const [tx, ty] = polar(cx, cy, 52, 28);
  const [lx, ly] = polar(cx, cy, 6, 118);
  const [rx, ry] = polar(cx, cy, 6, -62);
  return (
    <g>
      <rect x={84} y={168} width={32} height={8} rx={3} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={68} fill={INK.cream} />
      <circle cx={cx} cy={cy} r={68} fill="none" stroke={INK.charcoal} strokeWidth={9} />
      <path d={arcPath(cx, cy, 52, 210, 90)} fill="none" stroke={INK.mint} strokeWidth={11} />
      <path d={arcPath(cx, cy, 52, 90, 30)} fill="none" stroke={INK.yellow} strokeWidth={11} />
      <path d={arcPath(cx, cy, 52, 30, -30)} fill="none" stroke={INK.signalRed} strokeWidth={11} />
      {ticks.map((deg) => (
        <path key={deg} d={spokePath(cx, cy, 34, 42, deg)}
          fill="none" stroke={INK.charcoal} strokeWidth={4} strokeLinecap="round" />
      ))}
      <path d={`M${lx.toFixed(1)} ${ly.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${rx.toFixed(1)} ${ry.toFixed(1)} Z`} fill={INK.brick} />
      <circle cx={cx} cy={cy} r={11} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={4} fill={INK.cream} />
    </g>
  );
}

/** Both Ways: a two-headed arrow over a track with a buffer stop at each end. */
function TwoWayArrow() {
  return (
    <g>
      {[30, 56, 82, 108, 134, 160].map((x) => (
        <rect key={x} x={x} y={152} width={12} height={10} rx={2} fill={INK.charcoal} />
      ))}
      <rect x={18} y={144} width={164} height={9} rx={3} fill={INK.grey} />
      <rect x={12} y={120} width={14} height={30} rx={3} fill={INK.brick} />
      <rect x={174} y={120} width={14} height={30} rx={3} fill={INK.brick} />
      <path d="M22 90 L64 52 V74 H100 V106 H64 V128 Z" fill={INK.teal} />
      <path d="M178 90 L136 52 V74 H100 V106 H136 V128 Z" fill={INK.orange} />
    </g>
  );
}

/** Long Line: a straight track running all the way to the horizon. */
function TrackToHorizon() {
  const depths = [1, 0.74, 0.55, 0.41, 0.3, 0.22, 0.16, 0.115];
  return (
    <g>
      <path d="M2 104 Q30 80 62 104 Z" fill={INK.teal} />
      <path d="M134 104 Q166 76 198 104 Z" fill={INK.teal} />
      <path d="M100 104 L182 200 H18 Z" fill={INK.grey} />
      {depths.map((f) => (
        <rect key={f} x={100 - 66 * f} y={104 + 88 * f - 5 * f} width={132 * f} height={10 * f} fill={INK.charcoal} />
      ))}
      <path d="M50 200 H62 L100.5 104 H99.5 Z" fill={INK.cream} />
      <path d="M138 200 H150 L100.5 104 H99.5 Z" fill={INK.cream} />
      <path d="M8 104 H192" fill="none" stroke={INK.charcoal} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** Personal Best: a stopwatch with a rising arrow across it. */
function StopwatchArrow() {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <g>
      <rect x={84} y={52} width={12} height={12} fill={INK.grey} />
      <rect x={76} y={40} width={28} height={14} rx={4} fill={INK.charcoal} />
      <rect x={124} y={62} width={14} height={12} rx={3} fill={INK.charcoal} transform="rotate(40 131 68)" />
      <circle cx={90} cy={116} r={54} fill={INK.charcoal} />
      <circle cx={90} cy={116} r={43} fill={INK.cream} />
      {ticks.map((deg) => (
        <path key={deg} d={spokePath(90, 116, 33, 39, deg)}
          fill="none" stroke={INK.charcoal} strokeWidth={3.5} strokeLinecap="round" />
      ))}
      <path d="M90 116 L90 84" fill="none" stroke={INK.brick} strokeWidth={5} strokeLinecap="round" />
      <circle cx={90} cy={116} r={5} fill={INK.charcoal} />
      <path d="M28 168 L70 130 L96 148 L148 86" fill="none" stroke={INK.teal} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M169 61 L163 99 L133 73 Z" fill={INK.teal} />
    </g>
  );
}

/**
 * Day Pass: a pass card with a day's ink stamp on its corner. The stamp sits
 * on a cream disc: signal red straight on the teal card would match it in
 * brightness and vanish for red-green colour weakness and in greyscale.
 */
function StampedPass() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g>
      <g transform="rotate(-10 92 100)">
        <rect x={30} y={50} width={124} height={84} rx={10} fill={INK.teal} />
        <rect x={78} y={58} width={28} height={7} rx={3.5} fill={INK.charcoal} />
        <rect x={30} y={72} width={124} height={10} fill={INK.cream} />
        <rect x={42} y={92} width={28} height={32} rx={3} fill={INK.cream} />
        <rect x={80} y={96} width={58} height={7} rx={3.5} fill={INK.cream} />
        <rect x={80} y={110} width={40} height={7} rx={3.5} fill={INK.cream} />
      </g>
      <circle cx={136} cy={136} r={37} fill={INK.cream} />
      <g transform="rotate(14 136 136)">
        <circle cx={136} cy={136} r={32} fill="none" stroke={INK.signalRed} strokeWidth={6} />
        <circle cx={136} cy={136} r={23} fill="none" stroke={INK.signalRed} strokeWidth={2.5} />
        <circle cx={136} cy={136} r={6} fill="none" stroke={INK.signalRed} strokeWidth={5} />
        {rays.map((deg) => (
          <path key={deg} d={spokePath(136, 136, 12, 17, deg)}
            fill="none" stroke={INK.signalRed} strokeWidth={3.5} strokeLinecap="round" />
        ))}
      </g>
    </g>
  );
}

export const LINE_ART = {
  'line.completed': PunchedTicket,
  'line.accuracy': GleamingCab,
  'line.score': Speedometer,
  'line.bothWays': TwoWayArrow,
  'line.stations': TrackToHorizon,
  'line.personalBest': StopwatchArrow,
  'line.dayPass': StampedPass,
};
