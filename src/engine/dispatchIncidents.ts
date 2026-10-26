import type { LineCode } from '../data/types';
import {
  GAP_HOLD_MS, GAP_TRIGGER_MS, INCIDENT_FIRST_MS, INCIDENT_LIMIT_MS, INCIDENT_MAX, INCIDENTS_PER_MINUTE,
  PLATFORM_CAPACITY, SIGNAL_FAULT_STATIONS, STRAIN_CROWD_WEIGHT,
  STRAIN_HELD_WEIGHT, TICK_MS,
} from './dispatchBalance';
import { servedStations } from './dispatchNetwork';
import {
  closeStation, crowdAt, heldTrains, nextStationId, pairedRears, stepSim,
  type Incident, type IncidentKind, type PhaseNow, type SimState, type Train,
} from './dispatchSim';
import type { NetworkIndex } from './network';
import { nextRandom } from './rng';

export function fixItems(net: NetworkIndex, inc: Incident, s: SimState): string[] {
  const name = (id: string) => net.stations.get(id)?.name ?? id;
  switch (inc.kind) {
    case 'signal-fault': return inc.stations.map(name);
    case 'crowd-surge': return [`Crowd control at ${name(inc.place)}`];
    case 'train-fault': {
      const train = s.trains.find((t) => t.id === inc.train);
      return [`Reset train at ${name(train ? nextStationId(net, train) ?? inc.place : inc.place)}`];
    }
    case 'service-gap': {
      const train = s.trains.find((t) => t.id === inc.train);
      return [`Hold at ${name(train ? nextStationId(net, train) ?? inc.place : inc.place)}`];
    }
  }
}

export function strain(net: NetworkIndex, s: SimState, id: string): number {
  const held = heldTrains(net, s);
  const approaching = s.trains.filter((t) => (held.has(t.id) || t.stage === 'signal')
    && nextStationId(net, t) === id).length;
  return 1 + STRAIN_CROWD_WEIGHT * crowdAt(s, id) / PLATFORM_CAPACITY
    + STRAIN_HELD_WEIGHT * approaching;
}

interface Feasible { kind: IncidentKind; line: LineCode; stations: string[]; trains: number[] }

function feasibleAt(net: NetworkIndex, s: SimState, place: string, occupied: Set<string>): Feasible[] {
  if (s.outOfService[place] || occupied.has(place)) return [];
  const options: Feasible[] = [];
  const centerOffset = Math.floor(SIGNAL_FAULT_STATIONS / 2);
  for (const range of s.served) {
    const ids = net.lines.get(range.line)!.stations;
    const center = net.order.get(range.line)?.get(place);
    if (center === undefined || center < range.from || center > range.to) continue;
    const first = center - centerOffset;
    const last = first + SIGNAL_FAULT_STATIONS - 1;
    if (first >= range.from && last <= range.to) {
      const stations = ids.slice(first, last + 1);
      if (stations.every((id) => s.platforms[id] && !s.outOfService[id] && !occupied.has(id))) {
        options.push({ kind: 'signal-fault', line: range.line, stations, trains: [] });
      }
    }
  }
  const trains = s.trains.filter((t) => nextStationId(net, t) === place && !heldTrains(net, s).has(t.id));
  if (trains.length) {
    options.push({ kind: 'train-fault', line: trains[0]!.line, stations: [], trains: trains.map((t) => t.id) });
  }
  const line = s.served.find((range) => {
    const i = net.order.get(range.line)?.get(place);
    return i !== undefined && i >= range.from && i <= range.to;
  })?.line;
  if (line) options.push({ kind: 'crowd-surge', line, stations: [place], trains: [] });
  return options;
}

function draw(s: SimState): number {
  let value: number;
  [value, s.rng] = nextRandom(s.rng);
  return value;
}

function spawnIncident(net: NetworkIndex, s: SimState, startedMs: number): boolean {
  const occupied = new Set(s.incidents.flatMap((inc) => [inc.place, ...inc.stations]));
  const candidates = servedStations(net, s.served).map((place) => ({
    place, options: feasibleAt(net, s, place, occupied),
  })).filter((candidate) => candidate.options.length > 0);
  if (!candidates.length) return false;
  const weights = candidates.map(({ place }) => strain(net, s, place));
  let value = draw(s) * weights.reduce((sum, weight) => sum + weight, 0);
  let chosen = candidates[candidates.length - 1]!;
  for (let i = 0; i < candidates.length; i++) {
    value -= weights[i]!;
    if (value < 0) { chosen = candidates[i]!; break; }
  }
  // Kinds are uniform at the chosen place, regardless of how many Lines serve it.
  const byKind = [...new Set(chosen.options.map((option) => option.kind))];
  const kind = byKind[Math.floor(draw(s) * byKind.length)]!;
  const sameKind = chosen.options.filter((option) => option.kind === kind);
  const option = sameKind[Math.floor(draw(s) * sameKind.length)]!;
  const train = option.trains.length ? option.trains[Math.floor(draw(s) * option.trains.length)]! : null;
  const line = train === null ? option.line : s.trains.find((t) => t.id === train)!.line;
  s.incidents.push({ id: s.nextIncidentId++, kind, place: chosen.place, stations: [...option.stations],
    line, train, startedMs, step: 0, extra: 0 });
  return true;
}

