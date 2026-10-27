import type { LineCode, Point, ViewBox } from '../data/types';
import type { CareerState } from '../engine/dispatch';
import { careerScore, careerTotals } from '../engine/dispatch';
import { servedLines, servedStations } from '../engine/dispatchNetwork';
import type { Metrics } from '../engine/metrics';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { QUICK_RUN_MS, type QuickRunState } from '../engine/quickRun';
import type { RunState } from '../engine/run';
import { coverAspect, fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';

/** The card is square, in pixels. */
export const CARD_SIZE = 1080;

/** Where the map sits on the card, in card pixels. */
export const CARD_MAP = { x: 48, y: 316, w: 984, h: 512 };

/** The address every card carries. The canonical URL from index.html. */
export const SHARE_URL = 'https://kl-metro-typing.vercel.app/';

export interface CardStat {
  label: string;
  value: string;
}

export interface CardLine {
  code: LineCode;
  colour: string;
}

/** One unbroken stroke of the route, on one Line. */
export interface CardPath {
  /** Null for a Walk link, drawn neutral and dashed. */
  line: LineCode | null;
  colour: string;
  points: Point[];
}

export interface CardMap {
  /** Layout units shown, already shaped to `CARD_MAP`'s aspect. */
  view: ViewBox;
  /** Every Line, drawn faint underneath. */
  network: CardPath[];
  /** What this Run travelled or served, drawn bright. */
  route: CardPath[];
  /** Each Station reached, a small dot. */
  stops: Point[];
  start: Point | null;
  end: Point | null;
  /** Out of service Stations, drawn as crosses. */
  closed: Point[];
}

export interface ShareCard {
  /** Upper-case Mode label for the header, e.g. `QUICK RUN`. */
  mode: string;
  title: string;
  subtitle: string;
  lines: CardLine[];
  stats: CardStat[];
  /** Short stamps: `Verified`, `New personal best`, `#3 overall`. */
  badges: string[];
  map: CardMap;
  /** The line of text sent alongside the image. */
  text: string;
  /** File name for the PNG. */
  fileName: string;
}

const wpmText = (m: Metrics) => String(Math.round(m.wpm));
const accuracyText = (m: Metrics) => `${Math.round(m.accuracy * 100)}%`;
const scoreText = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function cardLine(net: NetworkIndex, code: LineCode): CardLine | null {
  const line = lineAt(net, code);
  return line ? { code, colour: line.colour } : null;
}

function cardLines(net: NetworkIndex, codes: Iterable<LineCode>): CardLine[] {
  return [...new Set(codes)].map((code) => cardLine(net, code)).filter((l): l is CardLine => l !== null);
}

/** The Lines on which `a` and `b` are next to each other. */
function sharedHops(net: NetworkIndex, a: string, b: string): LineCode[] {
  const out: LineCode[] = [];
  for (const [code, order] of net.order) {
    const i = order.get(a);
    const j = order.get(b);
    if (i !== undefined && j !== undefined && Math.abs(i - j) === 1) out.push(code);
  }
  return out;
}

function isWalk(net: NetworkIndex, a: string, b: string): boolean {
  return net.walk.get(a)?.includes(b) ?? false;
}

/** One Station of a route, and the Line it was reached on when the Run knows it. */
export interface RouteStep {
  id: string;
  line?: LineCode | null;
}

/**
 * Splits an ordered walk through Stations into strokes, one per Line.
 *
 * Two Lines can share a stretch (AG and SP do from Chan Sow Lin to Sentul
 * Timur), so a hop alone cannot say which Line it was on. A Line the Run knows
 * wins, then the Line already being drawn, then one that also carries the next
 * hop, so a stroke changes colour only where the Run really changed Line. A hop
 * on no Line is a Walk link (dashed) or a Jump (a break).
 */
export function routePaths(net: NetworkIndex, steps: readonly RouteStep[]): CardPath[] {
  const { geo } = networkLayout();
  const paths: CardPath[] = [];
  let current: CardPath | null = null;

  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1]!;
    const b = steps[i]!;
    const pa = geo.get(a.id);
    const pb = geo.get(b.id);
    if (!pa || !pb) {
      current = null;
      continue;
    }

    const hops = sharedHops(net, a.id, b.id);
    let line: LineCode | null = null;
    if (hops.length > 0) {
      const next = steps[i + 1];
      const onward = next ? sharedHops(net, b.id, next.id) : [];
      const drawing: LineCode | null = current === null ? null : current.line;
      line = (b.line && hops.includes(b.line) ? b.line : null)
        ?? (drawing && hops.includes(drawing) ? drawing : null)
        ?? hops.find((code) => onward.includes(code))
        ?? hops[0]!;
    } else if (!isWalk(net, a.id, b.id)) {
      // A Jump: the Run left one Leg's Terminus for another Line's Station.
      current = null;
      continue;
    }

    if (current && current.line === line) {
      current.points.push(pb);
      continue;
    }
    current = {
      line,
      colour: line ? lineAt(net, line)?.colour ?? '#94a3b8' : '#94a3b8',
      points: [pa, pb],
    };
    paths.push(current);
  }
  return paths;
}

