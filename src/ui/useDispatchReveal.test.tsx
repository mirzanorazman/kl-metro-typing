import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { rangeStations, type LineRange } from '../render/trackRanges';
import { DISPATCH_ENTRY_MS, DISPATCH_EXPANSION_MS, useDispatchReveal } from './useDispatchReveal';

const net = buildNetwork(loadNetworkData());
const starting: readonly LineRange[] = [{ line: 'KJ', from: 4, to: 17 }];
const extended: readonly LineRange[] = [{ line: 'KJ', from: 1, to: 17 }];
const shared: readonly LineRange[] = [{ line: 'AG', from: 0, to: 5 }];
const joined: readonly LineRange[] = [...shared, { line: 'SP', from: 0, to: 5 }];
let now = 0;
let reduced = false;
let listeners: Set<EventListener>;
let media: MediaQueryList;

function setReduced(value: boolean) {
  reduced = value;
  act(() => {
    for (const listener of listeners) listener({ matches: value } as MediaQueryListEvent);
  });
}

function advance(ms: number) {
  act(() => {
    now += ms;
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 100;
  reduced = false;
  listeners = new Set();
  media = {
    get matches() { return reduced; },
    addEventListener: vi.fn((_type: string, listener: EventListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: EventListener) => listeners.delete(listener)),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useDispatchReveal', () => {
  it('publishes entry on its first render, blocking until its 1000ms deadline', () => {
    const done = vi.fn();
    const frames: boolean[] = [];
    const { result } = renderHook(() => {
      const reveal = useDispatchReveal(net, starting, true, done);
      frames.push(reveal.event !== null);
      return reveal;
    });

    expect(frames[0]).toBe(true);
    expect(DISPATCH_ENTRY_MS).toBe(1000);
    expect(result.current.event).toMatchObject({ kind: 'entry', until: 1100, track: {
      before: [], segments: [{ ...starting[0], reverse: false }],
      stations: rangeStations(net, starting), duration: 1000,
    } });
    expect(result.current.event!.track.id).toBe(result.current.event!.id);
    expect(result.current.blocksInput()).toBe(true);
    advance(999);
    expect(result.current.blocksInput()).toBe(true);
    expect(done).not.toHaveBeenCalled();
    advance(1);
    expect(result.current.event).toBeNull();
    expect(result.current.blocksInput()).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('finishes synchronously on a first key when a background timer was withheld', () => {
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, starting, true, done));
    const blocks = result.current.blocksInput;
    let blocked = true;
    done.mockImplementation(() => {
      expect(blocks()).toBe(false);
    });
    now += 1000;
    act(() => { blocked = blocks(); });
    expect(blocked).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.event).toBeNull();
    advance(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('completes entry exactly once through StrictMode effect replay', () => {
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, starting, true, done), {
      wrapper: StrictMode,
    });
    expect(result.current.blocksInput()).toBe(true);
    advance(1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.event).toBeNull();
    advance(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('keeps methods, event identity and deadline stable, using the latest completion callback', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ ranges, done }) => useDispatchReveal(net, ranges, true, done), {
      initialProps: { ranges: starting, done: first },
    });
    const initial = result.current;
    advance(400);
    rerender({ ranges: extended, done: latest });
    expect(result.current.event).toBe(initial.event);
    for (const key of ['blocksInput', 'beginExpansion', 'clearNotice', 'cancel'] as const) {
      expect(result.current[key]).toBe(initial[key]);
    }
    advance(600);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    act(() => result.current.beginExpansion(starting, extended));
    expect(result.current.event!.id).toBeGreaterThan(initial.event!.id);
  });

  it('creates an 800ms existing-line extension without a joined-line notice or cue', () => {
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, starting, false, done));
    expect(result.current.event).toBeNull();
    act(() => result.current.beginExpansion(starting, extended));
    expect(DISPATCH_EXPANSION_MS).toBe(800);
    expect(result.current.event).toMatchObject({ kind: 'expansion', until: 900, track: {
      before: starting, segments: [{ line: 'KJ', from: 1, to: 4, reverse: true }], duration: 800,
    } });
    expect(result.current.event!.track.stations).toEqual(new Set(net.lines.get('KJ')!.stations.slice(1, 4)));
    expect(result.current.joining).toBeNull();
    expect(result.current.celebration).toBeNull();
    advance(800);
    expect(result.current.event).toBeNull();
    expect(done).not.toHaveBeenCalled();
  });

  it('reveals a newly joined line with no new stations and retains its notice and cue after completion', () => {
    const { result } = renderHook(() => useDispatchReveal(net, shared, false, vi.fn()));
    act(() => result.current.beginExpansion(shared, joined));
    const id = result.current.event!.id;
    expect(result.current.event!.track.stations.size).toBe(0);
    expect(result.current.event!.track.segments).toEqual([{ line: 'SP', from: 0, to: 5, reverse: false }]);
    expect(result.current.joining).toBe('SP');
    expect(result.current.celebration).toEqual({ id, line: 'SP' });
    advance(800);
    expect(result.current.event).toBeNull();
    expect(result.current.joining).toBe('SP');
    expect(result.current.celebration).toEqual({ id, line: 'SP' });
  });

  it('does not allocate an event or id for unchanged ranges', () => {
    const { result } = renderHook(() => useDispatchReveal(net, shared, false, vi.fn()));
    act(() => result.current.beginExpansion(shared, joined));
    const event = result.current.event;
    const cue = result.current.celebration;
    act(() => result.current.beginExpansion(joined, joined));
    expect(result.current.event).toBe(event);
    expect(result.current.celebration).toBe(cue);
    act(() => result.current.beginExpansion(starting, extended));
    expect(result.current.event!.id).toBe(event!.id + 1);
  });

  it('finishes reduced-motion entry after rendering, exactly once even in StrictMode', () => {
    reduced = true;
    const done = vi.fn();
    let rendering = false;
    done.mockImplementation(() => expect(rendering).toBe(false));
    const { result } = renderHook(() => {
      rendering = true;
      const controls = useDispatchReveal(net, starting, true, done);
      expect(controls.event).toBeNull();
      rendering = false;
      return controls;
    }, { wrapper: StrictMode });
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.blocksInput()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps reduced-motion joined-line notice and cue without creating a wait', () => {
    reduced = true;
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, shared, false, done));
    act(() => result.current.beginExpansion(shared, joined));
    expect(result.current.event).toBeNull();
    expect(result.current.blocksInput()).toBe(false);
    expect(result.current.joining).toBe('SP');
    expect(result.current.celebration).toMatchObject({ line: 'SP' });
    expect(vi.getTimerCount()).toBe(0);
    expect(done).not.toHaveBeenCalled();
  });

  it('finishes active waits when reduced motion turns on and never restarts them', () => {
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, starting, true, done));
    advance(200);
    setReduced(true);
    expect(result.current.event).toBeNull();
    expect(result.current.blocksInput()).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    setReduced(false);
    expect(result.current.event).toBeNull();
    advance(1000);
    expect(done).toHaveBeenCalledTimes(1);
    act(() => result.current.beginExpansion(shared, joined));
    setReduced(true);
    expect(result.current.event).toBeNull();
    expect(result.current.joining).toBe('SP');
    expect(result.current.celebration).toMatchObject({ line: 'SP' });
  });

  it('cancel clears entry completion and all reveal state immediately', () => {
    const done = vi.fn();
    const { result } = renderHook(() => useDispatchReveal(net, starting, true, done));
    act(() => result.current.cancel());
    expect(result.current.event).toBeNull();
    expect(result.current.blocksInput()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    advance(1000);
    expect(done).not.toHaveBeenCalled();
    act(() => result.current.beginExpansion(shared, joined));
    act(() => result.current.cancel());
    expect(result.current.joining).toBeNull();
    expect(result.current.celebration).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmount clears the timer and media listener without completing entry', () => {
    const done = vi.fn();
    const { unmount } = renderHook(() => useDispatchReveal(net, starting, true, done));
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    advance(1000);
    expect(done).not.toHaveBeenCalled();
  });

  it('clearNotice removes the notice and cue without cancelling an active reveal', () => {
    const { result } = renderHook(() => useDispatchReveal(net, shared, false, vi.fn()));
    act(() => result.current.beginExpansion(shared, joined));
    const event = result.current.event;
    act(() => result.current.clearNotice());
    expect(result.current.joining).toBeNull();
    expect(result.current.celebration).toBeNull();
    expect(result.current.event).toBe(event);
    expect(result.current.blocksInput()).toBe(true);
    advance(800);
    expect(result.current.event).toBeNull();
  });
});
