import type { LineCode } from '../data/types';
import type { CareerState } from '../engine/dispatch';
import type { Incident } from '../engine/dispatchSim';
import type { Target } from '../engine/dispatchTargets';
import type { NetworkIndex } from '../engine/network';
import type { TipSubject } from './dispatchTips';

/** The close camera's settings: on by default, and tuned from the dev camera panel in development. */
export interface CloseCameraSettings {
  on: boolean;
  /** How much closer than the normal frame, at CLOSE_EARLY_STATIONS served Stations or fewer. */
  early: number;
  /** How much closer than the normal frame, at CLOSE_LATE_STATIONS served Stations or more. */
  late: number;
}

export const CLOSE_CAMERA_DEFAULTS: CloseCameraSettings = { on: true, early: 3, late: 1.2 };

/** Shift 1's network: 14 Stations. */
export const CLOSE_EARLY_STATIONS = 14;
export const CLOSE_LATE_STATIONS = 40;

/** What the dev camera panel's sliders allow. */
export const CLOSE_RANGES = { early: [1, 5], late: [1, 3] } as const;

/**
 * How much closer than the normal frame a close view is, for a Served network
 * of `stations`: the early closeness on a small network, easing linearly to
 * the late one as it grows.
 */
export function closeness(
  stations: number, settings: Pick<CloseCameraSettings, 'early' | 'late'> = CLOSE_CAMERA_DEFAULTS,
): number {
  const t = Math.min(1, Math.max(0, (stations - CLOSE_EARLY_STATIONS) / (CLOSE_LATE_STATIONS - CLOSE_EARLY_STATIONS)));
  return settings.early + (settings.late - settings.early) * t;
}

/**
 * How close a failed Shift's camera comes to the Station that ended it: twice
 * the close camera's closeness now, and never less than 4×, so even a large
 * network ends tight on that one Station.
 */
export function failCloseness(closenessNow: number): number {
  return Math.max(4, 2 * closenessNow);
}

/**
 * The frame while a fix is typed: a lean towards the Incident, never a
 * close-up. It holds the place and its Served neighbours on its Line, so the
 * shot never closes in on one dot, and every waiting train's Station, so no
 * train waits out of view. The key carries the waiting Stations: one that
 * starts waiting mid-fix moves the key, and the map refits to take it in.
 */
export function leanIn(
  net: NetworkIndex, sim: CareerState['sim'], incident: Incident, targets: readonly Target[],
  served: ReadonlySet<string>,
): { stations: string[]; key: string } {
  const near = withNeighbours(net, incident.line, incident.place, served);
  const waiting = new Set<string>();
  for (const target of targets) {
    if (target.ref.kind === 'fix') continue;
    const id = target.ref.train;
    const train = sim.trains.find((t) => t.id === id);
    const station = train && net.lines.get(train.line)!.stations[train.at];
    if (station) waiting.add(station);
  }
  return {
    stations: [...new Set([...near, ...waiting])],
    key: `fix:${incident.id}:${[...waiting].sort().join(',')}`,
  };
}

/** A Station and its Served neighbours on `line`: a frame that never closes in on one dot. */
export function withNeighbours(net: NetworkIndex, line: LineCode, station: string, served: ReadonlySet<string>): string[] {
  const ids = net.lines.get(line)!.stations;
  const at = ids.indexOf(station);
  if (at < 0) return [station];
  return [ids[at - 1], station, ids[at + 1]]
    .filter((id): id is string => id !== undefined && (id === station || served.has(id)));
}

/**
 * The Stations a tip frames, with the lean-in's framing: those it is about and
 * each of its trains' own, each with its Served neighbours on the trains' Line.
 * A tip about no train (a closed Station) takes the neighbours on every Line
 * through each Station.
 */
export function subjectStations(
  net: NetworkIndex, sim: CareerState['sim'], subject: TipSubject, served: ReadonlySet<string>,
): string[] {
  const trains = subject.trains.flatMap((id) => sim.trains.filter((t) => t.id === id));
  const at = trains.map((train) => net.lines.get(train.line)!.stations[train.at]!);
  const trainLines = [...new Set(trains.map((train) => train.line))];
  const linesThrough = (station: string) => trainLines.length > 0 ? trainLines
    : [...net.lines].filter(([, line]) => line.stations.includes(station)).map(([code]) => code);
  return [...new Set([...subject.stations, ...at]
    .flatMap((station) => linesThrough(station).flatMap((line) => withNeighbours(net, line, station, served))))];
}
