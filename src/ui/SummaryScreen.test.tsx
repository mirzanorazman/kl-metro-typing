import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { music, sound } from '../audio/sound';
import { emptyStore, submitEntry } from '../data/leaderboardStore';
import { SummaryScreen } from './SummaryScreen';
import { loadProfile } from '../engine/progress';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog, type KeySource } from '../engine/keylog';
import { keyLineRun, lineRunRoute } from '../engine/lineRun';
import { stationAt } from '../engine/network';
import type { LineCode } from '../data/types';

const net = buildNetwork(loadNetworkData());
const finished = endRun(
  [...'Imbi'].reduce((s, k, i) => keyRun(net, s, k, i * 100), startRun(net, 'imbi', 0)),
);
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

const INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];

/**
 * Plays a complete Line Run on `line` from `from`, returning both the Run
 * and the Keylog beside it. Intervals are deliberately varied — a uniform or
 * zero interval is exactly what the `inhuman-consistency` and
 * `impossible-speed` checks exist to catch, so a fake-but-honest test run
 * must not look like a script.
 */
function playLine(line: LineCode, from: string, source: KeySource = PLAIN_SOURCE) {
  const route = lineRunRoute(net, line, from);
  const t0 = 5_000;
  let run = startRun(net, from, t0);
  let log: KeyLog = beginLog(t0);
  let now = t0;
  let i = 0;
  for (const id of route) {
    for (const character of stationAt(net, id)!.name) {
      now += INTERVALS[i++ % INTERVALS.length]!;
      log = appendKey(log, character, source, now);
      run = keyLineRun(net, route, run, character, now);
    }
  }
  return { run, log };
}

/** Plays a complete MR run, returning both the Run and the Keylog beside it. */
function playMR(source: KeySource = PLAIN_SOURCE) {
  return playLine('MR', 'kl-sentral', source);
}

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
      const { run, log } = playLine('AG', 'sentul-timur');
      render(
        <SummaryScreen
          net={net} run={run} onExit={() => {}}
          leaderboardLine="AG" leaderboardFrom="sentul-timur" keylog={log}
        />,
      );
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
      const { run, log } = playLine('AG', 'sentul-timur');
      render(
        <SummaryScreen
          net={net} run={run} onExit={() => {}}
          leaderboardLine="AG" leaderboardFrom="sentul-timur" keylog={log}
        />,
      );
      expect(screen.getByText(/didn't make the leaderboard/i)).toBeTruthy();
    });

    it('records the entry and shows the achieved rank', () => {
      const { run, log } = playLine('AG', 'sentul-timur');
      render(
        <SummaryScreen
          net={net} run={run} onExit={() => {}}
          leaderboardLine="AG" leaderboardFrom="sentul-timur" keylog={log}
        />,
      );
      fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
      fireEvent.click(screen.getByRole('button', { name: /save score/i }));
      expect(screen.getByText(/#1 overall/i)).toBeTruthy();
    });
  });
});

describe('SummaryScreen leaderboard eligibility', () => {
  it('offers name entry for a run that replays and passes', () => {
    const { run, log } = playMR();
    render(
      <SummaryScreen
        net={net} run={run} onExit={() => {}}
        leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
      />,
    );
    expect(screen.queryByText(/wasn't eligible/i)).toBeNull();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });

  it('refuses a run whose keystrokes arrived pasted', () => {
    const { run, log } = playMR({ trusted: true, batch: 11 });
    render(
      <SummaryScreen
        net={net} run={run} onExit={() => {}}
        leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
      />,
    );
    expect(screen.getByText("This run wasn't eligible for the leaderboard.")).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  it('never tells the player which check failed', () => {
    const { run, log } = playMR({ trusted: false, batch: 1 });
    render(
      <SummaryScreen
        net={net} run={run} onExit={() => {}}
        leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
      />,
    );
    expect(screen.queryByText(/untrusted|batched|speed|consistency/i)).toBeNull();
  });

  it('still shows the run stats when a run is ineligible', () => {
    const { run, log } = playMR({ trusted: false, batch: 1 });
    render(
      <SummaryScreen
        net={net} run={run} onExit={() => {}}
        leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
      />,
    );
    expect(screen.getByText('WPM')).toBeTruthy();
    expect(screen.getByText('Accuracy')).toBeTruthy();
  });

  it('records the failure in the profile', () => {
    const { run, log } = playMR({ trusted: false, batch: 1 });
    render(
      <SummaryScreen
        net={net} run={run} onExit={() => {}}
        leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
      />,
    );
    const fails = loadProfile().integrityFails ?? [];
    expect(fails).toHaveLength(1);
    expect(fails[0]!.mode).toBe('line');
    expect(fails[0]!.reason).toBe('untrusted-input');
  });
});
