import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile, STORAGE_KEY } from '../engine/progress';
import { saveDispatchBoard, type DispatchEntry } from '../data/dispatchBoardStore';
import { music, sound } from '../audio/sound';
import { HomeMap } from './HomeMap';

const net = buildNetwork(loadNetworkData());
const noop = () => {};
const shiftEntry = (shifts: number): DispatchEntry => ({
  id: `s${shifts}`, name: 'A', score: 10 * shifts, delivered: 5, shifts, wpm: 40, accuracy: 1, playedAt: shifts, verified: true,
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

type HomeProps = Partial<React.ComponentProps<typeof HomeMap>>;

function renderHome(props: HomeProps = {}) {
  return render(
    <HomeMap
      net={net}
      theme="paper"
      onToggleTheme={noop}
      onStartLine={noop}
      onPickStation={noop}
      onOpenLeaderboard={noop}
      onOpenDispatcher={noop}
      onStartQuick={noop}
      {...props}
    />,
  );
}

const saveJourney = () =>
  saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
const press = (key: string) => fireEvent.keyDown(window, { key });
const menuKeys = () => screen.getAllByTestId('menu-key').map((k) => k.textContent);
const lineRows = () => screen.queryByRole('button', { name: /kelana jaya line/i });

describe('HomeMap', () => {
  it('renders the network map', () => {
    const { container } = renderHome();
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws the land backdrop beneath the tracks', () => {
    const { container } = renderHome();
    expect(container.querySelectorAll('.map-backdrop path').length).toBeGreaterThan(0);
  });

  it('shows three kinds of play in order', () => {
    const { container } = renderHome();
    const labels = [...container.querySelectorAll('.mode-label')].map((l) => l.textContent);
    expect(labels).toEqual(['Career', 'Challenge', 'Explore']);
    expect(screen.getByText(
      'Your first day in the control room. Keep the trains moving, fix faults before stations shut, and earn new lines one Shift at a time.',
    )).toBeTruthy();
    expect(screen.getByText('30 seconds against the clock. How fast are you today?')).toBeTruthy();
    expect(screen.getByText('Line Run & Adventure')).toBeTruthy();
    expect(screen.getByText('No clock. Ride a whole line, or roam freely and unlock stations.')).toBeTruthy();
    expect(screen.getByText('Press a number, or type a line code.')).toBeTruthy();
    expect(lineRows()).toBeNull();
  });

  it('numbers the home cards 0 to 4', () => {
    saveJourney();
    renderHome();
    // Resume sits inside the Explore card, after 3, so compare as a set.
    expect([...menuKeys()].sort()).toEqual(['0', '1', '2', '3', '4']);
  });

  it('starts a Dispatcher Career with 1', () => {
    const onOpenDispatcher = vi.fn();
    renderHome({ onOpenDispatcher });
    press('1');
    expect(onOpenDispatcher).toHaveBeenCalledTimes(1);
  });

  it('starts a Quick Run with 2', () => {
    const onStartQuick = vi.fn();
    renderHome({ onStartQuick });
    press('2');
    expect(onStartQuick).toHaveBeenCalledTimes(1);
    expect(onStartQuick).toHaveBeenCalledWith();
  });

  it('starts a Quick Run from its card', () => {
    const onStartQuick = vi.fn();
    renderHome({ onStartQuick });
    fireEvent.click(screen.getByRole('button', { name: /^2\s*Quick Run/ }));
    expect(onStartQuick).toHaveBeenCalledTimes(1);
  });

  it('opens the Leaderboard with 4', () => {
    const onOpenLeaderboard = vi.fn();
    renderHome({ onOpenLeaderboard });
    press('4');
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('opens the leaderboard by click', () => {
    const onOpenLeaderboard = vi.fn();
    renderHome({ onOpenLeaderboard });
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('ignores 9 on the home cards', () => {
    const onOpenLeaderboard = vi.fn();
    renderHome({ onOpenLeaderboard });
    press('9');
    expect(onOpenLeaderboard).not.toHaveBeenCalled();
  });

  it('opens Explore with 3, showing the seven Lines and Start anywhere', () => {
    saveJourney();
    renderHome();
    press('3');
    expect(lineRows()).toBeTruthy();
    expect(screen.getByRole('button', { name: /putrajaya line/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /start anywhere/i })).toBeTruthy();
    expect(menuKeys()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('opens Explore from its card', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: /line run & adventure/i }));
    expect(lineRows()).toBeTruthy();
  });

  it('goes back from Explore on Escape', () => {
    renderHome();
    press('3');
    press('Escape');
    expect(lineRows()).toBeNull();
    expect(screen.getByText('Line Run & Adventure')).toBeTruthy();
  });

  it('closes only the search on Escape in Explore', () => {
    renderHome();
    press('3');
    press('8');
    expect(screen.getByLabelText(/search stations/i)).toBeTruthy();
    press('Escape');
    expect(screen.queryByLabelText(/search stations/i)).toBeNull();
    expect(lineRows()).toBeTruthy();
  });

  it('starts a line run from a line chosen by click', () => {
    let got: [string, string] | null = null;
    renderHome({ onStartLine: (c, f) => (got = [c, f]) });
    press('3');
    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    press('1');
    expect(got).toEqual(['KJ', 'gombak']);
  });

  it('selects a line by its row number in Explore', () => {
    let got: [string, string] | null = null;
    renderHome({ onStartLine: (c, f) => (got = [c, f]) });
    // 3 opens Explore, 5 is its fifth row, the Monorail; then 1 picks a direction.
    press('3');
    press('5');
    press('1');
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it('starts a line run from a line chosen by typing its code', () => {
    let got: [string, string] | null = null;
    renderHome({ onStartLine: (c, f) => (got = [c, f]) });
    press('m');
    press('r');
    press('1');
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it("jumps to a Line's directions when its code is typed on the home cards, and Escape returns to Explore", () => {
    renderHome();
    press('k');
    press('j');
    expect(screen.getByText(/Kelana Jaya Line — which way\?/)).toBeTruthy();
    press('Escape');
    expect(lineRows()).toBeTruthy();
  });

  it('offers to resume a saved journey inside the Explore card', () => {
    saveJourney();
    let picked = '';
    renderHome({ onPickStation: (id) => (picked = id) });
    fireEvent.click(screen.getByRole('button', { name: /resume adventure from imbi/i }));
    expect(picked).toBe('imbi');
  });

  it('resumes from the home cards with 0', () => {
    saveJourney();
    let picked = '';
    renderHome({ onPickStation: (id) => (picked = id) });
    press('0');
    expect(picked).toBe('imbi');
  });

  it('resumes from Explore with 0', () => {
    saveJourney();
    let picked = '';
    renderHome({ onPickStation: (id) => (picked = id) });
    press('3');
    press('0');
    expect(picked).toBe('imbi');
  });

  it('ignores zero when there is no journey to resume', () => {
    let picked = '';
    renderHome({ onPickStation: (id) => (picked = id) });
    press('0');
    expect(picked).toBe('');
  });

  it('shows only the stations chip on a fresh profile', () => {
    const { container } = renderHome();
    const chips = [...container.querySelectorAll('.mode-chip')].map((c) => c.textContent);
    expect(chips).toEqual([`0 / ${net.stations.size}`]);
  });

  it('shows the Quick Run best as a chip', () => {
    saveProfile({ ...emptyProfile(), quickBestOverall: 67.6 });
    renderHome();
    expect(screen.getByText('Best · 68')).toBeTruthy();
  });

  it('shows the most Shifts completed as a chip', () => {
    saveDispatchBoard({ version: 1, entries: [shiftEntry(7), shiftEntry(3)] });
    renderHome();
    expect(screen.getByText('Best · 7 Shifts')).toBeTruthy();
  });

  it('says Shift for a single one', () => {
    saveDispatchBoard({ version: 1, entries: [shiftEntry(1)] });
    renderHome();
    expect(screen.getByText('Best · 1 Shift')).toBeTruthy();
  });

  it('shows overall station progress', () => {
    renderHome();
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    renderHome();
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem(STORAGE_KEY, 'not json {{{');
    renderHome();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an icon-only sound toggle with accessible state', () => {
    const { container } = renderHome();

    const button = screen.getByRole('button', { name: /sound on/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText(/sound on/i)).toBeNull();

    fireEvent.click(button);

    expect(screen.getByRole('button', { name: /sound off/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/sound off/i)).toBeNull();
    expect(container.querySelectorAll('button svg').length).toBeGreaterThan(0);
  });

  it('starts and stops menu music with the home screen lifecycle', () => {
    const startMenu = vi.spyOn(music, 'startMenu').mockImplementation(() => {});
    const stopMenu = vi.spyOn(music, 'stopMenu').mockImplementation(() => {});

    const { unmount } = renderHome();
    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when opening station search', () => {
    renderHome();
    press('3');
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('opens station search with its row number in Explore', () => {
    renderHome();
    press('3');
    press('8');
    expect(screen.getByLabelText(/search stations/i)).toBeTruthy();
  });

  it('leaves the row numbers inert while the search field is open', () => {
    const onPickStation = vi.fn();
    saveJourney();
    renderHome({ onPickStation });
    press('3');
    press('8');
    // A 0 typed into the station name must not resume the journey.
    press('0');
    expect(onPickStation).not.toHaveBeenCalled();
  });
});

describe('HomeMap opening', () => {
  const home = (intro?: boolean) =>
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
        intro={intro}
      />,
    );

  it('draws the network on when the page first loads', () => {
    const { container } = home(true);
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(7);
    expect(container.querySelector('.home-map')?.getAttribute('data-intro')).toBe('true');
  });

  it('shows the map already drawn when the opening has played', () => {
    const { container } = home(false);
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(0);
    expect(container.querySelector('.home-map')?.getAttribute('data-intro')).toBe(null);
  });

  it('lets an impatient player skip the opening with a keypress', () => {
    const { container } = home(true);
    fireEvent.keyDown(window, { key: 'q' });
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(0);
  });

  it('lets an impatient player skip the opening with a click', () => {
    const { container } = home(true);
    fireEvent.pointerDown(window);
    expect(container.querySelectorAll('polyline[data-draw]')).toHaveLength(0);
  });
});

describe('HomeMap under StrictMode', () => {
  it('plays the opening even though React renders the component twice', async () => {
    // A fresh module registry, because the intro is spent once per page load
    // and the renders above have already spent this file's copy.
    vi.resetModules();
    const { HomeMap: Fresh } = await import('./HomeMap');

    // StrictMode double-invokes state initialisers to surface impure ones.
    // Consuming the one-per-load intro in an initialiser is exactly that:
    // the second invocation finds it already spent and the map appears
    // fully drawn, in development only.
    const { container } = render(
      <StrictMode>
        <Fresh
          net={net}
          theme="paper"
          onToggleTheme={noop}
          onStartLine={noop}
          onPickStation={noop}
          onOpenLeaderboard={noop}
        />
      </StrictMode>,
    );
    expect(container.querySelector('.home-map')?.getAttribute('data-intro')).toBe('true');
  });
});
