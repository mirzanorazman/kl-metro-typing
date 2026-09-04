import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { music, sound } from '../audio/sound';
import { emptyStore, submitEntry } from '../data/leaderboardStore';
import { SummaryScreen } from './SummaryScreen';

const net = buildNetwork(loadNetworkData());
const finished = endRun(
  [...'Imbi'].reduce((s, k, i) => keyRun(net, s, k, i * 100), startRun(net, 'imbi', 0)),
);
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SummaryScreen', () => {
  it('reports how many stations were visited', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getByText(/1 station/i)).toBeTruthy();
  });

  it('names the fastest and slowest stations of the run', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getAllByText(/Imbi/).length).toBeGreaterThan(0);
  });

  it('handles a run that ended before any station was completed', () => {
    render(<SummaryScreen net={net} run={endRun(startRun(net, 'imbi', 0))} onExit={() => {}} />);
    expect(screen.getByText(/0 stations/i)).toBeTruthy();
  });

  it('draws the journey travelled', () => {
    const { container } = render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(container.querySelector('polyline[data-journey]')).toBeTruthy();
  });

  it('renders no shape when no station was completed', () => {
    const { container } = render(
      <SummaryScreen net={net} run={endRun(startRun(net, 'imbi', 0))} onExit={() => {}} />,
    );
    expect(container.querySelector('polyline[data-journey]')).toBeNull();
  });

  it('starts and stops menu music with the summary lifecycle', () => {
    const startMenu = vi.spyOn(music, 'startMenu').mockImplementation(() => {});
    const stopMenu = vi.spyOn(music, 'stopMenu').mockImplementation(() => {});

    const { unmount } = render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);

    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when returning to the map', () => {
    const onExit = vi.fn();
    const back = vi.spyOn(sound, 'back').mockImplementation(() => {});

    render(<SummaryScreen net={net} run={finished} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  describe('leaderboard', () => {
    it('invites a name when the run qualifies for the leaderboard', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not show the leaderboard panel for a run with no eligible line', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });

    it('shows the miss message once the board is full of better scores', () => {
      let store = emptyStore();
      for (let i = 0; i < 20; i++) {
        store = submitEntry(net, store, {
          name: `p${i}`, lineCode: 'AG', metrics: { wpm: 999, accuracy: 1, score: 999 }, playedAt: i,
        }).store;
      }
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      expect(screen.getByText(/didn't make the leaderboard/i)).toBeTruthy();
    });

    it('records the entry and shows the achieved rank', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
      fireEvent.click(screen.getByRole('button', { name: /save score/i }));
      expect(screen.getByText(/#1 overall/i)).toBeTruthy();
    });
  });
});
