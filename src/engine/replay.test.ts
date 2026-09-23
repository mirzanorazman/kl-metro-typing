import { describe, it, expect, vi } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode, NetworkData } from '../data/types';
import { buildNetwork, stationAt, type NetworkIndex } from './network';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { keyLineRun, lineRunRoute } from './lineRun';
import { startRun, type RunState } from './run';
import {
  advanceQuickRun,
  enterQuickCharacter,
  quickRunAt,
  quickRunMetrics,
  type QuickLeg,
  type QuickRunState,
} from './quickRun';
import { replayLineRun, replayQuickRun, type QuickRunEvidence } from './replay';

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

function smallNetwork(codes: LineCode[] = ['MR', 'KG', 'PY']) {
  const lines: NetworkData['lines'] = codes.map((code) => ({
    code, name: code, colour: '#000000', termini: [`${code}0`, `${code}5`],
    stations: Array.from({ length: 6 }, (_, index) => `${code}${index}`),
    schematic: { start: { x: 0, y: 0 }, segments: [['E', 5]] },
  }));
  return buildNetwork({
    lines,
    stations: lines.flatMap((line) => line.stations.map((id, index) => ({
      id, name: id, codes: { [line.code]: id }, demand: 1, geo: { lat: 0, lng: index },
    }))),
    links: [],
  });
}

/** Completes legs live, then lets the deadline tick finish at the new landing. */
function playQuickLegs(network: NetworkIndex, count: number, random = () => 0) {
  let run = quickRunAt(network, 'MR', 'MR0', 'MR5')!;
  let keylog = beginLog(0);
  let now = 0;
  let i = 0;
  while (run.trace.legs.length <= count && (run.status === 'ready' || run.status === 'running')) {
    const key = run.typing.target[run.typing.cursor]!;
    now += interval(i++);
    keylog = appendKey(keylog, key, PLAIN_SOURCE, now);
    run = enterQuickCharacter(network, run, key, now, random);
  }
  run = advanceQuickRun(run, run.deadline!);
  const evidence: QuickRunEvidence = { keylog, trace: run.trace };
  return { run, evidence };
}

function replaceLeg(evidence: QuickRunEvidence, index: number, leg: QuickLeg): QuickRunEvidence {
  return { ...evidence, trace: { ...evidence.trace, legs: evidence.trace.legs.map((entry, i) => i === index ? leg : entry) } };
}

