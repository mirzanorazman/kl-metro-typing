import React from 'react';
import type { LineCode } from '../../src/data/types';
import { INCIDENT_GLYPH } from '../../src/render/incidentGlyphs';
import { useCurrentFrame } from 'remotion';
import { toScreen, type Cam } from './camera';
import { LINES, LINE_ORDER, along, heading, pos } from './net';
import { linePath, lineWidth, toD } from './MapLayer';
import { C } from './theme';
import { DISPATCH, ramp } from './timeline';

const START = 780;
/** Stations per second, for every Train on the board. */
const SPEED = 0.8;

interface Held {
  line: LineCode;
  /** Where the Train waits: just short of the Station it is held for. */
  at: number;
  forward: boolean;
  clear: number;
}

/** The Trains the script holds at red Signals, and when each is Cleared. */
const HELD: Held[] = [
  { line: 'KJ', at: 12.72, forward: true, clear: DISPATCH.clear1 },
  { line: 'MR', at: 4.72, forward: true, clear: DISPATCH.clear2 },
  { line: 'KG', at: 9.72, forward: true, clear: DISPATCH.greenWaveSignals[0]! },
  { line: 'KG', at: 11.72, forward: true, clear: DISPATCH.greenWaveSignals[1]! },
  { line: 'KG', at: 13.72, forward: true, clear: DISPATCH.greenWaveSignals[2]! },
];

/** Ampang Line Trains stopped by the Signal fault around Maluri until it is fixed. */
const STOPPED: { at: number; forward: boolean }[] = [
  { at: 10.45, forward: true },
  { at: 13.6, forward: false },
];

/** Free-running Trains per Line, so the whole board is visibly alive. */
const RUNNING: Record<LineCode, number> = { KJ: 4, AG: 2, SP: 3, MR: 1, KG: 3, PY: 4, SA: 2 };

function heldAt(h: Held, f: number): number {
  const s = h.forward ? 1 : -1;
  const arrive = START + 12;
  if (f < arrive) return h.at - (s * SPEED * (arrive - f)) / 30;
  if (f < h.clear) return h.at;
  const t = (f - h.clear) / 30;
  return h.at + s * SPEED * (t < 0.4 ? (t * t) / 0.8 : t - 0.2);
}

function stoppedAt(t: { at: number; forward: boolean }, f: number): number {
  const s = t.forward ? 1 : -1;
  if (f < DISPATCH.incidentAt) return t.at - (s * SPEED * (DISPATCH.incidentAt - f)) / 30;
  if (f < DISPATCH.fixed) return t.at;
  return t.at + (s * SPEED * (f - DISPATCH.fixed)) / 30;
}

