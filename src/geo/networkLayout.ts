import type { Point } from '../data/types';
import { loadNetworkData } from '../data/load';
import { makeProjection } from './project';
import { buildSchematic } from './schematic';
import { loadBoundaries, projectBoundaries, type BoundaryPath } from './boundaries';

/**
 * One viewport for the whole app. Every screen must share it — see below.
 */
export const NETWORK_VIEWPORT = { width: 1000, height: 800, padding: 60 };

export interface NetworkLayout {
  /** Geographic positions, keyed by station id. */
  geo: Map<string, Point>;
  /** Octolinear diagram positions, keyed by station id. */
  schematic: Map<string, Point>;
  /** Land outlines, projected with the same transform as `geo`. */
  backdrop: BoundaryPath[];
}

let cached: NetworkLayout | null = null;

/**
 * The single layout every screen draws from.
 *
 * Screens used to build their own projections: the home map fitted to all
 * stations at one padding, a line run fitted to *just that line's* stations at
 * another. Those are different coordinate spaces, so a station had different
 * x/y on each screen — which is why moving from the map into a run jumped
 * instead of animating. No view tween can bridge two coordinate systems; they
 * have to be the same one.
 *
 * Computed once and cached: the network data is static, so there is nothing to
 * invalidate, and the backdrop stops being projected three times over.
 */
export function networkLayout(): NetworkLayout {
  if (cached) return cached;

  const data = loadNetworkData();
  const proj = makeProjection(
    data.stations.map((s) => s.geo),
    NETWORK_VIEWPORT,
  );

  cached = {
    geo: new Map(data.stations.map((s) => [s.id, proj.project(s.geo)])),
    schematic: buildSchematic(data.lines).points,
    backdrop: projectBoundaries(loadBoundaries(), proj),
  };
  return cached;
}

/** Positions of one line's stations, in route order. Handy for framing. */
export function lineExtent(stationIds: readonly string[]): Point[] {
  const { geo } = networkLayout();
  return stationIds
    .map((id) => geo.get(id))
    .filter((p): p is Point => p !== undefined);
}
