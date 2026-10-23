import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LineCode } from '../data/types';
import type { CareerState, Wave } from '../engine/dispatch';
import type { Dir, SimState } from '../engine/dispatchSim';
import type { Target } from '../engine/dispatchTargets';
import type { NetworkIndex } from '../engine/network';
import { prefersReducedMotion } from './useLayoutMode';

/** How long a Cleared Signal's green mark takes to fade out. */
export const SIGNAL_FADE_MS = 500;
/** A Green wave's first flip waits this long, so its pulse is seen travelling. */
export const RIPPLE_LEAD_MS = 400;
/** The gap between one Green wave flip and the next. */
export const RIPPLE_STEP_MS = 150;
/** How long a wave with nothing to reach takes to run out along its Line. */
const EMPTY_WAVE_MS = 600;
/** The pulse's trail fades for this long after it reaches its far end. */
const PULSE_FADE_MS = 700;

export interface SignalMark {
  key: string;
  train: number;
  line: LineCode;
  /** Index of the faced Station on the Line, and the direction the train came from. */
  at: number;
  dir: Dir;
  station: string;
  lamp: 'red' | 'green';
  /** True once the train has gone: the mark is only turning green and fading. */
  cleared: boolean;
  /** Place in its Green wave's cleared order, when a wave cleared it. */
  order: number | null;
}

/** One direction of a Green wave's pulse: Station ids from the origin outward. */
export interface PulseRun { stations: string[]; ms: number }
export interface Pulse { wave: number; line: LineCode; runs: PulseRun[] }

/**
 * The Trains whose Signal was Cleared between two states of one Shift: each
 * was waiting at a Signal and has gone, and its Station is not Out of service
 * (a closed Station waves its train through; that is not a Clear). Only a
 * Target the player completed, or a Green wave it set off, clears a Signal.
 */
export function clearedSignals(net: NetworkIndex, prev: SimState, next: SimState): number[] {
  const waiting = new Map(prev.trains.filter((t) => t.stage === 'signal').map((t) => [t.id, t]));
  return next.trains.filter((t) => {
    const before = waiting.get(t.id);
    return before !== undefined && (t.stage !== 'signal' || t.at !== before.at)
      && !next.outOfService[net.lines.get(before.line)!.stations[before.at]!];
  }).map((t) => t.id);
}

/** When the mark a Green wave cleared `order`-th turns green. */
const flipDelay = (order: number) => RIPPLE_LEAD_MS + order * RIPPLE_STEP_MS;

function liveMarks(net: NetworkIndex, career: CareerState, targets: readonly Target[]): SignalMark[] {
  const marks: SignalMark[] = [];
  for (const target of targets) {
    if (target.ref.kind !== 'signal') continue;
    const id = target.ref.train;
    const t = career.sim.trains.find((train) => train.id === id);
    if (!t) continue;
    marks.push({ key: `${t.id}@${t.at}`, train: t.id, line: t.line, at: t.at, dir: t.dir,
      station: net.lines.get(t.line)!.stations[t.at]!, lamp: 'red', cleared: false, order: null });
  }
  return marks;
}

/**
 * The pulse runs out from the wave's origin in each direction that it cleared
 * a Signal, reaching the farthest one just as that mark flips. A wave that
 * found nothing waiting still runs, out to the ends of the Served Line.
 */
function pulseFor(net: NetworkIndex, career: CareerState, wave: Wave, cleared: readonly SignalMark[]): Pulse {
  const ids = net.lines.get(wave.line)!.stations;
  const origin = net.order.get(wave.line)?.get(wave.origin) ?? ids.indexOf(wave.origin);
  // Nearest first, so a side's farthest mark is also its last to flip.
  const reach = (marks: readonly SignalMark[], far: (...values: number[]) => number) => marks.length === 0 ? null
    : { at: far(...marks.map((mark) => mark.at)), ms: Math.max(...marks.map((mark) => flipDelay(mark.order!))) };
  let up = reach(cleared.filter((mark) => mark.at > origin), Math.max);
  let down = reach(cleared.filter((mark) => mark.at < origin), Math.min);
  if (!up && !down) {
    const range = career.served.find((r) => r.line === wave.line);
    if (range) {
      if (range.to > origin) up = { at: range.to, ms: EMPTY_WAVE_MS };
      if (range.from < origin) down = { at: range.from, ms: EMPTY_WAVE_MS };
    }
  }
  const runs: PulseRun[] = [];
  if (up) runs.push({ stations: ids.slice(origin, up.at + 1), ms: up.ms });
  if (down) runs.push({ stations: ids.slice(down.at, origin + 1).reverse(), ms: down.ms });
  return { wave: wave.id, line: wave.line, runs };
}

