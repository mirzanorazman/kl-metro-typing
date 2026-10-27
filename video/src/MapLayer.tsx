import React from 'react';
import type { LineCode, Point } from '../../src/data/types';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { cameraAt, toScreen, type Cam } from './camera';
import { BACKDROP, INTERCHANGES, LINES, LINE_ORDER, SHARED_SLOT, along, heading, nameOf, pos } from './net';
import { C, SANS } from './theme';
import { DispatchLayer } from './DispatchLayer';
import { HEIGHT, JUNCTION, TYPE, WIDTH, clamp01, drawnTo, playerTrain, ramp, revealFrame } from './timeline';

function backOut(t: number): number {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export function lineWidth(z: number): number {
  return Math.max(6, Math.min(15, 7.5 + 2.6 * Math.log2(z)));
}

/** Screen points of a Line from its first station up to fractional index `to`, offset where Lines share track. */
export function linePath(code: LineCode, from: number, to: number, cam: Cam): Point[] {
  const ids = LINES[code].stations;
  const w = lineWidth(cam.z);
  const pts: Point[] = [];
  const first = Math.max(0, Math.floor(from));
  const last = Math.min(ids.length - 1, Math.ceil(to));
  for (let i = first; i <= last; i++) {
    const at = Math.max(from, Math.min(to, i));
    pts.push(toScreen(along(code, at), cam));
  }
  // Offset each vertex by its neighbouring segments' slots, so a trunk two
  // Lines share (Ampang and Sri Petaling into Chan Sow Lin) shows both colours.
  return pts.map((p, k) => {
    const segs = [k - 1, k].filter((s) => s >= 0 && s < pts.length - 1);
    let ox = 0;
    let oy = 0;
    for (const s of segs) {
      const i = first + s;
      const key = [ids[i], ids[i + 1]].sort().join('|');
      const sharers = SHARED_SLOT.get(key) ?? [code];
      if (sharers.length < 2) continue;
      const slot = sharers.indexOf(code) - (sharers.length - 1) / 2;
      const a = pts[s]!;
      const b = pts[s + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      ox += (-(b.y - a.y) / len) * slot * w * 0.9;
      oy += ((b.x - a.x) / len) * slot * w * 0.9;
    }
    const n = segs.length || 1;
    return { x: p.x + ox / n, y: p.y + oy / n };
  });
}

export const toD = (pts: Point[]) =>
  pts.length < 2 ? '' : `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}`;

/** Station labels: who is named, when, and on which side of the dot. */
const LABELS: { id: string; from: number; to: number; side?: 'left' }[] = [
  { id: 'gombak', from: 50, to: 262 },
  { id: 'taman-melati', from: 136, to: 262 },
  { id: 'wangsa-maju', from: 171, to: 262 },
  { id: 'sri-rampai', from: 200, to: 262 },
  { id: 'setiawangsa', from: 242, to: 262 },
  { id: 'kl-sentral', from: 282, to: 388, side: 'left' },
  { id: 'titiwangsa', from: 368, to: 388, side: 'left' },
  { id: 'kelana-jaya', from: 392, to: 452, side: 'left' },
  { id: 'putra-heights', from: TYPE.junctionArrive.end, to: 534 },
  { id: 'puchong-prima', from: TYPE.junctionLeave.end, to: 540 },
  { id: 'upm', from: TYPE.quickRun[0]!.end, to: 686 },
  { id: 'taman-equine', from: TYPE.quickRun[1]!.end, to: 686 },
  { id: 'putra-permai', from: TYPE.quickRun[2]!.end, to: 686 },
  { id: '16-sierra', from: TYPE.quickRun[3]!.end, to: 686 },
  { id: 'pasar-seni', from: 800, to: 896, side: 'left' },
  { id: 'bukit-bintang', from: 836, to: 896 },
  { id: 'miharja', from: 912, to: 990, side: 'left' },
  { id: 'maluri', from: 912, to: 990 },
  { id: 'pandan-jaya', from: 912, to: 990 },
];

export const MapLayer: React.FC = () => {
  const f = useCurrentFrame();
  const cam = cameraAt(f);
  const vf = revealFrame(f);
  const w = lineWidth(cam.z);

  const drawn = Object.fromEntries(LINE_ORDER.map((c) => [c, drawnTo(c, vf)])) as Record<LineCode, number>;
  const before = Object.fromEntries(LINE_ORDER.map((c) => [c, drawnTo(c, revealFrame(f - 1))])) as Record<LineCode, number>;

  // A station shows once some Line's track reaches it, popping in as it does.
  const shown = new Map<string, number>();
  for (const code of LINE_ORDER) {
    const d = drawn[code];
    LINES[code].stations.forEach((id, i) => {
      if (d < 0 || d < i - 0.35) return;
      const s = i === 0 ? 1 : clamp01((d - (i - 0.35)) / 0.35);
      shown.set(id, Math.max(shown.get(id) ?? 0, s));
    });
  }
  // The very first station drops in with a bounce when GOMBAK is typed.
  if (shown.has('gombak') && vf < 120) shown.set('gombak', backOut(clamp01((vf - TYPE.hook.end) / 10)));

  const r = Math.max(4, Math.min(11, 4.5 + 1.6 * Math.log2(cam.z)));
  const mrGlow = ramp(f, 368, 376, 0, 1) * ramp(f, 380, 406, 1, 0);
  const train = playerTrain(f);
  const endDim = ramp(f, 1080, 1104, 1, 0.28);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', opacity: endDim }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <linearGradient id="topScrim" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.paper} stopOpacity="0.97" />
            <stop offset="45%" stopColor={C.paper} stopOpacity="0.85" />
            <stop offset="100%" stopColor={C.paper} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="vignette" cx="50%" cy="48%" r="75%">
            <stop offset="55%" stopColor={C.paper} stopOpacity="0" />
            <stop offset="100%" stopColor="#05070c" stopOpacity="0.85" />
          </radialGradient>
        </defs>

        {BACKDROP.map((ring, i) => (
          <path key={i} d={`${toD(ring.map((p) => toScreen(p, cam)))}Z`} fill={C.paperSub} stroke={C.paperEdge} strokeWidth={2} />
        ))}

        {LINE_ORDER.map((code) => {
          const d = drawn[code];
          if (d < 0) return null;
          const pts = linePath(code, 0, Math.max(d, 0.0001), cam);
          const drawing = d !== before[code] && d < LINES[code].stations.length - 1;
          const tip = pts[pts.length - 1]!;
          return (
            <g key={code}>
              {code === 'MR' && mrGlow > 0 && (
                <path d={toD(pts)} stroke={LINES.MR.colour} strokeWidth={w * 3.2} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" opacity={mrGlow} />
              )}
              <path d={toD(pts)} stroke={LINES[code].colour} strokeWidth={w} fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
              {drawing && (
                <>
                  <circle cx={tip.x} cy={tip.y} r={w * 1.8} fill={LINES[code].colour} filter="url(#glow)" />
                  <circle cx={tip.x} cy={tip.y} r={w * 0.55} fill="#ffffff" />
                </>
              )}
            </g>
          );
        })}

        {[...shown].map(([id, s]) => {
          const p = toScreen(pos(id), cam);
          const big = INTERCHANGES.has(id);
          const rr = (big ? r * 1.35 : r) * s;
          return (
            <circle key={id} cx={p.x} cy={p.y} r={rr} fill={big ? C.paper : '#ffffff'}
              stroke={big ? '#ffffff' : C.paper} strokeWidth={big ? Math.max(2.5, r * 0.5) : Math.max(1.5, r * 0.3)} />
          );
        })}

        <DispatchLayer cam={cam} />

        {train && train.opacity > 0 && <TrainMark train={train} cam={cam} />}

        {LABELS.map((l) => {
          const o = ramp(f, l.from, l.from + 8, 0, 1) * ramp(f, l.to - 8, l.to, 1, 0) * (shown.get(l.id) ?? 0);
          if (o <= 0) return null;
          const p = toScreen(pos(l.id), cam);
          const left = l.side === 'left';
          return (
            <text key={l.id} x={p.x + (left ? -1 : 1) * (r * 1.6 + 14)} y={p.y + 11} opacity={o}
              textAnchor={left ? 'end' : 'start'} fontFamily={SANS} fontWeight={700} fontSize={32}
              fill={C.ink} stroke={C.paper} strokeWidth={8} paintOrder="stroke" strokeLinejoin="round">
              {nameOf(l.id)}
            </text>
          );
        })}

        <rect width={WIDTH} height={HEIGHT} fill="url(#vignette)" />
        <rect width={WIDTH} height={720} fill="url(#topScrim)" />
      </svg>
      <JunctionPulse cam={cam} />
    </AbsoluteFill>
  );
};

/** The player's train: a white capsule edged in its Line's colour, with a glow. */
const TrainMark: React.FC<{ train: NonNullable<ReturnType<typeof playerTrain>>; cam: Cam }> = ({ train, cam }) => {
  const p = toScreen(along(train.line, train.at), cam);
  const h = heading(train.line, train.at, train.forward);
  const angle = (Math.atan2(h.y, h.x) * 180) / Math.PI;
  const colour = LINES[train.line].colour;
  return (
    <g opacity={train.opacity} transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
      <ellipse rx={46} ry={30} fill={colour} opacity={0.55} filter="url(#glow)" />
      <rect x={-27} y={-14} width={54} height={28} rx={14} fill="#ffffff" stroke={colour} strokeWidth={6} />
      <circle cx={14} cy={0} r={6} fill={colour} />
    </g>
  );
};

/** Rings around Putra Heights while the junction waits for a choice. */
const JunctionPulse: React.FC<{ cam: Cam }> = ({ cam }) => {
  const f = useCurrentFrame();
  if (f < JUNCTION.show || f > JUNCTION.hide + 10) return null;
  const p = toScreen(pos('putra-heights'), cam);
  const fade = ramp(f, JUNCTION.show, JUNCTION.show + 8, 0, 1) * ramp(f, JUNCTION.hide, JUNCTION.hide + 10, 1, 0);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute' }}>
      {[0, 15].map((off) => {
        const t = ((f - JUNCTION.show + off) % 30) / 30;
        return (
          <circle key={off} cx={p.x} cy={p.y} r={20 + t * 70} fill="none" stroke="#ffffff"
            strokeWidth={4} opacity={(1 - t) * 0.8 * fade} />
        );
      })}
    </svg>
  );
};
