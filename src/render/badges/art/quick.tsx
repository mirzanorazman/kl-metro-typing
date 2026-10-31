import { arcPath, arrowHeadPath, polar, sparklePath, spokePath } from './geometry';
import { INK } from './ink';

/**
 * Line Hopper: a train that has just leapt off the end of one Line's track,
 * nose up and clear of the rails, with a dashed arc showing where it lands
 * on the other Line's track across the gap.
 */
function TrackJump() {
  return (
    <g>
      <path d="M138 56 Q172 44 168 140" fill="none" stroke={INK.charcoal} strokeWidth={6} strokeLinecap="round" strokeDasharray="1 11" />
      <path d="M78 176 H118" fill="none" stroke={INK.charcoal} strokeWidth={6} strokeLinecap="round" opacity={0.2} />
      <rect x={8} y={148} width={58} height={12} rx={3} fill={INK.brick} />
      <rect x={136} y={148} width={58} height={12} rx={3} fill={INK.teal} />
      {[18, 38, 56, 146, 164, 184].map((x) => (
        <rect key={x} x={x - 5} y={162} width={10} height={7} rx={1.5} fill={INK.charcoal} />
      ))}
      <g transform="translate(90 84) rotate(-22)">
        <path d="M-72 -8 H-56" fill="none" stroke={INK.teal} strokeWidth={4} strokeLinecap="round" />
        <path d="M-78 4 H-56" fill="none" stroke={INK.teal} strokeWidth={4} strokeLinecap="round" />
        <path d="M-70 16 H-56" fill="none" stroke={INK.teal} strokeWidth={4} strokeLinecap="round" />
        <path d="M-46 -18 H22 Q44 -18 46 4 L46 18 H-46 Z" fill={INK.cream} />
        <rect x={-46} y={4} width={92} height={6} fill={INK.orange} />
        {[-40, -22, -4].map((x) => (
          <rect key={x} x={x} y={-12} width={14} height={11} rx={2} fill={INK.charcoal} />
        ))}
        <path d="M18 -12 H28 Q37 -10 39 -2 H18 Z" fill={INK.charcoal} />
        <circle cx={-28} cy={20} r={6} fill={INK.charcoal} />
        <circle cx={28} cy={20} r={6} fill={INK.charcoal} />
      </g>
    </g>
  );
}

/**
 * A stopwatch centred on (cx, cy) with outer radius r. `wedge` shades the
 * first thirty seconds of the dial: a Quick Run's half turn.
 */
function Stopwatch({ cx, cy, r, wedge, hand = true }: {
  cx: number; cy: number; r: number; wedge?: string; hand?: boolean;
}) {
  const face = r * 0.8;
  return (
    <g>
      <rect x={cx - r * 0.12} y={cy - r * 1.18} width={r * 0.24} height={r * 0.26} fill={INK.grey} />
      <rect x={cx - r * 0.3} y={cy - r * 1.36} width={r * 0.6} height={r * 0.24} rx={r * 0.08} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={r} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={face} fill={INK.cream} />
      {wedge && (
        <path d={`M${cx} ${cy - face} A${face} ${face} 0 0 1 ${cx} ${cy + face} Z`} fill={wedge} />
      )}
      {[90, 0, -90, 180].map((deg) => (
        <path key={deg} d={spokePath(cx, cy, face * 0.72, face * 0.92, deg)}
          fill="none" stroke={INK.charcoal} strokeWidth={r * 0.08} strokeLinecap="round" />
      ))}
      {hand && (
        <path d={`M${cx} ${cy} V${cy + face * 0.78}`} fill="none" stroke={INK.brick} strokeWidth={r * 0.1} strokeLinecap="round" />
      )}
      <circle cx={cx} cy={cy} r={r * 0.1} fill={INK.charcoal} />
    </g>
  );
}

/**
 * Express Service: a streamlined train with a speedometer set into its
 * side, the needle deep in the fast end. Line Speed is the bare dial; this
 * one rides on the train.
 */
function SpeedTrain() {
  const cx = 82;
  const cy = 98;
  const [tx, ty] = polar(cx, cy, 26, 20);
  const [lx, ly] = polar(cx, cy, 5, 110);
  const [rx, ry] = polar(cx, cy, 5, -70);
  return (
    <g>
      {[[70, 6, 26], [98, 0, 20], [126, 10, 26]].map(([y, x1, x2]) => (
        <path key={y} d={`M${x1} ${y} H${x2}`} fill="none" stroke={INK.charcoal} strokeWidth={6} strokeLinecap="round" />
      ))}
      <rect x={18} y={154} width={170} height={8} rx={3} fill={INK.grey} />
      <path d="M36 58 H116 Q166 60 188 140 Q188 148 180 148 H36 Z" fill={INK.teal} />
      <path d="M36 126 H182 L186 136 H36 Z" fill={INK.cream} />
      <path d="M126 70 Q156 76 172 112 H130 Z" fill={INK.charcoal} />
      <circle cx={62} cy={150} r={9} fill={INK.charcoal} />
      <circle cx={156} cy={150} r={9} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={38} fill={INK.cream} />
      <circle cx={cx} cy={cy} r={38} fill="none" stroke={INK.charcoal} strokeWidth={7} />
      <path d={arcPath(cx, cy, 26, 210, 90)} fill="none" stroke={INK.mint} strokeWidth={9} />
      <path d={arcPath(cx, cy, 26, 90, 30)} fill="none" stroke={INK.yellow} strokeWidth={9} />
      <path d={arcPath(cx, cy, 26, 30, -30)} fill="none" stroke={INK.signalRed} strokeWidth={9} />
      <path d={`M${lx.toFixed(1)} ${ly.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${rx.toFixed(1)} ${ry.toFixed(1)} Z`} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={7} fill={INK.charcoal} />
    </g>
  );
}