/**
 * The Signal marks to draw: one red mark per waiting train, plus the marks of
 * trains just Cleared, which turn green and fade. A Green wave flips its marks
 * one after another in the order it cleared them and sends a pulse along its
 * Line; under reduced motion they all flip at once and there is no pulse.
 *
 * Everything here is memory of what was on screen: the timers live in the UI
 * and the engine's `lastWave` is only read, never written. A wave animates
 * when its id changes, so one from an earlier Shift never replays.
 */
export function useSignalMarks(
  net: NetworkIndex,
  career: CareerState,
  targets: readonly Target[],
): { marks: SignalMark[]; pulse: Pulse | null } {
  const live = useMemo(() => liveMarks(net, career, targets), [net, career, targets]);
  const [fading, setFading] = useState<SignalMark[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const seen = useRef({ shift: career.shift, live, wave: career.lastWave?.id ?? 0 });
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // A layout effect, so a Cleared mark never misses a frame between red and green.
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = { shift: career.shift, live, wave: career.lastWave?.id ?? 0 };
    if (prev.live === live) return;
    const later = (ms: number, run: () => void) => {
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        run();
      }, ms);
      timers.current.add(timer);
    };
    const wave = career.lastWave && career.lastWave.id !== prev.wave ? career.lastWave : null;
    const reduced = prefersReducedMotion();
    // A new Shift brings a fresh set of trains; nothing on screen was Cleared.
    const now = new Set(live.map((mark) => mark.key));
    const cleared = prev.shift !== career.shift ? [] : prev.live.filter((mark) => {
      if (now.has(mark.key)) return false;
      const train = career.sim.trains.find((t) => t.id === mark.train);
      // Held by an Incident, or its Station went Out of service: not a Clear.
      return train !== undefined && (train.stage !== 'signal' || train.at !== mark.at)
        && !career.sim.outOfService[mark.station];
    }).map((mark) => {
      const order = wave ? wave.cleared.indexOf(mark.train) : -1;
      return { ...mark, cleared: true, order: order >= 0 ? order : null };
    });

    if (wave && !reduced) {
      const next = pulseFor(net, career, wave, cleared.filter((mark) => mark.order !== null));
      setPulse(next);
      const ms = Math.max(0, ...next.runs.map((run) => run.ms)) + PULSE_FADE_MS;
      later(ms, () => setPulse((current) => (current?.wave === next.wave ? null : current)));
    }
    if (cleared.length === 0) return;

    const flips = cleared.map((mark) => ({
      ...mark, lamp: (mark.order === null || reduced ? 'green' : 'red') as SignalMark['lamp'],
      delay: mark.order === null || reduced ? 0 : flipDelay(mark.order),
    }));
    const keys = new Set(flips.map((mark) => mark.key));
    setFading((list) => [...list.filter((mark) => !keys.has(mark.key)),
      ...flips.map(({ delay: _delay, ...mark }) => mark)]);
    for (const { key, delay } of flips) {
      if (delay > 0) {
        later(delay, () => setFading((list) => list.map((mark) => (mark.key === key ? { ...mark, lamp: 'green' } : mark))));
      }
      later(delay + SIGNAL_FADE_MS, () => setFading((list) => list.filter((mark) => mark.key !== key)));
    }
  }, [net, career, live]);

  const marks = useMemo(() => {
    const showing = new Set(live.map((mark) => mark.key));
    return [...live, ...fading.filter((mark) => !showing.has(mark.key))];
  }, [live, fading]);
  return { marks, pulse };
}

/**
 * The Green wave that just fired, for `ms` after it fired; otherwise null.
 * Only a change of wave id counts, so the last wave of an earlier Shift, still
 * held in Career state, does not flash again.
 */
export function useFreshWave(wave: Wave | null, ms: number): Wave | null {
  const seen = useRef(wave?.id ?? 0);
  const latest = useRef(wave);
  latest.current = wave;
  const [fresh, setFresh] = useState<Wave | null>(null);
  const id = wave?.id ?? 0;
  useLayoutEffect(() => {
    if (id === 0 || id === seen.current) return;
    seen.current = id;
    setFresh(latest.current);
    const timer = window.setTimeout(() => setFresh(null), ms);
    return () => window.clearTimeout(timer);
  }, [id, ms]);
  return fresh;
}
