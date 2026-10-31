import { arcPath, arrowHeadPath, polar } from './geometry';
import { INK } from './ink';

/** One keycap, `w` wide from its left edge `x`: a sloped skirt and a dished top. */
function Keycap({ x, w }: { x: number; w: number }) {
  return (
    <g>
      <path d={`M${x + 5} 112 H${x + w - 5} L${x + w} 160 Q${x + w} 166 ${x + w - 6} 166 H${x + 6} Q${x} 166 ${x} 160 Z`} fill={INK.paper} />
      <rect x={x + 9} y={116} width={w - 18} height={34} rx={6} fill={INK.cream} />
    </g>
  );
}

/** Steady Hands: a spirit level lying across a row of keycaps, its bubble dead centre. */
function LevelKeys() {
  return (
    <g>
      <rect x={10} y={158} width={180} height={18} rx={5} fill={INK.charcoal} />
      {[16, 75, 134].map((x) => <Keycap key={x} x={x} w={50} />)}
      <rect x={14} y={70} width={172} height={38} rx={8} fill={INK.blue} />
      <rect x={68} y={77} width={64} height={24} rx={12} fill={INK.mint} />
      <ellipse cx={100} cy={89} rx={11} ry={7} fill={INK.cream} />
      <path d="M84 77 V101" fill="none" stroke={INK.charcoal} strokeWidth={4} />
      <path d="M116 77 V101" fill="none" stroke={INK.charcoal} strokeWidth={4} />
      <circle cx={34} cy={89} r={7} fill={INK.cream} />
      <circle cx={166} cy={89} r={7} fill={INK.cream} />
    </g>
  );
}

/**
 * Mouthful: a ticket roll unspooling one long strip, printed edge to edge
 * with words. The strip is line work, so it carries its own charcoal edge.
 */
function TicketRoll() {
  const strip = 'M58 82 H134 Q176 82 176 122 Q176 160 134 160 H22';
  return (
    <g>
      <path d={strip} fill="none" stroke={INK.charcoal} strokeWidth={42} />
      <path d={strip} fill="none" stroke={INK.cream} strokeWidth={35} />
      <path d={strip} fill="none" stroke={INK.charcoal} strokeWidth={7} strokeDasharray="18 7" strokeDashoffset={-38} />
      <path d="M22 141 l5 6 -5 6 5 6 -5 6 5 6 -5 6" fill="none" stroke={INK.charcoal} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={56} cy={62} r={38} fill={INK.paper} />
      <circle cx={56} cy={62} r={28} fill="none" stroke={INK.charcoal} strokeWidth={2.5} opacity={0.5} />
      <circle cx={56} cy={62} r={19} fill="none" stroke={INK.charcoal} strokeWidth={2.5} opacity={0.5} />
      <circle cx={56} cy={62} r={11} fill={INK.orange} />
      <circle cx={56} cy={62} r={5} fill={INK.charcoal} />
    </g>
  );
}

/**
 * Back on Track: a flanged train wheel lifted clear of the rail, and an
 * arrow curling round to set it back down.
 */
function RerailWheel() {
  const cx = 86;
  const cy = 88;
  const holes = [90, 162, 234, 306, 18];
  const [ex, ey] = polar(cx, cy, 64, -36);
  return (
    <g>
      {[22, 52, 82, 112, 142, 172].map((x) => (
        <rect key={x} x={x - 9} y={168} width={18} height={10} rx={2} fill={INK.charcoal} />
      ))}
      <rect x={10} y={156} width={180} height={13} rx={3} fill={INK.grey} />
      <path d={arcPath(cx, cy, 64, 104, -30)} fill="none" stroke={INK.teal} strokeWidth={13} strokeLinecap="round" />
      <path d={arrowHeadPath(ex, ey, -126, 28, 18)} fill={INK.teal} />
      <circle cx={cx} cy={cy} r={50} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={42} fill={INK.grey} />
      {holes.map((deg) => {
        const [hx, hy] = polar(cx, cy, 25, deg);
        return <circle key={deg} cx={hx} cy={hy} r={8} fill={INK.paper} />;
      })}
      <circle cx={cx} cy={cy} r={11} fill={INK.cream} />
      <circle cx={cx} cy={cy} r={4.5} fill={INK.charcoal} />
    </g>
  );
}

/**
 * Regular Commuter: a monthly pass with a grid of days, nearly every one
 * punched through.
 */
