import { useId, type ReactNode } from 'react';
import type { Tier } from '../../engine/achievementState';

/** The frame's metal: a tier, or the one colour earned secrets share. */
export type FrameMetal = Tier | 'secret';

/** Light, mid and dark stops of each metal. The frame stroke is the mid stop. */
const METALS: Record<FrameMetal, readonly [string, string, string]> = {
  bronze: ['#F6C08F', '#B86B33', '#6B3512'],
  silver: ['#F7F9FB', '#A7B0BA', '#545D68'],
  gold: ['#FFEB94', '#E2A72A', '#855505'],
  // Plum: far from all three metals and from every poster ink, so secrets read as a set apart.
  secret: ['#EBD9F5', '#8A4F9E', '#45224F'],
};

const KEY_INK = '#2A2A2E';

/** A four-pointed star, centred on (cx, cy) with arms of length s. */
function sparklePath(cx: number, cy: number, s: number): string {
  const k = s * 0.12;
  return `M${cx} ${cy - s} Q${cx + k} ${cy - k} ${cx + s} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + s} ` +
    `Q${cx - k} ${cy + k} ${cx - s} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - s} Z`;
}

/**
 * The mid-century transit poster every badge is printed on: paper with a
 * lower band, a halftone sun disc, the art with a charcoal key line printed
 * slightly off-register, a faint grain, and a rounded frame in the metal.
 *
 * The art is drawn twice; the second copy is the key line, which
 * `badges.css` turns into outlines of the filled shapes. Ids come from
 * `useId` so any number of badges can share a page.
 */
export function BadgeFrame({ metal, children }: { metal: FrameMetal; children: ReactNode }) {
  const id = useId();
  const halftone = `${id}-halftone`;
  const grain = `${id}-grain`;
  const clip = `${id}-clip`;
  const shine = `${id}-metal`;
  const [light, mid, dark] = METALS[metal];

  return (
    <>
      <defs>
        <pattern id={halftone} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <circle cx={3} cy={3} r={1.4} fill="#B5582E" opacity={0.55} />
        </pattern>
        <pattern id={grain} width={3} height={3} patternUnits="userSpaceOnUse" patternTransform="rotate(37)">
          <circle cx={1} cy={1} r={0.55} fill={KEY_INK} opacity={0.14} />
        </pattern>
        <clipPath id={clip}>
          <rect x={12} y={12} width={176} height={176} rx={28} />
        </clipPath>
        {metal === 'gold' && (
          <linearGradient id={shine} gradientUnits="userSpaceOnUse" x1={30} y1={10} x2={170} y2={190}>
            <stop offset={0} stopColor={light} />
            <stop offset={0.5} stopColor={mid} />
            <stop offset={1} stopColor={dark} />
          </linearGradient>
        )}
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={12} y={12} width={176} height={176} fill="#EFDDBB" />
        <rect x={12} y={132} width={176} height={56} fill="#E3CFA6" />
        <circle cx={100} cy={100} r={60} fill="#E7A673" />
        <circle cx={100} cy={100} r={60} fill={`url(#${halftone})`} />
        <g transform="translate(100 102) scale(.84) translate(-100 -100)">
          {children}
          <g className="badge__key" transform="translate(1.8 -1.2)" aria-hidden="true">
            {children}
          </g>
        </g>
        <rect x={12} y={12} width={176} height={176} fill={`url(#${grain})`} />
      </g>
      <rect className="badge__frame" x={12} y={12} width={176} height={176} rx={28} fill="none" stroke={mid} strokeWidth={8} />
      <rect x={21} y={21} width={158} height={158} rx={21} fill="none" stroke={KEY_INK} strokeWidth={1} opacity={0.35} />
      {metal === 'gold' && (
        <path d={sparklePath(172, 28, 14)} fill={`url(#${shine})`} stroke={dark} strokeWidth={1} />
      )}
    </>
  );
}