function networkPaths(net: NetworkIndex): CardPath[] {
  const { geo } = networkLayout();
  return [...net.lines.values()].map((line) => ({
    line: line.code,
    colour: line.colour,
    points: line.stations.map((id) => geo.get(id)).filter((p): p is Point => p !== undefined),
  }));
}

/**
 * Frames `focus` in the card's map box. `fitViewBox` keeps a minimum span, so
 * a two-Station Run still shows the streets around it.
 */
export function cardView(focus: readonly Point[]): ViewBox {
  return coverAspect(fitViewBox(focus, 0.1), CARD_MAP.w / CARD_MAP.h);
}

function points(ids: readonly string[]): Point[] {
  const { geo } = networkLayout();
  return ids.map((id) => geo.get(id)).filter((p): p is Point => p !== undefined);
}

function travelMap(net: NetworkIndex, steps: readonly RouteStep[]): CardMap {
  const stops = points(steps.map((s) => s.id));
  return {
    view: cardView(stops),
    network: networkPaths(net),
    route: routePaths(net, steps),
    stops,
    start: stops[0] ?? null,
    end: stops.length > 1 ? stops[stops.length - 1]! : null,
    closed: [],
  };
}

const stationName = (net: NetworkIndex, id: string | undefined) => (id ? stationAt(net, id)?.name ?? id : '');

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface LineRunShare {
  metrics: Metrics;
  /** Passed replay and its Verdict. */
  verified: boolean;
  overallRank?: number | null;
  lineRank?: number | null;
}

/** A completed Line Run: the line end to end. */
export function lineRunCard(net: NetworkIndex, run: RunState, share: LineRunShare): ShareCard {
  const line = run.line ? lineAt(net, run.line) : undefined;
  const ids = run.stationTimes.map((s) => s.id);
  const from = stationName(net, ids[0]);
  const to = stationName(net, ids[ids.length - 1]);
  const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
  const lineName = line?.name ?? 'Line';
  // An early "End run" still shares, as the stretch it covered.
  const complete = line !== undefined && ids.length === line.stations.length;

  const badges: string[] = [];
  if (share.verified) badges.push('Verified');
  if (share.overallRank) badges.push(`#${share.overallRank} overall`);
  else if (share.lineRank) badges.push(`#${share.lineRank} on the line`);

  return {
    mode: 'LINE RUN',
    title: from && to && from !== to ? `${from} → ${to}` : lineName,
    subtitle: complete
      ? `${lineName} · ${plural(ids.length, 'station')}`
      : `${lineName} · ${ids.length} of ${plural(line?.stations.length ?? ids.length, 'station')}`,
    lines: run.line ? cardLines(net, [run.line]) : [],
    stats: [
      { label: 'WPM', value: wpmText(share.metrics) },
      { label: 'Accuracy', value: accuracyText(share.metrics) },
      { label: 'Score', value: scoreText(share.metrics.score) },
      { label: 'Time', value: formatDuration(elapsed) },
    ],
    badges,
    map: travelMap(net, ids.map((id) => ({ id, line: run.line }))),
    text: complete
      ? `I typed the ${lineName} end to end at ${wpmText(share.metrics)} WPM on KL-Metro Typing.`
      : `I typed ${plural(ids.length, 'station')} of the ${lineName} at ${wpmText(share.metrics)} WPM on KL-Metro Typing.`,
    fileName: `kl-metro-${slug(run.line ?? 'line')}-run.png`,
  };
}

export interface AdventureShare {
  metrics: Metrics;
  /** Stations Unlocked across every Run, and how many exist. */
  unlocked: number;
  total: number;
}

/** An Adventure: wherever the player roamed. */
export function adventureCard(net: NetworkIndex, run: RunState, share: AdventureShare): ShareCard {
  const ids = run.stationTimes.map((s) => s.id);
  const map = travelMap(net, ids.map((id) => ({ id })));
  const from = stationName(net, ids[0]);
  const to = stationName(net, ids[ids.length - 1]);

  return {
    mode: 'ADVENTURE',
    title: `${plural(ids.length, 'station')} explored`,
    subtitle: from && to && from !== to ? `${from} to ${to}` : from || 'The Klang Valley',
    lines: cardLines(net, map.route.flatMap((p) => (p.line ? [p.line] : []))),
    stats: [
      { label: 'WPM', value: wpmText(share.metrics) },
      { label: 'Accuracy', value: accuracyText(share.metrics) },
      { label: 'Stations', value: String(ids.length) },
      { label: 'Unlocked', value: `${share.unlocked}/${share.total}` },
    ],
    badges: [],
    map,
    text: `I explored ${plural(ids.length, 'station')} of the Klang Valley on KL-Metro Typing.`,
    fileName: 'kl-metro-adventure.png',
  };
}

