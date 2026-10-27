import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CareerState } from '../engine/dispatch';
import { crowdAt } from '../engine/dispatchSim';
import type { NetworkIndex } from '../engine/network';
import { prefersReducedMotion } from './useLayoutMode';
import { clearedSignals } from './useSignalMarks';

/** How long a call's pop stays up. */
export const POP_MS = 1_100;
/** How long a fixed Crowd surge's dispersal shows. */
export const DISPERSAL_MS = 1_800;
/** At peak, the most pops on the map at once. */
export const MAX_POPS = 4;

/** Who moved when a Train the player cleared called at a Station. */
export interface ExchangePop {
  key: string;
  train: number;
  station: string;
  boarded: number;
  alighted: number;
  delivered: number;
  /** The player's own Clear, not a Green wave's: always shown. */
  own: boolean;
  atMs: number;
}

/** A fixed Crowd surge's crowd draining: the count drops from `from` to `to`. */
export interface DispersalPop {
  key: string;
  station: string;
  count: number;
  from: number;
  to: number;
  /** Reduced motion: a still count, no people streaming away. */
  still: boolean;
}

export interface PassengerMoments {
  pops: ExchangePop[];
  dispersal: DispersalPop | null;
}

export const NO_MOMENTS: PassengerMoments = { pops: [], dispersal: null };

/** A cleared Train on its way to call, and the exchange it had before. */
interface Awaited { since: number; own: boolean }

/** The player's own Clears first, then the newest. */
const byRank = (a: ExchangePop, b: ExchangePop) => Number(b.own) - Number(a.own) || b.atMs - a.atMs;

/**
 * The moments the player helped passengers. A Train whose Signal the player
 * cleared (directly or by a Green wave) shows who boarded and alighted when it
 * next calls; a fixed Crowd surge shows its crowd draining away.
 *
 * Everything here is memory of what was on screen: the engine's
 * `lastExchange` and `lastDispersal` are only read, and the timers live in the
 * UI. A pop is keyed on its event's time, so a Train's next call replaces its
 * last pop. At peak only `MAX_POPS` show, the player's own Clears first.
 */
export function usePassengerMoments(net: NetworkIndex, career: CareerState): PassengerMoments {
  const [pops, setPops] = useState<ExchangePop[]>([]);
  const [dispersal, setDispersal] = useState<DispersalPop | null>(null);
  const seen = useRef(career);
  const awaited = useRef(new Map<number, Awaited>());
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // A layout effect, so a pop paints on the same frame as its call.
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = career;
    if (prev === career) return;
    const later = (ms: number, run: () => void) => {
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        run();
      }, ms);
      timers.current.add(timer);
    };
    // A new Shift brings a fresh set of Trains, and its clock starts again.
    if (prev.shift !== career.shift) {
      awaited.current.clear();
      setPops((list) => (list.length === 0 ? list : []));
      setDispersal(null);
      return;
    }
    const { sim } = career;

    const wave = career.lastWave && career.lastWave.id !== prev.lastWave?.id ? career.lastWave : null;
    for (const id of clearedSignals(net, prev.sim, sim)) {
      const before = prev.sim.trains.find((t) => t.id === id);
      awaited.current.set(id, { since: before?.lastExchange?.atMs ?? -1, own: !wave?.cleared.includes(id) });
    }

    const fresh: ExchangePop[] = [];
    for (const [id, { since, own }] of awaited.current) {
      const t = sim.trains.find((train) => train.id === id);
      const call = t?.lastExchange;
      if (t && call && call.atMs > since) {
        const { station, boarded, alighted, delivered, atMs } = call;
        fresh.push({ key: `${id}@${atMs}`, train: id, station, boarded, alighted, delivered, own, atMs });
        awaited.current.delete(id);
      } else if (!t || t.stage === 'signal') {
        // Gone, or waved through a closed Station to its next Signal without calling.
        awaited.current.delete(id);
      }
    }
    if (fresh.length > 0) {
      const trains = new Set(fresh.map((pop) => pop.train));
      setPops((list) => [...list.filter((pop) => !trains.has(pop.train)), ...fresh].sort(byRank).slice(0, MAX_POPS));
      for (const { key } of fresh) later(POP_MS, () => setPops((list) => list.filter((pop) => pop.key !== key)));
    }

    const gone = sim.lastDispersal;
    const before = prev.sim.lastDispersal;
    if (gone && gone.count > 0 && (gone.atMs !== before?.atMs || gone.incident !== before.incident)) {
      const to = crowdAt(sim, gone.station);
      const next: DispersalPop = { key: `${gone.incident}@${gone.atMs}`, station: gone.station, count: gone.count,
        from: to + gone.count, to, still: prefersReducedMotion() };
      setDispersal(next);
      later(DISPERSAL_MS, () => setDispersal((current) => (current?.key === next.key ? null : current)));
    }
  }, [net, career]);

  return { pops, dispersal };
}
