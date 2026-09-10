import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewport, VisualViewportProvider } from './useVisualViewport';

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

type ViewportEvent = 'resize' | 'scroll';

function restoreWindowProperty(name: 'innerHeight' | 'visualViewport', descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
  } else {
    delete (window as unknown as Record<string, unknown>)[name];
  }
}

function setInnerHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

function createVisualViewport(initialHeight: number) {
  let height = initialHeight;
  const listeners = new Map<ViewportEvent, EventListener>();
  const viewport = {
    get height() {
      return height;
    },
    addEventListener: vi.fn((type: ViewportEvent, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn(),
  } as unknown as VisualViewport;

  return {
    viewport,
    setHeight(nextHeight: number) {
      height = nextHeight;
    },
    dispatch(type: ViewportEvent) {
      listeners.get(type)?.(new Event(type));
    },
  };
}

function installVisualViewport(viewport: VisualViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
}

afterEach(() => {
  restoreWindowProperty('innerHeight', originalInnerHeight);
  restoreWindowProperty('visualViewport', originalVisualViewport);
  vi.restoreAllMocks();
});

describe('useVisualViewport', () => {
  function Probe() {
    useVisualViewport();
    return null;
  }

  it('reports the visual viewport height and a likely open keyboard', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(430);
    installVisualViewport(visual.viewport);

    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 430, keyboardLikelyOpen: true });
  });

  it('does not report a keyboard when the height difference is exactly 80', () => {
    setInnerHeight(844);
    installVisualViewport(createVisualViewport(764).viewport);

    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 764, keyboardLikelyOpen: false });
  });

  it('refreshes the measurement when the effect mounts', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(700);
    let heightReads = 0;
    Object.defineProperty(visual.viewport, 'height', {
      configurable: true,
      get: () => (heightReads++ === 0 ? 700 : 600),
    });
    installVisualViewport(visual.viewport);

    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 600, keyboardLikelyOpen: true });
  });

  it('rereads the visual viewport on resize', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(700);
    installVisualViewport(visual.viewport);
    const { result } = renderHook(() => useVisualViewport());

    act(() => {
      visual.setHeight(800);
      visual.dispatch('resize');
    });

    expect(result.current).toEqual({ height: 800, keyboardLikelyOpen: false });
  });

  it('rereads the visual viewport on scroll', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(800);
    installVisualViewport(visual.viewport);
    const { result } = renderHook(() => useVisualViewport());

    act(() => {
      visual.setHeight(650);
      visual.dispatch('scroll');
    });

    expect(result.current).toEqual({ height: 650, keyboardLikelyOpen: true });
  });

  it('falls back to innerHeight and updates on window resize', () => {
    setInnerHeight(844);
    installVisualViewport(undefined);
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current).toEqual({ height: 844, keyboardLikelyOpen: false });

    act(() => {
      setInnerHeight(700);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toEqual({ height: 700, keyboardLikelyOpen: false });
  });

  it('removes all listeners from the captured viewport on unmount', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(700);
    installVisualViewport(visual.viewport);
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useVisualViewport());
    const update = vi.mocked(visual.viewport.addEventListener).mock.calls.find(
      ([type]) => type === 'resize',
    )?.[1];

    unmount();

    expect(update).toBeDefined();
    expect(addWindowListener).toHaveBeenCalledWith('resize', update);
    expect(visual.viewport.addEventListener).toHaveBeenCalledWith('resize', update);
    expect(visual.viewport.addEventListener).toHaveBeenCalledWith('scroll', update);
    expect(removeWindowListener).toHaveBeenCalledWith('resize', update);
    expect(visual.viewport.removeEventListener).toHaveBeenCalledWith('resize', update);
    expect(visual.viewport.removeEventListener).toHaveBeenCalledWith('scroll', update);
  });

  it('shares one viewport subscription among provider consumers', () => {
    setInnerHeight(844);
    const visual = createVisualViewport(700);
    installVisualViewport(visual.viewport);
    const addWindowListener = vi.spyOn(window, 'addEventListener');

    render(createElement(
      VisualViewportProvider,
      null,
      createElement(Probe),
      createElement(Probe),
    ));

    expect(addWindowListener.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    expect(visual.viewport.addEventListener).toHaveBeenCalledTimes(2);
  });
});
