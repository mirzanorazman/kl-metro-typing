import type { CSSProperties } from 'react';
import type { LineCode, Point } from '../data/types';
import type { Layout } from '../geo/layout';
import type { NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { bunchedTrains, heldTrains } from '../engine/dispatchSim';
import { sameRef, type Target, type TargetRef } from '../engine/dispatchTargets';
import {
  chipBox, incidentBadge, layoutPops, overlayLayout, POP_LINE_EM, RING_COUNT_FONT, RING_R, RING_STROKE, ringCountAnchor, SIGNAL_HALF_W, SIGNAL_LEN, SIGNAL_POST,
  type Box, type OverlayFrame,
} from './dispatchLayout';
import { contrastText } from './contrast';
import type { CrowdingHintView } from './crowdingHint';
import { INCIDENT_GLYPH } from './incidentGlyphs';
import { NO_MOMENTS, type DispersalPop, type ExchangePop, type PassengerMoments } from './usePassengerMoments';
import { prefersReducedMotion } from './useLayoutMode';
import { useSignalMarks } from './useSignalMarks';
import { linePoints } from './trackRanges';

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
  /** The visible map and the panels over it: chips and pops stay on the one, out from under the others. */
  frame?: OverlayFrame | null;
  /** Each Line's track as the map draws it, side by side on shared track; null when it runs through its Stations. */
  tracks?: ReadonlyMap<LineCode, readonly Point[]> | null;
  /** Stations whose closure is still fresh: their X stamps in, with a ring when motion is allowed. */
  stamping?: ReadonlySet<string>;
  /** Trains a tip is about: each pulses a ring, a steady one under reduced motion. */
  spotlight?: ReadonlySet<number>;
  /** The crowding hint: Trains whose Signal chips turn amber, and a countdown ring on each crowded Station. */
  hint?: CrowdingHintView;
}

const NO_STAMPING: ReadonlySet<string> = new Set();
const NO_SPOTLIGHT: ReadonlySet<number> = new Set();

const CROSS_ICON = 'M-0.55,-0.55 L0.55,0.55 M0.55,-0.55 L-0.55,0.55';

/** Lamp centres in the head: green farther out, red nearer the track, as on a two-aspect signal. */
const LAMP_Y = { green: -19.5, red: -12.5 } as const;

/** A person, about 12 nominal units tall, standing on the origin: a head, arms and legs. */
export const PERSON = 'M0,-6.5 V-1 M-2.8,-4.5 H2.8 M0,-1 L-2.2,4 M0,-1 L2.2,4';

/** How many people stream away from a dispersal: enough to read as a crowd, never a swarm. */
const peopleFor = (count: number) => Math.max(6, Math.min(12, Math.round(count / 4)));

/** The lines of a pop: who boarded and, when anyone did, who got off. */
const popText = (pop: ExchangePop) =>
  pop.alighted > 0 ? [`+${pop.boarded} boarded`, `−${pop.alighted} off`] : [`+${pop.boarded} boarded`];

/**
 * The pops beside Stations where a Train the player cleared just called: who
 * boarded and, when anyone did, who got off. Pops at one Station stack
 * upward, and every pop keeps clear of the chips, which are drawn over them.
 */
