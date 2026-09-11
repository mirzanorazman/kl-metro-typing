import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { KEYLOG_VERSION } from '../engine/keylog';
import { runTick, useRunRecorder } from './useRunRecorder';

describe('runTick', () => {
  it('gives whole milliseconds', () => {
    expect(Number.isInteger(runTick())).toBe(true);
  });

  it('does not go backwards', () => {
    const first = runTick();
    expect(runTick()).toBeGreaterThanOrEqual(first);
  });
});

describe('useRunRecorder', () => {
  it('opens a log at the run start', () => {
    const { result } = renderHook(() => useRunRecorder(500));
    expect(result.current.snapshot()).toEqual({
      v: KEYLOG_VERSION, t0: 500, ms: 0, events: [],
    });
  });

  it('accumulates keystrokes and returns the tick each was recorded at', () => {
    const { result } = renderHook(() => useRunRecorder(runTick()));
    let tick = 0;
    act(() => { tick = result.current.record('a'); });
    act(() => { result.current.record('b'); });

    const log = result.current.snapshot();
    expect(log.events.map((e) => e.k)).toEqual(['a', 'b']);
    expect(Number.isInteger(tick)).toBe(true);
  });

  it('carries the source onto the event', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a', { trusted: false, batch: 3 }); });
    const event = result.current.snapshot().events[0]!;
    expect(event.u).toBe(1);
    expect(event.b).toBe(3);
  });

  it('treats an omitted source as an ordinary keystroke', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a'); });
    const event = result.current.snapshot().events[0]!;
    expect(event.u).toBeUndefined();
    expect(event.b).toBeUndefined();
  });

  it('does not re-render the component when recording', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useRunRecorder(0);
    });
    const before = renders;
    act(() => {
      for (let i = 0; i < 50; i++) result.current.record('a');
    });
    expect(renders).toBe(before);
  });

  it('reopens an empty log on reset', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a'); });
    act(() => { result.current.reset(900); });
    expect(result.current.snapshot()).toEqual({
      v: KEYLOG_VERSION, t0: 900, ms: 0, events: [],
    });
  });
});
