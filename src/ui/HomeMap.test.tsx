import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
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
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws the land backdrop beneath the tracks', () => {
    const { container } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} />,
    );
    expect(container.querySelectorAll('.map-backdrop path').length).toBeGreaterThan(0);
  });

  it('starts a line run from a line chosen by click', () => {
    let got: [string, string] | null = null;
    render(<HomeMap net={net} onStartLine={(c, f) => (got = [c, f])} onPickStation={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['KJ', 'gombak']);
  });

  it('starts a line run from a line chosen by typing its code', () => {
    let got: [string, string] | null = null;
    render(<HomeMap net={net} onStartLine={(c, f) => (got = [c, f])} onPickStation={noop} />);
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it('offers to resume a saved journey', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    let picked = '';
    render(<HomeMap net={net} onStartLine={noop} onPickStation={(id) => (picked = id)} />);
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(picked).toBe('imbi');
  });

  it('shows overall station progress', () => {
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem('myrapid.v1', 'not json {{{');
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an icon-only sound toggle with accessible state', () => {
    const { container } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} />,
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
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} />,
    );

    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when opening station search', () => {
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});

    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));

    expect(select).toHaveBeenCalledTimes(1);
  });
});