describe('replayQuickRun', () => {
  it('reproduces the live quick run metrics exactly', () => {
    const start = 'imbi';
    const toward = 'titiwangsa';
    const t0 = 2_000;
    let run: QuickRunState = quickRunAt(net, 'MR', start, toward)!;
    let log = beginLog(t0);
    let now = t0;
    let i = 0;

    // Type until the 30-second deadline is reached, with reproducible live choices.
    while (run.status !== 'completed' && now - t0 < 60_000) {
      const character = run.typing.target[run.typing.cursor];
      if (character === undefined) break;
      now += interval(i++);
      log = appendKey(log, character, PLAIN_SOURCE, now);
      run = enterQuickCharacter(net, run, character, now, () => 0.8);
    }

    const live = quickRunMetrics(run, run.endedAt ?? now);
    expect(run.trace.legs.length).toBeGreaterThan(1);
    const replayed = replayQuickRun(net, { keylog: log, trace: run.trace });
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

    // Type only a handful of characters — well short of the 30-second
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

    const replayed = replayQuickRun(net, { keylog: log, trace: run.trace });
    expect(replayed).not.toBeNull();
    expect(replayed!.complete).toBe(true);
    expect(replayed!.stationsCompleted).toBe(completedLive.completedStations.length);
    expect(replayed!.metrics).toEqual(live);
  });

  it('uses every recorded choice without consulting Math.random or candidate order', () => {
    const network = smallNetwork();
    const { run, evidence } = playQuickLegs(network, 4, () => 0.8);
    const reordered = { ...network, lines: new Map([...network.lines].reverse()) };
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Replay rerolled a leg'); });
    try {
      expect(replayQuickRun(reordered, evidence)).toEqual({
        metrics: quickRunMetrics(run, run.endedAt!), stationsCompleted: run.completedStations.length, complete: true,
      });
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it.each([
    ['missing Line', { line: 'XX', at: 'MR0', toward: 'MR5' }],
    ['missing Station', { line: 'MR', at: 'missing', toward: 'MR5' }],
    ['Station on another Line', { line: 'MR', at: 'KG0', toward: 'MR5' }],
    ['non-Terminus destination', { line: 'MR', at: 'MR0', toward: 'MR4' }],
    ['fewer than four advances', { line: 'MR', at: 'MR2', toward: 'MR5' }],
  ] as const)('rejects a first leg with %s', (_, leg) => {
    const evidence: QuickRunEvidence = { keylog: beginLog(0), trace: { version: 1, legs: [leg as QuickLeg] } };
    expect(replayQuickRun(smallNetwork(), evidence)).toBeNull();
  });

  it('rejects a Terminus missing from the Station data', () => {
    const network = smallNetwork();
    network.stations.delete('MR5');
    expect(replayQuickRun(network, {
      keylog: beginLog(0), trace: { version: 1, legs: [{ line: 'MR', at: 'MR0', toward: 'MR5' }] },
    })).toBeNull();
  });

  it.each([
    ['same-Line jump', { line: 'MR', at: 'MR5', toward: 'MR0' }],
    ['short jump', { line: 'KG', at: 'KG2', toward: 'KG5' }],
    ['invalid jump Station', { line: 'KG', at: 'missing', toward: 'KG5' }],
    ['invalid jump Terminus', { line: 'KG', at: 'KG0', toward: 'KG4' }],
  ] as const)('rejects a %s', (_, leg) => {
    const network = smallNetwork();
    const { evidence } = playQuickLegs(network, 1);
    expect(replayQuickRun(network, replaceLeg(evidence, 1, leg))).toBeNull();
  });

  it('rejects a reused Line while another eligible different Line remains unused', () => {
    const network = smallNetwork();
    const { evidence } = playQuickLegs(network, 2);
    expect(evidence.trace.legs.map(({ line }) => line)).toEqual(['MR', 'KG', 'PY']);
    expect(replayQuickRun(network, replaceLeg(evidence, 2, { line: 'MR', at: 'MR0', toward: 'MR5' }))).toBeNull();
  });

  it('rejects a typed landing while the selected Line has an eligible untyped landing', () => {
    const network = smallNetwork(['MR', 'KG']);
    const { evidence } = playQuickLegs(network, 1);
    // Both Lines share this Terminus; it was typed immediately before the jump.
    const kg = network.lines.get('KG')!;
    network.lines.set('KG', { ...kg, stations: ['MR5', ...kg.stations.slice(1)] });
    expect(replayQuickRun(network, replaceLeg(evidence, 1, { line: 'KG', at: 'MR5', toward: 'KG5' }))).toBeNull();
    expect(replayQuickRun(network, replaceLeg(evidence, 1, { line: 'KG', at: 'KG1', toward: 'KG5' }))?.complete).toBe(true);
  });

  it('allows reused Lines and typed landings when their preferred tiers are exhausted', () => {
    const network = smallNetwork(['MR', 'KG']);
    const { run, evidence } = playQuickLegs(network, 3);
    expect(evidence.trace.legs.map(({ line }) => line)).toEqual(['MR', 'KG', 'MR', 'KG']);
    expect(replayQuickRun(network, evidence)).toEqual({
      metrics: quickRunMetrics(run, run.endedAt!), stationsCompleted: run.completedStations.length, complete: true,
    });
  });

  it('rejects a missing required jump entry', () => {
    const network = smallNetwork();
    const { evidence } = playQuickLegs(network, 1);
    expect(replayQuickRun(network, { ...evidence, trace: { ...evidence.trace, legs: evidence.trace.legs.slice(0, 1) } })).toBeNull();
  });

  it('rejects an extra unused entry', () => {
    const network = smallNetwork();
    const { evidence } = playQuickLegs(network, 1);
    const legs = [...evidence.trace.legs, { line: 'PY' as const, at: 'PY0', toward: 'PY5' }];
    expect(replayQuickRun(network, { ...evidence, trace: { version: 1, legs } })).toBeNull();
  });

  it.each([0, 1])('does not consume a jump when the final Terminus key is at or after the deadline (%s)', (delay) => {
    const network = smallNetwork();
    const { evidence } = playQuickLegs(network, 1);
    const events = evidence.keylog.events.map((event) => ({ ...event }));
    const beforeLast = events.slice(0, -1).reduce((time, { dt }) => time + dt, 0);
    events[events.length - 1]!.dt = events[0]!.dt + 30_000 + delay - beforeLast;
    const keylog = { ...evidence.keylog, events, ms: events[0]!.dt + 30_000 + delay };
    const oneLeg = { keylog, trace: { ...evidence.trace, legs: evidence.trace.legs.slice(0, 1) } };
    expect(replayQuickRun(network, oneLeg)).toMatchObject({ complete: true, stationsCompleted: 5 });
    expect(replayQuickRun(network, { ...evidence, keylog })).toBeNull();
  });

  it('rejects a continuation error instead of promoting an interrupted run to completion', () => {
    const network = smallNetwork(['MR']);
    const { run, evidence } = playQuickLegs(network, 1);
    expect(run.status).toBe('interrupted');
    expect(replayQuickRun(network, evidence)).toBeNull();
  });

  it('reports a run with no printable input as incomplete', () => {
    expect(replayQuickRun(smallNetwork(), {
      keylog: appendKey(beginLog(0), 'Shift', PLAIN_SOURCE, 100),
      trace: { version: 1, legs: [{ line: 'MR', at: 'MR0', toward: 'MR5' }] },
    })).toMatchObject({ complete: false, stationsCompleted: 0 });
  });

  it.each([
    { version: 2, legs: [{ line: 'MR', at: 'MR0', toward: 'MR5' }] },
    { version: 1, legs: [] },
    { version: 1, legs: [null] },
    { version: 1, legs: 'invalid' },
    undefined,
  ])('rejects a missing or malformed trace: %j', (trace) => {
    expect(replayQuickRun(smallNetwork(), { keylog: beginLog(0), trace } as QuickRunEvidence)).toBeNull();
  });

  it('rejects an unsupported Keylog version', () => {
    const { evidence } = playQuickLegs(smallNetwork(), 1);
    expect(replayQuickRun(smallNetwork(), { ...evidence, keylog: { ...evidence.keylog, v: 99 } })).toBeNull();
  });
});
