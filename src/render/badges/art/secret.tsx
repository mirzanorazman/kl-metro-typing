import { arrowHeadPath, polar, sparklePath, starPath } from './geometry';
import { INK, LINE_INKS } from './ink';

/** A crescent moon centred on (cx, cy), radius r, its horns pointing right. */
function crescentPath(cx: number, cy: number, r: number): string {
  const [x1, y1] = polar(cx, cy, r, 55);
  const [x2, y2] = polar(cx, cy, r, -55);
  const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `M${p(x1, y1)} A${r} ${r} 0 1 0 ${p(x2, y2)} A${(r * 0.95).toFixed(1)} ${(r * 0.95).toFixed(1)} 0 0 1 ${p(x1, y1)} Z`;
}

/** A hanging Station sign: a Line-colour band, then one blank bar per word. */
function StationSign({ x, y, w, words }: { x: number; y: number; w: number; words: [number, number][] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={42} rx={7} fill={INK.cream} />
      <rect x={x} y={y} width={16} height={42} rx={4} fill={INK.blue} />
      {words.map(([from, len]) => (
        <rect key={from} x={x + from} y={y + 15} width={len} height={12} rx={6} fill={INK.charcoal} />
      ))}
    </g>
  );
}

/**
 * Not That Ampang: two Station signs, the second the first name and then
 * some, and a red ring round the shorter one.
 */
function TwoSigns() {
  // An ellipse round the top sign, drawn in one stroke that overshoots its start.
  const points = Array.from({ length: 51 }, (_, i) => {
    const a = ((20 + i * 8) * Math.PI) / 180;
    const r = 1 + i * 0.0024;
    return `${(80 + 66 * r * Math.cos(a)).toFixed(1)} ${(73 - 33 * r * Math.sin(a)).toFixed(1)}`;
  });
  const ring = `M${points.join(' L')}`;
  return (
    <g>
      <rect x={8} y={20} width={184} height={8} rx={3} fill={INK.grey} />
      {[44, 72, 132].map((x) => (
        <rect key={x} x={x} y={24} width={5} height={x === 132 ? 92 : 30} fill={INK.grey} />
      ))}
      <StationSign x={30} y={52} w={100} words={[[28, 56]]} />
      <StationSign x={22} y={114} w={164} words={[[28, 56], [92, 56]]} />
      <path d={ring} fill="none" stroke={INK.signalRed} strokeWidth={8} strokeLinecap="round" />
    </g>
  );
}

/**
 * Round Trip: a ride drawn the way the map draws Lines, wandering out
 * through Station after Station and coming back into the one it left.
 */
function LoopRoute() {
  const route = 'M100 152 H52 L24 124 V100 L56 68 V44 H144 L176 76 L127 125';
  const stops: [number, number][] = [[24, 112], [56, 56], [100, 44], [160, 60], [152, 100]];
  return (
    <g>
      <path d={route} fill="none" stroke={INK.teal} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arrowHeadPath(129, 123, 225, 26, 17)} fill={INK.teal} />
      {stops.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={6} fill={INK.cream} />
      ))}
      <circle cx={100} cy={152} r={19} fill={INK.cream} />
      <circle cx={100} cy={152} r={19} fill="none" stroke={INK.charcoal} strokeWidth={8} />
      <circle cx={100} cy={152} r={6} fill={INK.orange} />
    </g>
  );
}

