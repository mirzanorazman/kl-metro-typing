import type { CSSProperties } from 'react';
import type { Point } from '../data/types';
import type { Layout } from '../geo/layout';
import type { NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { bunchedTrains, heldTrains, trainPosition, type Train } from '../engine/dispatchSim';
import { sameRef, type Target, type TargetRef } from '../engine/dispatchTargets';
import { contrastText } from './contrast';
import { INCIDENT_GLYPH } from './incidentGlyphs';
import { NO_MOMENTS, type DispersalPop, type ExchangePop, type PassengerMoments } from './usePassengerMoments';
import { useSignalMarks, type SignalMark } from './useSignalMarks';

export interface DispatchOverlayProps {
  net: NetworkIndex;
  layout: Layout;
  markScale: number;
  career: CareerState;
  targets: readonly Target[];
  /** Targets still matching what has been typed; empty when nothing is. */
  aimed: readonly Target[];
  /** Calls and dispersals to pop up beside their Stations. */
  moments?: PassengerMoments;
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
 * stepped away from any chip already placed or box to `avoid`. Interchanges
 * stack instead of overprinting.
 */
function layoutChips(
  wanted: readonly { key: string; ref: TargetRef; text: string; kind: TargetRef['kind']; from: Point; side: Point }[],
  m: number,
  fontSize: number,
  avoid: readonly Box[] = [],
): Chip[] {
  const h = fontSize * 1.5;
  const pad = fontSize * 0.45;
  const placed: Chip[] = [];
  const boxes: Box[] = [...avoid];
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

const CROSS_ICON = 'M-0.55,-0.55 L0.55,0.55 M0.55,-0.55 L-0.55,0.55';

/** A signal post in nominal units, its foot at the origin and its head up -y: a pole and a footing. */
const SIGNAL_POST = 'M0,0 V-8 M-2.5,0 H2.5';
const SIGNAL_HALF_W = 5;
const SIGNAL_LEN = 24;
/** Lamp centres in the head: green farther out, red nearer the track, as on a two-aspect signal. */
const LAMP_Y = { green: -19.5, red: -12.5 } as const;

interface MarkPlace { at: Point; angle: number; box: Box }

/**
 * Where a Signal mark stands: at its faced Station, on the side of the track
 * the train approaches on, just clear of the waiting train's nose. The post
 * points away from the track, so it never lies over the train or the rail.
 */
function placeMark(net: NetworkIndex, layout: Layout, mark: SignalMark, m: number): MarkPlace | null {
  const ids = net.lines.get(mark.line)!.stations;
  const station = layout.get(mark.station);
  if (!station) return null;
  const behind = layout.get(ids[mark.at - mark.dir] ?? '');
  const ahead = layout.get(ids[mark.at + mark.dir] ?? '');
  const heading = behind ? unit(station.x - behind.x, station.y - behind.y)
    : ahead ? unit(ahead.x - station.x, ahead.y - station.y) : { x: 1, y: 0 };
  // Screen y points down, so (-y, x) is the right-hand side of travel.
  const side = { x: -heading.y, y: heading.x };
  const at = { x: station.x + heading.x * m + side.x * 4 * m, y: station.y + heading.y * m + side.y * 4 * m };
  // Rotates the drawing's "up" (0, -1) onto `side`.
  const angle = (Math.atan2(side.x, -side.y) * 180) / Math.PI;
  const corners = [-SIGNAL_HALF_W, SIGNAL_HALF_W].flatMap((across) => [0, SIGNAL_LEN].map((out) => ({
    x: at.x + (heading.x * across + side.x * out) * m,
    y: at.y + (heading.y * across + side.y * out) * m,
  })));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { at, angle, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

/** A person, about 12 nominal units tall, standing on the origin: a head, arms and legs. */
const PERSON = 'M0,-6.5 V-1 M-2.8,-4.5 H2.8 M0,-1 L-2.2,4 M0,-1 L2.2,4';

/** How many people stream away from a dispersal: enough to read as a crowd, never a swarm. */
const peopleFor = (count: number) => Math.max(4, Math.min(10, Math.round(count / 4)));

/**
 * The pops beside Stations where a Train the player cleared just called: who
 * boarded and, when anyone did, who got off. Pops at one Station stack upward.
 */
function ExchangePops({ pops, layout, m }: { pops: readonly ExchangePop[]; layout: Layout; m: number }) {
  const fontSize = 12 * m;
  return <>{pops.map((pop, i) => {
    const p = layout.get(pop.station);
    if (!p) return null;
    const stacked = pops.slice(0, i).filter((other) => other.station === pop.station).length;
    const lines = pop.alighted > 0 ? 2 : 1;
    const y = p.y - 16 * m - stacked * 2.4 * fontSize - (lines - 1) * fontSize * 1.1;
    return (
      // Keyed on the call, so a Train's next call restarts its pop.
      <g key={`pop-${pop.key}`} data-testid="exchange-pop" data-train={pop.train} data-station={pop.station}
        data-own={pop.own ? 'true' : undefined} className="exchange-pop" transform={`translate(${p.x} ${y})`}>
        <text className="exchange-pop-text" fontSize={fontSize} textAnchor="middle">
          <tspan className="exchange-pop-boarded">+{pop.boarded} boarded</tspan>
          {pop.alighted > 0 && (
            <tspan className="exchange-pop-off" x={0} dy={fontSize * 1.1}>−{pop.alighted} off</tspan>
          )}
        </text>
      </g>
    );
  })}</>;
}

/**
 * A fixed Crowd surge's crowd draining at its Station: the waiting count drops
 * to its new value while small people stream away. Under reduced motion the
 * new count stands still and nobody moves.
 */
function Dispersal({ pop, layout, m }: { pop: DispersalPop; layout: Layout; m: number }) {
  const p = layout.get(pop.station);
  if (!p) return null;
  const fontSize = 12 * m;
  const people = pop.still ? 0 : peopleFor(pop.count);
  const countY = p.y - 22 * m;
  return (
    <g data-testid="dispersal" data-station={pop.station}
      data-still={pop.still ? 'true' : undefined} className="dispersal">
      {Array.from({ length: people }, (_, i) => {
        // Spread round the Station, a little uneven so they read as people, not a dial.
        const angle = (i / people) * Math.PI * 2 + (i % 2 ? 0.25 : -0.1);
        const reach = (30 + (i % 3) * 7) * m;
        const style = {
          '--dx': `${Math.cos(angle) * reach}px`, '--dy': `${Math.sin(angle) * reach}px`, '--delay': `${(i % 4) * 60}ms`,
        } as CSSProperties;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <g data-testid="person" className="dispersal-person" style={style}>
              <g transform={`scale(${m})`}>
                <circle cy={-8.5} r={2} />
                <path d={PERSON} vectorEffect="non-scaling-stroke" />
              </g>
            </g>
          </g>
        );
      })}
      {!pop.still && (
        <text className="dispersal-count dispersal-from" x={p.x} y={countY} fontSize={fontSize} textAnchor="middle">
          <tspan data-count="from">{pop.from}</tspan> waiting
        </text>
      )}
      <text className="dispersal-count dispersal-to" x={p.x} y={countY} fontSize={fontSize} textAnchor="middle">
        <tspan data-count="to">{pop.to}</tspan> waiting
      </text>
      <text className="dispersal-gone" x={p.x} y={countY - fontSize * 1.15} fontSize={fontSize} textAnchor="middle">
        −{pop.count} dispersed
      </text>
    </g>
  );
}

const pointsOf = (layout: Layout, ids: readonly string[]) => ids.map((id) => layout.get(id))
  .filter((p): p is Point => !!p).map((p) => `${p.x},${p.y}`).join(' ');

/**
 * The live Shift on the map: Trains with their Line code, each waiting Train's
 * Station name beside it, Incidents as a pulsing badge with a glyph for their
 * kind (signal head, Train front, crowd) and their current fix, and Out of service Stations crossed out. Every state has a
 * shape or text as well as a colour. Each waiting train has a Signal mark, a
 * post whose lamp turns from red to green when it is Cleared, and a Green wave
 * sends a pulse along its Line. Passenger moments pop up beside their
 * Stations: who moved at a call the player cleared, and a fixed Crowd surge's
 * crowd draining away.
 */
export function DispatchOverlay({
  net, layout, markScale: m, career, targets, aimed, moments = NO_MOMENTS,
}: DispatchOverlayProps) {
  const { sim, aim } = career;
  const { marks, pulse } = useSignalMarks(net, career, targets);
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
  const placed = new Map(marks.map((mark) => [mark.key, placeMark(net, layout, mark, m)] as const)
    .filter((entry): entry is [string, MarkPlace] => entry[1] !== null));
  // Chips step clear of the waiting trains' marks; a fading mark may pass under one.
  const chips = layoutChips(wanted, m, fontSize,
    marks.filter((mark) => !mark.cleared).flatMap((mark) => placed.get(mark.key)?.box ?? []));

  const heldStretches = sim.incidents.filter((inc) => inc.kind === 'signal-fault');

  // Between Shifts each offered Expansion's new track is drawn dashed in its
  // Line's colour, from the Station it attaches at.
  const offers = (career.status === 'between' ? career.offers : []).map((offer) => {
    const ids = net.lines.get(offer.line)!.stations;
    const current = career.served.find((r) => r.line === offer.line);
    const spans = !current ? [[offer.from, offer.to]]
      : [offer.from < current.from && [offer.from, current.from], offer.to > current.to && [current.to, offer.to]]
        .filter((span): span is number[] => !!span);
    return { offer, paths: spans.map(([from, to]) => ids.slice(from, to! + 1)) };
  });

  return (
    <g className="dispatch-overlay" data-testid="dispatch-overlay">
      {offers.map(({ offer, paths }) => {
        const line = net.lines.get(offer.line)!;
        const end = layout.get(offer.farEnd);
        return (
          <g key={`offer-${offer.line}-${offer.from}-${offer.to}`} data-testid="dispatch-offer" className="dispatch-offer-path">
            {paths.map((ids) => {
              const points = ids.map((id) => layout.get(id)).filter((p): p is Point => !!p)
                .map((p) => `${p.x},${p.y}`).join(' ');
              // A paper-coloured bed under the dashes keeps them readable over
              // the Line's own track.
              return (
                <g key={ids[0]}>
                  <polyline className="dispatch-offer-bed" points={points} vectorEffect="non-scaling-stroke" />
                  <polyline points={points} stroke={line.colour} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
            {end && <circle cx={end.x} cy={end.y} r={6 * m} stroke={line.colour} vectorEffect="non-scaling-stroke" />}
          </g>
        );
      })}

      {heldStretches.map((inc) => (
        <polyline
          key={`held-${inc.id}`}
          className="dispatch-held-stretch"
          points={inc.stations.map((id) => layout.get(id)).filter((p): p is Point => !!p)
            .map((p) => `${p.x},${p.y}`).join(' ')}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {pulse && (
        // Keyed on the wave, so each new one replays from its origin.
        <g key={`wave-${pulse.wave}`} data-testid="wave-pulse" data-line={pulse.line} className="wave-pulse">
          {pulse.runs.map((run) => {
            const points = pointsOf(layout, run.stations);
            return (
              // No non-scaling-stroke here: Chrome then measures dashes in
              // screen pixels and ignores pathLength, so widths scale by hand.
              <g key={run.stations[run.stations.length - 1]} style={{ '--pulse-ms': `${run.ms}ms` } as CSSProperties}>
                <polyline className="wave-pulse-trail" points={points} pathLength={1} strokeWidth={7 * m} />
                <polyline className="wave-pulse-bed" points={points} pathLength={1} strokeWidth={14 * m} />
                <polyline className="wave-pulse-head" points={points} pathLength={1} strokeWidth={10 * m} />
              </g>
            );
          })}
        </g>
      )}

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
        // The place glows while its fix is being typed.
        const fixing = isLocked({ kind: 'fix', incident: inc.id })
          && targets.some((t) => t.ref.kind === 'fix' && t.ref.incident === inc.id);
        return (
          <g key={`inc-${inc.id}`} data-testid="dispatch-incident" data-kind={inc.kind} className="dispatch-incident">
            {fixing && (
              <circle data-testid="incident-glow" className="incident-glow" cx={p.x} cy={p.y} r={26 * m} />
            )}
            <circle className="dispatch-pulse" cx={p.x} cy={p.y} r={14 * m} />
            <circle className="dispatch-incident-badge" cx={p.x} cy={p.y - 12 * m} r={9 * m}
              vectorEffect="non-scaling-stroke" />
            <path
              data-icon={`incident-${inc.kind}`}
              d={INCIDENT_GLYPH[inc.kind]}
              fillRule="evenodd"
              transform={`translate(${p.x} ${p.y - 12 * m}) scale(${6 * m})`}
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

      {marks.map((mark) => {
        const place = placed.get(mark.key);
        if (!place) return null;
        return (
          <g
            key={`mark-${mark.key}`}
            data-testid="signal-mark"
            data-train={mark.train}
            data-station={mark.station}
            data-aspect={mark.lamp}
            data-order={mark.order ?? undefined}
            className="signal-mark"
            transform={`translate(${place.at.x} ${place.at.y}) rotate(${place.angle}) scale(${m})`}
          >
            <path className="signal-post" d={SIGNAL_POST} vectorEffect="non-scaling-stroke" />
            <rect className="signal-head" x={-SIGNAL_HALF_W} y={-SIGNAL_LEN} width={SIGNAL_HALF_W * 2} height={16}
              rx={SIGNAL_HALF_W} />
            <circle className="signal-socket" cx={0} cy={LAMP_Y.green} r={2.8} />
            <circle className="signal-socket" cx={0} cy={LAMP_Y.red} r={2.8} />
            <circle className="signal-lamp" data-lamp={mark.lamp} cx={0} cy={LAMP_Y[mark.lamp]} r={3.1} />
          </g>
        );
      })}

      {/* Keyed on the event, so a new dispersal replays from the start. */}
      {moments.dispersal && <Dispersal key={moments.dispersal.key} pop={moments.dispersal} layout={layout} m={m} />}
      <ExchangePops pops={moments.pops} layout={layout} m={m} />

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