function ExchangePops({ pops, layout, m, chips, frame }: {
  pops: readonly ExchangePop[]; layout: Layout; m: number; chips: readonly Box[]; frame: OverlayFrame | null;
}) {
  const shown = pops.filter((pop) => layout.has(pop.station));
  const places = layoutPops(
    shown.map((pop) => ({ key: pop.key, at: layout.get(pop.station)!, text: popText(pop), own: pop.own })),
    m, chips, frame,
  );
  return <>{shown.map((pop, i) => {
    const place = places[i]!;
    return (
      // Keyed on the call, so a Train's next call restarts its pop.
      <g key={`pop-${pop.key}`} data-testid="exchange-pop" data-train={pop.train} data-station={pop.station}
        data-own={pop.own ? 'true' : undefined} className="exchange-pop" transform={`translate(${place.x} ${place.y})`}>
        <text className="exchange-pop-text" fontSize={place.fontSize} textAnchor="middle">
          <tspan className="exchange-pop-boarded">+{pop.boarded} boarded</tspan>
          {pop.alighted > 0 && (
            <tspan className="exchange-pop-off" x={0} dy={place.fontSize * POP_LINE_EM}>−{pop.alighted} off</tspan>
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
        const reach = (44 + (i % 3) * 12) * m;
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

/**
 * The live Shift on the map: Trains with their Line code, each waiting Train's
 * Station name beside it, Incidents as a pulsing badge with a glyph for their
 * kind (signal head, Train front, crowd) and their current fix, and Out of service Stations crossed out. Every state has a
 * shape or text as well as a colour. Each waiting train has a Signal mark, a
 * post whose lamp turns from red to green when it is Cleared, and a Green wave
 * sends a pulse along its Line. Passenger moments pop up beside their
 * Stations: who moved at a call the player cleared, and a fixed Crowd surge's
 * crowd draining away. The trains a tip is about pulse while it shows.
 */
export function DispatchOverlay({
  net, layout, markScale: m, career, targets, aimed, moments = NO_MOMENTS, frame = null, tracks = null,
  stamping = NO_STAMPING, spotlight = NO_SPOTLIGHT, hint,
}: DispatchOverlayProps) {
  const { sim, aim } = career;
  const { marks, pulse } = useSignalMarks(net, career, targets);
  const held = heldTrains(net, sim);
  const bunched = bunchedTrains(net, sim);
  const typed = aim.typed.length;
  const isAimed = (ref: TargetRef) => aimed.some((t) => sameRef(t.ref, ref));
  const isLocked = (ref: TargetRef) => aim.lock !== null && sameRef(aim.lock, ref);
  const { trains, marks: placed, chips, fontSize } = overlayLayout(net, layout, career, targets, marks, m, frame);

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
              const points = linePoints(net, layout, tracks, offer.line, ids);
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
          points={linePoints(net, layout, tracks, inc.line, inc.stations)}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {pulse && (
        // Keyed on the wave, so each new one replays from its origin.
        <g key={`wave-${pulse.wave}`} data-testid="wave-pulse" data-line={pulse.line} className="wave-pulse">
          {pulse.runs.map((run) => {
            const points = linePoints(net, layout, tracks, pulse.line, run.stations);
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
        const stamp = stamping.has(id);
        return (
          <g key={`oos-${id}`} data-testid="dispatch-oos" data-station={id} className="dispatch-oos"
            data-stamp={stamp ? 'true' : undefined}>
            {stamp && !prefersReducedMotion() && (
              <circle data-testid="oos-ring" className="dispatch-oos-ring" cx={p.x} cy={p.y} r={r} />
            )}
            <circle cx={p.x} cy={p.y} r={r} />
            <g className="dispatch-oos-x">
              <path
                data-icon="out-of-service"
                d={CROSS_ICON}
                transform={`translate(${p.x} ${p.y}) scale(${r})`}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </g>
        );
      })}

      {hint?.rings.map(({ id, share, waiting }) => {
        const p = layout.get(id);
        if (!p) return null;
        const r = RING_R * m;
        const count = ringCountAnchor(p, m);
        return (
          <g key={`ring-${id}`} data-testid="crowding-ring" data-station={id} className="crowding-ring">
            {/* No non-scaling-stroke: Chrome then ignores pathLength on the arc, so widths scale by hand. */}
            <circle className="crowding-ring-track" cx={p.x} cy={p.y} r={r} strokeWidth={RING_STROKE * m} />
            <circle className="crowding-ring-arc" cx={p.x} cy={p.y} r={r} pathLength={1} strokeDasharray={`${share} 1`}
              strokeWidth={RING_STROKE * m} transform={`rotate(-90 ${p.x} ${p.y})`} />
            <text className="crowding-count" x={count.x} y={count.y} fontSize={RING_COUNT_FONT * m}>{waiting}</text>
          </g>
        );
      })}

      {sim.incidents.map((inc) => {
        const p = layout.get(inc.place);
        if (!p || sim.outOfService[inc.place]) return null;
        // The place glows while its fix is being typed.
        const fixing = isLocked({ kind: 'fix', incident: inc.id })
          && targets.some((t) => t.ref.kind === 'fix' && t.ref.incident === inc.id);
        const badge = incidentBadge(p, m);
        return (
          <g key={`inc-${inc.id}`} data-testid="dispatch-incident" data-kind={inc.kind} className="dispatch-incident">
            {fixing && (
              <circle data-testid="incident-glow" className="incident-glow" cx={p.x} cy={p.y} r={26 * m} />
            )}
            <circle className="dispatch-pulse" cx={p.x} cy={p.y} r={14 * m} />
            <circle className="dispatch-incident-badge" cx={badge.x} cy={badge.y} r={badge.r}
              vectorEffect="non-scaling-stroke" />
            <path
              data-icon={`incident-${inc.kind}`}
              d={INCIDENT_GLYPH[inc.kind]}
              fillRule="evenodd"
              transform={`translate(${badge.x} ${badge.y}) scale(${6 * m})`}
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
            data-spotlight={spotlight.has(t.id) ? 'true' : undefined}
            className="dispatch-train"
            transform={`translate(${at.x} ${at.y}) rotate(${upright})`}
          >
            {spotlight.has(t.id) && (
              <circle className="dispatch-spotlight-ring" r={w * 0.8} vectorEffect="non-scaling-stroke" />
            )}
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
      {/* After the chips are laid out and before they are drawn: pops yield to chips, and chips stay on top. */}
      <ExchangePops pops={moments.pops} layout={layout} m={m} chips={chips.map(chipBox)} frame={frame} />

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
            data-relieve={chip.kind === 'signal' && chip.ref.kind === 'signal' && hint?.relieving.has(chip.ref.train)
              ? 'true' : undefined}
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
