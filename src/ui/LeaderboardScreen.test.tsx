import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyStore, saveStore, submitEntry } from '../data/leaderboardStore';
import { loadDispatchBoard, submitDispatchEntry } from '../data/dispatchBoardStore';
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

  it('lists Dispatcher Careers on their own tab', () => {
    const metrics = { wpm: 61.6, accuracy: 0.948, score: 55 };
    let board = loadDispatchBoard();
    board = submitDispatchEntry(board, {
      name: 'Aina', score: 812, delivered: 860, shifts: 4, metrics, playedAt: 1, verified: true,
    }).board;
    submitDispatchEntry(board, {
      name: 'Badrul', score: 640, delivered: 700, shifts: 3, metrics, playedAt: 2, verified: true,
    });

    render(<LeaderboardScreen net={net} onExit={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Dispatcher' }));

    const header = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(header).toEqual(['#', 'Name', 'Score', 'Shifts', 'WPM', 'Accuracy']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['1', 'Aina', '812', '4', '62', '95%'],
      ['2', 'Badrul', '640', '3', '62', '95%'],
    ]);
  });

  it('returns to the map', () => {
    const onExit = vi.fn();
    render(<LeaderboardScreen net={net} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('keeps the standalone class and Back action by default', () => {
    const { container } = render(<LeaderboardScreen net={net} onExit={() => {}} />);

    expect(container.querySelector('.leaderboard-screen--embedded')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to the map' })).toBeTruthy();
  });

  it('uses the embedded class and omits the Back action inside mobile Ranking', () => {
    const { container } = render(<LeaderboardScreen embedded net={net} />);

    expect(container.querySelector('.leaderboard-screen--embedded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to the map' })).toBeNull();
  });
});