/** A warning triangle centred on (cx, cy): a signal-red rim around a cream face. */
function WarningTriangle({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  const tri = (k: number) =>
    `M${cx} ${cy - s * k} L${cx + s * k * 0.95} ${cy + s * k * 0.62} H${cx - s * k * 0.95} Z`;
  return (
    <g>
      <path d={tri(1)} fill={INK.signalRed} />
      <path d={tri(0.5)} fill={INK.cream} />
    </g>
  );
}

/** Rush Hour Survivor: a dispatcher's hard hat with three warning triangles over it. */
function HardHat() {
  return (
    <g>
      <path d="M46 150 Q46 92 100 90 Q154 92 154 150 Z" fill={INK.yellow} />
      <path d="M92 91 H108 V150 H92 Z" fill={INK.orange} />
      <rect x={28} y={144} width={144} height={18} rx={8} fill={INK.yellow} />
      <WarningTriangle cx={46} cy={70} s={24} />
      <WarningTriangle cx={100} cy={44} s={24} />
      <WarningTriangle cx={154} cy={70} s={24} />
    </g>
  );
}

/** Seven Colours: a train in a livery striped in all seven Lines' colours. */
function RainbowTrain() {
  return (
    <g>
      <rect x={6} y={160} width={188} height={8} rx={3} fill={INK.grey} />
      <path d="M8 62 H124 Q174 62 192 104 V150 H8 Z" fill={INK.cream} />
      {LINE_INKS.map((fill, i) => (
        <rect key={fill} x={8} y={104 + i * 6.5} width={184} height={6.5} fill={fill} />
      ))}
      {[16, 52, 88].map((x) => (
        <rect key={x} x={x} y={72} width={28} height={22} rx={3} fill={INK.charcoal} />
      ))}
      <path d="M128 72 Q160 74 176 96 H128 Z" fill={INK.charcoal} />
      <circle cx={40} cy={154} r={10} fill={INK.charcoal} />
      <circle cx={156} cy={154} r={10} fill={INK.charcoal} />
    </g>
  );
}

/**
 * Last Train Home: a stone tunnel mouth, and inside it the back of the
 * last train, its two red tail-lights on a dark panel going into the dark.
 */
function TunnelTail() {
  return (
    <g>
      <path d="M14 178 V100 A86 86 0 0 1 186 100 V178 Z" fill={INK.brick} />
      <path d="M46 178 V106 A54 54 0 0 1 154 106 V178 Z" fill={INK.charcoal} />
      {[150, 120, 90, 60, 30].map((deg) => {
        const [x1, y1] = polar(100, 106, 54, deg);
        const [x2, y2] = polar(100, 106, 86, deg);
        return <path key={deg} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={INK.paper} strokeWidth={3} />;
      })}
      <path d="M90 18 H110 L106 50 H94 Z" fill={INK.paper} />
      <path d="M70 178 L92 150" fill="none" stroke={INK.grey} strokeWidth={5} strokeLinecap="round" />
      <path d="M130 178 L108 150" fill="none" stroke={INK.grey} strokeWidth={5} strokeLinecap="round" />
      <path d="M78 150 V112 Q78 100 90 100 H110 Q122 100 122 112 V150 Z" fill={INK.grey} />
      <rect x={84} y={108} width={32} height={14} rx={3} fill={INK.cream} />
      <rect x={78} y={128} width={44} height={16} fill={INK.charcoal} />
      <circle cx={88} cy={136} r={5.5} fill={INK.signalRed} />
      <circle cx={112} cy={136} r={5.5} fill={INK.signalRed} />
    </g>
  );
}

/** Sweet Sixteen: a birthday cake with one lit candle. */
function Cake() {
  return (
    <g>
      <ellipse cx={100} cy={166} rx={78} ry={12} fill={INK.grey} />
      <rect x={38} y={96} width={124} height={66} rx={6} fill={INK.paper} />
      <rect x={38} y={128} width={124} height={11} fill={INK.brick} />
      <path
        d={'M34 104 Q34 92 46 92 H154 Q166 92 166 104 V112 Q166 120 160 120 Q154 120 154 112 Q154 124 146 124 ' +
          'Q138 124 138 112 V114 Q138 120 132 120 Q124 120 124 110 Q124 128 114 128 Q104 128 104 114 ' +
          'Q104 120 96 120 Q88 120 88 110 Q88 124 78 124 Q68 124 68 112 Q68 118 60 118 Q52 118 52 108 ' +
          'Q52 124 43 124 Q34 124 34 112 Z'}
        fill={INK.cream}
      />
      <rect x={93} y={50} width={14} height={44} rx={3} fill={INK.teal} />
      <path d="M93 64 L107 56 M93 78 L107 70 M93 92 L107 84" fill="none" stroke={INK.cream} strokeWidth={4} />
      <path d="M100 16 Q114 32 112 40 Q110 50 100 50 Q90 50 88 40 Q86 32 100 16 Z" fill={INK.yellow} />
      <path d="M100 30 Q106 38 105 42 Q104 46 100 46 Q96 46 95 42 Q94 38 100 30 Z" fill={INK.orange} />
    </g>
  );
}

/**
 * Puchong in One Breath: one long gust of breath sweeping over a Station
 * sign three words long, curling up at its end.
 */
function LongBreath() {
  return (
    <g>
      <rect x={40} y={136} width={8} height={42} fill={INK.grey} />
      <rect x={152} y={136} width={8} height={42} fill={INK.grey} />
      <rect x={8} y={102} width={184} height={40} rx={7} fill={INK.cream} />
      <rect x={8} y={102} width={16} height={40} rx={4} fill={INK.brick} />
      {[[32, 42], [80, 62], [148, 36]].map(([x, w]) => (
        <rect key={x} x={x} y={116} width={w} height={12} rx={6} fill={INK.charcoal} />
      ))}
      <path d="M14 70 C50 40 80 90 116 62 S168 30 178 56 Q182 76 162 74 Q150 70 156 60"
        fill="none" stroke={INK.teal} strokeWidth={11} strokeLinecap="round" />
      <path d="M22 88 C52 70 76 98 110 84" fill="none" stroke={INK.teal} strokeWidth={6} strokeLinecap="round" />
      <path d="M36 40 C60 28 80 40 96 34" fill="none" stroke={INK.teal} strokeWidth={6} strokeLinecap="round" />
    </g>
  );
}

/** Close Call: an hourglass with the last few grains about to fall. */
function Hourglass() {
  return (
    <g transform="rotate(-12 100 100)">
      <path d="M66 36 H134 Q134 84 106 100 Q134 116 134 164 H66 Q66 116 94 100 Q66 84 66 36 Z" fill={INK.cream} />
      <path d="M70 162 Q72 130 100 124 Q128 130 130 162 Z" fill={INK.orange} />
      <path d="M93 92 Q100 88 107 92 L100 100 Z" fill={INK.orange} />
      <path d="M100 100 V124" fill="none" stroke={INK.orange} strokeWidth={3} />
      <rect x={56} y={22} width={14} height={156} rx={4} fill={INK.brick} />
      <rect x={130} y={22} width={14} height={156} rx={4} fill={INK.brick} />
      <rect x={48} y={18} width={104} height={16} rx={5} fill={INK.charcoal} />
      <rect x={48} y={166} width={104} height={16} rx={5} fill={INK.charcoal} />
    </g>
  );
}

/**
 * A domino seen edge-on, with its right foot at (x, 162), tipped `tilt`
 * degrees to the right about that foot.
 */
function Domino({ x, tilt, fill }: { x: number; tilt: number; fill: string }) {
  return <rect x={x - 15} y={96} width={15} height={66} rx={3} fill={fill} transform={`rotate(${tilt} ${x} 162)`} />;
}

/**
 * Against the Odds: a run of dominoes toppled one onto the next, each
 * resting on the one in front, and the last one still standing: the one
 * that held.
 */
function LastStanding() {
  const fallen: [number, number][] = [[129.1, 26], [89.7, 44], [40.5, 62]];
  return (
    <g>
      <rect x={8} y={160} width={184} height={10} rx={3} fill={INK.charcoal} />
      <g transform="translate(104 162) scale(1.2) translate(-104 -162)">
        {fallen.map(([x, tilt]) => <Domino key={x} x={x} tilt={tilt} fill={INK.charcoal} />)}
        <Domino x={173} tilt={0} fill={INK.cream} />
      </g>
      <path d={sparklePath(150, 50, 20)} fill={INK.yellow} />
    </g>
  );
}

/** Night Owl: an owl perched on a signal post under a crescent moon, against the night. */
function Owl() {
  return (
    <g>
      <circle cx={100} cy={98} r={74} fill={INK.blue} />
      <path d={crescentPath(150, 54, 20)} fill={INK.cream} />
      <path d={sparklePath(46, 54, 8)} fill={INK.cream} />
      <path d={sparklePath(160, 108, 6)} fill={INK.cream} />
      <rect x={94} y={128} width={12} height={56} fill={INK.grey} />
      <rect x={58} y={124} width={84} height={10} rx={4} fill={INK.grey} />
      <path d="M70 60 L76 40 L88 54 H112 L124 40 L130 60 Q138 92 120 120 Q100 132 80 120 Q62 92 70 60 Z" fill={INK.orange} />
      <ellipse cx={100} cy={104} rx={16} ry={18} fill={INK.cream} />
      <path d="M70 76 Q60 100 78 118 Q76 96 82 82 Z" fill={INK.brick} />
      <path d="M130 76 Q140 100 122 118 Q124 96 118 82 Z" fill={INK.brick} />
      <circle cx={87} cy={72} r={12} fill={INK.yellow} />
      <circle cx={113} cy={72} r={12} fill={INK.yellow} />
      <circle cx={88} cy={73} r={5.5} fill={INK.charcoal} />
      <circle cx={112} cy={73} r={5.5} fill={INK.charcoal} />
      <path d="M95 84 H105 L100 94 Z" fill={INK.charcoal} />
      <path d="M86 124 l-4 6 M92 124 v7 M108 124 v7 M114 124 l4 6" fill="none" stroke={INK.yellow} strokeWidth={3.5} strokeLinecap="round" />
    </g>
  );
}

/**
 * Merdeka!: a flag flying from its pole: red and cream stripes and a blue
 * canton with a crescent and star. Generic, not any one nation's flag.
 */
function FlyingFlag() {
  const [x0, x1, h] = [48, 180, 14];
  const top = (x: number) => 44 + 8 * Math.sin(((x - x0) / (x1 - x0)) * 2 * Math.PI);
  const xs = Array.from({ length: 23 }, (_, i) => x0 + (i * (x1 - x0)) / 22);
  const band = (from: number, to: number, right = x1) => {
    const run = xs.filter((x) => x <= right);
    const edge = (k: number) => run.map((x) => `${x.toFixed(1)} ${(top(x) + k).toFixed(1)}`);
    return `M${edge(from).join(' L')} L${edge(to).reverse().join(' L')} Z`;
  };
  return (
    <g>
      <rect x={38} y={30} width={10} height={150} rx={3} fill={INK.grey} />
      <circle cx={43} cy={26} r={8} fill={INK.yellow} />
      <path d={band(0, 7 * h)} fill={INK.cream} />
      {[0, 2, 4, 6].map((k) => (
        <path key={k} d={band(k * h, (k + 1) * h)} fill={INK.signalRed} />
      ))}
      <path d={band(0, 4 * h, 114)} fill={INK.blue} />
      <path d={crescentPath(72, 78, 17)} fill={INK.yellow} />
      <path d={starPath(98, 78, 12, 5)} fill={INK.yellow} />
    </g>
  );
}

export const SECRET_ART = {
  'secret.ampang': TwoSigns,
  'secret.roundTrip': LoopRoute,
  'secret.rushHour': HardHat,
  'secret.sevenColours': RainbowTrain,
  'secret.lastTrain': TunnelTail,
  'secret.sixteen': Cake,
  'secret.puchong': LongBreath,
  'secret.closeCall': Hourglass,
  'secret.againstOdds': LastStanding,
  'secret.nightOwl': Owl,
  'secret.merdeka': FlyingFlag,
};
