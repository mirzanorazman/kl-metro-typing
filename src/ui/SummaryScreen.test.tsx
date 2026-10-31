import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { music, sound } from '../audio/sound';
import { emptyStore, submitEntry } from '../data/leaderboardStore';
import { SummaryScreen } from './SummaryScreen';
import { AchievementsScreen } from './AchievementsScreen';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { ACHIEVEMENTS } from '../engine/achievementDefs';
import { emptyAchievements, type AchievementState } from '../engine/achievementState';
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

describe('SummaryScreen achievements', () => {
  /** Every achievement already earned but `except`, so only that one can be announced. */
  function earnedAllBut(except: string): AchievementState['earned'] {
    return Object.fromEntries(ACHIEVEMENTS.filter((a) => a.id !== except).map((a) => [
      a.id, { award: a.category === 'secret' ? 'secret' as const : 'gold' as const, at: {} },
    ]));
  }

  it('announces a Line Run achievement once under StrictMode', async () => {
    vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    const base = emptyAchievements();
    // Long Line's Bronze is 200 stations typed; MR's 11 tip it over.
    saveProfile({
      ...emptyProfile(),
      achievements: { ...base, earned: earnedAllBut('line.stations'), counters: { ...base.counters, lineStations: 195 } },
    });
    const { run, log } = playMR();

    render(
      <StrictMode>
        <SummaryScreen
          net={net} run={run} onExit={() => {}} mode="line" line="MR"
          leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
        />
      </StrictMode>,
    );
    // Lets the share card settle, so its late update lands inside act.
    await act(async () => {});

    const announced = screen.getByRole('region', { name: 'New achievements' });
    expect(within(announced).getAllByRole('listitem')).toHaveLength(1);
    expect(within(announced).getAllByText('Long Line')).toHaveLength(1);
    expect(within(announced).getByText('Bronze · 200 stations typed')).toBeTruthy();
    const saved = loadProfile().achievements!;
    expect(saved.counters.lineStations).toBe(195 + run.stationTimes.length);
    expect(saved.unannounced).toEqual([]);
  });
  it('claims only the three it shows, the Run\'s own first, and leaves the rest for the achievements screen', async () => {
    vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    const base = emptyAchievements();
    const queued = [
      { id: 'explorer.unlocked', award: 'gold' as const, at: 1 },
      { id: 'explorer.interchanges', award: 'gold' as const, at: 2 },
      { id: 'quick.score', award: 'gold' as const, at: 3 },
      { id: 'craft.days', award: 'gold' as const, at: 4 },
    ];
    saveProfile({
      ...emptyProfile(),
      achievements: {
        ...base,
        earned: earnedAllBut('line.stations'),
        counters: { ...base.counters, lineStations: 195 },
        unannounced: queued,
      },
    });
    const { run, log } = playMR();

    const summary = render(
      <StrictMode>
        <SummaryScreen
          net={net} run={run} onExit={() => {}} mode="line" line="MR"
          leaderboardLine="MR" leaderboardFrom="kl-sentral" keylog={log}
        />
      </StrictMode>,
    );
    await act(async () => {});

    const announced = screen.getByRole('region', { name: 'New achievements' });
    const rows = within(announced).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('Long Line');
    expect(rows[1]!.textContent).toContain('Regular Commuter');
    expect(rows[2]!.textContent).toContain('Express Service');
    expect(within(announced).getByText('+2 more')).toBeTruthy();
    expect(loadProfile().achievements!.unannounced).toEqual(queued.slice(0, 2));
    summary.unmount();

    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(screen.getAllByText('New')).toHaveLength(2);
    expect(within(screen.getByRole('button', { name: /Jalan-Jalan/ })).getByText('New')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /All Change/ })).getByText('New')).toBeTruthy();
    expect(loadProfile().achievements!.unannounced).toEqual([]);
  });
});