/**
 * Tapau Run: a pyramid packet of takeaway rice, paper over a banana leaf and
 * tied with a rubber band, seen from a corner so it reads as a packet rather
 * than a cone; beside it a small dial with its thirty seconds shaded.
 */
function TapauPacket() {
  return (
    <g>
      <path d="M90 34 L26 140 L110 160 Z" fill={INK.cream} />
      <path d="M90 34 L110 160 L168 128 Z" fill={INK.paper} />
      <path d="M33.7 127.3 L107.6 144.9 L110 160 L26 140 Z" fill={INK.teal} />
      <path d="M107.6 144.9 L158.6 116.7 L168 128 L110 160 Z" fill={INK.teal} />
      <path d="M58 87 L100 97 L102 109.6 L51.6 97.6 Z" fill={INK.brick} />
      <path d="M100 97 L129 81 L136.8 90.4 L102 109.6 Z" fill={INK.brick} />
      <Stopwatch cx={152} cy={152} r={28} wedge={INK.orange} />
    </g>
  );
}

/** Clean Thirty: a stopwatch with its thirty seconds shaded, ticked off, gleaming. */
function CleanStopwatch() {
  return (
    <g>
      <Stopwatch cx={96} cy={112} r={58} wedge={INK.mint} hand={false} />
      <path d="M66 112 L88 136 L130 86" fill="none" stroke={INK.charcoal} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      <path d={sparklePath(160, 54, 22)} fill={INK.yellow} />
      <path d={sparklePath(170, 100, 11)} fill={INK.yellow} />
    </g>
  );
}

/** Up the Line: a Line climbing a rising bar chart, a Station on each bar. */
function ClimbingLine() {
  const bars: [number, number][] = [[34, 128], [72, 104], [110, 80]];
  return (
    <g>
      {bars.map(([x, top]) => (
        <rect key={x} x={x} y={top} width={30} height={170 - top} rx={3} fill={INK.cream} />
      ))}
      <rect x={148} y={56} width={30} height={114} rx={3} fill={INK.yellow} />
      <rect x={26} y={168} width={160} height={8} rx={3} fill={INK.charcoal} />
      <path d="M49 110 L87 86 L125 62 L148 48" fill="none" stroke={INK.teal} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arrowHeadPath(146, 49, 32, 30, 17)} fill={INK.teal} />
      {[[49, 110], [87, 86], [125, 62]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={8} fill={INK.cream} />
          <circle cx={x} cy={y} r={8} fill="none" stroke={INK.charcoal} strokeWidth={5} />
        </g>
      ))}
    </g>
  );
}

/** Every Start: a row of starting flags, each in a different Line's colour. */
function StartingFlags() {
  const flags: [number, string][] = [[40, INK.brick], [88, INK.yellow], [136, INK.blue]];
  return (
    <g>
      <rect x={20} y={164} width={164} height={10} rx={3} fill={INK.charcoal} />
      {flags.map(([x, fill], i) => (
        <g key={x} transform={`translate(0 ${i * -12})`}>
          <rect x={x - 4} y={58} width={8} height={118 + i * 12} rx={3} fill={INK.grey} />
          <circle cx={x} cy={56} r={6} fill={INK.grey} />
          <path d={`M${x + 4} 64 Q${x + 20} 56 ${x + 30} 64 Q${x + 40} 72 ${x + 48} 66 V102 Q${x + 40} 108 ${x + 30} 100 Q${x + 20} 92 ${x + 4} 100 Z`} fill={fill} />
        </g>
      ))}
    </g>
  );
}

/** One More Go: a replay loop around a stopwatch. */
function ReplayLoop() {
  const [ex, ey] = polar(100, 106, 68, 36);
  return (
    <g>
      <path d={arcPath(100, 106, 68, -14, -324)} fill="none" stroke={INK.orange} strokeWidth={15} />
      <path d={arrowHeadPath(ex, ey, -54, 30, 21)} fill={INK.orange} />
      <Stopwatch cx={100} cy={110} r={40} />
    </g>
  );
}

export const QUICK_ART = {
  'quick.score': SpeedTrain,
  'quick.jumps': TrackJump,
  'quick.completed': TapauPacket,
  'quick.clean': CleanStopwatch,
  'quick.improved': ClimbingLine,
  'quick.starts': StartingFlags,
  'quick.backToBack': ReplayLoop,
};
