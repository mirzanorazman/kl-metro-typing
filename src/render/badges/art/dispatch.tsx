import { arcPath, arrowHeadPath, polar, spokePath } from './geometry';
import { INK } from './ink';

/**
 * All Clear: a signal head showing green. The red lamp is vivid and the green
 * lamp light mint, so the two differ by brightness as well as hue; the lit
 * lamp also carries the glint and the glow arcs.
 */
function SignalLamp() {
  return (
    <g>
      <rect x={76} y={164} width={48} height={12} rx={4} fill={INK.grey} />
      <rect x={94} y={112} width={12} height={56} fill={INK.grey} />
      <rect x={66} y={24} width={68} height={98} rx={30} fill={INK.charcoal} />
      <circle cx={100} cy={56} r={17} fill={INK.signalRed} />
      <circle cx={100} cy={94} r={17} fill={INK.mint} />
      <circle cx={94} cy={88} r={5} fill={INK.cream} />
      <path d="M56 82 Q50 94 56 106" fill="none" stroke={INK.mint} strokeWidth={5} strokeLinecap="round" />
      <path d="M144 82 Q150 94 144 106" fill="none" stroke={INK.mint} strokeWidth={5} strokeLinecap="round" />
      <path d="M44 76 Q36 94 44 112" fill="none" stroke={INK.mint} strokeWidth={4} strokeLinecap="round" />
      <path d="M156 76 Q164 94 156 112" fill="none" stroke={INK.mint} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/**
 * Through the Eras: three train fronts on one rail, old to modern, each
 * taller than the last: a boxy early car with one roof lamp, a flat-faced
 * car with a big windscreen, and a rounded modern cab.
 */
function ThreeEras() {
  return (
    <g>
      <rect x={10} y={164} width={180} height={8} rx={3} fill={INK.grey} />
      <rect x={20} y={100} width={46} height={64} rx={3} fill={INK.brick} />
      <rect x={24} y={92} width={38} height={10} rx={2} fill={INK.charcoal} />
      <circle cx={43} cy={86} r={6} fill={INK.yellow} />
      <rect x={26} y={110} width={14} height={18} rx={2} fill={INK.cream} />
      <rect x={46} y={110} width={14} height={18} rx={2} fill={INK.cream} />
      <rect x={24} y={146} width={38} height={6} fill={INK.charcoal} />

      <rect x={74} y={74} width={52} height={90} rx={6} fill={INK.orange} />
      <rect x={80} y={84} width={40} height={30} rx={3} fill={INK.charcoal} />
      <rect x={74} y={124} width={52} height={7} fill={INK.cream} />
      <circle cx={84} cy={148} r={5} fill={INK.cream} />
      <circle cx={116} cy={148} r={5} fill={INK.cream} />

      <path d="M134 164 V74 Q134 42 160 42 Q186 42 186 74 V164 Z" fill={INK.cream} />
      <path d="M140 92 Q140 54 160 54 Q180 54 180 92 Z" fill={INK.charcoal} />
      <rect x={134} y={118} width={52} height={10} fill={INK.teal} />
      <circle cx={145} cy={146} r={5} fill={INK.yellow} />
      <circle cx={175} cy={146} r={5} fill={INK.yellow} />
    </g>
  );
}

/** Packed In: a carriage bulging at the seams, every window full of heads. */
function PackedCarriage() {
  const heads = [46, 73, 100, 127, 154];
  return (
    <g>
      <path d="M14 60 Q8 102 14 144" fill="none" stroke={INK.charcoal} strokeWidth={5} strokeLinecap="round" />
      <path d="M186 60 Q192 102 186 144" fill="none" stroke={INK.charcoal} strokeWidth={5} strokeLinecap="round" />
      <rect x={20} y={160} width={160} height={8} rx={3} fill={INK.grey} />
      <path d="M28 56 Q100 34 172 56 Q182 102 172 148 Q100 164 28 148 Q18 102 28 56 Z" fill={INK.teal} />
      <path d="M24 126 Q100 138 176 126 L175 136 Q100 148 25 136 Z" fill={INK.cream} />
      <rect x={32} y={64} width={136} height={52} rx={6} fill={INK.charcoal} />
      {heads.map((x) => (
        <g key={x}>
          <path d={`M${x - 12} 116 Q${x - 12} 98 ${x} 98 Q${x + 12} 98 ${x + 12} 116 Z`} fill={INK.orange} />
          <circle cx={x} cy={84} r={11} fill={INK.cream} />
        </g>
      ))}
      <circle cx={56} cy={156} r={9} fill={INK.charcoal} />
      <circle cx={144} cy={156} r={9} fill={INK.charcoal} />
    </g>
  );
}

/**
 * On It: a spanner crossed with a signal flag. The flag is split cream and
 * signal red, so its red always sits on cream.
 */
function SpannerFlag() {
  return (
    <g>
      <g transform="rotate(-34 100 104)">
        <rect x={96} y={34} width={8} height={140} rx={3} fill={INK.charcoal} />
        <path d="M96 38 H46 V86 H96 Z" fill={INK.cream} />
        <path d="M96 38 L46 86 H96 Z" fill={INK.signalRed} />
      </g>
      <g transform="rotate(-45 100 104)">
        <rect x={34} y={95} width={92} height={18} rx={9} fill={INK.grey} />
        <path d="M174.2 95 A26 26 0 1 0 174.2 113 L150 113 V95 Z" fill={INK.grey} />
        <circle cx={40} cy={104} r={4} fill={INK.charcoal} />
      </g>
    </g>
  );
}

/**
 * Mind the Gap: a raised hand holding the train, above the platform's yellow
 * edge line and the dark gap below it.
 */
function HoldHand() {
  return (
    <g>
      <rect x={8} y={148} width={184} height={20} fill={INK.grey} />
      <rect x={8} y={134} width={184} height={14} fill={INK.yellow} />
      <rect x={8} y={168} width={184} height={16} fill={INK.charcoal} />
      <rect x={84} y={118} width={44} height={14} rx={2} fill={INK.brick} />
      <path
        d={'M68 82 V48 A8 8 0 0 1 84 48 V74 H86 V38 A8 8 0 0 1 102 38 V74 H104 V40 A8 8 0 0 1 120 40 ' +
          'V74 H122 V52 A8 8 0 0 1 138 52 V100 Q138 124 112 124 H94 Q80 124 72 112 L48 84 A8.5 8.5 0 0 1 61 73 Z'}
        fill={INK.cream}
      />
    </g>
  );
}

/** A station clock face: ring, ticks and hands. */
function ClockFace({ cx, cy, r, hour, minute }: {
  cx: number; cy: number; r: number; hour: number; minute: number;
}) {
  const face = r * 0.84;
  const [hx, hy] = polar(cx, cy, face * 0.5, 90 - hour * 30);
  const [mx, my] = polar(cx, cy, face * 0.78, 90 - minute * 6);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={INK.charcoal} />
      <circle cx={cx} cy={cy} r={face} fill={INK.cream} />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => (
        <path key={deg} d={spokePath(cx, cy, face * (deg % 90 === 0 ? 0.7 : 0.8), face * 0.92, deg)}
          fill="none" stroke={INK.charcoal} strokeWidth={deg % 90 === 0 ? 5 : 3} strokeLinecap="round" />
      ))}
      <path d={`M${cx} ${cy} L${hx.toFixed(1)} ${hy.toFixed(1)}`} fill="none" stroke={INK.charcoal} strokeWidth={7} strokeLinecap="round" />
      <path d={`M${cx} ${cy} L${mx.toFixed(1)} ${my.toFixed(1)}`} fill="none" stroke={INK.charcoal} strokeWidth={5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill={INK.brick} />
    </g>
  );
}

