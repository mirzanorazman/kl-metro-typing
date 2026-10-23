import type { Point } from '../data/types';
import type { Layout } from '../geo/layout';
import type { NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { bunchedTrains, heldTrains, trainPosition, type Train } from '../engine/dispatchSim';
import { sameRef, type Target, type TargetRef } from '../engine/dispatchTargets';
import { contrastText } from './contrast';

export interface DispatchOverlayProps {
  net: NetworkIndex;
  layout: Layout;
  markScale: number;
  career: CareerState;
  targets: readonly Target[];
  /** Targets still matching what has been typed; empty when nothing is. */
  aimed: readonly Target[];
}

/** Monospace advance plus the label letter-spacing, as a fraction of the font size. */
const CHAR_EM = 0.68;

interface Box { x0: number; y0: number; x1: number; y1: number }

const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

interface Placed { train: Train; at: Point; heading: Point; side: Point }

/**
 * Where a Train is drawn. A Train at its Signal waits short of the Station,
 * back along the track it came in on, and every Train keeps to the right-hand
 * side of its direction of travel: the two directions at one Station never
 * share a spot, and neither do their labels.
 */
function placeTrain(net: NetworkIndex, layout: Layout, t: Train, m: number): Placed | null {
  const ids = net.lines.get(t.line)!.stations;
  const pos = trainPosition(net, t);
  const from = layout.get(pos.from);
  const to = layout.get(pos.to);
  if (!from || !to) return null;
  let at = { x: from.x + (to.x - from.x) * pos.t, y: from.y + (to.y - from.y) * pos.t };
  let heading: Point;
  if (pos.from !== pos.to) {
    heading = unit(to.x - from.x, to.y - from.y);
  } else {
    const behind = layout.get(ids[t.at - t.dir] ?? '');
    const ahead = layout.get(ids[t.at + t.dir] ?? '');
    heading = behind ? unit(from.x - behind.x, from.y - behind.y)
      : ahead ? unit(ahead.x - from.x, ahead.y - from.y) : { x: 1, y: 0 };
    if ((t.stage === 'signal' || t.stage === 'cleared') && behind) {
      const back = Math.min(16 * m, 0.4 * Math.hypot(from.x - behind.x, from.y - behind.y));
      at = { x: at.x - heading.x * back, y: at.y - heading.y * back };
    }
  }
  // Screen y points down, so (-y, x) is the right-hand side of travel.
  const side = { x: -heading.y, y: heading.x };
  return { train: t, at: { x: at.x + side.x * 8 * m, y: at.y + side.y * 8 * m }, heading, side };
}

interface Chip {
  key: string;
  ref: TargetRef;
  text: string;
  kind: TargetRef['kind'];
  from: Point;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lays chips out in order, each beside its anchor on the given side and
 * stepped away from any chip already placed. Interchanges stack instead of
 * overprinting.
 */
function layoutChips(
  wanted: readonly { key: string; ref: TargetRef; text: string; kind: TargetRef['kind']; from: Point; side: Point }[],
  m: number,
  fontSize: number,
): Chip[] {
  const h = fontSize * 1.5;
  const pad = fontSize * 0.45;
  const placed: Chip[] = [];
  const boxes: Box[] = [];
  for (const item of wanted) {
    const w = item.text.length * fontSize * CHAR_EM + pad * 2 + (item.kind === 'skip' ? fontSize : 0);
    const gap = 15 * m;
    const right = item.side.x >= 0;
    const x = right ? item.from.x + item.side.x * gap : item.from.x + item.side.x * gap - w;
    let y = item.from.y + item.side.y * gap - h / 2;
    const step = (item.side.y >= 0 ? 1 : -1) * (h + 2 * m);
    for (let tries = 0; tries < 8 && boxes.some((b) => hits(b, { x0: x, y0: y, x1: x + w, y1: y + h })); tries++) {
      y += step;
    }
    const chip = { key: item.key, ref: item.ref, text: item.text, kind: item.kind, from: item.from, x, y, w, h };
    placed.push(chip);
    boxes.push({ x0: x, y0: y, x1: x + w, y1: y + h });
  }
  return placed;
}

const KIND_ICON = 'M0,-1 L0.9,0.7 L-0.9,0.7 Z';
const CROSS_ICON = 'M-0.55,-0.55 L0.55,0.55 M0.55,-0.55 L-0.55,0.55';

/**
 * The live Shift on the map: Trains with their Line code, each waiting Train's
 * Station name beside it, Incidents as a pulsing warning triangle with their
 * current fix, and Out of service Stations crossed out. Every state has a
 * shape or text as well as a colour.
 */
export function DispatchOverlay({ net, layout, markScale: m, career, targets, aimed }: DispatchOverlayProps) {
  const { sim, aim } = career;
  const held = heldTrains(net, sim);
  const bunched = bunchedTrains(net, sim);
  const fontSize = 13 * m;
  const typed = aim.typed.length;
  const isAimed = (ref: TargetRef) => aimed.some((t) => sameRef(t.ref, ref));
  const isLocked = (ref: TargetRef) => aim.lock !== null && sameRef(aim.lock, ref);

  const trains = sim.trains
    .map((t) => placeTrain(net, layout, t, m))
    .filter((p): p is Placed => p !== null);
  const byId = new Map(trains.map((p) => [p.train.id, p]));

  const wanted = [];
  for (const target of targets) {
    if (target.ref.kind === 'fix') {
      const id = target.ref.incident;
      const inc = sim.incidents.find((i) => i.id === id);
      const p = inc && layout.get(inc.place);
      if (!p) continue;
      wanted.push({ key: `fix-${id}`, ref: target.ref, text: target.text, kind: 'fix' as const,
        from: p, side: { x: -0.6, y: -0.8 } });
    } else {
      const placed = byId.get(target.ref.train);
      if (!placed) continue;
      wanted.push({ key: `${target.ref.kind}-${target.ref.train}`, ref: target.ref, text: target.text,
        kind: target.ref.kind, from: placed.at, side: placed.side });
    }
  }
  const chips = layoutChips(wanted, m, fontSize);

  const heldStretches = sim.incidents.filter((inc) => inc.kind === 'signal-fault');

  return (
    <g className="dispatch-overlay" data-testid="dispatch-overlay">
      {heldStretches.map((inc) => (
        <polyline
          key={`held-${inc.id}`}
          className="dispatch-held-stretch"
          points={inc.stations.map((id) => layout.get(id)).filter((p): p is Point => !!p)
            .map((p) => `${p.x},${p.y}`).join(' ')}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {Object.keys(sim.outOfService).map((id) => {
        const p = layout.get(id);
        if (!p) return null;
        const r = 7 * m;
        return (
          <g key={`oos-${id}`} data-testid="dispatch-oos" data-station={id} className="dispatch-oos">
            <circle cx={p.x} cy={p.y} r={r} />
            <path
              data-icon="out-of-service"
              d={CROSS_ICON}
              transform={`translate(${p.x} ${p.y}) scale(${r})`}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}

      {sim.incidents.map((inc) => {
        const p = layout.get(inc.place);
        if (!p || sim.outOfService[inc.place]) return null;
        return (
          <g key={`inc-${inc.id}`} data-testid="dispatch-incident" data-kind={inc.kind} className="dispatch-incident">
            <circle className="dispatch-pulse" cx={p.x} cy={p.y} r={14 * m} />
            <path
              data-icon="incident"
              d={KIND_ICON}
              transform={`translate(${p.x} ${p.y - 12 * m}) scale(${6 * m})`}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}

      {trains.map(({ train: t, at, heading }) => {
        const line = net.lines.get(t.line)!;
        const w = 24 * m;
        const h = 13 * m;
        const angle = (Math.atan2(heading.y, heading.x) * 180) / Math.PI;
        const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
        return (
          <g
            key={`train-${t.id}`}
            data-testid="dispatch-train"
            data-train={t.id}
            data-held={held.has(t.id) ? 'true' : undefined}
            data-bunched={bunched.has(t.id) ? 'true' : undefined}
            className="dispatch-train"
            transform={`translate(${at.x} ${at.y}) rotate(${upright})`}
          >
            {bunched.has(t.id) && (
              <rect className="dispatch-bunch-ring" x={-w / 2 - 3 * m} y={-h / 2 - 3 * m}
                width={w + 6 * m} height={h + 6 * m} rx={4 * m} vectorEffect="non-scaling-stroke" />
            )}
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.5 * m} fill={line.colour}
              vectorEffect="non-scaling-stroke" />
            <text y={h * 0.3} fontSize={8.5 * m} textAnchor="middle" fill={contrastText(line.colour)}>
              {t.line}
            </text>
          </g>
        );
      })}

      {chips.map((chip) => {
        const aimedHere = isAimed(chip.ref);
        const locked = isLocked(chip.ref);
        const done = aimedHere ? Math.min(typed, chip.text.length) : 0;
        const textX = chip.x + fontSize * 0.45 + (chip.kind === 'skip' ? fontSize : 0);
        const baseline = chip.y + chip.h * 0.7;
        return (
          <g
            key={chip.key}
            className="dispatch-chip"
            data-testid={chip.kind === 'fix' ? 'dispatch-fix' : chip.kind === 'skip' ? 'dispatch-skip' : 'dispatch-signal'}
            data-candidate={aimedHere ? 'true' : undefined}
            data-locked={locked ? 'true' : undefined}
            data-kind={chip.kind}
          >
            <line className="dispatch-leader" x1={chip.from.x} y1={chip.from.y}
              x2={chip.x + (chip.x + chip.w / 2 > chip.from.x ? 0 : chip.w)} y2={chip.y + chip.h / 2}
              vectorEffect="non-scaling-stroke" />
            <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx={2 * m}
              vectorEffect="non-scaling-stroke" />
            {chip.kind === 'skip' && (
              <path className="dispatch-skip-icon" aria-hidden="true"
                d={`M${chip.x + fontSize * 0.4},${chip.y + chip.h * 0.3} l${fontSize * 0.35},${chip.h * 0.2} l${-fontSize * 0.35},${chip.h * 0.2} M${chip.x + fontSize * 0.8},${chip.y + chip.h * 0.3} l${fontSize * 0.35},${chip.h * 0.2} l${-fontSize * 0.35},${chip.h * 0.2}`}
                vectorEffect="non-scaling-stroke" />
            )}
            <text x={textX} y={baseline} fontSize={fontSize}>
              {done > 0 && <tspan className="dispatch-typed">{chip.text.slice(0, done)}</tspan>}
              {chip.text.slice(done)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
