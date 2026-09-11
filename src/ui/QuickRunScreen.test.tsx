import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from '../engine/network';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { QUICK_RUN_MS } from '../engine/quickRun';
import { QuickRunScreen } from './QuickRunScreen';
import { TypingInputProvider } from './TypingInputProvider';

// jsdom cannot produce a trusted keyboard event (see TypingInputProvider.test.tsx),
// so a dispatched keydown always reports `isTrusted: false`. The PB tests
// below need to simulate a legitimate, trusted player run, which no
// fireEvent option can achieve — isTrusted is a non-configurable own property
// jsdom sets at construction. Wrapping useKeyboard here is the standard
// escape hatch for an untestable browser primitive; every other behaviour of
// useKeyboard is preserved unchanged.
vi.mock('./useKeyboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useKeyboard')>();
  return {
    ...actual,
    useKeyboard: (onKey: Parameters<typeof actual.useKeyboard>[0], active?: boolean) =>
      actual.useKeyboard((key, source) => onKey(key, { ...source, trusted: true }), active),
  };
});

const net = buildNetwork(loadNetworkData());
const mobileStyles = readFileSync('src/ui/mobile.css', 'utf8');

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');

let now = 1_000;
let visibility: DocumentVisibilityState = 'visible';
let phone = false;
let viewport: EventTarget & { height: number };

function installBrowserState() {
  viewport = Object.assign(new EventTarget(), { height: 844 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: phone,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<PropertyKey, unknown>)[key];
}

function renderQuick({
  line = 'MR',
  toward = 'titiwangsa',
  previousStart = null,
  onStartingStation = vi.fn(),
  onBack = vi.fn(),
  random = () => 0,
  providerEnabled = true,
}: {
  line?: LineCode;
  toward?: string;
  previousStart?: string | null;
  onStartingStation?: (id: string) => void;
  onBack?: () => void;
  random?: () => number;
  providerEnabled?: boolean;
} = {}) {
  return render(
    <TypingInputProvider enabled={providerEnabled}>
      <QuickRunScreen
        net={net}
        line={line}
        toward={toward}
        previousStart={previousStart}
        onStartingStation={onStartingStation}
        onBack={onBack}
        random={random}
      />
    </TypingInputProvider>,
  );
}

function nativeInput(value: string) {
  const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
  fireEvent.input(input, { target: { value } });
  return input;
}

function tickAt(nextNow: number) {
  now = nextNow;
  act(() => vi.advanceTimersByTime(100));
}

const TYPING_INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];

/**
 * Types via real keydown events (routed through useKeyboard, not the mobile
 * native-input path), advancing the mocked `now` with varied intervals
 * between keystrokes so the resulting Keylog reads as human rather than
 * tripping `impossible-speed` on a flat mocked clock. Requires
 * `renderQuick({ providerEnabled: false })` so typing is not swallowed by
 * TypingInputProvider's own (untrusted) native-input path.
 */
function typeQuickAsHuman(text: string) {
  let i = 0;
  for (const ch of text) {
    now += TYPING_INTERVALS[i++ % TYPING_INTERVALS.length]!;
    fireEvent.keyDown(window, { key: ch });
  }
}

/**
 * Types `count` keydown events at a perfectly uniform interval — the
 * inhuman-consistency signature `verifyKeyLog` is built to reject. Content is
 * irrelevant (a Quick Run completes on the deadline, not on matching text),
 * so it always sends the same printable key.
 */
function typeQuickAsBot(count: number, intervalMs = 150) {
  for (let i = 0; i < count; i++) {
    now += intervalMs;
    fireEvent.keyDown(window, { key: 'a' });
  }
}

/** Reads the name currently prompted, whatever station the run is on. */
function currentStationName(): string {
  const label = screen.getByLabelText(/^Type /).getAttribute('aria-label')!;
  return label.replace(/^Type /, '');
}

function hidePage(at: number) {
  now = at;
  visibility = 'hidden';
  fireEvent(document, new Event('visibilitychange'));
}

function stat(label: string): string | null {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  now = 1_000;
  visibility = 'visible';
  phone = false;
  installBrowserState();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreProperty(window, 'matchMedia', originalMatchMedia);
  restoreProperty(window, 'visualViewport', originalVisualViewport);
  restoreProperty(window, 'innerHeight', originalInnerHeight);
  restoreProperty(document, 'visibilityState', originalVisibility);
  localStorage.clear();
});

