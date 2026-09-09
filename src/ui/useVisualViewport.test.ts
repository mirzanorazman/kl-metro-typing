import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewport } from './useVisualViewport';

type FakeEventTarget = {
  addEventListener: ReturnType<typeof vi.fn<any[], void>>;
  removeEventListener: ReturnType<typeof vi.fn<any[], void>>;
  dispatch: (type: string) => void;
};

function createEventTarget(): FakeEventTarget {
  const listeners = new Map<string, EventListener>();
  const addEventListener = vi.fn<any[], void>((type, listener) => {
    listeners.set(type, listener);
  });
  const removeEventListener = vi.fn<any[], void>((type, listener) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  });

  return {
    addEventListener,
    removeEventListener,
    dispatch: (type) => listeners.get(type)?.(new Event(type)),
  };
}

const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const visualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');

function setInnerHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function setVisualViewport(value: object | undefined) {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (innerHeightDescriptor) Object.defineProperty(window, 'innerHeight', innerHeightDescriptor);
  if (visualViewportDescriptor) {
    Object.defineProperty(window, 'visualViewport', visualViewportDescriptor);
  } else {
    Reflect.deleteProperty(window, 'visualViewport');
  }
});

describe('useVisualViewport', () => {
  it('reports the visual viewport height and an open keyboard', () => {
    const windowEvents = createEventTarget();
    const visualViewport = { height: 430, ...createEventTarget() };
    vi.spyOn(window, 'addEventListener').mockImplementation(windowEvents.addEventListener);
    vi.spyOn(window, 'removeEventListener').mockImplementation(windowEvents.removeEventListener);
    setInnerHeight(844);
    setVisualViewport(visualViewport);

    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 430, keyboardLikelyOpen: true });
    vi.restoreAllMocks();
  });

  it('does not report the keyboard for an exact 80 pixel difference', () => {
    setInnerHeight(844);
    setVisualViewport({ height: 764, ...createEventTarget() });

    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 764, keyboardLikelyOpen: false });
  });

  it('updates height and keyboard state on visual viewport resize', () => {
    const visualViewport = { height: 800, ...createEventTarget() };
    setInnerHeight(844);
    setVisualViewport(visualViewport);
    const { result } = renderHook(() => useVisualViewport());

    act(() => {
      visualViewport.height = 400;
      visualViewport.dispatch('resize');
    });

    expect(result.current).toEqual({ height: 400, keyboardLikelyOpen: true });
  });

  it('updates height and keyboard state on visual viewport scroll', () => {
    const visualViewport = { height: 800, ...createEventTarget() };
    setInnerHeight(844);
    setVisualViewport(visualViewport);
    const { result } = renderHook(() => useVisualViewport());

    act(() => {
      visualViewport.height = 400;
      visualViewport.dispatch('scroll');
    });

    expect(result.current).toEqual({ height: 400, keyboardLikelyOpen: true });
  });

  it('falls back to innerHeight and responds to window resize without a visual viewport', () => {
    const windowEvents = createEventTarget();
    vi.spyOn(window, 'addEventListener').mockImplementation(windowEvents.addEventListener);
    vi.spyOn(window, 'removeEventListener').mockImplementation(windowEvents.removeEventListener);
    setInnerHeight(844);
    setVisualViewport(undefined);
    const { result } = renderHook(() => useVisualViewport());

    act(() => {
      setInnerHeight(600);
      windowEvents.dispatch('resize');
    });

    expect(result.current).toEqual({ height: 600, keyboardLikelyOpen: false });
    vi.restoreAllMocks();
  });

  it('removes the window and visual viewport listeners on unmount', () => {
    const windowEvents = createEventTarget();
    const visualViewport = createEventTarget();
    vi.spyOn(window, 'addEventListener').mockImplementation(windowEvents.addEventListener);
    vi.spyOn(window, 'removeEventListener').mockImplementation(windowEvents.removeEventListener);
    setVisualViewport({ height: 844, ...visualViewport });
    const { unmount } = renderHook(() => useVisualViewport());

    unmount();

    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    vi.restoreAllMocks();
  });
});
