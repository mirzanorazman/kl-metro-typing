import React from 'react';
import type { LineCode } from '../../src/data/types';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { LINES, LINE_ORDER, STATION_COUNT } from './net';
import { C, MONO, SANS, contrastText } from './theme';
import {
  BADGE_FRAMES, CORE_END, DISPATCH, ERAS, JUNCTION, LINE_RUN_END, SCENE, TYPE, WIDTH, activeIn, clamp01, drawnTo,
  easeOut, eraAt, focusAmount, ramp, revealFrame, typedAt, type Typed,
} from './timeline';

const fadeWindow = (f: number, a: number, b: number, edge = 10) =>
  ramp(f, a, a + edge, 0, 1, easeOut) * ramp(f, b - edge, b, 1, 0);

export const Badge: React.FC<{ code: LineCode; size?: number }> = ({ code, size = 34 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: LINES[code].colour, color: contrastText(LINES[code].colour),
    font: `800 ${size}px/1 ${SANS}`, letterSpacing: 1, padding: `${size * 0.28}px ${size * 0.42}px`,
    borderRadius: size * 0.3, minWidth: size * 1.9,
  }}>
    {code}
  </span>
);

/* ---------- the Era timeline along the top ---------- */

export const EraBar: React.FC = () => {
  const f = useCurrentFrame();
  const o = ramp(f, 36, 52, 0, 1) * ramp(f, SCENE.end - 6, SCENE.end + 8, 1, 0) * (1 - 0.6 * focusAmount(f));
  if (o <= 0) return null;
  const vf = revealFrame(f);
  const era = eraAt(vf);
  const x0 = 130;
  const x1 = WIDTH - 130;
  const step = (x1 - x0) / (ERAS.length - 1);

  const seen = new Set<string>();
  for (const code of LINE_ORDER) {
    const d = drawnTo(code, vf);
    LINES[code].stations.forEach((id, i) => { if (d >= i - 0.35 && d >= 0) seen.add(id); });
  }

  return (
    <AbsoluteFill style={{ opacity: o }}>
      <svg width={WIDTH} height={260} style={{ position: 'absolute', top: 0 }}>
        <line x1={x0} x2={x1} y1={150} y2={150} stroke={C.paperEdge} strokeWidth={6} strokeLinecap="round" />
        <line x1={x0} x2={x0 + era * step} y1={150} y2={150} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
        {ERAS.map((label, i) => {
          const on = clamp01(era - i + 1);
          const current = 1 - Math.min(1, Math.abs(era - i));
          return (
            <g key={label}>
              <circle cx={x0 + i * step} cy={150} r={11 + 5 * current} fill={on > 0.5 ? C.ink : C.paper}
                stroke={on > 0.5 ? C.ink : C.inkFaint} strokeWidth={4} />
              <text x={x0 + i * step} y={208} textAnchor="middle" fontFamily={MONO} fontSize={30}
                fontWeight={current > 0.5 ? 800 : 500}
                fill={current > 0.5 ? C.ink : on > 0.5 ? C.inkMuted : C.inkFaint}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute', top: 92, width: '100%', textAlign: 'center',
        font: `600 28px/1 ${MONO}`, color: C.inkMuted, letterSpacing: 3,
      }}>
        {seen.size} STATIONS
      </div>
    </AbsoluteFill>
  );
};

/* ---------- headlines ---------- */

const HEADLINES: { from: number; to: number; kicker?: string; colour?: string; lines: string[] }[] = [
  { from: 96, to: CORE_END + 8, lines: ['Type the station.', 'Drive the train.'] },
  { from: 344, to: 504, kicker: 'LINE RUN', colour: LINES.MR.colour, lines: ['End to end.'] },
  { from: 556, to: 744, kicker: 'ADVENTURE', colour: LINES.KJ.colour, lines: ['Choose your way.'] },
  { from: 798, to: 954, kicker: 'QUICK RUN', colour: LINES.PY.colour, lines: ['30 seconds. Go.'] },
  { from: 1086, to: DISPATCH.entrance[1] + 6, kicker: 'DISPATCHER', colour: C.signalGreen, lines: ['Now run', 'all of it.'] },
  { from: 1354, to: SCENE.end, kicker: 'DISPATCHER', colour: C.signalGreen, lines: ['Grow the network,', 'era by era.'] },
];

export const Headline: React.FC = () => {
  const f = useCurrentFrame();
  const h = HEADLINES.find((x) => f >= x.from && f < x.to);
  if (!h) return null;
  return (
    <AbsoluteFill style={{ top: 290, alignItems: 'center' }}>
      {h.kicker && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18, opacity: fadeWindow(f, h.from, h.to, 8),
          font: `700 36px/1 ${MONO}`, letterSpacing: 7, color: C.inkMuted, marginBottom: 22,
        }}>
          <span style={{ width: 44, height: 10, borderRadius: 5, background: h.colour }} />
          {h.kicker}
        </div>
      )}
      {h.lines.map((text, i) => {
        const a = h.from + (h.kicker ? 10 : 4) + i * 14;
        return (
          <div key={text} style={{
            font: `800 96px/1.08 ${SANS}`, color: C.ink, letterSpacing: -2, textAlign: 'center',
            opacity: fadeWindow(f, a, h.to, 10),
            translate: `0px ${ramp(f, a, a + 14, 40, 0, easeOut)}px`,
            textShadow: `0 4px 30px ${C.paper}`,
          }}>
            {text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------- the typing panel ---------- */

interface PanelView {
  line: LineCode;
  label: string;
  meta?: string;
  typed?: Typed;
  note?: string;
  /** An Incident's fix items, shown as chips under the prompt. */
  chips?: Typed[];
  opacity: number;
}

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

function panelAt(f: number): PanelView | null {
  if (f >= 84 && f < CORE_END + 14) {
    return { line: 'KJ', label: 'NEXT STATION', typed: activeIn(TYPE.core, f) ?? TYPE.core[0], opacity: fadeWindow(f, 84, CORE_END + 14, 12) };
  }
  if (f >= 370 && f < 508) {
    const done = TYPE.lineRun.filter((t) => t.end <= f).length;
    return {
      line: 'MR', label: 'LINE RUN · KL MONORAIL', meta: `${done}/10`, typed: activeIn(TYPE.lineRun, f) ?? TYPE.lineRun[0],
      note: done === 10 && f > LINE_RUN_END + 4 ? 'Line complete' : undefined, opacity: fadeWindow(f, 370, 508, 10),
    };
  }
  if (f >= 578 && f < JUNCTION.show + 2) {
    return { line: 'KJ', label: 'NEXT STATION', typed: TYPE.junctionArrive, opacity: fadeWindow(f, 578, JUNCTION.show + 2, 10) };
  }
  if (f >= JUNCTION.hide - 2 && f < 754) {
    return { line: 'SP', label: 'NEXT STATION', typed: TYPE.junctionLeave, opacity: fadeWindow(f, JUNCTION.hide - 2, 754, 8) };
  }
  if (f >= 826 && f < 958) {
    const first = TYPE.quickRun[0]!.keys[0]!;
    const left = 30 - Math.max(0, f - first) / 30;
    const wpm = Math.round(ramp(f, first + 10, 940, 45, 72, (t) => t));
    return {
      line: 'PY', label: 'QUICK RUN', meta: `0:${pad(Math.ceil(left))}  ·  ${f < first + 10 ? '—' : wpm} WPM`,
      typed: activeIn(TYPE.quickRun, f) ?? TYPE.quickRun[0], opacity: fadeWindow(f, 826, 958, 10),
    };
  }
  if (f >= DISPATCH.entrance[1] && f < 1200) {
    return { line: 'KJ', label: 'CLEAR SIGNAL', typed: TYPE.clear1, opacity: fadeWindow(f, DISPATCH.entrance[1], 1200, 8) };
  }
  if (f >= 1202 && f < 1258) {
    return { line: 'KG', label: 'GREEN WAVE', note: '3 Signals cleared', opacity: fadeWindow(f, 1202, 1258, 8) };
  }
  if (f >= DISPATCH.incidentAt + 2 && f < 1354) {
    // The Incident lives in the one panel: its kind and place on top, its fix items as chips.
    const t = activeIn(TYPE.fix, f) ?? TYPE.fix[0]!;
    const i = TYPE.fix.indexOf(t);
    return {
      line: 'AG', label: '⚠ SIGNAL FAULT · MALURI', meta: `${Math.min(3, i + (f >= t.end ? 1 : 0))}/3`, typed: t,
      chips: TYPE.fix, note: f >= DISPATCH.fixed + 2 ? 'Fixed' : undefined, opacity: fadeWindow(f, DISPATCH.incidentAt + 2, 1354, 8),
    };
  }
  return null;
}

export const Prompt: React.FC<{ typed: Typed; colour: string; size: number; cursor?: boolean }> = ({ typed, colour, size, cursor }) => {
  const f = useCurrentFrame();
  const { done, wrong } = typedAt(typed, f);
  const blink = Math.floor(f / 15) % 2 === 0;
  return (
    <div style={{ font: `700 ${size}px/1.2 ${MONO}`, whiteSpace: 'pre', display: 'flex' }}>
      {[...typed.text].map((ch, i) => {
        const state = i < done ? 'done' : i === done ? (wrong ? 'wrong' : 'current') : 'pending';
        return (
          <span key={i} style={{
            color: state === 'done' ? C.ink : state === 'wrong' ? C.error : state === 'current' ? colour : C.inkFaint,
            borderBottom: state === 'wrong' ? `${size * 0.09}px double ${C.error}`
              : state === 'current' ? `${size * 0.05}px solid ${colour}`
              : ch === ' ' && state === 'pending' ? `${size * 0.05}px solid ${C.inkFaint}` : `${size * 0.05}px solid transparent`,
            translate: state === 'wrong' ? `${Math.sin(f * 2.4) * 5}px 0px` : undefined,
          }}>
            {ch}
          </span>
        );
      })}
      {cursor && done >= typed.text.length && (
        <span style={{ width: size * 0.55, background: blink ? C.ink : 'transparent', marginLeft: 6 }} />
      )}
    </div>
  );
};

export const Panel: React.FC = () => {
  const f = useCurrentFrame();
  const v = panelAt(f);
  if (!v || v.opacity <= 0) return null;
  const colour = LINES[v.line].colour;
  const lit = v.line === 'SP' ? '#d6336c' : colour;
  const wrong = v.typed ? typedAt(v.typed, f).wrong : false;
  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 1392, opacity: v.opacity,
      translate: `0px ${(1 - v.opacity) * 30}px`,
      background: C.panel, border: `3px solid ${wrong ? C.error : v.chips ? (v.note ? C.signalGreen : C.warn) : colour}`, borderRadius: 30,
      boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 60px -10px ${wrong ? C.error : colour}`,
      padding: '30px 40px 36px', display: 'flex', flexDirection: 'column', gap: 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Badge code={v.line} />
        <span style={{ font: `700 30px/1 ${MONO}`, letterSpacing: 3, color: C.inkMuted, flex: 1 }}>{v.label}</span>
        {v.meta && <span style={{ font: `700 34px/1 ${MONO}`, color: C.ink }}>{v.meta}</span>}
      </div>
      <div style={{ height: 100, display: 'flex', alignItems: 'center' }}>
        {v.note && !v.typed ? (
          <span style={{ font: `800 72px/1.2 ${SANS}`, color: C.signalGreen }}>{v.note}</span>
        ) : v.typed ? (
          <Prompt typed={v.typed} colour={lit} size={80} />
        ) : null}
      </div>
      {v.chips && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {v.chips.map((c) => {
            const state = f >= c.end ? 'done' : f >= c.start ? 'current' : 'pending';
            return (
              <span key={c.text} style={{
                font: `700 28px/1 ${MONO}`, padding: '10px 16px', borderRadius: 12,
                border: `2px solid ${state === 'done' ? C.signalGreen : state === 'current' ? C.ink : C.panelEdge}`,
                color: state === 'done' ? C.signalGreen : state === 'current' ? C.ink : C.inkFaint,
              }}>
                {state === 'done' ? '✓ ' : ''}{c.text}
              </span>
            );
          })}
        </div>
      )}
      {wrong && (
        <span style={{ position: 'absolute', right: 40, bottom: 28, font: `700 28px/1 ${SANS}`, color: C.error }}>Wrong key</span>
      )}
      {v.note && v.typed && (
        <span style={{ position: 'absolute', right: 40, bottom: 30, font: `800 32px/1 ${SANS}`, color: C.signalGreen,
          }}>
          ✓ {v.note}
        </span>
      )}
    </div>
  );
};

/* ---------- the opening: a cursor, then GOMBAK ---------- */

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= 100) return null;
  const o = ramp(f, 82, 96, 1, 0);
  const blink = Math.floor(f / 12) % 2 === 0;
  return (
    <AbsoluteFill style={{ top: 1430, alignItems: 'center', opacity: o }}>
      <div style={{ font: `700 32px/1 ${MONO}`, letterSpacing: 6, color: C.inkMuted, marginBottom: 30, opacity: ramp(f, 4, 16, 0, 1) }}>
        NEXT STATION
      </div>
      {f < TYPE.hook.start ? (
        <span style={{ width: 70, height: 130, background: blink ? C.ink : 'transparent' }} />
      ) : (
        <Prompt typed={TYPE.hook} colour={LINES.KJ.colour} size={140} cursor />
      )}
    </AbsoluteFill>
  );
};

/* ---------- the Adventure junction ---------- */

export const Junction: React.FC = () => {
  const f = useCurrentFrame();
  const o = fadeWindow(f, JUNCTION.show, JUNCTION.hide + 4, 8);
  if (o <= 0) return null;
  const picked = f >= JUNCTION.pick;
  const options: { key: string; code: LineCode; toward: string }[] = [
    { key: '1', code: 'SP', toward: 'Sentul Timur' },
    { key: '2', code: 'KJ', toward: 'Gombak' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 1330, opacity: o, translate: `0px ${(1 - o) * 30}px`,
      background: C.panel, border: `3px solid ${C.panelEdge}`, borderRadius: 30, padding: '30px 36px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div style={{ font: `800 46px/1.1 ${SANS}`, color: C.ink, marginBottom: 6 }}>Putra Heights — which way?</div>
      {options.map((opt, i) => {
        const on = picked && i === 0;
        const press = i === 0 ? ramp(f, JUNCTION.pick - 2, JUNCTION.pick, 0, 1) * ramp(f, JUNCTION.pick + 2, JUNCTION.pick + 8, 1, 0) : 0;
        return (
          <div key={opt.key} style={{
            display: 'flex', alignItems: 'center', gap: 24, padding: '20px 24px', borderRadius: 20,
            border: `3px solid ${on ? '#d6336c' : C.panelEdge}`,
            background: on ? 'rgba(214, 51, 108, 0.18)' : 'rgba(255,255,255,0.03)',
            scale: on ? String(1 + 0.03 * ramp(f, JUNCTION.pick, JUNCTION.pick + 6, 0, 1) * ramp(f, JUNCTION.pick + 6, JUNCTION.pick + 14, 1, 0.4)) : '1',
          }}>
            <span style={{
              font: `800 36px/1 ${MONO}`, color: C.ink, border: `3px solid ${C.inkMuted}`, borderRadius: 10,
              padding: '8px 16px', translate: `0px ${press * 4}px`, background: press > 0 ? C.inkFaint : 'transparent',
            }}>{opt.key}</span>
            <Badge code={opt.code} size={32} />
            <span style={{ font: `700 40px/1 ${SANS}`, color: on || !picked ? C.ink : C.inkFaint }}>toward {opt.toward}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ---------- Latest: the count lands ---------- */

export const NetworkTotal: React.FC = () => {
  const f = useCurrentFrame();
  const o = fadeWindow(f, SCENE.latest + 4, SCENE.dispatcher - 4, 12);
  if (o <= 0) return null;
  const vf = revealFrame(f);
  const seen = new Set<string>();
  for (const code of LINE_ORDER) {
    const d = drawnTo(code, vf);
    LINES[code].stations.forEach((id, i) => { if (d >= 0 && d >= i - 0.35) seen.add(id); });
  }
  const landed = seen.size === STATION_COUNT;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{ position: 'absolute', top: 280, width: '100%', textAlign: 'center' }}>
        <div style={{ font: `800 230px/1 ${SANS}`, color: C.ink, letterSpacing: -6,
          scale: landed ? String(1 + 0.06 * ramp(f, 1012, 1018, 1, 0)) : '1' }}>
          {seen.size}
        </div>
        <div style={{ font: `700 56px/1.2 ${SANS}`, color: C.inkMuted, marginTop: 6 }}>stations · 7 lines</div>
      </div>
      <div style={{ position: 'absolute', top: 1440, width: '100%', display: 'flex', justifyContent: 'center', gap: 16 }}>
        {LINE_ORDER.map((code, i) => {
          const a = BADGE_FRAMES[i]!;
          return (
            <span key={code} style={{
              opacity: ramp(f, a, a + 3, 0, 1),
              scale: String(ramp(f, a, a + 8, 0.4, 1, (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2))),
            }}>
              <Badge code={code} size={44} />
            </span>
          );
        })}
      </div>
      <div style={{
        position: 'absolute', top: 1580, width: '100%', textAlign: 'center', font: `700 48px/1 ${SANS}`, color: C.ink,
        opacity: ramp(f, 1038, 1048, 0, 1),
      }}>
        One keyboard.
      </div>
    </AbsoluteFill>
  );
};

/* ---------- the end card ---------- */

export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const E = SCENE.end;
  if (f < E) return null;
  const logo = ramp(f, E + 8, E + 24, 0, 1, (t) => 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2));
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <svg viewBox="0 0 64 64" width={250} height={250} style={{
        position: 'absolute', top: 470, scale: String(logo), opacity: clamp01(logo * 2),
      }}>
        <rect width="64" height="64" rx="14" fill={C.paperSub} />
        <circle cx="32" cy="32" r="21" fill={LINES.KJ.colour} />
        <path d="M7 32h12M45 32h12" stroke={LINES.AG.colour} strokeWidth="6" strokeLinecap="round" />
        <circle cx="32" cy="32" r="11" fill={C.ink} />
      </svg>
      <div style={{
        position: 'absolute', top: 770, font: `800 54px/1 ${SANS}`, letterSpacing: 6, color: C.ink,
        opacity: ramp(f, E + 18, E + 30, 0, 1), translate: `0px ${ramp(f, E + 18, E + 32, 24, 0, easeOut)}px`,
      }}>
        KL-METRO TYPING
      </div>
      <div style={{
        position: 'absolute', top: 880, font: `800 88px/1.1 ${SANS}`, color: C.ink, textAlign: 'center', letterSpacing: -1.5,
        opacity: ramp(f, E + 26, E + 40, 0, 1), translate: `0px ${ramp(f, E + 26, E + 42, 30, 0, easeOut)}px`,
      }}>
        Type your way<br />across the<br />Klang Valley.
      </div>
      <div style={{
        position: 'absolute', top: 1260, padding: '30px 44px', borderRadius: 999, background: C.ink,
        opacity: ramp(f, E + 36, E + 44, 0, 1), scale: String(ramp(f, E + 36, E + 46, 0.85, 1, easeOut)),
        display: 'flex', alignItems: 'center',
      }}>
        <EndUrl />
      </div>
      <div style={{
        position: 'absolute', top: 1720, font: `500 26px/1.4 ${SANS}`, color: C.inkFaint, textAlign: 'center',
        opacity: ramp(f, E + 60, E + 72, 0, 1),
      }}>
        Unofficial fan project. Not affiliated with Prasarana or Rapid KL.
      </div>
    </AbsoluteFill>
  );
};

const EndUrl: React.FC = () => {
  const f = useCurrentFrame();
  const { done } = typedAt(TYPE.url, f);
  const blink = Math.floor(f / 15) % 2 === 0;
  return (
    <div style={{ font: `800 50px/1 ${MONO}`, color: C.paper, whiteSpace: 'pre', display: 'flex', alignItems: 'center' }}>
      <span>{TYPE.url.text.slice(0, done)}</span>
      <span style={{ color: 'rgba(11,15,23,0.25)' }}>{TYPE.url.text.slice(done)}</span>
      <span style={{ width: 6, height: 54, marginLeft: 4, background: done < TYPE.url.text.length || blink ? LINES.KJ.colour : 'transparent' }} />
    </div>
  );
};