describe('QuickRunScreen', () => {
  it('renders a ready run without starting the clock until printable input', () => {
    const onStartingStation = vi.fn();
    const { container } = renderQuick({ onStartingStation, providerEnabled: false });

    expect(screen.getByText('KL Monorail · toward Titiwangsa')).toBeTruthy();
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
    expect(screen.getByText('0:45').getAttribute('data-final')).toBe('false');
    expect(screen.queryByRole('heading', { name: /run (?:interrupted|complete)/i })).toBeNull();
    expect(onStartingStation).toHaveBeenCalledWith('kl-sentral');

    fireEvent.keyDown(window, { key: 'Shift' });
    now = 20_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('0:45')).toBeTruthy();
    expect(container.querySelector('.prompt [data-state="current"]')?.textContent).toBe('K');
  });

  it('starts on a native printable key, counts down, marks the final ten seconds, and completes at the deadline', () => {
    renderQuick();

    nativeInput('xK');
    expect(screen.getByText('0:45')).toBeTruthy();
    expect(screen.getByLabelText('Type KL Sentral').querySelector('[data-state="done"]')?.textContent).toBe('K');

    tickAt(36_000);
    const finalTimer = screen.getByText('0:10');
    expect(finalTimer.getAttribute('data-final')).toBe('true');

    tickAt(46_000);
    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.queryByText('0:00')).toBeNull();
  });

  it('releases the native input when a Quick Run completes normally', () => {
    renderQuick();
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    nativeInput('K');

    tickAt(1_000 + QUICK_RUN_MS);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it('releases the native input when a Quick Run is interrupted', () => {
    renderQuick();
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    nativeInput('K');

    hidePage(2_000);

    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it('cleans up the running interval and visibility listener on unmount', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderQuick();
    nativeInput('K');

    unmount();

    expect(clearInterval).toHaveBeenCalled();
    expect(removeEventListener.mock.calls.some(([type]) => type === 'visibilitychange')).toBe(true);
  });

  it('persists a completed station before a later interruption without changing the existing PB', () => {
    saveProfile({ ...emptyProfile(), quickBest: { MR: 999 } });
    renderQuick();

    nativeInput('KL Sentral');
    hidePage(2_000);

    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect(loadProfile().visited).toContain('kl-sentral');
    expect(loadProfile().quickBest.MR).toBe(999);
  });

  it('persists every station completed in one batched native input event', () => {
    renderQuick();

    nativeInput('KL SentralTun Sambanthan');

    expect(loadProfile().visited).toEqual(expect.arrayContaining(['kl-sentral', 'tun-sambanthan']));
  });

  it('records a strictly higher selected-line PB once and keeps the new-best label stable', () => {
    renderQuick({ providerEnabled: false });
    // At least 20 keystrokes with varied intervals: the completion effect
    // now gates the PB write on the Verdict, and a single 'K' (as before
    // Task 7) is too few keystrokes to ever verify.
    typeQuickAsHuman('KL SentralTun Sambanthan');

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(loadProfile().quickBest.MR).toBeGreaterThan(0);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('New personal best');
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('status').textContent).toBe('New personal best');
  });

  it('does not replace an equal or lower PB', () => {
    saveProfile({ ...emptyProfile(), quickBest: { MR: 999 } });
    renderQuick({ providerEnabled: false });
    typeQuickAsHuman('KL SentralTun Sambanthan');

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(loadProfile().quickBest.MR).toBe(999);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Personal best: 999');
  });

  it('includes partial characters in interrupted metrics but never unlocks the current station', () => {
    renderQuick();
    nativeInput('K');

    hidePage(2_000);

    expect(stat('WPM')).toBe('12');
    expect(stat('Stations completed')).toBe('0');
    expect(loadProfile().visited).not.toContain('kl-sentral');
  });

  it('backs out without a summary when hidden while ready', () => {
    const onBack = vi.fn();
    const { container } = renderQuick({ onBack });

    hidePage(1_000);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.quick-summary')).toBeNull();
    expect(container.querySelector('.quick-run')).toBeNull();
  });

  it('completes normally when visibility is lost at the deadline', () => {
    renderQuick();
    nativeInput('K');

    hidePage(1_000 + QUICK_RUN_MS);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Run interrupted' })).toBeNull();
  });

  it('offers phone refocus when the keyboard is closed and keeps the clock running', () => {
    phone = true;
    renderQuick();
    const hint = screen.getByRole('button', { name: 'Tap to continue typing' });
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.click(hint);
    expect(document.activeElement).toBe(input);
    nativeInput('K');
    tickAt(2_000);
    expect(screen.getByText('0:44')).toBeTruthy();

    viewport.height = 430;
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(screen.queryByRole('button', { name: 'Tap to continue typing' })).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Tap to continue typing' })).toBeTruthy();
  });

  it('never shows the refocus hint on desktop', () => {
    renderQuick();
    expect(screen.queryByRole('button', { name: 'Tap to continue typing' })).toBeNull();
  });

  it('runs again after focusing, preserving route choices and excluding the previous start', () => {
    const random = vi.fn().mockReturnValue(0);
    const onStartingStation = vi.fn();
    renderQuick({ random, onStartingStation });
    expect(onStartingStation).toHaveBeenLastCalledWith('kl-sentral');
    nativeInput('K');
    tickAt(1_000 + QUICK_RUN_MS);
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    onStartingStation.mockImplementationOnce(() => {
      expect(document.activeElement).toBe(input);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    expect(onStartingStation).toHaveBeenLastCalledWith('tun-sambanthan');
    expect(screen.getByText('KL Monorail · toward Titiwangsa')).toBeTruthy();
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
    expect(screen.getByText('0:45')).toBeTruthy();
  });

  it('records the second Quick Run of a session as its own personal best, with no integrity failure', () => {
    renderQuick({ providerEnabled: false });

    // First run: two honest stations, comfortably past the 20-keystroke floor.
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    const firstBest = loadProfile().quickBest.MR;
    expect(firstBest).toBeGreaterThan(0);
    expect(loadProfile().integrityFails ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    // Second run: more honest stations than the first, so an uncorrupted
    // recorder and replay clock produce a strictly higher score. Guards the
    // ordinary path: a second Quick Run in one session must be scored (and
    // able to beat the first run's best) on its own evidence.
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('New personal best');
    expect(loadProfile().quickBest.MR).toBeGreaterThan(firstBest!);
    expect(loadProfile().integrityFails ?? []).toHaveLength(0);
  });

  it('judges a bot-paced second Quick Run on its own Keylog rather than the first run\'s', () => {
    renderQuick({ providerEnabled: false });

    // Run 1: two honest, humanly-varied stations — establishes a real best.
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    const firstBest = loadProfile().quickBest.MR;
    expect(firstBest).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    // Run 2: uniform, bot-paced keystrokes — exactly what `inhuman-consistency`
    // exists to catch, and well past the 40-interval floor that check needs.
    // Before the fix, `runAgain` never called `recorder.reset`, so this run's
    // keystrokes were appended onto run one's still-open Keylog: the
    // consistency check then ran over the *combined* log, and run one's
    // human variance diluted run two's uniform timing below the rejection
    // threshold, letting a bot-paced run masquerade as legitimate and even
    // book a personal best.
    typeQuickAsBot(45);
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(loadProfile().quickBest.MR).toBe(firstBest);
    const fails = loadProfile().integrityFails ?? [];
    expect(fails).toHaveLength(1);
    expect(fails[0]!.mode).toBe('quick');
    expect(fails[0]!.reason).toBe('inhuman-consistency');
  });

  it('renders only the compact active play surface around the map, prompt, and timer', () => {
    const { container } = renderQuick();

    expect(container.querySelector('.quick-run .play .map-canvas')).toBeTruthy();
    expect(container.querySelector('.quick-run .prompt')).toBeTruthy();
    expect(container.querySelector('.quick-run-timer')).toBeTruthy();
    expect(container.querySelector('.mobile-bottom-nav')).toBeNull();
    expect(container.querySelector('.mobile-drawer')).toBeNull();
    expect(container.querySelector('.leaderboard-panel')).toBeNull();
    expect(screen.queryByRole('button', { name: /end/i })).toBeNull();
  });

  it('adds a fixed, non-pulsing Quick Run layout with a compact short-height variant', () => {
    expect(mobileStyles).toMatch(/\.quick-run\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(mobileStyles).toMatch(/\.quick-run \.play-panel\s*\{[^}]*max-height:\s*none;[^}]*padding:\s*var\(--s2\);[^}]*gap:\s*var\(--s\);/);
    expect(mobileStyles).toMatch(/\.quick-run-timer\[data-final='true'\][^{]*\{[^}]*color:\s*var\(--error\);[^}]*font-weight:\s*700;/);
    expect(mobileStyles).toMatch(/@media\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*500px\)[\s\S]*\.quick-run \.play-panel\s*\{[^}]*padding:\s*var\(--s\);[^}]*gap:\s*var\(--s\);/);
    expect(mobileStyles).not.toMatch(/quick-run[^}]*animation/i);
    expect(mobileStyles).not.toMatch(/quick-run[^}]*overflow(?:-[xy])?:\s*auto/i);
  });
});
