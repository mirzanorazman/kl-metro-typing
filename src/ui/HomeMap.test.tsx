import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile, STORAGE_KEY } from '../engine/progress';
import { music, sound } from '../audio/sound';
import { HomeMap } from './HomeMap';

const net = buildNetwork(loadNetworkData());
const noop = () => {};
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeMap', () => {
  it('renders the network map', () => {
    const { container } = render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws the land backdrop beneath the tracks', () => {
    const { container } = render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    expect(container.querySelectorAll('.map-backdrop path').length).toBeGreaterThan(0);
  });

  it('starts a line run from a line chosen by click', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={(c, f) => (got = [c, f])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['KJ', 'gombak']);
  });

  it('starts a quick run with the selected line and direction', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onStartQuick={(code, toward) => (got = [code, toward])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    fireEvent.click(screen.getAllByRole('button', { name: '45s Quick Run' })[0]!);

    expect(got).toEqual(['KJ', 'putra-heights']);
  });

  it('starts a line run from a line chosen by typing its code', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={(c, f) => (got = [c, f])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it('offers to resume a saved journey', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    let picked = '';
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={(id) => (picked = id)}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(picked).toBe('imbi');
  });

  it('shows overall station progress', () => {
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem(STORAGE_KEY, 'not json {{{');
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an icon-only sound toggle with accessible state', () => {
    const { container } = render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );

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

    const { unmount } = render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );

    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when opening station search', () => {
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});

    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));

    expect(select).toHaveBeenCalledTimes(1);
  });

  it('opens the leaderboard', () => {
    let opened = false;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={() => (opened = true)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(opened).toBe(true);
  });
  it('numbers the menu rows so every one has a shortcut key', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    // Seven lines, then Start anywhere and Leaderboard, then Resume on zero.
    const keys = screen.getAllByTestId('menu-key').map((k) => k.textContent);
    expect(keys).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('selects a line by its row number', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={(c, f) => (got = [c, f])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    // 5 is the fifth row, the Monorail; then 1 picks a direction.
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it('opens station search with its row number', () => {
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: '8' });
    expect(screen.getByLabelText(/search stations/i)).toBeTruthy();
  });

  it('opens the leaderboard with its row number', () => {
    let opened = false;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={() => (opened = true)}
      />,
    );
    fireEvent.keyDown(window, { key: '9' });
    expect(opened).toBe(true);
  });

  it('resumes a saved journey with zero', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    let picked = '';
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={(id) => (picked = id)}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: '0' });
    expect(picked).toBe('imbi');
  });

  it('ignores zero when there is no journey to resume', () => {
    let picked = '';
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={(id) => (picked = id)}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: '0' });
    expect(picked).toBe('');
  });

  it('leaves the row numbers inert while the search field is open', () => {
    let opened = false;
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={() => (opened = true)}
      />,
    );
    fireEvent.keyDown(window, { key: '8' });
    // A 9 typed into the station name must not open the leaderboard.
    fireEvent.keyDown(window, { key: '9' });
    expect(opened).toBe(false);
  });

  it('closes the station search on Escape', () => {
    render(
      <HomeMap
        net={net}
        theme="paper"
        onToggleTheme={noop}
        onStartLine={noop}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: '8' });
    expect(screen.queryByLabelText(/search stations/i)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText(/search stations/i)).toBeNull();
  });
});
