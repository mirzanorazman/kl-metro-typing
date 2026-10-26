import type { NetworkIndex } from '../engine/network';
import type { CareerState, Closure, Failure } from '../engine/dispatch';
import { pairedRears, type OosCause } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';

/** One-time Dispatcher tips, in the order they queue when moments coincide. */
export const DISPATCH_TIPS = [
  { id: 'start', text: "Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift." },
  { id: 'incident', text: 'An incident holds trains until you type its fix. Left too long, the station goes out of service.' },
  { id: 'service-gap', text: 'These two trains are too close together, so the Station behind them waits longer. Type the fix to hold the second one, or get the front one moving.' },
  { id: 'late', text: 'This train is late: its next platform has waited too long. Type the farther Station shown beside it to run it express.' },
  { id: 'new-train', text: 'A new train has joined at the end of the line. Trains join during the peaks until each line has its full fleet; longer lines get more trains.' },
  { id: 'out-of-service', text: 'A station is out of service. Each closure fills the gauge at the top; when it is full, the Shift fails.' },
  { id: 'expansion', text: "Shift cleared. Choose where your network grows. Type a station's name or click it." },
] as const;

export type DispatchTipId = (typeof DISPATCH_TIPS)[number]['id'];

export function dispatchTipText(id: DispatchTipId): string {
  return DISPATCH_TIPS.find((t) => t.id === id)!.text;
}

/**
 * The tip moments that happened between two states, minus those `seen`.
 * `start` is not a moment: the screen shows it inline while the Career is ready.
 * A new Shift's fresh sim is not compared with the last one's. A Service gap
 * has its own tip, so only the random kinds count as a new Incident. Takes
 * `net` because late Trains are read through the network.
 */
export function newDispatchTips(
  net: NetworkIndex,
  prev: CareerState,
  next: CareerState,
  seen: ReadonlySet<string>,
): DispatchTipId[] {
  const hit = new Set<DispatchTipId>();
  const want = (id: DispatchTipId) => !seen.has(id);
  if (next.status === 'between' && prev.status !== 'between') hit.add('expansion');
  if (prev.shift === next.shift && prev.sim !== next.sim) {
    const before = prev.sim;
    const after = next.sim;
    const started = after.incidents.filter((inc) => !before.incidents.some((p) => p.id === inc.id));
    if (started.some((inc) => inc.kind !== 'service-gap')) hit.add('incident');
    if (started.some((inc) => inc.kind === 'service-gap')) hit.add('service-gap');
    if (want('late')) {
      const skips = (s: typeof after) => visibleTargets(net, s).filter((t) => t.ref.kind === 'skip');
      const had = new Set(skips(before).map((t) => t.ref.kind === 'skip' && t.ref.train));
      if (skips(after).some((t) => t.ref.kind === 'skip' && !had.has(t.ref.train))) hit.add('late');
    }
    if (after.nextTrainId > before.nextTrainId) hit.add('new-train');
    if (after.oosOrder.length > before.oosOrder.length) hit.add('out-of-service');
  }
  return DISPATCH_TIPS.map((t) => t.id).filter((id) => hit.has(id) && want(id));
}

/** What a tip points at on the map: its trains, and the Stations it is about. */
export interface TipSubject { trains: number[]; stations: string[] }

/**
 * The trains and Stations a tip is about, so the map can frame and pulse them
 * while it shows: the newest Service gap's rear train, its leader and the
 * Station it left behind; or the first late train (by id) offering a Station
 * further ahead, at its platform. Null for a tip about no train, and for a subject
 * that has gone, including between Shifts, when the Shift's trains are out of play.
 */
export function tipSubject(net: NetworkIndex, career: CareerState, id: DispatchTipId): TipSubject | null {
  if (career.status !== 'running' && career.status !== 'paused') return null;
  const { sim } = career;
  const stationOf = (train: number) => {
    const t = sim.trains.find((candidate) => candidate.id === train);
    return t ? net.lines.get(t.line)!.stations[t.at]! : null;
  };
  if (id === 'service-gap') {
    const gap = sim.incidents.filter((inc) => inc.kind === 'service-gap').sort((a, b) => b.id - a.id)[0];
    if (!gap || gap.train === null || stationOf(gap.train) === null) return null;
    const leader = pairedRears(net, sim).get(gap.train);
    return { trains: leader === undefined ? [gap.train] : [gap.train, leader], stations: [gap.place] };
  }
  if (id === 'late') {
    // Skip offers come in train id order.
    const skip = visibleTargets(net, sim).find((t) => t.ref.kind === 'skip');
    return skip?.ref.kind === 'skip' ? { trains: [skip.ref.train], stations: [stationOf(skip.ref.train)!] } : null;
  }
  return null;
}

const CAUSE_TEXT: Record<OosCause, string> = {
  crowding: 'because its platform overflowed',
  'signal-fault': 'after a signal fault was left unfixed',
  'train-fault': 'after a train fault was left unfixed',
  'crowd-surge': 'after a crowd surge was left unfixed',
  'service-gap': 'after a service gap was left unfixed',
};

function closureClause(net: NetworkIndex, c: Closure): string {
  const name = net.stations.get(c.station)?.name ?? c.station;
  return `${name} went out of service ${CAUSE_TEXT[c.cause]}`;
}

/** One Station's closure and its cause, as a sentence. */
export function closureText(net: NetworkIndex, c: Closure): string {
  return `${closureClause(net, c)}.`;
}

/** What ended the Career, in one sentence: the first closure, which started the collapse. */
export function failureText(net: NetworkIndex, f: Failure): string {
  const first = f.closures[0];
  return first ? `Shift ${f.shift} ended: it started when ${closureClause(net, first)}.` : `Shift ${f.shift} ended.`;
}
