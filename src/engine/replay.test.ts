import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, stationAt } from './network';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { keyLineRun, lineRunRoute } from './lineRun';
import { startRun, type RunState } from './run';
import {
  advanceQuickRun,
  enterQuickCharacter,
  quickRunAt,
  quickRunMetrics,
  type QuickRunState,
} from './quickRun';
import { replayLineRun, replayQuickRun } from './replay';

const net = buildNetwork(loadNetworkData());

/** Human-ish intervals: a repeating spread, never uniform. */
const INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];
const interval = (i: number) => INTERVALS[i % INTERVALS.length]!;

/**
 * Plays a full Line Run, driving the engine and the log from the same clock —
 * exactly as the screen will.
 */
function playLineRun(line: 'MR', from: string): { run: RunState; log: KeyLog } {
  const route = lineRunRoute(net, line, from);
  const t0 = 5_000;
  let run = startRun(net, from, t0);
  let log = beginLog(t0);
  let now = t0;
  let i = 0;

  for (const id of route) {
    for (const character of stationAt(net, id)!.name) {
      now += interval(i++);
      log = appendKey(log, character, PLAIN_SOURCE, now);
      run = keyLineRun(net, route, run, character, now);
    }
  }
  return { run, log };
}

describe('replayLineRun', () => {
  // The test the whole design rests on. If this is green, the Keylog is a
  // faithful substitute for the Run and a server can derive scores from it.
  it('reproduces the live run metrics exactly', () => {
    const { run, log } = playLineRun('MR', 'kl-sentral');
    const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
    const live = { correctChars: run.correctChars, keystrokes: run.keystrokes, elapsed };

    const replayed = replayLineRun(net, 'MR', 'kl-sentral', log);
    expect(replayed).not.toBeNull();
    expect(replayed!.metrics.wpm).toBe(live.correctChars / 5 / (live.elapsed / 60_000));
    expect(replayed!.metrics.accuracy).toBe(live.correctChars / live.keystrokes);
    expect(replayed!.complete).toBe(true);
    expect(replayed!.stationsCompleted).toBe(lineRunRoute(net, 'MR', 'kl-sentral').length);
  });

  it('reports an unfinished route as incomplete', () => {
    const { log } = playLineRun('MR', 'kl-sentral');
    const short: KeyLog = { ...log, events: log.events.slice(0, 40) };
    const replayed = replayLineRun(net, 'MR', 'kl-sentral', short);
    expect(replayed!.complete).toBe(false);
  });

  it('rejects a log whose keys do not drive the route', () => {
    let log = beginLog(0);
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 120;
      log = appendKey(log, 'z', PLAIN_SOURCE, now);
    }
    expect(replayLineRun(net, 'MR', 'kl-sentral', log)!.complete).toBe(false);
  });

  it('returns null when the start is not a terminus', () => {
    const { log } = playLineRun('MR', 'kl-sentral');
    expect(replayLineRun(net, 'MR', 'imbi', log)).toBeNull();
  });

  it('returns null for a log from another version', () => {
    const { log } = playLineRun('MR', 'kl-sentral');
    expect(replayLineRun(net, 'MR', 'kl-sentral', { ...log, v: 99 })).toBeNull();
  });
});

describe('replayQuickRun', () => {
  it('reproduces the live quick run metrics exactly', () => {
    const start = 'imbi';
    const toward = 'titiwangsa';
    const t0 = 2_000;
    let run: QuickRunState = quickRunAt(net, 'MR', start, toward)!;
    let log = beginLog(t0);
    let now = t0;
    let i = 0;

    // Type until the 45-second deadline is reached.
    while (run.status !== 'completed' && now - t0 < 60_000) {
      const character = run.typing.target[run.typing.cursor];
      if (character === undefined) break;
      now += interval(i++);
      log = appendKey(log, character, PLAIN_SOURCE, now);
      run = enterQuickCharacter(net, run, character, now);
    }

    const live = quickRunMetrics(run, run.endedAt ?? now);
    const replayed = replayQuickRun(net, 'MR', start, toward, log);
    expect(replayed).not.toBeNull();
    expect(replayed!.metrics).toEqual(live);
    expect(replayed!.complete).toBe(run.status === 'completed');
    expect(replayed!.stationsCompleted).toBe(run.completedStations.length);
  });

  // The real-world ending: the player stops typing before the deadline, and
  // it is the UI's interval tick — not a keystroke — that completes the run.
  // The log therefore has no event at the deadline; replay must reach
  // `complete` by advancing to it explicitly, the way `replay.ts` does after
  // its event loop. If that advance were missing, this run would replay as
  // permanently `running` instead of `completed`.
  it('completes a run that stopped short of the deadline, via the tick rather than a keystroke', () => {
    const start = 'imbi';
    const toward = 'titiwangsa';
    const t0 = 2_000;
    let run: QuickRunState = quickRunAt(net, 'MR', start, toward)!;
    let log = beginLog(t0);
    let now = t0;
    let i = 0;

    // Type only a handful of characters — well short of the 45-second
    // deadline — then stop. No further keystrokes reach the log.
    for (let n = 0; n < 8; n++) {
      const character = run.typing.target[run.typing.cursor];
      if (character === undefined) break;
      now += interval(i++);
      log = appendKey(log, character, PLAIN_SOURCE, now);
      run = enterQuickCharacter(net, run, character, now);
    }

    expect(run.status).toBe('running');
    expect(run.deadline).not.toBeNull();
    expect(now - t0).toBeLessThan(run.deadline! - t0);

    // Live: the deadline arrives with no further keystrokes — only the tick.
    const completedLive = advanceQuickRun(run, run.deadline!);
    expect(completedLive.status).toBe('completed');
    const live = quickRunMetrics(completedLive, completedLive.endedAt ?? run.deadline!);

    const replayed = replayQuickRun(net, 'MR', start, toward, log);
    expect(replayed).not.toBeNull();
    expect(replayed!.complete).toBe(true);
    expect(replayed!.stationsCompleted).toBe(completedLive.completedStations.length);
    expect(replayed!.metrics).toEqual(live);
  });

  it('returns null when the start station is not on the line', () => {
    const log = appendKey(beginLog(0), 'a', PLAIN_SOURCE, 100);
    expect(replayQuickRun(net, 'MR', 'gombak', 'titiwangsa', log)).toBeNull();
  });
});
