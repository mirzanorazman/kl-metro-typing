import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePhoneLandscape } from './usePhoneLandscape';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;

function viewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', originalWidth);
  Object.defineProperty(window, 'innerHeight', originalHeight);
  vi.restoreAllMocks();
});

describe('usePhoneLandscape', () => {
  it.each([
    [true, 390, 844, false],
    [true, 844, 390, true],
    [false, 1024, 768, false],
    [false, 1512, 982, false],
    [true, 700, 700, false],
  ])('gates phone=%s at %sx%s to %s', (phone, width, height, expected) => {
    viewport(width, height);
    const { result } = renderHook(() => usePhoneLandscape(phone));
    expect(result.current).toBe(expected);
  });

  it('follows resize, orientationchange, and the phone presentation decision', () => {
    viewport(390, 844);
    const { result, rerender } = renderHook(({ phone }) => usePhoneLandscape(phone), {
      initialProps: { phone: true },
    });
    act(() => {
      viewport(844, 390);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    rerender({ phone: false });
    expect(result.current).toBe(false);
    rerender({ phone: true });
    expect(result.current).toBe(true);
    act(() => {
      viewport(390, 844);
      window.dispatchEvent(new Event('orientationchange'));
    });
    expect(result.current).toBe(false);
  });

  it('removes both viewport listeners on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePhoneLandscape(true));
    unmount();
    for (const event of ['resize', 'orientationchange']) {
      const listener = add.mock.calls.find(([type]) => type === event)?.[1];
      expect(listener).toBeDefined();
      expect(remove).toHaveBeenCalledWith(event, listener);
    }
  });
});
