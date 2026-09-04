import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { HomeMap } from './HomeMap';

const net = buildNetwork(loadNetworkData());
const noop = () => {};
beforeEach(() => localStorage.clear());

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

  it('states that the project is unofficial', () => {
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem('myrapid.v1', 'not json {{{');
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
