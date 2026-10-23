import type { NetworkIndex } from '../engine/network';
import type { CareerState, Failure } from '../engine/dispatch';
import { bunchedTrains, type OosCause } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';

/** One-time Dispatcher tips, in the order they queue when moments coincide. */
export const DISPATCH_TIPS = [
  { id: 'start', text: "Type a waiting station's name to clear its signal. Trains you don't clear wait." },
  { id: 'incident', text: 'An incident holds trains until you type its fix. Left too long, the station goes out of service.' },
  { id: 'bunching', text: 'Trains are bunching. Holding one back (not clearing it) evens out the gaps.' },
  { id: 'late', text: 'A late train offers a station further ahead. Type that to run it express.' },
  { id: 'out-of-service', text: 'A station is out of service. Lose a quarter of your network and the shift fails.' },
  { id: 'expansion', text: "Shift cleared. Choose where your network grows. Type a station's name or click it." },
] as const;

export type DispatchTipId = (typeof DISPATCH_TIPS)[number]['id'];

export function dispatchTipText(id: DispatchTipId): string {
  return DISPATCH_TIPS.find((t) => t.id === id)!.text;
}

/**
 * The tip moments that happened between two states, minus those `seen`.
 * `start` is not a moment: the screen shows it inline while the Career is ready.
 * A new Shift's fresh sim is not compared with the last one's. Takes `net`
 * because bunching and late Trains are read through the network.
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
    if (want('incident') && after.incidents.some((inc) => !before.incidents.some((p) => p.id === inc.id))) {
      hit.add('incident');
    }
    if (want('bunching')) {
      const was = bunchedTrains(net, before);
      if ([...bunchedTrains(net, after)].some((id) => !was.has(id))) hit.add('bunching');
    }
    if (want('late')) {
      const skips = (s: typeof after) => visibleTargets(net, s).filter((t) => t.ref.kind === 'skip');
      const had = new Set(skips(before).map((t) => t.ref.kind === 'skip' && t.ref.train));
      if (skips(after).some((t) => t.ref.kind === 'skip' && !had.has(t.ref.train))) hit.add('late');
    }
    if (after.oosOrder.length > before.oosOrder.length) hit.add('out-of-service');
  }
  return DISPATCH_TIPS.map((t) => t.id).filter((id) => hit.has(id) && want(id));
}

const CAUSE_TEXT: Record<OosCause, string> = {
  crowding: 'when its platform overflowed',
  'signal-fault': 'after a signal fault was left unfixed',
  'train-fault': 'after a train fault was left unfixed',
  'crowd-surge': 'after a crowd surge was left unfixed',
};

/** What ended the Career, in one sentence. */
export function failureText(net: NetworkIndex, f: Failure): string {
  const name = net.stations.get(f.station)?.name ?? f.station;
  return `Shift ${f.shift} ended: ${name} went out of service ${CAUSE_TEXT[f.cause]}.`;
}