/**
 * The Line each completed Station was reached on.
 *
 * A Leg ends at its Terminus and the Run Jumps at once, so the Station after a
 * Leg's `toward` belongs to the next Leg.
 */
export function quickRunSteps(run: QuickRunState): RouteStep[] {
  const legs = run.trace.legs;
  let leg = 0;
  return run.completedStations.map(({ id }, i) => {
    const previous = run.completedStations[i - 1]?.id;
    if (i > 0 && previous === legs[leg]?.toward && leg + 1 < legs.length) leg++;
    return { id, line: legs[leg]?.line ?? null };
  });
}

export interface QuickRunShare {
  metrics: Metrics;
  verified: boolean;
  newBest: boolean;
}

/** A completed Quick Run: thirty seconds, every Leg in its Line's colour. */
export function quickRunCard(net: NetworkIndex, run: QuickRunState, share: QuickRunShare): ShareCard {
  const steps = quickRunSteps(run);
  const count = steps.length;
  const seconds = QUICK_RUN_MS / 1000;
  const map = travelMap(net, steps.length > 0 ? steps : [{ id: run.trace.legs[0]?.at ?? run.at }]);

  const badges: string[] = [];
  if (share.verified) badges.push('Verified');
  if (share.newBest) badges.push('New personal best');

  return {
    mode: 'QUICK RUN',
    title: `${plural(count, 'station')} in ${seconds} s`,
    // The badges already give the codes; the subtitle names the Lines.
    subtitle: run.trace.legs.length === 1
      ? lineAt(net, run.trace.legs[0]!.line)?.name ?? run.trace.legs[0]!.line
      : run.trace.legs.map((leg) => (lineAt(net, leg.line)?.name ?? leg.line).replace(/ Line$/, '')).join(' → '),
    lines: cardLines(net, run.trace.legs.map((leg) => leg.line)),
    stats: [
      { label: 'WPM', value: wpmText(share.metrics) },
      { label: 'Accuracy', value: accuracyText(share.metrics) },
      { label: 'Score', value: scoreText(share.metrics.score) },
      { label: 'Stations', value: String(count) },
    ],
    badges,
    map,
    text: `${plural(count, 'station')} in ${seconds} seconds at ${wpmText(share.metrics)} WPM on KL-Metro Typing.`,
    fileName: 'kl-metro-quick-run.png',
  };
}

export interface CareerShare {
  metrics: Metrics;
  verified: boolean;
  rank?: number | null;
}

/** A Dispatcher Career: the network it ran, and where it broke. */
export function careerCard(net: NetworkIndex, career: CareerState, share: CareerShare): ShareCard {
  const { geo } = networkLayout();
  const totals = careerTotals(career);
  const served = servedStations(net, career.served);
  const codes = servedLines(career.served);
  const route: CardPath[] = career.served.map((range) => {
    const line = lineAt(net, range.line);
    return {
      line: range.line,
      colour: line?.colour ?? '#94a3b8',
      points: points(line?.stations.slice(range.from, range.to + 1) ?? []),
    };
  });
  const closedIds = new Set([
    ...(career.failure?.closures.map((c) => c.station) ?? []),
    ...Object.keys(career.sim.outOfService),
  ]);
  const first = career.failure?.closures[0]?.station;
  const shifts = career.cleared;
  const score = careerScore(career);

  const badges: string[] = [];
  if (share.verified) badges.push('Verified');
  if (share.rank) badges.push(`#${share.rank} on the board`);

  return {
    mode: 'DISPATCHER',
    title: `${plural(shifts, 'Shift')} cleared`,
    subtitle: first
      ? `${plural(served.length, 'Station')} · fell at ${stationName(net, first)}`
      : `${plural(served.length, 'Station')} on the network`,
    lines: cardLines(net, codes),
    stats: [
      { label: 'Score', value: scoreText(score) },
      { label: 'Delivered', value: scoreText(totals.delivered) },
      { label: 'On time', value: `${Math.round(totals.onTimePct)}%` },
      { label: 'WPM', value: wpmText(share.metrics) },
    ],
    badges,
    map: {
      view: cardView(points(served)),
      network: networkPaths(net),
      route,
      stops: points(served),
      start: null,
      end: null,
      closed: [...closedIds].map((id) => geo.get(id)).filter((p): p is Point => p !== undefined),
    },
    text: `I ran ${plural(served.length, 'Station')} of the Klang Valley for ${plural(shifts, 'Shift')} on KL-Metro Typing.`,
    fileName: 'kl-metro-dispatcher.png',
  };
}