function PunchedMonth() {
  const cols = [56, 78, 100, 122, 144];
  const rows = [92, 114, 136];
  const left = 2; // the days still to come, at the end of the month
  return (
    <g transform="rotate(8 100 104)">
      <rect x={30} y={42} width={140} height={122} rx={12} fill={INK.blue} />
      <rect x={84} y={50} width={32} height={9} rx={4.5} fill={INK.charcoal} />
      <rect x={40} y={74} width={120} height={80} rx={6} fill={INK.cream} />
      {rows.flatMap((y, r) => cols.map((x, c) => {
        const punched = r * cols.length + c < rows.length * cols.length - left;
        return <circle key={`${x}-${y}`} cx={x} cy={y} r={7.5} fill={punched ? INK.charcoal : INK.paper} />;
      }))}
    </g>
  );
}

/**
 * Mileage: a long track winding back and forth across the country. The
 * track is line work: sleepers, then two rails.
 */
function WindingTrack() {
  const route = 'M24 196 C24 150 176 170 172 128 C168 92 30 112 32 74 C34 40 150 52 172 18';
  return (
    <g>
      <circle cx={160} cy={84} r={14} fill={INK.teal} />
      <circle cx={42} cy={136} r={12} fill={INK.teal} />
      <rect x={157} y={96} width={6} height={10} fill={INK.charcoal} />
      <rect x={39} y={146} width={6} height={10} fill={INK.charcoal} />
      <path d={route} fill="none" stroke={INK.charcoal} strokeWidth={30} strokeDasharray="6 7" />
      <path d={route} fill="none" stroke={INK.cream} strokeWidth={20} />
      <path d={route} fill="none" stroke={INK.grey} strokeWidth={11} />
    </g>
  );
}

/** A chevron pointing right with its tip at (x, y), `h` from tip to tail end. */
function chevronPath(x: number, y: number, h: number): string {
  const w = h * 0.8;
  const t = h * 0.62;
  return `M${x - w} ${y - h} H${x - w + t} L${x + t} ${y} L${x - w + t} ${y + h} H${x - w} L${x} ${y} Z`;
}

/** Picking Up Speed: three chevrons, each bigger and higher than the last. */
function RisingChevrons() {
  const steps: [number, number, number, string][] = [
    [58, 138, 22, INK.yellow], [104, 116, 32, INK.orange], [150, 90, 44, INK.brick],
  ];
  return (
    <g>
      {[[112, 6, 26], [130, 2, 18], [148, 10, 22]].map(([y, x1, x2]) => (
        <path key={y} d={`M${x1} ${y} H${x2}`} fill="none" stroke={INK.charcoal} strokeWidth={6} strokeLinecap="round" />
      ))}
      {steps.map(([x, y, h, fill]) => <path key={x} d={chevronPath(x, y, h)} fill={fill} />)}
    </g>
  );
}

/**
 * All-Rounder: a compass rose whose four points each wear a different
 * colour, one for each kind of play. Each point is split light and dark.
 */
function CompassRose() {
  const cx = 100;
  const cy = 100;
  const points: [number, string][] = [[90, INK.teal], [0, INK.orange], [270, INK.brick], [180, INK.blue]];
  const arm = (deg: number, len: number, half: number, side: 1 | -1) => {
    const [tx, ty] = polar(cx, cy, len, deg);
    const [sx, sy] = polar(cx, cy, half, deg + side * 45);
    return `M${cx} ${cy} L${tx.toFixed(1)} ${ty.toFixed(1)} L${sx.toFixed(1)} ${sy.toFixed(1)} Z`;
  };
  return (
    <g>
      <circle cx={cx} cy={cy} r={56} fill={INK.cream} />
      <circle cx={cx} cy={cy} r={56} fill="none" stroke={INK.charcoal} strokeWidth={6} />
      {[45, 135, 225, 315].map((deg) => (
        <g key={deg}>
          <path d={arm(deg, 52, 12, 1)} fill={INK.grey} />
          <path d={arm(deg, 52, 12, -1)} fill={INK.paper} />
        </g>
      ))}
      {points.map(([deg, fill]) => (
        <g key={deg}>
          <path d={arm(deg, 84, 22, 1)} fill={fill} />
          <path d={arm(deg, 84, 22, -1)} fill={INK.cream} />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={9} fill={INK.charcoal} />
    </g>
  );
}

export const CRAFT_ART = {
  'craft.streak': LevelKeys,
  'craft.longNames': TicketRoll,
  'craft.comeback': RerailWheel,
  'craft.days': PunchedMonth,
  'craft.characters': WindingTrack,
  'craft.speedUp': RisingChevrons,
  'craft.allRounder': CompassRose,
};
