import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyStore, saveStore, submitEntry } from '../data/leaderboardStore';
import { LeaderboardScreen } from './LeaderboardScreen';

const net = buildNetwork(loadNetworkData());
beforeEach(() => localStorage.clear());

describe('LeaderboardScreen', () => {
  it('shows an empty state when nothing has been recorded', () => {
    render(<LeaderboardScreen net={net} onExit={() => {}} />);
    expect(screen.getByText(/no scores yet/i)).toBeTruthy();
  });

  it('lists the overall board with a line column, ranked by weighted score', () => {
    let store = emptyStore();
    store = submitEntry(net, store, {
      name: 'Ali', lineCode: 'PY', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 1,
    }).store;
    store = submitEntry(net, store, {
      name: 'Bee', lineCode: 'MR', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 2,
    }).store;
    saveStore(store);

    render(<LeaderboardScreen net={net} onExit={() => {}} />);

    // Equal raw score, but Putrajaya (the longest line) weighs 1 vs KL
    // Monorail's ~0.24, so Ali's weighted score ranks first.
    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows[0]?.textContent).toContain('Ali');
    expect(rows[0]?.textContent).toContain('Putrajaya Line');
  });

  it('switches to a per-line board without a line column', () => {
    let store = emptyStore();
    store = submitEntry(net, store, {
      name: 'Ali', lineCode: 'MR', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 1,
    }).store;
    saveStore(store);

    render(<LeaderboardScreen net={net} onExit={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'MR' }));

    expect(screen.queryByText(/^line$/i)).toBeNull();
    expect(screen.getByText('Ali')).toBeTruthy();
  });

  it('returns to the map', () => {
    const onExit = vi.fn();
    render(<LeaderboardScreen net={net} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
