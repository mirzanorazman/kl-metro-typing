import { starPath } from './geometry';
import { INK, LINE_INKS } from './ink';

/** Jalan-Jalan: a folded map with two lines and a pin. */
function FoldedMap() {
  return (
    <g>
      <path d="M38 72 L82 60 L82 152 L38 164 Z" fill={INK.cream} />
      <path d="M82 60 L120 72 L120 164 L82 152 Z" fill={INK.paper} />
      <path d="M120 72 L162 60 L162 152 L120 164 Z" fill={INK.cream} />
      <path d="M52 92 L84 104 L104 142" fill="none" stroke={INK.teal} strokeWidth={6} strokeLinecap="round" />
      <path d="M48 140 L70 118 L96 126 L124 112 L152 98" fill="none" stroke={INK.orange} strokeWidth={6} strokeLinecap="round" />
      <circle cx={70} cy={118} r={4.5} fill={INK.cream} />
      <circle cx={96} cy={126} r={4.5} fill={INK.cream} />
      <circle cx={84} cy={104} r={4.5} fill={INK.cream} />
      <path d="M128 112 C114 92 106 84 106 70 A22 22 0 1 1 150 70 C150 84 142 92 128 112 Z" fill={INK.brick} />
      <circle cx={128} cy={70} r={8} fill={INK.cream} />
    </g>
  );
}

/** End of the Line: a buffer stop at the end of the rails, its lamp lit. */
function BufferStop() {
  return (
    <g>
      {[36, 64, 92, 120, 148].map((x) => (
        <rect key={x} x={x} y={156} width={16} height={10} rx={2} fill={INK.charcoal} />
      ))}
      <rect x={26} y={148} width={148} height={9} rx={3} fill={INK.grey} />
      <path d="M96 112 L84 148 L95 148 L106 112 Z" fill={INK.orange} />
      <path d="M148 112 L160 148 L149 148 L138 112 Z" fill={INK.orange} />
      <rect x={72} y={97} width={22} height={12} fill={INK.grey} />
      <rect x={60} y={86} width={14} height={34} rx={6} fill={INK.grey} />
      <rect x={90} y={90} width={68} height={26} rx={6} fill={INK.orange} />
      {[104, 124, 144].map((x) => (
        <path key={x} d={`M${x} 90 h10 l-9 26 h-10 Z`} fill={INK.cream} />
      ))}
      <rect x={120} y={60} width={7} height={32} fill={INK.grey} />
      <circle cx={123.5} cy={50} r={13} fill={INK.brick} />
      <path d="M98 38 L105 42" fill="none" stroke={INK.sun} strokeWidth={4} strokeLinecap="round" />
      <path d="M149 38 L142 42" fill="none" stroke={INK.sun} strokeWidth={4} strokeLinecap="round" />
      <path d="M123.5 24 L123.5 30" fill="none" stroke={INK.sun} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/**
 * All Change: two Lines crossing under a station canopy, with the map's
 * interchange capsule where they meet.
 */
function CrossingCanopy() {
  return (
    <g>
      <rect x={38} y={70} width={9} height={98} fill={INK.grey} />
      <rect x={153} y={70} width={9} height={98} fill={INK.grey} />
      <path d="M22 66 L54 34 H146 L178 66 Z" fill={INK.brick} />
      <rect x={22} y={66} width={156} height={10} fill={INK.cream} />
      <path d="M32 106 L168 166" fill="none" stroke={INK.teal} strokeWidth={14} strokeLinecap="round" />
      <path d="M32 166 L168 106" fill="none" stroke={INK.orange} strokeWidth={14} strokeLinecap="round" />
      <rect x={72} y={122} width={56} height={28} rx={14} fill={INK.cream} />
      <rect x={72} y={122} width={56} height={28} rx={14} fill="none" stroke={INK.charcoal} strokeWidth={6} />
    </g>
  );
}

/** Walk It Off: a sneaker striding along a covered walkway. */
function WalkwaySneaker() {
  return (
    <g>
      <rect x={28} y={80} width={7} height={84} fill={INK.charcoal} />
      <rect x={165} y={80} width={7} height={84} fill={INK.charcoal} />
      <path d="M16 78 Q100 30 184 78 V90 Q100 44 16 90 Z" fill={INK.teal} />
      <rect x={12} y={162} width={176} height={9} rx={3} fill={INK.grey} />
      <path d="M54 90 Q64 86 72 92 L84 104 Q98 114 118 117 L142 121 Q162 125 165 142 H48 Q42 116 54 90 Z" fill={INK.brick} />
      <path d="M48 112 Q44 128 48 142 H64 V112 Z" fill={INK.orange} />
      <path d="M137 120 L142 121 Q162 125 165 142 H132 Q131 129 137 120 Z" fill={INK.cream} />
      <path d="M42 140 H164 Q172 140 172 147 Q172 156 162 156 H50 Q42 156 42 149 Z" fill={INK.cream} />
      <path d="M79 104 L86 95" fill="none" stroke={INK.cream} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M91 111 L98 102" fill="none" stroke={INK.cream} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M103 116 L110 107" fill="none" stroke={INK.cream} strokeWidth={4.5} strokeLinecap="round" />
    </g>
  );
}

/** Crossroads: a signpost at a Junction, its arms pointing three ways. */
function Signpost() {
  return (
    <g>
      <path d="M76 174 L86 160 H114 L124 174 Z" fill={INK.charcoal} />
      <rect x={94} y={30} width={12} height={132} fill={INK.grey} />
      <circle cx={100} cy={30} r={8} fill={INK.grey} />
      <path d="M84 40 H146 L166 58 L146 76 H84 Z" fill={INK.teal} />
      <path d="M116 84 H54 L34 102 L54 120 H116 Z" fill={INK.orange} />
      <path d="M84 128 H138 L156 144 L138 160 H84 Z" fill={INK.brick} />
      <circle cx={92} cy={58} r={3.5} fill={INK.cream} />
      <circle cx={108} cy={102} r={3.5} fill={INK.cream} />
      <circle cx={92} cy={144} r={3.5} fill={INK.cream} />
    </g>
  );
}

/** One carriage of the Long Ride train, from its left edge. */
function Carriage({ x, w }: { x: number; w: number }) {
  const pane = (w - 16) / 3;
  return (
    <g>
      <rect x={x} y={106} width={w} height={38} rx={5} fill={INK.cream} />
      <rect x={x} y={132} width={w} height={5} fill={INK.orange} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x + 5 + i * (pane + 3)} y={113} width={pane} height={12} rx={2} fill={INK.charcoal} />
      ))}
      <circle cx={x + 9} cy={146} r={5.5} fill={INK.charcoal} />
      <circle cx={x + w - 9} cy={146} r={5.5} fill={INK.charcoal} />
    </g>
  );
}

