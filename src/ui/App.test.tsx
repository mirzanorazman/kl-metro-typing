import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { App } from './App';

const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

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
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport);
  else delete (window as unknown as Record<string, unknown>).visualViewport;
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
  else delete (Element.prototype as Partial<Element>).scrollIntoView;
  phoneMedia = null;
});

describe('App', () => {
  beforeEach(() => installMatchMedia(false));

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
    fireEvent.click(screen.getAllByRole('button', { name: '45s Quick Run' })[0]!);

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
    fireEvent.click(screen.getAllByRole('button', { name: '45s Quick Run' })[0]!);
    for (const key of 'KL Sentral') fireEvent.keyDown(window, { key });
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();

    setVisibility('hidden');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(screen.getByRole('button', { name: /back to transit/i }));

    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.click(screen.getAllByRole('button', { name: '45s Quick Run' })[0]!);

    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
  });

  it('takes a completed line run all the way to a visible leaderboard entry', () => {
    // Skips the 1.1s post-completion celebration delay so the summary (and
    // its leaderboard panel) appears synchronously — see LineRunScreen.test.tsx.
    installMatchMedia(true, false);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });

    for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);

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