/** The Station a bunched pair leaves without service: the rear Train's last call, else the one behind it. */
function gapPlace(net: NetworkIndex, s: SimState, rear: Train): string {
  if (rear.lastExchange) return rear.lastExchange.station;
  const range = s.served.find((r) => r.line === rear.line)!;
  const at = Math.max(range.from, Math.min(range.to, rear.at - rear.dir));
  return net.lines.get(rear.line)!.stations[at]!;
}

/**
 * Player-caused, so no draw on `incidentDebt` or the rng: a pair that stays
 * bunched for GAP_TRIGGER_MS starts a Service gap on its rear Train, which
 * ends by itself once the pair breaks up. A rear Train still owed a hold has
 * no pair timer, so a pair still standing after the hold starts afresh.
 */
function stepServiceGaps(net: NetworkIndex, s: SimState, endMs: number): void {
  for (const [key, left] of Object.entries(s.gapHolds)) {
    const t = s.trains.find((candidate) => candidate.id === Number(key));
    const rest = t?.stage === 'signal' ? left - TICK_MS : left;
    if (!t || rest <= 0) delete s.gapHolds[Number(key)];
    else s.gapHolds[Number(key)] = rest;
  }
  const rears = pairedRears(net, s);
  const pairs: Record<string, number> = {};
  for (const [rear, leader] of rears) {
    if (s.gapHolds[rear] !== undefined) continue;
    const key = `${rear}:${leader}`;
    // A pair first seen in the state before this tick began then.
    pairs[key] = s.pairs[key] ?? s.shiftMs;
  }
  s.pairs = pairs;
  s.incidents = s.incidents.filter((inc) => inc.kind !== 'service-gap' || (inc.train !== null && rears.has(inc.train)));
  for (const [key, startMs] of Object.entries(s.pairs)) {
    if (s.incidents.length >= INCIDENT_MAX) break;
    const rear = s.trains.find((t) => t.id === Number(key.split(':')[0]))!;
    if (endMs - startMs < GAP_TRIGGER_MS
      || s.incidents.some((inc) => inc.kind === 'service-gap' && inc.train === rear.id)) continue;
    const place = gapPlace(net, s, rear);
    if (s.outOfService[place] || s.incidents.some((inc) => inc.place === place || inc.stations.includes(place))) continue;
    s.incidents.push({ id: s.nextIncidentId++, kind: 'service-gap', place, stations: [], line: rear.line,
      train: rear.id, startedMs: endMs, step: 0, extra: 0 });
  }
}

/** Spawn and escalate against the ending time of the pending simulation tick. */
export function stepIncidents(net: NetworkIndex, s: SimState, phase: PhaseNow): void {
  const endMs = s.shiftMs + TICK_MS;
  s.incidents = s.incidents.filter((inc) => !s.outOfService[inc.place]);
  for (const inc of [...s.incidents]) {
    if (endMs - inc.startedMs >= INCIDENT_LIMIT_MS) closeStation(s, inc.place, inc.kind);
  }
  stepServiceGaps(net, s, endMs);
  if (endMs < INCIDENT_FIRST_MS || s.incidents.length >= INCIDENT_MAX) return;
  s.incidentDebt += INCIDENTS_PER_MINUTE * phase.multiplier * phase.escalation * TICK_MS / 60_000;
  while (s.incidentDebt >= 1 && s.incidents.length < INCIDENT_MAX) {
    if (!spawnIncident(net, s, endMs)) break;
    s.incidentDebt--;
  }
}

/** One game tick: incident changes take effect before movement and arrivals. */
export function stepWorld(net: NetworkIndex, s: SimState, phase: PhaseNow): void {
  stepIncidents(net, s, phase);
  stepSim(net, s, phase);
}

/** Complete exactly one typed repair item. */
export function advanceFix(net: NetworkIndex, s: SimState, incidentId: number): boolean {
  const inc = s.incidents.find((candidate) => candidate.id === incidentId);
  if (!inc) return false;
  const count = fixItems(net, inc, s).length;
  if (inc.step >= count) return false;
  inc.step++;
  if (inc.step === count) {
    s.incidents.splice(s.incidents.indexOf(inc), 1);
    if (inc.kind === 'crowd-surge') disperseSurge(s, inc);
    if (inc.kind === 'service-gap' && inc.train !== null) s.gapHolds[inc.train] = GAP_HOLD_MS;
  }
  return true;
}

/** The surge's extra Passengers leave the platform: counted as neither Delivered nor Stranded. */
function disperseSurge(s: SimState, inc: Incident): void {
  const waiting = s.platforms[inc.place]?.waiting ?? {};
  const count = Math.min(Math.floor(inc.extra), crowdAt(s, inc.place));
  let remaining = count;
  for (const destination of Object.keys(waiting).sort()) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, waiting[destination]!);
    remaining -= taken;
    if (taken === waiting[destination]) delete waiting[destination];
    else waiting[destination]! -= taken;
  }
  s.dispersed += count;
  s.lastDispersal = { station: inc.place, count, incident: inc.id, atMs: s.shiftMs };
}
