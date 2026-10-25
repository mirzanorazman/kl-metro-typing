import { useLayoutEffect, useRef, useState } from 'react';
import type { CareerState } from '../engine/dispatch';
import type { Incident } from '../engine/dispatchSim';

/** How long a closed Station's stamp shows on the map. */
export const CLOSURE_STAMP_MS = 1_000;
/** How long the closing Incident card lingers after its Station closes. */
export const CLOSING_CARD_MS = 1_500;

/** One Station closing, as the screen saw it. */
export interface Closing {
  station: string;
  /** `sim.shiftMs` when the screen first saw it closed. */
  atMs: number;
  /** The Incident at that place just before it closed, if any (the engine drops it on closing). */
  incident: Incident | null;
}

/**
 * The closings the screen has seen since it mounted or the Shift began, oldest
 * first. Stations already closed on the first Career it sees are not reported.
 *
 * Everything here is memory of what was on screen: the engine's `oosOrder` is
 * only read. The Incident comes from the previous sim, since closing a Station
 * removes its Incidents. Ages run on `sim.shiftMs`, so they stand still while
 * the Career is paused and through the failure hold.
 */
export function useClosures(career: CareerState): Closing[] {
  const [closings, setClosings] = useState<Closing[]>([]);
  const seen = useRef(career);

  // A layout effect, so a closing paints on the same frame as the closure.
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = career;
    if (prev === career) return;
    // A new Shift brings a fresh network, and its clock starts again.
    if (prev.shift !== career.shift) {
      setClosings((list) => (list.length === 0 ? list : []));
      return;
    }
    const { sim } = career;
    const fresh = sim.oosOrder.slice(prev.sim.oosOrder.length).map((station): Closing => ({
      station,
      atMs: sim.shiftMs,
      incident: prev.sim.incidents.find((inc) => inc.place === station) ?? null,
    }));
    if (fresh.length > 0) setClosings((list) => [...list, ...fresh]);
  }, [career]);

  return closings;
}

/** The closings younger than `windowMs` on the Shift's clock. */
export function freshClosings(closings: readonly Closing[], shiftMs: number, windowMs: number): Closing[] {
  return closings.filter((c) => shiftMs - c.atMs < windowMs);
}
