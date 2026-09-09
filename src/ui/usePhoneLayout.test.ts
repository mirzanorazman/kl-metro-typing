import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERY, usePhoneLayout } from './usePhoneLayout';

type FakeMediaQueryList = {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn<any[], void>>;
  removeEventListener: ReturnType<typeof vi.fn<any[], void>>;
  dispatchChange: () => void;
};

function createMediaQueryList(matches: boolean): FakeMediaQueryList {
  let listener: (() => void) | undefined;
  const addEventListener = vi.fn<any[], void>((_type, callback) => {
    listener = callback;
  });
  const removeEventListener = vi.fn<any[], void>((_type, callback) => {
    if (listener === callback) listener = undefined;
  });

  return {
    matches,
    addEventListener,
    removeEventListener,
    dispatchChange: () => listener?.(),
  };
}

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function setMatchMedia(matchMedia: unknown) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
}

afterEach(() => {
  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, 'matchMedia');
  }
});

describe('usePhoneLayout', () => {
  it('returns true for a matching phone query and passes the exact query string', () => {
    const mediaQueryList = createMediaQueryList(true);
    const matchMedia = vi.fn(() => mediaQueryList);
    setMatchMedia(matchMedia);

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(PHONE_QUERY);
  });

  it('returns false when the phone query does not match', () => {
    const mediaQueryList = createMediaQueryList(false);
    setMatchMedia(vi.fn(() => mediaQueryList));

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(false);
  });

  it('updates when the MediaQueryList dispatches a change', () => {
    const mediaQueryList = createMediaQueryList(false);
    setMatchMedia(vi.fn(() => mediaQueryList));
    const { result } = renderHook(() => usePhoneLayout());

    act(() => {
      mediaQueryList.matches = true;
      mediaQueryList.dispatchChange();
    });

    expect(result.current).toBe(true);
  });

  it('removes the registered change listener on unmount', () => {
    const mediaQueryList = createMediaQueryList(false);
    setMatchMedia(vi.fn(() => mediaQueryList));
    const { unmount } = renderHook(() => usePhoneLayout());
    const registeredListener = mediaQueryList.addEventListener.mock.calls[0]![1];

    unmount();

    expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith('change', registeredListener);
  });

  it('returns false when matchMedia is unavailable', () => {
    setMatchMedia(undefined);

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(false);
  });
});