/**
 * Perfect Service: a station clock in a laurel wreath. The wreath is open at
 * the top and its leaves sweep upward, so at small sizes it can't read as a cog.
 */
function LaurelClock() {
  const cx = 100;
  const cy = 98;
  const left = [238, 210, 182, 154];
  const right = left.map((deg) => 180 - deg);
  return (
    <g>
      <path d={arcPath(cx, cy, 64, 262, 140)} fill="none" stroke={INK.teal} strokeWidth={5} strokeLinecap="round" />
      <path d={arcPath(cx, cy, 64, 40, -82)} fill="none" stroke={INK.teal} strokeWidth={5} strokeLinecap="round" />
      {[...left, ...right].map((deg) => {
        const onLeft = deg > 90 && deg < 270;
        const [x, y] = polar(cx, cy, 70, deg + (onLeft ? -6 : 6));
        const tilt = onLeft ? -34 : 34;
        return (
          <ellipse key={deg} cx={x} cy={y} rx={17} ry={7.5} fill={INK.teal}
            transform={`rotate(${(90 - deg + tilt).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`} />
        );
      })}
      <path d="M100 160 L80 182 L88 168 L76 166 Z" fill={INK.brick} />
      <path d="M100 160 L120 182 L112 168 L124 166 Z" fill={INK.brick} />
      <circle cx={100} cy={160} r={7} fill={INK.brick} />
      <ClockFace cx={cx} cy={cy} r={46} hour={10} minute={10} />
    </g>
  );
}

/** Right on Time: a platform clock on its bracket, with a tick beside it. */
function TickClock() {
  return (
    <g>
      <rect x={70} y={14} width={12} height={34} fill={INK.grey} />
      <rect x={52} y={14} width={48} height={10} rx={3} fill={INK.grey} />
      <ClockFace cx={76} cy={100} r={56} hour={12} minute={0} />
      <circle cx={146} cy={146} r={30} fill={INK.mint} />
      <path d="M132 146 L142 157 L161 134" fill="none" stroke={INK.charcoal} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * Express Stopper: the Line map's view of an express. A curved arrow skips
 * the middle Station, which is drawn faded, and lands on the next.
 */
function SkipArrow() {
  return (
    <g>
      <path d="M22 144 H178" fill="none" stroke={INK.teal} strokeWidth={14} strokeLinecap="round" />
      <circle cx={100} cy={144} r={14} fill={INK.paper} />
      <circle cx={100} cy={144} r={14} fill="none" stroke={INK.grey} strokeWidth={6} />
      {[40, 160].map((x) => (
        <g key={x}>
          <circle cx={x} cy={144} r={18} fill={INK.cream} />
          <circle cx={x} cy={144} r={18} fill="none" stroke={INK.charcoal} strokeWidth={8} />
        </g>
      ))}
      <path d="M40 118 C50 36 156 26 160 98" fill="none" stroke={INK.orange} strokeWidth={14} strokeLinecap="round" />
      <path d={arrowHeadPath(160, 94, -87, 32, 16)} fill={INK.orange} />
    </g>
  );
}

export const DISPATCH_ART = {
  'dispatch.era': ThreeEras,
  'dispatch.delivered': PackedCarriage,
  'dispatch.clears': SignalLamp,
  'dispatch.incidents': SpannerFlag,
  'dispatch.gaps': HoldHand,
  'dispatch.perfect': LaurelClock,
  'dispatch.onTime': TickClock,
  'dispatch.express': SkipArrow,
};
