import type { CareerState } from '../engine/dispatch';
import { DWELL_BASE_MS, OOS_CROWD_MS, TRAVEL_MS } from '../engine/dispatchBalance';
import { crowdAt, type SimState, type Train } from '../engine/dispatchSim';
import type { Target } from '../engine/dispatchTargets';
import type { NetworkIndex } from '../engine/network';

/** Off, or amber Signal chips on the Trains that relieve a crowded Station (a), or those chips and a ring on the Station (b). */
export type CrowdingHintMode = 'off' | 'a' | 'b';
/**
 * Which Held Trains turn amber: any within `RELIEVE_BLOCKS` (blocks), or only
 * those that can still reach the crowded Station before it closes (time).
 */
export type AmberRule = 'blocks' | 'time';
export interface CrowdingHintSettings { mode: CrowdingHintMode; delayMs: number; declutter: boolean; amber: AmberRule }

/** What players get, chosen after playtest 2.5 (2026-10-29); development builds start here too. */
export const CROWDING_HINT_DEFAULTS: CrowdingHintSettings = { mode: 'b', delayMs: 2_000, declutter: true, amber: 'time' };
export const CROWDING_HINT_OFF: CrowdingHintSettings = { mode: 'off', delayMs: 5_000, declutter: false, amber: 'time' };
export const CROWDING_DELAY_RANGE = [0, 15_000] as const;
export const CROWDING_DELAY_STEP = 1_000;

/** A Train this many blocks (or fewer) before a crowded Station is close enough to relieve it. */
export const RELIEVE_BLOCKS = 3;
/** The typing speed the time rule assumes for each Clear on the way. */
export const ARRIVAL_WPM = 60;

export interface CrowdedStation {
  id: string;
  /** How far the countdown to closing has run, 0 to 1. */
  share: number;
  /** Time left before the platform goes Out of service. */
  leftMs: number;
  waiting: number;
}

/** A crowded Station's ring; lost when no Held Train can relieve it, so it shows grey. */
export interface CrowdingRing extends CrowdedStation { lost: boolean }

/** What the overlay draws for the hint: the Trains whose Signal chips turn amber, and the ring on each crowded Station. */
export interface CrowdingHintView { relieving: ReadonlySet<number>; rings: readonly CrowdingRing[] }

/** Stations whose platform has been full for at least `delayMs`, by id. */
export function crowdedStations(sim: SimState, delayMs: number): CrowdedStation[] {
  return Object.keys(sim.platforms).sort()
    .filter((id) => !sim.outOfService[id] && sim.platforms[id]!.fullMs > 0 && sim.platforms[id]!.fullMs >= delayMs)
    .map((id) => {
      const { fullMs } = sim.platforms[id]!;
      return { id, share: Math.min(1, fullMs / OOS_CROWD_MS), leftMs: Math.max(0, OOS_CROWD_MS - fullMs), waiting: crowdAt(sim, id) };
    });
}

/**
 * The least time a Held Train needs to reach the platform `blocks` ahead of
 * its Signal: every Station name on the way typed at `ARRIVAL_WPM`, its own
 * Signal's first, and the shortest dwell and one run per block. Passengers,
 * busy blocks and closed Stations run through only add time it ignores.
 */
export function arrivalMs(net: NetworkIndex, train: Train, blocks: number): number {
  const stations = net.lines.get(train.line)!.stations;
  let letters = 0;
  for (let b = 0; b <= blocks; b++) {
    const id = stations[train.at + b * train.dir]!;
    letters += (net.stations.get(id)?.name ?? id).length;
  }
  // A word is five keys.
  return (letters / (ARRIVAL_WPM * 5)) * 60_000 + blocks * (DWELL_BASE_MS + TRAVEL_MS);
}

/**
 * Trains the player could call now that stand within `RELIEVE_BLOCKS` blocks
 * before a crowded Station, travelling toward it, on a Line that serves it.
 * Under the time rule a Train must also be able to arrive before the Station
 * closes (`arrivalMs`).
 */
export function relievingTrains(
  net: NetworkIndex,
  sim: SimState,
  crowded: readonly CrowdedStation[],
  targets: readonly Target[],
  amber: AmberRule = 'blocks',
): Set<number> {
  const callable = new Set(targets.flatMap((target) => target.ref.kind === 'signal' ? [target.ref.train] : []));
  const relieving = new Set<number>();
  for (const train of sim.trains) {
    if (!callable.has(train.id)) continue;
    const range = sim.served.find((r) => r.line === train.line);
    const stations = net.lines.get(train.line)!.stations;
    for (const { id, leftMs } of crowded) {
      const index = stations.indexOf(id);
      if (!range || index < range.from || index > range.to) continue;
      const blocks = (index - train.at) * train.dir;
      if (blocks < 0 || blocks > RELIEVE_BLOCKS) continue;
      if (amber === 'blocks' || arrivalMs(net, train, blocks) <= leftMs) relieving.add(train.id);
    }
  }
  return relieving;
}

/**
 * What the hint shows under `hint`: the amber Trains for every crowded
 * Station, and under B a ring on each, lost when no amber Train relieves it.
 */
export function hintView(
  net: NetworkIndex,
  sim: SimState,
  crowded: readonly CrowdedStation[],
  targets: readonly Target[],
  hint: CrowdingHintSettings,
): CrowdingHintView {
  const relieving = relievingTrains(net, sim, crowded, targets, hint.amber);
  const rings = hint.mode !== 'b' ? [] : crowded.map((c) => (
    { ...c, lost: relievingTrains(net, sim, [c], targets, hint.amber).size === 0 }));
  return { relieving, rings };
}

/** The hint belongs to the Shift itself: not between Shifts, after one, or in the lesson. */
export function hintLive(status: CareerState['status'], inLesson: boolean): boolean {
  return !inLesson && (status === 'ready' || status === 'running' || status === 'paused');
}

/**
 * The only Station names left drawn when the map is decluttered: Incident
 * places and ringed Stations. A Held Train's Station is not among them, since
 * its Signal chip already names it.
 */
export function declutteredLabels(sim: SimState, ringed: readonly string[]): Set<string> {
  const ids = new Set<string>(ringed);
  for (const inc of sim.incidents) ids.add(inc.place);
  return ids;
}