/** Long Ride: a train of many carriages, running on past the edge of the poster. */
function LongTrain() {
  return (
    <g transform="translate(182 122) scale(1.3) translate(-182 -134)">
      <rect x={-80} y={148} width={300} height={7} rx={3} fill={INK.grey} />
      {[-62, -24, 14, 52, 90].map((x) => (
        <g key={x}>
          <rect x={x + 34} y={126} width={6} height={6} fill={INK.charcoal} />
          <Carriage x={x} w={34} />
        </g>
      ))}
      <path d="M130 106 H156 Q178 106 182 130 V144 H130 Z" fill={INK.cream} />
      <rect x={130} y={132} width={52} height={5} fill={INK.orange} />
      <path d="M156 113 H158 Q172 114 176 128 H156 Z" fill={INK.charcoal} />
      <rect x={135} y={113} width={14} height={12} rx={2} fill={INK.charcoal} />
      <circle cx={139} cy={146} r={5.5} fill={INK.charcoal} />
      <circle cx={170} cy={146} r={5.5} fill={INK.charcoal} />
    </g>
  );
}

/** Every Line: a medal on a ribbon striped in seven Line colours. */
function LineMedal() {
  return (
    <g>
      {LINE_INKS.map((fill, i) => (
        <rect key={fill} x={65 + i * 10} y={18} width={10} height={86} fill={fill} />
      ))}
      <rect x={88} y={92} width={24} height={16} rx={4} fill={INK.grey} />
      <circle cx={100} cy={138} r={40} fill={INK.yellow} />
      <circle cx={100} cy={138} r={30} fill="none" stroke={INK.orange} strokeWidth={4} />
      <path d={starPath(100, 140, 20, 8.5)} fill={INK.brick} />
    </g>
  );
}

export const EXPLORER_ART = {
  'explorer.unlocked': FoldedMap,
  'explorer.interchanges': CrossingCanopy,
  'explorer.termini': BufferStop,
  'explorer.walk': WalkwaySneaker,
  'explorer.junctions': Signpost,
  'explorer.longRide': LongTrain,
  'explorer.lines': LineMedal,
};
