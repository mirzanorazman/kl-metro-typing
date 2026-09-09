import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { App } from './App';

const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

// jsdom does not implement matchMedia at all (undefined by default — see
// resolveTheme's optional-chaining guard in App.tsx). One test below stubs it
// permanently to skip an animation delay; restore that original value after
// every test so it cannot leak into the atmosphere tests that follow.
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('App', () => {
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

  it('takes a completed line run all the way to a visible leaderboard entry', () => {
    // Skips the 1.1s post-completion celebration delay so the summary (and
    // its leaderboard panel) appears synchronously — see LineRunScreen.test.tsx.
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

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
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

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
