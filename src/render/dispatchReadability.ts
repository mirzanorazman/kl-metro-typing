import type { Point } from '../data/types';
import { shiftPhase, startCareer, type CareerState } from '../engine/dispatch';
import { TICK_MS } from '../engine/dispatchBalance';
import { servedStations, type Served } from '../engine/dispatchNetwork';
import { clearSignal, startShiftSim } from '../engine/dispatchSim';
import { advanceFix, fixItems, stepWorld } from '../engine/dispatchIncidents';
import { visibleTargets } from '../engine/dispatchTargets';
import { linesOf, type NetworkIndex } from '../engine/network';
import { fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import {
  chipBox, circleBox, DISPATCH_FIT_PADDING, DISPATCH_LANE_PX, DISPATCH_MIN_MARK_PX, dispatchLabelled, hits,
  incidentBadge, overlayFrame, overlayLayout, overlayObstacles, type ScreenRect,
} from './dispatchLayout';
import {
  labelBox, labelTiers, mapLabels, markScaleFor, pxPerUnit, sharedSegments, STATION_R, trackLines,
} from './mapMarks';

export { sharedSegments };
import { liveMarks } from './useSignalMarks';

/**
 * How readable the Dispatcher's map is at a given screen size, measured on the
 * same pure layout the map and its overlay render with.
 */
export interface ReadabilityReport {
  /**
   * Chips overlapping another chip, an Incident badge or a Station name, or
   * hidden: under a panel or off the screen.
   */
  chipOverlaps: number;
  /** The smallest Station mark, in screen pixels across. */
  minMarkPx: number;
  /** Consecutive Station pairs where two Lines' tracks are drawn on top of each other. */
  stackedSharedSegments: number;
}

/** Rail stroke width in screen pixels (non-scaling), as MapCanvas draws it. */
export const TRACK_PX = 6;

/** Every Line served end to end. */
export function fullNetwork(net: NetworkIndex): Served {
  return [...net.lines.values()].map((line) => ({ line: line.code, from: 0, to: line.stations.length - 1 }))
    .sort((a, b) => a.line.localeCompare(b.line));
}

/**
 * A busy peak on the full network. Every Line is served and the sim runs at
 * full fleet (`trainFactor` 1). For `flowMs` every Signal is Cleared and every
 * Incident fixed the moment it appears, so the fleet spreads over the whole
 * network; then for `holdMs` nothing is, so every Train piles up at a Signal,
 * the centre included, and fresh Incidents wait. (Holding from the start
 * leaves only the opening Trains waiting, all at the outer ends.) The Career
 * is left `ready`, so the board holds still until the first key.
 */
export function fullNetworkPeak(net: NetworkIndex, seed = 7, flowMs = 60_000, holdMs = 20_000): CareerState {
  const base = startCareer(net, seed);
  const served = fullNetwork(net);
  const sim = startShiftSim(net, served, base.sim.rng);
  for (let t = 0; t < flowMs + holdMs; t += TICK_MS) {
    const phase = shiftPhase(t);
    stepWorld(net, sim, { multiplier: phase.multiplier, flow: phase.flow, trainFactor: 1, escalation: 1 });
    if (t >= flowMs) continue;
    for (const train of sim.trains) if (train.stage === 'signal') clearSignal(net, sim, train.id);
    for (const inc of [...sim.incidents]) while (advanceFix(net, sim, inc.id));
  }
  return { ...base, served, sim };
}

/**
 * The Dispatcher's panels over a map of `viewport` size, in screen pixels, as
 * its stylesheet lays them out: the top bar, the Incidents panel (as tall as
 * its cards, up to its cap) and the typing panel. The live screen measures
 * the real ones; this stands in for them where nothing is laid out.
 */
export function dispatchPanels(net: NetworkIndex, career: CareerState, viewport: { w: number; h: number }): ScreenRect[] {
  const { sim } = career;
  const wide = Math.min(896, viewport.w - 40);
  const bar = { x: (viewport.w - wide) / 2, y: 16, w: wide, h: 33 };
  // A card: its head and padding, then rows of about 36 characters for the
  // fix items, and a row for a Crowd surge's count; 8 px between cards.
  // (Measured: 91 px for a Signal fault with two rows of fix items, and for a
  // Crowd surge with one.)
  const cards = sim.incidents.filter((inc) => !sim.outOfService[inc.place]).map((inc) => {
    const chars = fixItems(net, inc, sim).reduce((n, text) => n + text.length + 1, 4);
    return 37 + 27 * (Math.ceil(chars / 36) + (inc.kind === 'crowd-surge' ? 1 : 0));
  });
  const listed = cards.length === 0 ? 42 : cards.reduce((a, b) => a + b, 0) + 8 * (cards.length - 1);
  const sideW = Math.min(272, viewport.w * 0.3);
  const side = { x: viewport.w - 16 - sideW, y: 64, w: sideW, h: Math.min(listed, viewport.h - 256) };
  // The typing panel (measured): 162 px with the idle line, 184 with a name to type.
  const typingH = career.status === 'ready' ? 162 : 184;
  const typing = { x: (viewport.w - wide) / 2, y: viewport.h - 24 - typingH, w: wide, h: typingH };
  return [bar, side, typing];
}

/** The report, with the chip overlaps broken down by what each chip hits. */
export interface ReadabilityDetail extends ReadabilityReport {
  chipOnChip: number;
  chipOnIncident: number;
  chipOnName: number;
  /** Chips under a panel or past the edge of the screen. */
  chipHidden: number;
  chips: number;
  names: number;
  pxPerUnit: number;
  markScale: number;
}

export function measureReadability(
  net: NetworkIndex,
  career: CareerState,
  viewport: { w: number; h: number },
): ReadabilityReport {
  const { chipOverlaps, minMarkPx, stackedSharedSegments } = readabilityDetail(net, career, viewport);
  return { chipOverlaps, minMarkPx, stackedSharedSegments };
}

export function readabilityDetail(
  net: NetworkIndex,
  career: CareerState,
  viewport: { w: number; h: number },
): ReadabilityDetail {
  const { geo: layout } = networkLayout();
  const served = new Set(servedStations(net, career.served));
  const points = [...served].map((id) => layout.get(id)).filter((p): p is Point => p !== undefined);
  const view = fitViewBox(points, DISPATCH_FIT_PADDING);
  const px = pxPerUnit(view, viewport);
  const m = markScaleFor(view, { screen: viewport, minPx: DISPATCH_MIN_MARK_PX });

  // Station marks: every Station is drawn, served or dimmed.
  let minMark = Infinity;
  for (const station of net.stations.values()) {
    if (!layout.has(station.id)) continue;
    const r = linesOf(station).length > 1 ? STATION_R.interchange : STATION_R.stop;
    minMark = Math.min(minMark, 2 * r * m * px);
  }

  const targets = visibleTargets(net, career.sim);
  const marks = liveMarks(net, career, targets);
  const panels = dispatchPanels(net, career, viewport);
  const frame = overlayFrame(view, viewport, panels);
  const { chips } = overlayLayout(net, layout, career, targets, marks, m, frame);
  const names = mapLabels({
    net, layout, view, markScale: m, activeStation: null,
    labelled: dispatchLabelled(net, career, served, targets), tiers: labelTiers(net),
    boxes: overlayObstacles(net, layout, career, targets, marks, m, frame),
  });
  // What hides a chip, without the frame's clearance: the panels as drawn,
  // and everything past the screen's edge.
  const { view: screenBox, panels: panelBoxes } = overlayFrame(view, viewport, panels, 0)!;
  const labelBoxes = names.labels.map((label) => labelBox(label, names.text.get(label.id) ?? '', names.opts));
  const badges = career.sim.incidents
    .filter((inc) => !career.sim.outOfService[inc.place])
    .flatMap((inc) => {
      const p = layout.get(inc.place);
      return p ? [circleBox(incidentBadge(p, m))] : [];
    });

  let chipOnChip = 0;
  let chipOnIncident = 0;
  let chipOnName = 0;
  let chipHidden = 0;
  const boxes = chips.map(chipBox);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    const offScreen = b.x0 < screenBox.x0 || b.y0 < screenBox.y0 || b.x1 > screenBox.x1 || b.y1 > screenBox.y1;
    if (offScreen || panelBoxes.some((panel) => hits(b, panel))) chipHidden++;
    for (let j = i + 1; j < boxes.length; j++) if (hits(boxes[i]!, boxes[j]!)) chipOnChip++;
    for (const badge of badges) if (hits(boxes[i]!, badge)) chipOnIncident++;
    for (const label of labelBoxes) if (hits(boxes[i]!, label)) chipOnName++;
  }

  // Shared track: two Lines' drawn strokes closer than a stroke width overlap.
  const tracks = trackLines(net, layout, DISPATCH_LANE_PX / px);
  let stackedSharedSegments = 0;
  for (const [key, lines] of sharedSegments(net)) {
    const [a, b] = key.split('|') as [string, string];
    const mids = lines.map((code) => {
      const line = net.lines.get(code)!;
      const pts = tracks.get(code)!;
      const i = line.stations.indexOf(a);
      const j = line.stations.indexOf(b);
      return { x: (pts[i]!.x + pts[j]!.x) / 2, y: (pts[i]!.y + pts[j]!.y) / 2 };
    });
    let stacked = false;
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) {
        if (Math.hypot(mids[i]!.x - mids[j]!.x, mids[i]!.y - mids[j]!.y) * px < TRACK_PX - 0.01) stacked = true;
      }
    }
    if (stacked) stackedSharedSegments++;
  }

  return {
    chipOverlaps: chipOnChip + chipOnIncident + chipOnName + chipHidden, minMarkPx: minMark, stackedSharedSegments,
    chipOnChip, chipOnIncident, chipOnName, chipHidden, chips: chips.length, names: names.labels.length, pxPerUnit: px, markScale: m,
  };
}
