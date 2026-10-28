import type { CareerState } from '../engine/dispatch';
import { OOS_CROWD_MS } from '../engine/dispatchBalance';
import { crowdAt, type SimState } from '../engine/dispatchSim';
import type { Target } from '../engine/dispatchTargets';
import type { NetworkIndex } from '../engine/network';

/** Off, or the crowded Station's ring alone (a), or the ring with the Trains that relieve it (b). */
export type CrowdingHintMode = 'off' | 'a' | 'b';
export interface CrowdingHintSettings { mode: CrowdingHintMode; delayMs: number; declutter: boolean }

/** Development builds start with the hint on; production ships it off. */
export const CROWDING_HINT_DEFAULTS: CrowdingHintSettings = { mode: 'b', delayMs: 5_000, declutter: false };
export const CROWDING_HINT_OFF: CrowdingHintSettings = { mode: 'off', delayMs: 5_000, declutter: false };
export const CROWDING_DELAY_RANGE = [0, 15_000] as const;
export const CROWDING_DELAY_STEP = 1_000;

/** A Train this many blocks (or fewer) before a crowded Station is close enough to relieve it. */
export const RELIEVE_BLOCKS = 3;

export interface CrowdedStation {
  id: string;
  /** How far the countdown to closing has run, 0 to 1. */
  share: number;
  waiting: number;
}

/** Stations whose platform has been full for at least `delayMs`, by id. */
export function crowdedStations(sim: SimState, delayMs: number): CrowdedStation[] {
  return Object.keys(sim.platforms).sort()
    .filter((id) => !sim.outOfService[id] && sim.platforms[id]!.fullMs > 0 && sim.platforms[id]!.fullMs >= delayMs)
    .map((id) => ({ id, share: Math.min(1, sim.platforms[id]!.fullMs / OOS_CROWD_MS), waiting: crowdAt(sim, id) }));
}

/**
 * Trains the player could call now that stand within `RELIEVE_BLOCKS` blocks
 * before a crowded Station, travelling toward it, on a Line that serves it.
 */
export function relievingTrains(
  net: NetworkIndex,
  sim: SimState,
  crowded: readonly CrowdedStation[],
  targets: readonly Target[],
): Set<number> {
  const callable = new Set(targets.flatMap((target) => target.ref.kind === 'signal' ? [target.ref.train] : []));
  const relieving = new Set<number>();
  for (const train of sim.trains) {
    if (!callable.has(train.id)) continue;
    const range = sim.served.find((r) => r.line === train.line);
    const stations = net.lines.get(train.line)!.stations;
    for (const { id } of crowded) {
      const index = stations.indexOf(id);
      if (!range || index < range.from || index > range.to) continue;
      const blocks = (index - train.at) * train.dir;
      if (blocks >= 0 && blocks <= RELIEVE_BLOCKS) relieving.add(train.id);
    }
  }
  return relieving;
}

/** The hint belongs to the Shift itself: not between Shifts, after one, or in the lesson. */
export function hintLive(status: CareerState['status'], inLesson: boolean): boolean {
  return !inLesson && (status === 'ready' || status === 'running' || status === 'paused');
}

/** The only Station names left drawn when the map is decluttered. */
export function declutteredLabels(
  net: NetworkIndex,
  sim: SimState,
  targets: readonly Target[],
  ringed: readonly string[],
): Set<string> {
  const ids = new Set<string>(ringed);
  for (const target of targets) {
    if (target.ref.kind === 'fix') continue;
    const id = target.ref.train;
    const train = sim.trains.find((t) => t.id === id);
    const station = train && net.lines.get(train.line)!.stations[train.at];
    if (station) ids.add(station);
  }
  for (const inc of sim.incidents) ids.add(inc.place);
  return ids;
}
