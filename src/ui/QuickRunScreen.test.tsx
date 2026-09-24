import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from '../engine/network';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { QUICK_RUN_MS } from '../engine/quickRun';
import * as replay from '../engine/replay';
import * as geoFit from '../geo/fit';
import { lineExtent } from '../geo/networkLayout';
import * as mapRendering from '../render/MapCanvas';
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
let reducedMotion = false;
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
    value: vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : phone,
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
  strict = false,
  phoneLandscape = false,
}: {
  line?: LineCode;
  toward?: string;
  previousStart?: string | null;
  onStartingStation?: (id: string) => void;
  onBack?: () => void;
  random?: () => number;
  providerEnabled?: boolean;
  strict?: boolean;
  phoneLandscape?: boolean;
} = {}) {
  const content = (
    <TypingInputProvider enabled={providerEnabled}>
      <QuickRunScreen
        net={net}
        line={line}
        toward={toward}
        previousStart={previousStart}
        onStartingStation={onStartingStation}
        onBack={onBack}
        random={random}
        phoneLandscape={phoneLandscape}
      />
    </TypingInputProvider>
  );
  const rendered = render(strict ? <StrictMode>{content}</StrictMode> : content);
  return {
    ...rendered,
    rotate: (landscape: boolean) => {
      const rotated = (
        <TypingInputProvider enabled={providerEnabled}>
          <QuickRunScreen net={net} line={line} toward={toward} previousStart={previousStart}
            onStartingStation={onStartingStation} onBack={onBack} random={random}
            phoneLandscape={landscape} />
        </TypingInputProvider>
      );
      rendered.rerender(strict ? <StrictMode>{rotated}</StrictMode> : rotated);
    },
  };
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

function typeToFirstJump(type = typeQuickAsHuman) {
  // The last eligible MR start, Raja Chulan, is four advances from Titiwangsa.
  for (let station = 0; station < 5; station++) type(currentStationName());
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
  reducedMotion = false;
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
  it('cancels a ready run on phone rotation without a result or retained input', () => {
    const onBack = vi.fn();
    const { rotate, container } = renderQuick({ onBack, strict: true });
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    const save = vi.spyOn(Storage.prototype, 'setItem');

    rotate(true);
    rotate(true);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.body);
    expect(container.querySelector('.quick-run, .quick-summary')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('interrupts running play once, releases input, and reveals the frozen result in portrait', () => {
    saveProfile({ ...emptyProfile(), quickBestOverall: 100 });
    const { rotate } = renderQuick({ strict: true });
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    nativeInput('KL SentralT');
    const save = vi.spyOn(Storage.prototype, 'setItem');
    now = 2_000;

    rotate(true);
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    expect(screen.queryByLabelText(/^Type /)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Run interrupted' })).toBeNull();
    expect(document.activeElement).toBe(document.body);
    nativeInput('un Sambanthan');
    tickAt(60_000);
    rotate(true);
    rotate(false);

    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect(stat('Stations completed')).toBe('1');
    expect(stat('WPM')).toBe('132');
    expect(loadProfile().visited).not.toContain('tun-sambanthan');
    expect(loadProfile().quickBestOverall).toBe(100);
    expect(save).not.toHaveBeenCalled();

    rotate(true);
    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run again' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(screen.queryByLabelText(/^Type /)).toBeNull();
  });

  it('keeps an already completed summary visible and blocks Run again in phone landscape', () => {
    const { rotate } = renderQuick();
    nativeInput('K');
    tickAt(1_000 + QUICK_RUN_MS);
    const save = vi.spyOn(Storage.prototype, 'setItem');

    rotate(true);
    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.getByText('Rotate to portrait to play')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run again' }) as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
    rotate(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(screen.getByLabelText(/^Type /)).toBeTruthy();
  });

  it('renders each ordinary keystroke on the map without a stale render or a mirrored-state render', () => {
    const map = vi.spyOn(mapRendering, 'MapCanvas');
    renderQuick();
    map.mockClear();

    nativeInput('K');

    expect(map.mock.calls.map(([props]) => props.trainProgress)).toEqual([0.1]);
    map.mockClear();
    nativeInput('L');
    expect(map.mock.calls.map(([props]) => props.trainProgress)).toEqual([0.2]);
  });

  it('keeps the departing map mounted until the fade midpoint', () => {
    const random = vi.fn().mockReturnValueOnce(0.999).mockReturnValue(0);
    const { container } = renderQuick({ random, providerEnabled: false });
    for (let station = 0; station < 4; station++) typeQuickAsHuman(currentStationName());
    typeQuickAsHuman('Titiwangs');
    const departingMap = container.querySelector('.map-canvas');

    typeQuickAsHuman('a');
    expect(container.querySelector('.map-canvas')).toBe(departingMap);
    expect(container.querySelector('.quick-run-map')?.getAttribute('data-phase')).toBe('out');
    act(() => vi.advanceTimersByTime(99));
    expect(container.querySelector('.map-canvas')).toBe(departingMap);
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.map-canvas')).not.toBe(departingMap);
    expect(container.querySelector('.quick-run-map')?.getAttribute('data-phase')).toBe('in');
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('.quick-run-map')?.getAttribute('data-jumping')).toBe('false');
  });

  it('consumes each jump draw once under StrictMode when a native batch crosses the Terminus', () => {
    const random = vi.fn().mockReturnValue(0.999);
    const replayer = vi.spyOn(replay, 'replayQuickRun');
    renderQuick({ random, strict: true });
    random.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.999);

    nativeInput('Raja ChulanBukit NanasMedan TuankuChow KitTitiwangsaG');

    expect(random).toHaveBeenCalledTimes(2);
    expect(currentStationName()).toBe('Gombak');
    expect(screen.getByLabelText('Type Gombak').querySelector('[data-state="done"]')?.textContent).toBe('G');
    expect(loadProfile().visited).toEqual(expect.arrayContaining(['raja-chulan', 'titiwangsa']));
    tickAt(now + QUICK_RUN_MS);
    expect(stat('Stations completed')).toBe('5');
    expect(replayer).toHaveBeenCalledTimes(1);
    expect(replayer.mock.calls[0]![1].trace.legs).toEqual([
      { line: 'MR', at: 'raja-chulan', toward: 'titiwangsa' },
      { line: 'KJ', at: 'gombak', toward: 'putra-heights' },
    ]);
    expect(replayer.mock.results[0]!.value?.complete).toBe(true);
  });

  it('samples integer live metrics once per second without refreshing on keystrokes', () => {
    renderQuick();
    nativeInput('xK');
    now = 1_499;
    act(() => vi.advanceTimersByTime(499));
    nativeInput('L');
    now = 1_999;
    act(() => vi.advanceTimersByTime(500));

    expect(stat('WPM')).toBe('—');
    expect(stat('Accuracy')).toBe('—');

    now = 2_000;
    act(() => vi.advanceTimersByTime(1));
    expect(stat('WPM')).toBe('24');
    expect(stat('Accuracy')).toBe('67%');

    nativeInput(' ');
    now = 2_999;
    act(() => vi.advanceTimersByTime(999));
    expect(stat('WPM')).toBe('24');
    expect(stat('Accuracy')).toBe('67%');

    now = 3_000;
    act(() => vi.advanceTimersByTime(1));
    expect(stat('WPM')).toBe('18');
    expect(stat('Accuracy')).toBe('75%');
  });

  it('changes jump context immediately and accepts input while the map fades and reframes', () => {
    const random = vi.fn().mockReturnValueOnce(0.999).mockReturnValue(0);
    const map = vi.spyOn(mapRendering, 'MapCanvas');
    const { container } = renderQuick({ random, providerEnabled: false });
    typeToFirstJump();

    expect(random).toHaveBeenCalledTimes(3);
    expect(screen.getByText('KJ · Kelana Jaya Line · toward Putra Heights')).toBeTruthy();
    expect(screen.getByLabelText('Type Gombak')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Jumped to KJ · Gombak');
    expect(container.querySelector('.quick-run-map')?.getAttribute('data-jumping')).toBe('true');

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByText('Jumped to KJ · Gombak')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'G' });
    expect(screen.queryByText('Jumped to KJ · Gombak')).toBeNull();
    expect(screen.getByLabelText('Type Gombak').querySelector('[data-state="done"]')?.textContent).toBe('G');

    act(() => vi.advanceTimersByTime(99));
    expect(container.querySelector('[data-station="titiwangsa"]')?.getAttribute('data-active')).toBe('true');
    act(() => vi.advanceTimersByTime(1));
    const mapProps = map.mock.calls[map.mock.calls.length - 1]![0];
    expect(mapProps.emphasis).toBe('KJ');
    expect(mapProps.trainColour).toBe(net.lines.get('KJ')!.colour);
    expect(mapProps.fitTo).toEqual(lineExtent(net.lines.get('KJ')!.stations));
    expect(mapProps.fitKey).toBe('quick:KJ:1');
    expect(mapProps.previousStation).toBeNull();
    expect(mapProps.travelled).toEqual(['gombak']);
    expect(container.querySelector('.track-done')).toBeNull();
    expect(container.querySelector('[data-line="MR"]')?.getAttribute('data-dim')).toBe('true');
    expect(container.querySelector('.play-panel')?.getAttribute('style')).toContain(net.lines.get('KJ')!.colour);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByLabelText('Type Gombak')).toBeTruthy();
  });

  it('reframes jumps instantly with reduced motion while retaining the announcement', () => {
    reducedMotion = true;
    const random = vi.fn().mockReturnValueOnce(0.999).mockReturnValue(0);
    const { container } = renderQuick({ random, providerEnabled: false });
    typeToFirstJump();

    expect(screen.getByText('Jumped to KJ · Gombak')).toBeTruthy();
    expect(container.querySelector('[data-station="gombak"]')?.getAttribute('data-active')).toBe('true');
    expect(container.querySelector('.quick-run-map')?.getAttribute('data-jumping')).toBe('false');
    expect(container.querySelector('.track-done')).toBeNull();
  });

  it('persists Stations from both legs before interruption without saving a personal best', () => {
    const random = vi.fn().mockReturnValueOnce(0.999).mockReturnValue(0);
    saveProfile({ ...emptyProfile(), quickBestOverall: 1, quickBest: { MR: 999 } });
    renderQuick({ random, providerEnabled: false });
    typeToFirstJump();
    typeQuickAsHuman('Gombak');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    hidePage(now + 100);
    tickAt(now + QUICK_RUN_MS);

    expect(stat('Lines used')).toBe('MR → KJ');
    expect(stat('Stations completed')).toBe('6');
    expect(loadProfile().visited).toEqual(expect.arrayContaining(['raja-chulan', 'titiwangsa', 'gombak']));
    expect(loadProfile().quickBestOverall).toBe(1);
    expect(loadProfile().quickBest).toEqual({ MR: 999 });
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
  });

  it('frames one Station behind and two ahead of the active leg in either Direction', () => {
    const follow = vi.spyOn(geoFit, 'followPoints');
    renderQuick({ toward: 'kl-sentral', random: () => 0.999 });

    const positions = lineExtent([...net.lines.get('MR')!.stations].reverse());
    expect(follow).toHaveBeenLastCalledWith(positions, 0, { behind: 1, ahead: 2 });
  });

  it('replays jumped evidence and resets the leg trace, log, metrics, and announcement on Run again', () => {
    const replayer = vi.spyOn(replay, 'replayQuickRun');
    const random = vi.fn().mockReturnValueOnce(0.999).mockReturnValue(0);
    renderQuick({ random, providerEnabled: false });
    typeToFirstJump();
    tickAt(now + QUICK_RUN_MS);

    expect(stat('Lines used')).toBe('MR → KJ');
    expect(loadProfile().quickBestOverall).toBeGreaterThan(0);
    const first = replayer.mock.calls[0]![1];
    expect(first.trace.legs.map((leg) => leg.line)).toEqual(['MR', 'KJ']);
    const firstBest = loadProfile().quickBestOverall;

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(screen.getByText('MR · KL Monorail · toward Titiwangsa')).toBeTruthy();
    expect(currentStationName()).toBe('KL Sentral');
    expect(stat('WPM')).toBe('—');
    expect(stat('Accuracy')).toBe('—');
    expect(screen.queryByText(/Jumped to/)).toBeNull();
    typeQuickAsHuman('KL SentralTun Sambanthan');
    tickAt(now + QUICK_RUN_MS);

    const second = replayer.mock.calls[1]![1];
    expect(second.keylog.t0).toBeGreaterThan(first.keylog.t0);
    expect(second.keylog.events.map((event) => event.k).join('')).toBe('KL SentralTun Sambanthan');
    expect(second.trace.legs).toEqual([{ line: 'MR', at: 'kl-sentral', toward: 'titiwangsa' }]);
    expect(loadProfile().integrityFails ?? []).toHaveLength(0);
    expect(loadProfile().quickBestOverall).toBe(firstBest);
    expect(screen.getByRole('status').textContent).toBe(`Personal best: ${Math.round(firstBest!)}`);
  });

  it.each([null, { complete: false, stationsCompleted: 0, metrics: { wpm: 0, accuracy: 1, score: 0 } }])(
    'rejects failed replay evidence without replacing the overall best', (replayed) => {
      saveProfile({ ...emptyProfile(), quickBestOverall: 2, quickBest: { MR: 999 } });
      vi.spyOn(replay, 'replayQuickRun').mockReturnValue(replayed);
      renderQuick({ providerEnabled: false });
      typeQuickAsHuman('KL SentralTun Sambanthan');
      tickAt(now + QUICK_RUN_MS);

      expect(loadProfile().quickBestOverall).toBe(2);
      expect(loadProfile().quickBest).toEqual({ MR: 999 });
      expect(loadProfile().integrityFails?.[0]?.reason).toBe('malformed-log');
      expect(screen.getByRole('status').textContent).toBe('Personal best: 2');
    },
  );
  it('renders a ready run without starting the clock until printable input', () => {
    const onStartingStation = vi.fn();
    const { container } = renderQuick({ onStartingStation, providerEnabled: false });

    expect(screen.getByText('MR · KL Monorail · toward Titiwangsa')).toBeTruthy();
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
    expect(screen.getByText('0:30').getAttribute('data-final')).toBe('false');
    expect(stat('WPM')).toBe('—');
    expect(stat('Accuracy')).toBe('—');
    expect(screen.queryByRole('heading', { name: /run (?:interrupted|complete)/i })).toBeNull();
    expect(onStartingStation).toHaveBeenCalledWith('kl-sentral');

    fireEvent.keyDown(window, { key: 'Shift' });
    now = 20_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('0:30')).toBeTruthy();
    expect(stat('WPM')).toBe('—');
    expect(stat('Accuracy')).toBe('—');
    expect(container.querySelector('.prompt [data-state="current"]')?.textContent).toBe('K');
  });

  it('starts on a native printable key, counts down, marks the final ten seconds, and completes at the deadline', () => {
    renderQuick();

    nativeInput('xK');
    expect(screen.getByText('0:30')).toBeTruthy();
    expect(screen.getByLabelText('Type KL Sentral').querySelector('[data-state="done"]')?.textContent).toBe('K');

    tickAt(21_000);
    const finalTimer = screen.getByText('0:10');
    expect(finalTimer.getAttribute('data-final')).toBe('true');

    tickAt(31_000);
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
    saveProfile({ ...emptyProfile(), quickBest: { MR: 999 }, quickBestOverall: 500 });
    renderQuick();

    nativeInput('KL Sentral');
    hidePage(2_000);

    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect(loadProfile().visited).toContain('kl-sentral');
    expect(loadProfile().quickBest.MR).toBe(999);
    expect(loadProfile().quickBestOverall).toBe(500);
  });

  it('persists every station completed in one batched native input event', () => {
    renderQuick();

    nativeInput('KL SentralTun Sambanthan');

    expect(loadProfile().visited).toEqual(expect.arrayContaining(['kl-sentral', 'tun-sambanthan']));
  });

  it('records a strictly higher overall PB once and leaves legacy bests untouched', () => {
    saveProfile({ ...emptyProfile(), quickBest: { MR: 999 } });
    renderQuick({ providerEnabled: false });
    // At least 20 keystrokes with varied intervals: the completion effect
    // now gates the PB write on the Verdict, and a single 'K' (as before
    // Task 7) is too few keystrokes to ever verify.
    typeQuickAsHuman('KL SentralTun Sambanthan');

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(loadProfile().quickBestOverall).toBeGreaterThan(0);
    expect(loadProfile().quickBest).toEqual({ MR: 999 });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('New personal best');
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('status').textContent).toBe('New personal best');
  });

  it('does not replace an equal or lower PB', () => {
    saveProfile({ ...emptyProfile(), quickBest: { MR: 42 }, quickBestOverall: 999 });
    renderQuick({ providerEnabled: false });
    typeQuickAsHuman('KL SentralTun Sambanthan');

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(loadProfile().quickBestOverall).toBe(999);
    expect(loadProfile().quickBest.MR).toBe(42);
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
    expect(screen.getByText('0:29')).toBeTruthy();

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
    expect(screen.getByText('MR · KL Monorail · toward Titiwangsa')).toBeTruthy();
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
    expect(screen.getByText('0:30')).toBeTruthy();
  });

  it('records the second Quick Run of a session as its own personal best, with no integrity failure', () => {
    renderQuick({ providerEnabled: false });

    // First run: two honest stations, comfortably past the 20-keystroke floor.
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    const firstBest = loadProfile().quickBestOverall;
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
    expect(loadProfile().quickBestOverall).toBeGreaterThan(firstBest!);
    expect(loadProfile().integrityFails ?? []).toHaveLength(0);
  });

  it('judges a bot-paced second Quick Run on its own Keylog rather than the first run\'s', () => {
    renderQuick({ providerEnabled: false });

    // Run 1: two honest, humanly-varied stations — establishes a real best.
    typeQuickAsHuman(currentStationName());
    typeQuickAsHuman(currentStationName());
    tickAt(now + QUICK_RUN_MS + 5_000);

    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    const firstBest = loadProfile().quickBestOverall;
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
    expect(loadProfile().quickBestOverall).toBe(firstBest);
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
    expect(mobileStyles).toMatch(/\.quick-run-map\[data-phase='out'\]\s*\{[^}]*animation:\s*quick-jump-out\s*100ms/);
    expect(mobileStyles).toMatch(/\.quick-run-map\[data-phase='in'\]\s*\{[^}]*animation:\s*quick-jump-in\s*100ms/);
    expect(mobileStyles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.quick-run-map\[data-jumping='true'\]\s*\{\s*animation:\s*none;/);
    expect(mobileStyles).not.toMatch(/quick-run-timer[^}]*animation/i);
    expect(mobileStyles).not.toMatch(/quick-run[^}]*overflow(?:-[xy])?:\s*auto/i);
  });
});
