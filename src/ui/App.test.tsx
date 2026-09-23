import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { App } from './App';
import * as transit from './MobileTransit';
import * as adventureSetup from './MobileAdventureSetup';

// jsdom cannot produce a trusted keyboard event (see TypingInputProvider.test.tsx),
// so a dispatched keydown always reports `isTrusted: false`. The end-to-end
// leaderboard test below needs to simulate a legitimate, trusted player run,
// which no fireEvent option can achieve — isTrusted is a non-configurable own
// property jsdom sets at construction. Wrapping useKeyboard here is the
// standard escape hatch for an untestable browser primitive (the same reason
// this file already mocks `window.matchMedia`); every other behaviour of
// useKeyboard is preserved unchanged.
vi.mock('./useKeyboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useKeyboard')>();
  return {
    ...actual,
    useKeyboard: (onKey: Parameters<typeof actual.useKeyboard>[0], active?: boolean) =>
      actual.useKeyboard((key, source) => onKey(key, { ...source, trusted: true }), active),
  };
});

const TYPING_INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];

/**
 * Types with a mocked, varying clock so the resulting Keylog reads as human:
 * a real fireEvent-driven loop executes fast enough that consecutive
 * `performance.now()` reads round to the same millisecond, which trips
 * `impossible-speed` regardless of trust.
 */
function typeAsHuman(text: string, clock: { now: number }) {
  let i = 0;
  for (const ch of text) {
    clock.now += TYPING_INTERVALS[i++ % TYPING_INTERVALS.length]!;
    fireEvent.keyDown(window, { key: ch });
  }
}

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

// jsdom does not implement matchMedia at all (undefined by default — see
// resolveTheme's optional-chaining guard in App.tsx). App tests install a
// desktop or phone result explicitly, then restore the original value.
const originalMatchMedia = window.matchMedia;
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

let phoneMedia: { matches: boolean; listeners: Set<EventListener> } | null = null;

