import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERY, usePhoneLayout } from './usePhoneLayout';

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function restoreMatchMedia() {
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  } else {
    delete (window as Partial<Window>).matchMedia;
  }
}

function createMediaQueryList(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
  const query = {
    get matches() {
      return matches;
    },
    media: PHONE_QUERY,
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'change') changeListener = listener as (event: MediaQueryListEvent) => void;
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    query,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      changeListener?.({ matches: nextMatches } as MediaQueryListEvent);
    },
  };
}

function installMatchMedia(query: MediaQueryList) {
  const matchMedia = vi.fn(() => query);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });
  return matchMedia;
}

afterEach(() => {
  restoreMatchMedia();
  vi.restoreAllMocks();
});

describe('usePhoneLayout', () => {
  it('uses the exact phone query and returns its current true match', () => {
    const { query } = createMediaQueryList(true);
    const matchMedia = installMatchMedia(query);

    const { result } = renderHook(() => usePhoneLayout());

    expect(PHONE_QUERY).toBe('(max-width: 700px), (pointer: coarse) and (max-height: 700px)');
    expect(matchMedia).toHaveBeenCalledWith(PHONE_QUERY);
    expect(result.current).toBe(true);
  });

  it('returns false when the phone query does not match', () => {
    const { query } = createMediaQueryList(false);
    installMatchMedia(query);

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(false);
  });

  it('updates when the media query changes from false to true', () => {
    const media = createMediaQueryList(false);
    installMatchMedia(media.query);
    const { result } = renderHook(() => usePhoneLayout());

    act(() => media.setMatches(true));

    expect(result.current).toBe(true);
  });

  it('removes the exact change listener on unmount', () => {
    const { query } = createMediaQueryList(false);
    installMatchMedia(query);
    const { unmount } = renderHook(() => usePhoneLayout());
    const update = vi.mocked(query.addEventListener).mock.calls.find(([type]) => type === 'change')?.[1];

    unmount();

    expect(update).toBeDefined();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', update);
  });

  it('returns false when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(false);
  });
});
