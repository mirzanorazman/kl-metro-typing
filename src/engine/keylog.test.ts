import { describe, it, expect } from 'vitest';
import {
  KEYLOG_MAX_EVENTS,
  KEYLOG_VERSION,
  PLAIN_SOURCE,
  appendKey,
  beginLog,
  type KeyLog,
} from './keylog';

describe('beginLog', () => {
  it('opens an empty log stamped with the version and start time', () => {
    const log = beginLog(1000);
    expect(log.v).toBe(KEYLOG_VERSION);
    expect(log.t0).toBe(1000);
    expect(log.ms).toBe(0);
    expect(log.events).toEqual([]);
  });

  it('quantises the start time to whole milliseconds', () => {
    expect(beginLog(1000.6).t0).toBe(1001);
  });
});

describe('appendKey', () => {
  it('measures the first event from the log start', () => {
    const log = appendKey(beginLog(1000), 'a', PLAIN_SOURCE, 1150);
    expect(log.events).toEqual([{ k: 'a', dt: 150 }]);
    expect(log.ms).toBe(150);
  });

  it('measures later events from the previous one', () => {
    let log = beginLog(1000);
    log = appendKey(log, 'a', PLAIN_SOURCE, 1150);
    log = appendKey(log, 'b', PLAIN_SOURCE, 1290);
    expect(log.events[1]).toEqual({ k: 'b', dt: 140 });
    expect(log.ms).toBe(290);
  });

  it('does not mutate the log it is given', () => {
    const first = beginLog(1000);
    appendKey(first, 'a', PLAIN_SOURCE, 1150);
    expect(first.events).toEqual([]);
  });

  // The no-drift property the whole design rests on: deltas are differences of
  // rounded offsets, never rounded differences, so they sum back exactly.
  it('sums deltas back to the exact offset of every event', () => {
    let log = beginLog(1000);
    const times: number[] = [];
    let now = 1000;
    for (let i = 0; i < 500; i++) {
      now += 100.5;                 // a half-millisecond that would drift if rounded per delta
      times.push(Math.round(now));
      log = appendKey(log, 'a', PLAIN_SOURCE, now);
    }
    let running = log.t0;
    log.events.forEach((event, i) => {
      running += event.dt;
      expect(running).toBe(times[i]);
    });
  });

  it('flags an untrusted keystroke and leaves trusted ones unmarked', () => {
    const trusted = appendKey(beginLog(0), 'a', PLAIN_SOURCE, 10);
    expect(trusted.events[0]!.u).toBeUndefined();

    const untrusted = appendKey(beginLog(0), 'a', { trusted: false, batch: 1 }, 10);
    expect(untrusted.events[0]!.u).toBe(1);
  });

  it('records the batch size only when more than one character arrived', () => {
    const single = appendKey(beginLog(0), 'a', PLAIN_SOURCE, 10);
    expect(single.events[0]!.b).toBeUndefined();

    const batched = appendKey(beginLog(0), 'a', { trusted: true, batch: 11 }, 10);
    expect(batched.events[0]!.b).toBe(11);
  });

  it('stops appending at the cap rather than growing without bound', () => {
    const full: KeyLog = {
      v: KEYLOG_VERSION,
      t0: 0,
      ms: 0,
      events: Array.from({ length: KEYLOG_MAX_EVENTS }, () => ({ k: 'a', dt: 0 })),
    };
    expect(appendKey(full, 'b', PLAIN_SOURCE, 99).events).toHaveLength(KEYLOG_MAX_EVENTS);
  });
});
