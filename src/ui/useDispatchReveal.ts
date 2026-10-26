import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LineCode } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import { rangeAdditions, rangeStations, type LineRange } from '../render/trackRanges';
import type { TrackReveal } from '../render/trackReveal';

export const DISPATCH_ENTRY_MS = 1000;
export const DISPATCH_EXPANSION_MS = 800;

export interface RevealEvent {
  id: number;
  kind: 'entry' | 'expansion';
  until: number;
  track: TrackReveal;
}

export interface DispatchRevealControls {
  event: RevealEvent | null;
  joining: LineCode | null;
  celebration: { id: number; line: LineCode } | null;
  blocksInput(): boolean;
  beginExpansion(before: readonly LineRange[], after: readonly LineRange[]): void;
  clearNotice(): void;
  cancel(): void;
}

type RevealState = Pick<DispatchRevealControls, 'event' | 'joining' | 'celebration'>;

function createEvent(
  net: NetworkIndex, id: number, kind: RevealEvent['kind'],
  before: readonly LineRange[], after: readonly LineRange[],
  segments = rangeAdditions(net, before, after),
): RevealEvent {
  const duration = kind === 'entry' ? DISPATCH_ENTRY_MS : DISPATCH_EXPANSION_MS;
  const stations = rangeStations(net, after);
  for (const id of rangeStations(net, before)) stations.delete(id);
  return {
    id, kind, until: performance.now() + duration,
    track: { id, before, segments, stations, duration },
  };
}

/** Presentation deadlines stay separate from the Career and its simulation clock. */
export function useDispatchReveal(
  net: NetworkIndex, starting: readonly LineRange[], entry: boolean, onEntryDone: () => void,
): DispatchRevealControls {
  const [media] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'));
  const reduced = useRef(media?.matches ?? false);
  const [state, setState] = useState<RevealState>(() => ({
    event: entry && !reduced.current ? createEvent(net, 1, 'entry', [], starting) : null,
    joining: null,
    celebration: null,
  }));
  const current = useRef(state);
  const nextId = useRef(entry ? 2 : 1);
  const pendingEntry = useRef(entry);
  const latest = useRef({ net, onEntryDone });
  latest.current = { net, onEntryDone };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const publish = useCallback((next: RevealState) => {
    current.current = next;
    setState(next);
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    const completeEntry = pendingEntry.current;
    pendingEntry.current = false;
    if (current.current.event) publish({ ...current.current, event: null });
    // Clear authoritative state first: the callback may synchronously route a key.
    if (completeEntry) latest.current.onEntryDone();
  }, [clearTimer, publish]);

  const blocksInput = useCallback(() => {
    const event = current.current.event;
    if (event && !reduced.current && performance.now() < event.until) return true;
    finish();
    return false;
  }, [finish]);

  const beginExpansion = useCallback((before: readonly LineRange[], after: readonly LineRange[]) => {
    const net = latest.current.net;
    const segments = rangeAdditions(net, before, after);
    if (segments.length === 0) return;
    const id = nextId.current++;
    const beforeLines = new Set(before.map((range) => range.line));
    const joining = after.find((range) => !beforeLines.has(range.line))?.line ?? null;
    clearTimer();
    pendingEntry.current = false;
    publish({
      event: reduced.current ? null : createEvent(net, id, 'expansion', before, after, segments),
      joining,
      celebration: joining ? { id, line: joining } : null,
    });
  }, [clearTimer, publish]);

  const clearNotice = useCallback(() => {
    publish({ ...current.current, joining: null, celebration: null });
  }, [publish]);

  const cancel = useCallback(() => {
    clearTimer();
    pendingEntry.current = false;
    publish({ event: null, joining: null, celebration: null });
  }, [clearTimer, publish]);

  useLayoutEffect(() => {
    const update = () => {
      reduced.current = media?.matches ?? false;
      if (reduced.current) finish();
    };
    update();
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [finish, media]);

  useEffect(() => {
    const event = state.event;
    if (!event) return;
    const schedule = () => {
      if (current.current.event !== event) return;
      const remaining = event.until - performance.now();
      if (remaining <= 0) finish();
      else timer.current = setTimeout(schedule, remaining);
    };
    schedule();
    // StrictMode replays setup; cleanup must preserve the event and pending entry.
    return clearTimer;
  }, [clearTimer, finish, state.event]);

  return { ...state, blocksInput, beginExpansion, clearNotice, cancel };
}
