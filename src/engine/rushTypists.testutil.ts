import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { CARRIAGE_CAPACITY, OVERFLOW_MS } from './rushBalance';
import { deliverableAt, queueCapacity, railHops, type RushActionBody, type RushState } from './rushHour';

/** Test support: scripted Rush Hour routing, for balance tests and the probe. */

const net = buildNetwork(loadNetworkData());

/** Picks the Direction whose next Station delivers most, then has most waiting. Never turns. */
export function greedyChoose(s: RushState): RushActionBody {
  let best = s.options[0]!;
  let score = -1;
  for (const o of s.options) {
    const v = deliverableAt(net, s, o.next) * 3 + (s.queues[o.next]?.passengers.length ?? 0);
    if (v > score) {
      score = v;
      best = o;
    }
  }
  return { a: 'choose', line: best.line, next: best.next };
}

/**
 * The Station a sensible player heads for from `from`: what it would deliver
 * plus how urgent its Queue is, discounted by distance.
 */
function goal(s: RushState, from: string): string {
  const room = CARRIAGE_CAPACITY - s.load.length;
  let best = from;
  let bestScore = -Infinity;
  for (const [id, hops] of railHops(net, s.lineSet, from)) {
    if (hops === 0) continue;
    const q = s.queues[id]!;
    const fill = q.passengers.length / queueCapacity(net, id);
    const urgency = q.overflowMs > 0 ? 10 + (20 * q.overflowMs) / OVERFLOW_MS : fill * fill * 8;
    const value = deliverableAt(net, s, id) * 2 + (room > 0 ? urgency : urgency * 0.3);
    const score = value / (1 + hops * 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

const hopsTo = (s: RushState, from: string, to: string) => railHops(net, s.lineSet, from).get(to) ?? Infinity;

/** At a Junction, takes the Direction that gets closest to the goal. */
export function plannerChoose(s: RushState): RushActionBody {
  const g = goal(s, s.at);
  let best = s.options[0]!;
  for (const o of s.options) if (hopsTo(s, o.next, g) < hopsTo(s, best.next, g)) best = o;
  return { a: 'choose', line: best.line, next: best.next };
}

/** Turns around when the Station just left is closer to the goal than the one ahead. */
export function plannerSteer(s: RushState): boolean {
  if (s.arrivedFrom === null) return false;
  const g = goal(s, s.arrivedFrom);
  return hopsTo(s, s.arrivedFrom, g) < hopsTo(s, s.at, g);
}