export const DispatchLayer: React.FC<{ cam: Cam }> = ({ cam }) => {
  const f = useCurrentFrame();
  if (f < START || f > DISPATCH.rewind[0] + 4) return null;
  const fade = ramp(f, START, START + 18, 0, 1) * ramp(f, DISPATCH.rewind[0] - 8, DISPATCH.rewind[0] + 2, 1, 0);
  const scale = Math.max(0.7, Math.min(1.25, 0.6 + 0.2 * cam.z));

  const trains: { line: LineCode; at: number; forward: boolean }[] = [];
  for (const code of LINE_ORDER) {
    const L = LINES[code].stations.length - 1;
    for (let k = 0; k < RUNNING[code]; k++) {
      const u = (((k * 2 * L) / RUNNING[code] + L * 0.37 + (SPEED * (f - START)) / 30) % (2 * L) + 2 * L) % (2 * L);
      trains.push({ line: code, at: u <= L ? u : 2 * L - u, forward: u <= L });
    }
  }
  for (const h of HELD) trains.push({ line: h.line, at: heldAt(h, f), forward: h.forward });
  for (const t of STOPPED) trains.push({ line: 'AG', at: stoppedAt(t, f), forward: t.forward });

  // The Green wave: a bright pulse running down the Kajang Line as its Signals clear.
  const wave = ramp(f, DISPATCH.greenWave - 4, DISPATCH.greenWave + 22, 8, 16, (t) => t);
  const waveOn = ramp(f, DISPATCH.greenWave - 4, DISPATCH.greenWave, 0, 1) * ramp(f, DISPATCH.greenWave + 18, DISPATCH.greenWave + 28, 1, 0);

  const incident = toScreen(pos('maluri'), cam);
  const incIn = ramp(f, DISPATCH.incidentAt, DISPATCH.incidentAt + 8, 0, 1);
  const incOut = ramp(f, DISPATCH.fixed, DISPATCH.fixed + 10, 1, 0);

  return (
    <g opacity={fade}>
      {waveOn > 0 && (
        <path d={toD(linePath('KG', Math.max(8, wave - 2.5), wave, cam))} stroke="#bbf7d0"
          strokeWidth={lineWidth(cam.z) * 2.4} fill="none" strokeLinecap="round" filter="url(#softglow)" opacity={waveOn} />
      )}

      {trains.map((t, i) => {
        const p = toScreen(along(t.line, t.at), cam);
        const h = heading(t.line, t.at, t.forward);
        const angle = (Math.atan2(h.y, h.x) * 180) / Math.PI;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale})`}>
            <rect x={-15} y={-8} width={30} height={16} rx={8} fill={LINES[t.line].colour} stroke="#ffffff" strokeWidth={3} />
          </g>
        );
      })}

      {HELD.map((h, i) => {
        const lampOn = ramp(f, h.clear + 16, h.clear + 26, 1, 0);
        if (lampOn <= 0) return null;
        const at = h.at + (h.forward ? 0.16 : -0.16);
        const p = toScreen(along(h.line, at), cam);
        const d = heading(h.line, at, h.forward);
        const nx = -d.y * 26 * scale;
        const ny = d.x * 26 * scale;
        const green = f >= h.clear;
        return (
          <g key={i} opacity={lampOn * ramp(f, START + 6, START + 16, 0, 1)}>
            <g transform={`translate(${p.x + nx} ${p.y + ny}) scale(${scale})`}>
              <rect x={-10} y={-16} width={20} height={32} rx={6} fill={C.signalHead} stroke="#334155" strokeWidth={2} />
              <circle cx={0} cy={green ? 6 : -6} r={10} fill={green ? C.signalGreen : C.signalRed} filter="url(#softglow)" />
              <circle cx={0} cy={green ? 6 : -6} r={6.5} fill={green ? C.signalGreen : C.signalRed} />
            </g>
            {green && <Ripple x={p.x} y={p.y} start={h.clear} colour={C.signalGreen} />}
          </g>
        );
      })}

      {f >= DISPATCH.incidentAt && incOut > 0 && (
        <g transform={`translate(${incident.x} ${incident.y - 58 * scale}) scale(${scale * (0.6 + 0.4 * incIn)})`} opacity={incIn * incOut}>
          {[0, 15].map((off) => {
            const t = ((f - DISPATCH.incidentAt + off) % 30) / 30;
            return <circle key={off} r={30 + 40 * t} fill="none" stroke={C.warn} strokeWidth={4} opacity={1 - t} />;
          })}
          <circle r={30} fill={C.paper} stroke={C.warn} strokeWidth={5} />
          <path d={INCIDENT_GLYPH['signal-fault']} fill={C.warn} fillRule="evenodd" transform="scale(17)" />
        </g>
      )}
      {f >= DISPATCH.fixed && <Ripple x={incident.x} y={incident.y} start={DISPATCH.fixed} colour={C.signalGreen} big />}
    </g>
  );
};

const Ripple: React.FC<{ x: number; y: number; start: number; colour: string; big?: boolean }> = ({ x, y, start, colour, big }) => {
  const f = useCurrentFrame();
  const t = ramp(f, start, start + (big ? 26 : 20), 0, 1, (v) => 1 - Math.pow(1 - v, 2));
  if (t >= 1) return null;
  return <circle cx={x} cy={y} r={14 + t * (big ? 150 : 80)} fill="none" stroke={colour} strokeWidth={big ? 8 : 5} opacity={1 - t} />;
};