function installMatchMedia(matches: boolean, phoneMatches = matches) {
  window.matchMedia = ((q: string) => ({
    get matches() {
      return q.includes('max-width: 700px') || q.includes('pointer: coarse')
        ? phoneMedia?.matches ?? phoneMatches
        : matches;
    },
    media: q,
    onchange: null,
    addEventListener: (_type: string, listener: EventListener) => {
      if (q.includes('max-width: 700px') || q.includes('pointer: coarse')) {
        phoneMedia?.listeners.add(listener);
      }
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      phoneMedia?.listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  phoneMedia = { matches: phoneMatches, listeners: new Set() };
}

function setPhoneLayout(matches: boolean) {
  if (!phoneMedia) throw new Error('matchMedia not installed');
  phoneMedia.matches = matches;
  for (const listener of phoneMedia.listeners) listener(new Event('change'));
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

function installVisualViewport(initialHeight: number) {
  let height = initialHeight;
  const viewport = new EventTarget() as EventTarget & { height: number };
  Object.defineProperty(viewport, 'height', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  return {
    setHeight(nextHeight: number) { height = nextHeight; },
    dispatch(type: 'resize' | 'scroll') { viewport.dispatchEvent(new Event(type)); },
  };
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  Element.prototype.scrollIntoView = () => {};
  setViewport(390, 844);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
  if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport);
  else delete (window as unknown as Record<string, unknown>).visualViewport;
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
  else delete (Element.prototype as Partial<Element>).scrollIntoView;
  phoneMedia = null;
});

describe('App', () => {
  beforeEach(() => installMatchMedia(false));

  it('keeps phone navigation available while landscape disables all play starts', () => {
    installMatchMedia(true);
    setViewport(844, 390);
    render(<App />);

    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    for (const name of ['Start 45s Quick Run', 'Full Line Run']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search stations' }), { target: { value: 'Imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /^Imbi/ }));
    expect((screen.getByRole('button', { name: 'Start Adventure' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));
    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Transit' }));
    act(() => setViewport(390, 844));
    expect((screen.getByRole('button', { name: 'Start 45s Quick Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses stale and programmatic start callbacks after rotating to landscape', () => {
    installMatchMedia(true);
    const transitRender = vi.spyOn(transit, 'MobileTransit');
    const adventureRender = vi.spyOn(adventureSetup, 'MobileAdventureSetup');
    render(<App />);
    const { onStartQuick, onStartLine } = transitRender.mock.calls[transitRender.mock.calls.length - 1]![0];
    fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
    const { onStart } = adventureRender.mock.calls[adventureRender.mock.calls.length - 1]![0];
    act(() => setViewport(844, 390));

    for (const start of [() => onStartQuick('MR', 'titiwangsa'), () => onStartLine('MR', 'kl-sentral'), () => onStart('imbi')]) {
      act(start);
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
      expect(screen.queryByLabelText(/^Type /)).toBeNull();
    }
  });

  it('cancels a ready Quick Run to Transit on rotation without a summary', () => {
    installMatchMedia(true);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 45s Quick Run' }));
    act(() => setViewport(844, 390));

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    expect(screen.queryByRole('heading', { name: /run interrupted/i })).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('removes the landscape typing input and restores native typing after returning to portrait', () => {
    installMatchMedia(true);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 45s Quick Run' }));
    const originalInput = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    expect(document.activeElement).toBe(originalInput);

    act(() => setViewport(844, 390));
    expect(screen.queryByRole('textbox', { name: 'Typing input for Station name' })).toBeNull();
    act(() => originalInput.focus());
    expect(document.activeElement).toBe(document.body);

    act(() => setViewport(390, 844));
    const restoredInput = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    expect(restoredInput).not.toBe(originalInput);
    fireEvent.click(screen.getByRole('button', { name: 'Start 45s Quick Run' }));
    expect(document.activeElement).toBe(restoredInput);
    const prompt = screen.getByLabelText(/^Type /);
    const firstCharacter = prompt.getAttribute('aria-label')!.replace(/^Type /, '')[0];
    fireEvent.input(restoredInput, { target: { value: firstCharacter } });
    expect(screen.getByLabelText(/^Type /).querySelector('[data-state="done"]')?.textContent).toBe(firstCharacter);
  });

  it.each(['Quick', 'Line', 'Adventure'])('passes the landscape gate to an active %s Run', (mode) => {
    installMatchMedia(true);
    render(<App />);
    if (mode === 'Adventure') {
      fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search stations' }), { target: { value: 'Imbi' } });
      fireEvent.click(screen.getByRole('button', { name: /^Imbi/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Start Adventure' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: mode === 'Quick' ? 'Start 45s Quick Run' : 'Full Line Run' }));
    }
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    fireEvent.input(input, { target: { value: 'a' } });
    act(() => setViewport(844, 390));
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    expect(screen.queryByLabelText(/^Type /)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    act(() => input.focus());
    expect(document.activeElement).toBe(document.body);
    act(() => setViewport(390, 844));
    expect(screen.getByRole('heading', { name: mode === 'Quick' ? 'Run interrupted' : 'Journey complete' })).toBeTruthy();
  });

  it.each([[1024, 768], [1512, 982]])('allows desktop/tablet play in landscape at %sx%s', (width, height) => {
    setViewport(width, height);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getByRole('button', { name: '45s Quick Run toward Titiwangsa' }));
    fireEvent.keyDown(window, { key: 'K' });
    expect(screen.getByLabelText(/^Type /)).toBeTruthy();
    expect(screen.queryByText('Rotate to portrait to play')).toBeNull();
  });

  it('opens on the map', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('starts a line run from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('starts an adventure from a searched station', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /^imbi/i }));
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the leaderboard from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeTruthy();
  });

  it('starts a desktop quick run from the home direction picker', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getByRole('button', { name: '45s Quick Run toward Titiwangsa' }));

    expect(document.querySelector('.quick-run')).toBeTruthy();
    expect(screen.getByText(/KL Monorail · toward/i)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });

  it('bounds an active phone run to the live visual viewport height', () => {
    installMatchMedia(true);
    const viewport = installVisualViewport(700);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Start 45s Quick Run' }));

    const frame = document.querySelector('.mobile-run-frame') as HTMLElement;
    expect(frame.style.height).toBe('700px');

    act(() => {
      viewport.setHeight(430);
      viewport.dispatch('resize');
    });
    expect(frame.style.height).toBe('430px');

    act(() => {
      viewport.setHeight(390);
      viewport.dispatch('scroll');
    });
    expect(frame.style.height).toBe('390px');
  });

  it('preserves an active quick run across both phone breakpoint transitions', () => {
    installMatchMedia(false);
    installVisualViewport(700);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getByRole('button', { name: '45s Quick Run toward Titiwangsa' }));
    fireEvent.keyDown(window, { key: 'K' });

    const prompt = screen.getByLabelText('Type KL Sentral');
    expect(prompt.querySelector('[data-state="done"]')?.textContent).toBe('K');
    const timer = screen.getByText('0:30', { selector: '.quick-run-timer' }).textContent;

    act(() => setPhoneLayout(true));
    expect((document.querySelector('.mobile-run-frame') as HTMLElement).style.height).toBe('700px');
    expect(screen.getByLabelText('Type KL Sentral').querySelector('[data-state="done"]')?.textContent).toBe('K');
    expect(screen.getByText('0:30', { selector: '.quick-run-timer' }).textContent).toBe(timer);

    act(() => setPhoneLayout(false));
    expect(document.querySelector('.mobile-run-frame')).toBeNull();
    expect(screen.getByLabelText('Type KL Sentral').querySelector('[data-state="done"]')?.textContent).toBe('K');
    expect(screen.getByText('0:30', { selector: '.quick-run-timer' }).textContent).toBe(timer);

    act(() => setPhoneLayout(true));
    expect((document.querySelector('.mobile-run-frame') as HTMLElement).style.height).toBe('700px');
    expect(screen.getByLabelText('Type KL Sentral').querySelector('[data-state="done"]')?.textContent).toBe('K');
    expect(screen.getByText('0:30', { selector: '.quick-run-timer' }).textContent).toBe(timer);
  });

  it('starts phone home in Transit without the desktop line picker', () => {
    installMatchMedia(true);
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start 45s Quick Run' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start anywhere/i })).toBeNull();
  });

  it('switches between phone destinations and embeds ranking without Back', () => {
    installMatchMedia(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
    expect(screen.getByRole('textbox', { name: 'Search stations' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));
    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /back to the map/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Transit' }));
    expect(screen.getByRole('button', { name: 'Start 45s Quick Run' })).toBeTruthy();
  });

  it('returns a phone adventure setup to the desktop home when the layout widens', () => {
    installMatchMedia(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
    expect(screen.getByRole('textbox', { name: 'Search stations' })).toBeTruthy();

    act(() => setPhoneLayout(false));

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(document.querySelector('.home-map')).toBeTruthy();
  });

  it('moves a desktop leaderboard into the phone ranking shell and back', () => {
    installMatchMedia(false);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByRole('button', { name: /back to the map/i })).toBeTruthy();

    act(() => setPhoneLayout(true));

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ranking' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: /back to the map/i })).toBeNull();

    act(() => setPhoneLayout(false));

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(document.querySelector('.home-map')).toBeTruthy();
  });

  it('hides phone navigation during a quick run and restores Transit on back', () => {
    installMatchMedia(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Start 45s Quick Run' }));
    expect(document.querySelector('.quick-run')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();

    setVisibility('hidden');
    fireEvent(document, new Event('visibilitychange'));

    expect(document.querySelector('.quick-run')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start 45s Quick Run' })).toBeTruthy();
  });

  it('retains the latest quick-run starting station for the next run', () => {
    installMatchMedia(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getByRole('button', { name: '45s Quick Run toward Titiwangsa' }));
    for (const key of 'KL Sentral') fireEvent.keyDown(window, { key });
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();

    setVisibility('hidden');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(screen.getByRole('button', { name: /back to transit/i }));

    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getByRole('button', { name: '45s Quick Run toward Titiwangsa' }));

    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
  });

  it('takes a completed line run all the way to a visible leaderboard entry', () => {
    // Skips the 1.1s post-completion celebration delay so the summary (and
    // its leaderboard panel) appears synchronously — see LineRunScreen.test.tsx.
    installMatchMedia(true, false);

    const clock = { now: 0 };
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });

    for (const name of MR_ROUTE_FROM_KL_SENTRAL) typeAsHuman(name, clock);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));

    expect(screen.getByText('Ali')).toBeTruthy();
  });
});

describe('atmosphere', () => {
  it('follows the OS when the player has never chosen', () => {
    // jsdom's matchMedia always reports no match, so this is the light branch.
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('paper');
  });

  it('honours a stored choice over the OS', () => {
    saveProfile({ ...emptyProfile(), theme: 'midnight' });
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });

  it('follows the OS into midnight when it reports a dark preference', () => {
    // Same stub pattern as the completed-run test above: jsdom never
    // implements matchMedia, so this exercises resolveTheme's other branch —
    // the one the "follows the OS" test above cannot reach, because jsdom's
    // undefined matchMedia always resolves to the light branch. Restored by
    // the shared afterEach so it cannot leak into a later test.
    installMatchMedia(true, false);

    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });

  it('toggling the theme persists the choice without disturbing the rest of the profile', () => {
    // `muted` stands in for "the rest of the profile": a field that has
    // nothing to do with theme, so it only survives if toggleTheme spreads
    // the freshly-loaded profile rather than writing a bare { theme } record.
    saveProfile({ ...emptyProfile(), muted: true });
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('paper');

    fireEvent.click(screen.getByRole('button', { name: /switch to midnight/i }));

    expect(document.documentElement.dataset.theme).toBe('midnight');
    const saved = loadProfile();
    expect(saved.theme).toBe('midnight');
    expect(saved.muted).toBe(true);
  });
});

describe('the opening animation', () => {
  it('draws the network on when the app first opens', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.home-map')?.getAttribute('data-intro')).toBe('true');
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(7);
  });

  it('does not replay on the way back from another screen', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    expect(container.querySelector('.home-map')?.getAttribute('data-intro')).toBe(null);
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(0);
  });
});
