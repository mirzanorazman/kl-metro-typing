# Run Integrity Implementation Plan

> **Status: executed 2026-09-11.** All eight tasks are complete on branch
> `worktree-run-integrity` (`80ed5b8..0188244`). The step checkboxes below are
> left unticked deliberately — several steps were superseded during execution,
> so ticking them would assert something untrue. The authoritative record of
> what was built, what diverged, and why is
> `docs/superpowers/2026-09-11-run-integrity-execution-record.md`. Read that
> before trusting any step here.
>
> Known defects in this plan's own text, all corrected during execution: Task
> 6's batch encoding made the anti-paste budget 2–4× tighter than the spec
> (§3.11); Task 3's and Task 4's tests never reached the branches they claimed
> to cover (§3.2, §3.4); Task 7 shipped a verification bypass its prescribed
> test could not have caught (§3.5); Task 8's prose contradicted itself (§3.9).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every scored Run as a Keylog, replay it to derive its Metrics, and judge it with one pure function — so a leaderboard score is derived from evidence rather than believed.

**Architecture:** The input layer annotates keystrokes with their Source (trusted? how many characters arrived at once?) and never rejects any. A ref-backed recorder writes a Keylog alongside the Run and owns the Run's clock, so replaying the Keylog reproduces the live Metrics exactly. Two pure engine functions — `replayLineRun`/`replayQuickRun` and `verifyKeyLog` — gate leaderboard eligibility, and both are DOM-free so a server can call them unchanged later.

**Tech Stack:** TypeScript 5.3, React 18, Vite 5, Vitest 1 + jsdom, `@testing-library/react`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-run-integrity-design.md`

## Global Constraints

- **`src/engine/*` is pure.** No React, no timers, no `localStorage`, no `performance.now()`. Time enters as a `now` parameter. This is invariant 2 in `docs/STATUS.md`.
- **Dependency direction is one-way:** `ui` → `engine`, never back.
- **Never call `setState` inside another state updater** (invariant 6). Recording happens in the event callback, before `setRun`, never inside the updater.
- **No new runtime dependencies.** The app makes no network requests at runtime (invariant 5); nothing here changes that.
- **Vocabulary is `CONTEXT.md`'s.** Use Run, Line Run, Quick Run, Station, Line, Metrics — and the spec's additions: Keylog, Source, Verdict, Replay, Eligible.
- **Test command:** `npm test` runs the whole suite; `npx vitest run <path>` runs one file. Tests live beside their source as `<name>.test.ts(x)`.
- **Type check:** `npx tsc --noEmit` must be clean before every commit.
- **Existing suite is 214 tests and green.** Never commit with a red suite.
- **Player-facing failure copy is exactly:** `This run wasn't eligible for the leaderboard.` No reason is ever shown to the player.

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/keylog.ts` *(new)* | The Keylog record format and its construction. Knows nothing about Runs, Stations, or cheating. |
| `src/engine/integrity.ts` *(new)* | `verifyKeyLog`. The only place a judgment is made. Knows nothing about the network. |
| `src/engine/replay.ts` *(new)* | Drives a Keylog back through the Run engines to derive Metrics. |
| `src/ui/useRunRecorder.ts` *(new)* | The only impure unit. Ref-backed Keylog accumulation; owns the Run clock via `runTick()`. |
| `src/engine/lineRun.ts` *(modify)* | Gains `keyLineRun` — the route rule lifted out of `LineRunScreen.tsx`. |
| `src/engine/quickRun.ts` *(modify)* | Gains `quickRunAt` — constructing a ready Quick Run, split from choosing one at random. |
| `src/engine/progress.ts` *(modify)* | `Profile.integrityFails` and `recordIntegrityFail`. |
| `src/engine/leaderboard.ts` *(modify)* | `LeaderboardEntry.verified`. |
| `src/ui/useKeyboard.ts` *(modify)* | Reports `e.isTrusted` as part of the Source. |
| `src/ui/TypingInputProvider.tsx` *(modify)* | Reports how many characters one input event delivered. |
| `src/ui/LineRunScreen.tsx` *(modify)* | Uses `keyLineRun` and the recorder; hands the Keylog to the summary. |
| `src/ui/QuickRunScreen.tsx` *(modify)* | Uses the recorder; gates `quickBest` on the Verdict. |
| `src/ui/SummaryScreen.tsx` *(modify)* | Replays, verifies, and gates the name panel. |

---

### Task 1: The Keylog record format

**Files:**
- Create: `src/engine/keylog.ts`
- Test: `src/engine/keylog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `KEYLOG_VERSION: number`, `KEYLOG_MAX_EVENTS: number`, `PLAIN_SOURCE: KeySource`, `interface KeySource { trusted: boolean; batch: number }`, `interface KeyEvent { k: string; dt: number; u?: 1; b?: number }`, `interface KeyLog { v: number; t0: number; ms: number; events: KeyEvent[] }`, `beginLog(now: number): KeyLog`, `appendKey(log: KeyLog, key: string, source: KeySource, now: number): KeyLog`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/keylog.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/keylog.test.ts`
Expected: FAIL — `Failed to resolve import "./keylog"`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/keylog.ts`:

```ts
export const KEYLOG_VERSION = 1;

/**
 * A hard ceiling on log length. Both instrumented modes finish far below it —
 * a 37-station Line Run is roughly 500 keystrokes — so this only bounds memory
 * against a pathological case.
 */
export const KEYLOG_MAX_EVENTS = 5_000;

/** How a keystroke reached the game. */
export interface KeySource {
  /** The browser's `event.isTrusted` for the event that delivered it. */
  trusted: boolean;
  /** Characters delivered by that one event. 1 for an ordinary keypress. */
  batch: number;
}

/** The Source of an ordinary, unremarkable keystroke. */
export const PLAIN_SOURCE: KeySource = { trusted: true, batch: 1 };

export interface KeyEvent {
  /** The character typed. */
  k: string;
  /** Milliseconds since the previous event, or since the log opened. */
  dt: number;
  /** Present only when the event was untrusted. */
  u?: 1;
  /** Present only when more than one character arrived together. */
  b?: number;
}

export interface KeyLog {
  v: number;
  /** The Run clock's value when the log opened. */
  t0: number;
  /** Offset of the most recent event. 0 while the log is empty. */
  ms: number;
  events: KeyEvent[];
}

export function beginLog(now: number): KeyLog {
  return { v: KEYLOG_VERSION, t0: Math.round(now), ms: 0, events: [] };
}

/**
 * Appends one keystroke.
 *
 * `dt` is the difference between *rounded offsets*, never a rounded
 * difference. Summing deltas therefore reconstructs each timestamp exactly,
 * with no error accumulating across hundreds of events — which is what lets a
 * replayed Run reproduce the live one's Metrics rather than approximate them.
 */
export function appendKey(
  log: KeyLog,
  key: string,
  source: KeySource,
  now: number,
): KeyLog {
  if (log.events.length >= KEYLOG_MAX_EVENTS) return log;

  const offset = Math.round(now) - log.t0;
  const event: KeyEvent = { k: key, dt: offset - log.ms };
  if (!source.trusted) event.u = 1;
  if (source.batch > 1) event.b = source.batch;

  return { ...log, ms: offset, events: [...log.events, event] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/keylog.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type check and commit**

```bash
npx tsc --noEmit
git add src/engine/keylog.ts src/engine/keylog.test.ts
git commit -m "feat: add the Keylog record format

Deltas are differences of rounded offsets rather than rounded differences,
so they sum back exactly and a replayed Run can reproduce the live one's
Metrics instead of approximating them."
```

---

### Task 2: Lift the Line Run route rule into the engine

The route-completion and interchange rule currently lives in a React callback at `src/ui/LineRunScreen.tsx:92-105`. Replay cannot reproduce a Line Run without it, and `docs/STATUS.md` already lists it as debt with no direct test. This task moves it and rewires the screen, so the rule exists in exactly one place.

**Files:**
- Modify: `src/engine/lineRun.ts`
- Modify: `src/ui/LineRunScreen.tsx:92-105`
- Test: `src/engine/lineRun.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `keyLineRun(net: NetworkIndex, route: readonly string[], state: RunState, key: string, now: number): RunState`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/lineRun.test.ts`. Add `keyLineRun` to the existing import from `./lineRun`, and add these imports at the top of the file:

```ts
import { startRun, type RunState } from './run';
import { stationAt } from './network';
import { keyLineRun, lineRunRoute, terminiOf } from './lineRun';
```

Then append:

```ts
/** Types `text` one character at a time, one millisecond apart. */
function type(route: readonly string[], state: RunState, text: string, from = 0): RunState {
  let next = state;
  [...text].forEach((character, i) => {
    next = keyLineRun(net, route, next, character, from + i + 1);
  });
  return next;
}

describe('keyLineRun', () => {
  const route = lineRunRoute(net, 'MR', 'kl-sentral');

  it('moves to the next station on the route once a name is finished', () => {
    const run = type(route, startRun(net, 'kl-sentral', 0), 'KL Sentral');
    expect(run.at).toBe('tun-sambanthan');
    expect(run.typing.target).toBe('Tun Sambanthan');
  });

  it('passes through an interchange without stopping to ask', () => {
    // KL Sentral is served by several lines, so the engine alone would offer a
    // junction here. A Line Run must never prompt.
    const run = type(route, startRun(net, 'kl-sentral', 0), 'KL Sentral');
    expect(run.phase).toBe('typing');
    expect(run.options).toEqual([]);
  });

  it('ends the run when the last station on the route is typed', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(run.phase).toBe('ended');
    expect(run.stationTimes).toHaveLength(route.length);
  });

  it('does not reverse at the terminus the way a free Run would', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(run.at).toBe('titiwangsa');
  });

  it('ignores keys once the run has ended', () => {
    let run = startRun(net, 'kl-sentral', 0);
    let clock = 0;
    for (const id of route) {
      const name = stationAt(net, id)!.name;
      run = type(route, run, name, clock);
      clock += name.length + 1;
    }
    expect(keyLineRun(net, route, run, 'x', 99_999)).toBe(run);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/lineRun.test.ts`
Expected: FAIL — `keyLineRun is not a function` / no exported member `keyLineRun`.

- [ ] **Step 3: Write the implementation**

Add to the top of `src/engine/lineRun.ts`:

```ts
import { chooseTowards, endRun, keyRun, type RunState } from './run';
```

and append to the file:

```ts
/**
 * One keystroke in a Line Run.
 *
 * A Line Run has no decisions in it, which the generic Run engine does not
 * know: it would prompt at every interchange and reverse at the terminus.
 * This wraps `keyRun` with the two rules that make the route fixed.
 */
export function keyLineRun(
  net: NetworkIndex,
  route: readonly string[],
  state: RunState,
  key: string,
  now: number,
): RunState {
  if (state.phase !== 'typing') return state;

  let next = keyRun(net, state, key, now);

  // Route complete: end here rather than letting the engine reverse.
  if (next.stationTimes.length >= route.length) return endRun(next);

  // Interchange: stay on the line instead of prompting the player.
  if (next.phase === 'junction') {
    const target = route[next.stationTimes.length];
    if (target) next = chooseTowards(net, next, target, now);
  }

  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/lineRun.test.ts`
Expected: PASS, 9 tests (4 existing + 5 new).

- [ ] **Step 5: Rewire the screen to use it**

In `src/ui/LineRunScreen.tsx`, replace the `onKey` callback (currently lines 92-105) with:

```ts
  const onKey = useCallback((key: string) => {
    setRun((prev) => keyLineRun(net, route, prev, key, performance.now()));
  }, [net, route]);
```

Update the imports: remove `chooseTowards`, `endRun` and `keyRun` from the `'../engine/run'` import if nothing else in the file uses them (`endRun` is still used by the "End run" button, so keep that one), and add `keyLineRun` to the `'../engine/lineRun'` import:

```ts
import { endRun, runMetrics, startRun, type RunState } from '../engine/run';
import { keyLineRun, lineRunRoute } from '../engine/lineRun';
```

- [ ] **Step 6: Run the full suite to confirm the screen still behaves**

Run: `npm test`
Expected: PASS. `src/ui/LineRunScreen.test.tsx` exercises this path and must stay green — it is the proof the extraction changed nothing.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
git add src/engine/lineRun.ts src/engine/lineRun.test.ts src/ui/LineRunScreen.tsx
git commit -m "refactor: move the Line Run route rule into the engine

The route-completion and interchange rules lived in a React callback and
had no direct test, which docs/STATUS.md listed as debt. Replay cannot
reproduce a Line Run without them in the engine."
```

---

### Task 3: Replay

**Files:**
- Create: `src/engine/replay.ts`
- Modify: `src/engine/quickRun.ts`
- Test: `src/engine/replay.test.ts`

**Interfaces:**
- Consumes: `KeyLog`, `KEYLOG_VERSION`, `beginLog`, `appendKey`, `PLAIN_SOURCE` (Task 1); `keyLineRun` (Task 2).
- Produces: `interface ReplayResult { metrics: Metrics; stationsCompleted: number; complete: boolean }`, `replayLineRun(net, line, from, log): ReplayResult | null`, `replayQuickRun(net, line, start, toward, log): ReplayResult | null`, and `quickRunAt(net, lineCode, at, toward): QuickRunState` from `quickRun.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/replay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, stationAt } from './network';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from './keylog';
import { keyLineRun, lineRunRoute } from './lineRun';
import { startRun, type RunState } from './run';
import { enterQuickCharacter, quickRunAt, quickRunMetrics, type QuickRunState } from './quickRun';
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
  });

  it('returns null when the start station is not on the line', () => {
    const log = appendKey(beginLog(0), 'a', PLAIN_SOURCE, 100);
    expect(replayQuickRun(net, 'MR', 'gombak', 'titiwangsa', log)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/replay.test.ts`
Expected: FAIL — `Failed to resolve import "./replay"`, and `quickRunAt` is not exported.

- [ ] **Step 3: Split constructing a Quick Run from choosing one**

Replay needs to rebuild a Quick Run at a known Station, but `prepareQuickRun` picks one at random. Separate the two.

In `src/engine/quickRun.ts`, add this function immediately above `prepareQuickRun`:

```ts
/**
 * A ready Quick Run starting at `at`.
 *
 * Split out of `prepareQuickRun` so a Run can be reconstructed at a known
 * Station — replay cannot re-roll the random choice that picked it.
 * Returns null if `at` is not on the Line, or `toward` is not a terminus.
 */
export function quickRunAt(
  net: NetworkIndex,
  lineCode: LineCode,
  at: string,
  toward: string,
): QuickRunState | null {
  const line = lineAt(net, lineCode);
  if (!line || line.stations.length < 2) return null;

  const first = line.stations[0]!;
  const last = line.stations[line.stations.length - 1]!;
  if (toward !== first && toward !== last) return null;
  if (!line.stations.includes(at)) return null;

  const station = stationAt(net, at);
  if (!station) return null;

  return {
    line: lineCode,
    initialToward: toward,
    direction: toward === last ? 1 : -1,
    at,
    arrivedFrom: null,
    typing: beginTyping(station.name),
    completedStations: [],
    startedAt: null,
    stationStartedAt: null,
    deadline: null,
    endedAt: null,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
    status: 'ready',
  };
}
```

Then replace the body of `prepareQuickRun` from `const at = candidates[index]!;` to the end of the function with:

```ts
  const at = candidates[index]!;
  const state = quickRunAt(net, lineCode, at, toward);
  if (!state) throw new Error(`Quick Run starting station not found: ${at}`);
  return state;
```

The two validation blocks at the top of `prepareQuickRun` (the `!line` throw and the `toward` throw) stay where they are — `prepareQuickRun` throws on bad input, `quickRunAt` returns null, and each keeps its existing contract.

- [ ] **Step 4: Write the replay implementation**

Create `src/engine/replay.ts`:

```ts
import type { LineCode } from '../data/types';
import { KEYLOG_VERSION, type KeyLog } from './keylog';
import { keyLineRun, lineRunRoute } from './lineRun';
import { computeMetrics, type Metrics } from './metrics';
import type { NetworkIndex } from './network';
import { advanceQuickRun, enterQuickCharacter, quickRunAt, quickRunMetrics } from './quickRun';
import { startRun, type RunState } from './run';

export interface ReplayResult {
  metrics: Metrics;
  stationsCompleted: number;
  /** True when the replay reached the terminal state a real Run would. */
  complete: boolean;
}

/**
 * Drives a Keylog back through the Line Run engine to derive its Metrics.
 *
 * `null` means the Keylog cannot describe a Run on this route at all — a
 * hand-forged log fails here, before any heuristic gets a say. A log that
 * replays but stops short returns `complete: false` instead.
 */
export function replayLineRun(
  net: NetworkIndex,
  line: LineCode,
  from: string,
  log: KeyLog,
): ReplayResult | null {
  if (log.v !== KEYLOG_VERSION) return null;

  const route = lineRunRoute(net, line, from);
  if (route.length === 0) return null;

  let state: RunState;
  try {
    state = startRun(net, from, log.t0);
  } catch {
    return null;
  }

  let now = log.t0;
  for (const event of log.events) {
    now += event.dt;
    state = keyLineRun(net, route, state, event.k, now);
  }

  // Elapsed time is the sum of Station times, not wall time — the same
  // measure SummaryScreen has always used, so pauses between Stations are
  // not charged against the player.
  const elapsed = state.stationTimes.reduce((n, s) => n + s.ms, 0);

  return {
    metrics: computeMetrics(state.correctChars, state.keystrokes, elapsed),
    stationsCompleted: state.stationTimes.length,
    complete: state.phase === 'ended' && state.stationTimes.length === route.length,
  };
}

/**
 * Drives a Keylog back through the Quick Run engine.
 *
 * The 45-second deadline needs no parameter: `enterQuickCharacter` derives it
 * from the first keystroke. The run is advanced to that deadline afterwards,
 * because live it is the interval tick — not a keystroke — that completes it.
 */
export function replayQuickRun(
  net: NetworkIndex,
  line: LineCode,
  start: string,
  toward: string,
  log: KeyLog,
): ReplayResult | null {
  if (log.v !== KEYLOG_VERSION) return null;

  let state = quickRunAt(net, line, start, toward);
  if (!state) return null;

  let now = log.t0;
  for (const event of log.events) {
    now += event.dt;
    state = enterQuickCharacter(net, state, event.k, now);
  }
  if (state.deadline !== null) state = advanceQuickRun(state, state.deadline);

  return {
    metrics: quickRunMetrics(state, state.endedAt ?? now),
    stationsCompleted: state.completedStations.length,
    complete: state.status === 'completed',
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/replay.test.ts src/engine/quickRun.test.ts`
Expected: PASS. `quickRun.test.ts` must stay green — `prepareQuickRun`'s contract did not change.

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
npm test
git add src/engine/replay.ts src/engine/replay.test.ts src/engine/quickRun.ts
git commit -m "feat: replay a Keylog to derive a Run's metrics

Replaying reproduces the live run's metrics exactly rather than
approximately, so a score can be derived from the log instead of believed.
quickRunAt splits constructing a ready Quick Run from choosing one at
random, which replay needs to rebuild a run at a known station."
```

---

### Task 4: The validator

**Files:**
- Create: `src/engine/integrity.ts`
- Test: `src/engine/integrity.test.ts`

**Interfaces:**
- Consumes: `KeyLog`, `KEYLOG_VERSION`, `KEYLOG_MAX_EVENTS` (Task 1).
- Produces: `type IntegrityReason`, `type Verdict = { ok: true } | { ok: false; reason: IntegrityReason }`, `INTEGRITY_THRESHOLDS`, `verifyKeyLog(log: KeyLog, replayedWpm: number): Verdict`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/integrity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KEYLOG_VERSION, type KeyEvent, type KeyLog } from './keylog';
import { verifyKeyLog } from './integrity';

/** A log with the given inter-key intervals. The first event is stamped at 0. */
function logOf(intervals: number[], extra: Partial<KeyEvent> = {}): KeyLog {
  const events: KeyEvent[] = [{ k: 'a', dt: 0, ...extra }];
  for (const dt of intervals) events.push({ k: 'a', dt, ...extra });
  return { v: KEYLOG_VERSION, t0: 0, ms: intervals.reduce((a, b) => a + b, 0), events };
}

/** Plausible human typing: roughly 110 wpm with ordinary variation. */
const HUMAN = Array.from({ length: 120 }, (_, i) => [128, 191, 97, 164, 233, 112, 145, 178, 88, 205][i % 10]!);
const HUMAN_WPM = 110;

describe('verifyKeyLog', () => {
  // The false-positive guard. Every threshold change reruns against this.
  it('passes plausible human typing', () => {
    expect(verifyKeyLog(logOf(HUMAN), HUMAN_WPM)).toEqual({ ok: true });
  });

  it('passes a long thinking pause before the first keystroke', () => {
    const log = logOf(HUMAN);
    log.events[0]!.dt = 12_000;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: true });
  });

  it('rejects a log from another version', () => {
    const log = { ...logOf(HUMAN), v: 99 };
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects a log that runs backwards', () => {
    const log = logOf(HUMAN);
    log.events[40]!.dt = -50;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'malformed-log' });
  });

  it('rejects a log too short to judge', () => {
    expect(verifyKeyLog(logOf([100, 100, 100]), 60)).toEqual({
      ok: false, reason: 'too-few-keystrokes',
    });
  });

  it('rejects synthetic keystrokes', () => {
    expect(verifyKeyLog(logOf(HUMAN, { u: 1 }), HUMAN_WPM)).toEqual({
      ok: false, reason: 'untrusted-input',
    });
  });

  it('rejects a pasted station name', () => {
    const log = logOf(HUMAN);
    log.events[30]!.b = 11;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'batched-input' });
  });

  it('tolerates the two- and three-character bursts a predictive keyboard sends', () => {
    const log = logOf(HUMAN);
    log.events[10]!.b = 2;
    log.events[20]!.b = 3;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: true });
  });

  it('rejects many small bursts even when none is large', () => {
    const log = logOf(HUMAN);
    for (let i = 1; i <= 12; i++) log.events[i * 5]!.b = 2;
    expect(verifyKeyLog(log, HUMAN_WPM)).toEqual({ ok: false, reason: 'batched-input' });
  });

  it('rejects a speed no human reaches', () => {
    expect(verifyKeyLog(logOf(HUMAN), 420)).toEqual({ ok: false, reason: 'impossible-speed' });
  });

  it('rejects a stopped clock', () => {
    // performance.now() overridden to a constant: every delta collapses to zero.
    const log = logOf(Array.from({ length: 120 }, () => 0));
    expect(verifyKeyLog(log, 9_000)).toEqual({ ok: false, reason: 'impossible-speed' });
  });

  it('rejects the metronome timing of a scripted bot', () => {
    const log = logOf(Array.from({ length: 120 }, () => 100));
    expect(verifyKeyLog(log, 120)).toEqual({ ok: false, reason: 'inhuman-consistency' });
  });

  it('rejects a bot that adds a little jitter', () => {
    const log = logOf(Array.from({ length: 120 }, (_, i) => 100 + (i % 5)));
    expect(verifyKeyLog(log, 120)).toEqual({ ok: false, reason: 'inhuman-consistency' });
  });

  it('does not judge consistency on too small a sample', () => {
    // 30 uniform intervals is below the sample floor: suspicious, not provable.
    const log = logOf(Array.from({ length: 30 }, () => 150));
    expect(verifyKeyLog(log, 80)).toEqual({ ok: true });
  });

  it('never penalises perfect accuracy on its own', () => {
    expect(verifyKeyLog(logOf(HUMAN), 180)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/integrity.test.ts`
Expected: FAIL — `Failed to resolve import "./integrity"`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/integrity.ts`:

```ts
import { KEYLOG_MAX_EVENTS, KEYLOG_VERSION, type KeyLog } from './keylog';

export type IntegrityReason =
  | 'malformed-log'
  | 'too-few-keystrokes'
  | 'untrusted-input'
  | 'batched-input'
  | 'impossible-speed'
  | 'inhuman-consistency';

export type Verdict = { ok: true } | { ok: false; reason: IntegrityReason };

/**
 * Every number the validator judges by, in one place.
 *
 * These are deliberately generous. A false positive costs an honest player a
 * leaderboard entry, so each threshold sits well clear of what a human can
 * actually do rather than close to it.
 */
export const INTEGRITY_THRESHOLDS = {
  /** Below this the statistics mean nothing. */
  minEvents: 20,
  /** "Kelana Jaya" pastes as one event of 11. Predictive keyboards send 2-3. */
  maxBatchPerEvent: 4,
  maxBatchedEvents: 8,
  /** The sustained human record is around 212 wpm. */
  maxWpm: 300,
  minMedianIntervalMs: 40,
  minIntervalsForConsistency: 40,
  /** Humans run 0.35-0.7; a setInterval script runs 0.01-0.05. */
  minCoefficientOfVariation: 0.12,
} as const;

const fail = (reason: IntegrityReason): Verdict => ({ ok: false, reason });

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Judges one Keylog. Total: every input produces a Verdict, nothing throws.
 *
 * `replayedWpm` comes from Replay rather than being derived here. A Keylog
 * records which keys were pressed and when, but not which were correct — only
 * Replay knows that, because only Replay knows the route.
 *
 * Checks run cheapest-and-most-certain first, so the reported Reason is the
 * most defensible one available.
 */
export function verifyKeyLog(log: KeyLog, replayedWpm: number): Verdict {
  const t = INTEGRITY_THRESHOLDS;

  if (log.v !== KEYLOG_VERSION) return fail('malformed-log');
  if (log.events.length > KEYLOG_MAX_EVENTS) return fail('malformed-log');
  if (log.events.some((event) => event.dt < 0)) return fail('malformed-log');
  if (log.events.length < t.minEvents) return fail('too-few-keystrokes');

  if (log.events.some((event) => event.u === 1)) return fail('untrusted-input');

  const batched = log.events.filter((event) => (event.b ?? 1) > 1);
  if (batched.some((event) => (event.b ?? 1) >= t.maxBatchPerEvent)) return fail('batched-input');
  if (batched.length > t.maxBatchedEvents) return fail('batched-input');

  // The first event's delta measures the pause before typing began, not an
  // inter-key interval. A player thinking for ten seconds is not evidence.
  const intervals = log.events.slice(1).map((event) => event.dt);

  if (replayedWpm > t.maxWpm) return fail('impossible-speed');
  if (median(intervals) < t.minMedianIntervalMs) return fail('impossible-speed');

  if (
    intervals.length >= t.minIntervalsForConsistency &&
    coefficientOfVariation(intervals) < t.minCoefficientOfVariation
  ) {
    return fail('inhuman-consistency');
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/integrity.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Type check and commit**

```bash
npx tsc --noEmit
git add src/engine/integrity.ts src/engine/integrity.test.ts
git commit -m "feat: judge a Keylog against human typing

One pure function, one threshold table. Accuracy and long pauses are
deliberately never checked: fast typists are also accurate, and a pause
only lowers the player's own score."
```

---

### Task 5: Profile and leaderboard record fields

**Files:**
- Modify: `src/engine/progress.ts`
- Modify: `src/engine/leaderboard.ts`
- Test: `src/engine/progress.test.ts`
- Test: `src/engine/leaderboard.test.ts`

**Interfaces:**
- Consumes: `IntegrityReason` (Task 4).
- Produces: `INTEGRITY_FAIL_LIMIT`, `interface IntegrityFail { t: number; mode: 'line' | 'quick'; reason: IntegrityReason }`, `recordIntegrityFail(profile: Profile, fail: IntegrityFail): Profile`, `Profile.integrityFails?: IntegrityFail[]`, `LeaderboardEntry.verified?: true`, and `makeEntry` gaining an optional `verified?: boolean` parameter.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/progress.test.ts` (add `recordIntegrityFail`, `INTEGRITY_FAIL_LIMIT` to the existing import from `./progress`):

```ts
describe('recordIntegrityFail', () => {
  it('records a failure newest first', () => {
    let profile = emptyProfile();
    profile = recordIntegrityFail(profile, { t: 1, mode: 'line', reason: 'batched-input' });
    profile = recordIntegrityFail(profile, { t: 2, mode: 'quick', reason: 'untrusted-input' });
    expect(profile.integrityFails).toEqual([
      { t: 2, mode: 'quick', reason: 'untrusted-input' },
      { t: 1, mode: 'line', reason: 'batched-input' },
    ]);
  });

  it('keeps only the most recent failures', () => {
    let profile = emptyProfile();
    for (let i = 0; i < INTEGRITY_FAIL_LIMIT + 5; i++) {
      profile = recordIntegrityFail(profile, { t: i, mode: 'line', reason: 'impossible-speed' });
    }
    expect(profile.integrityFails).toHaveLength(INTEGRITY_FAIL_LIMIT);
    expect(profile.integrityFails![0]!.t).toBe(INTEGRITY_FAIL_LIMIT + 4);
  });

  it('does not mutate the profile it is given', () => {
    const profile = emptyProfile();
    recordIntegrityFail(profile, { t: 1, mode: 'line', reason: 'malformed-log' });
    expect(profile.integrityFails).toBeUndefined();
  });

  it('survives a save and load round trip', () => {
    const profile = recordIntegrityFail(emptyProfile(), {
      t: 7, mode: 'quick', reason: 'inhuman-consistency',
    });
    saveProfile(profile);
    expect(loadProfile().integrityFails).toEqual([
      { t: 7, mode: 'quick', reason: 'inhuman-consistency' },
    ]);
  });

  it('loads a profile saved before the field existed', () => {
    const old = { ...emptyProfile() };
    delete (old as Partial<Profile>).integrityFails;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    const loaded = loadProfile();
    expect(loaded.recovered).toBeUndefined();
    expect(loaded.integrityFails).toBeUndefined();
  });
});
```

`src/engine/progress.test.ts` already has `beforeEach(() => localStorage.clear())` at module level, so the round-trip cases need no extra setup. Add `recordIntegrityFail`, `INTEGRITY_FAIL_LIMIT` and `type Profile` to the existing import from `./progress`.

Append to `src/engine/leaderboard.test.ts`:

```ts
describe('makeEntry verification', () => {
  const metrics = { wpm: 60, accuracy: 0.95, score: 54.15 };

  it('marks a verified entry', () => {
    const entry = makeEntry({
      id: 'a', name: 'Mirza', lineCode: 'MR', metrics, weight: 1, playedAt: 0, verified: true,
    });
    expect(entry.verified).toBe(true);
  });

  it('leaves an unverified entry unmarked rather than marking it false', () => {
    const entry = makeEntry({
      id: 'a', name: 'Mirza', lineCode: 'MR', metrics, weight: 1, playedAt: 0,
    });
    expect(entry.verified).toBeUndefined();
    expect('verified' in entry).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/progress.test.ts src/engine/leaderboard.test.ts`
Expected: FAIL — no exported member `recordIntegrityFail`; `verified` not on the `makeEntry` parameter type.

- [ ] **Step 3: Implement the profile field**

In `src/engine/progress.ts`, add the import at the top:

```ts
import type { IntegrityReason } from './integrity';
```

Add above the `Profile` interface:

```ts
export const INTEGRITY_FAIL_LIMIT = 20;

/** One Run that failed its Verdict. Kept so false positives are visible. */
export interface IntegrityFail {
  t: number;
  mode: 'line' | 'quick';
  reason: IntegrityReason;
}
```

Add to the `Profile` interface, after `wpmHistory`:

```ts
  /**
   * Runs that failed their Verdict, newest first, capped at
   * INTEGRITY_FAIL_LIMIT. Optional and additive, so older saves carry forward
   * untouched through migrate's spread — the path `muted` and `quickBest` took.
   * There is no UI for it; it exists so a false positive is visible before a
   * server is built on the assumption it cannot happen.
   */
  integrityFails?: IntegrityFail[];
```

Append the recorder beside the other `record*` functions:

```ts
export function recordIntegrityFail(profile: Profile, fail: IntegrityFail): Profile {
  return {
    ...profile,
    integrityFails: [fail, ...(profile.integrityFails ?? [])].slice(0, INTEGRITY_FAIL_LIMIT),
  };
}
```

`emptyProfile` is deliberately left alone: the field is optional and absent means "nothing has ever failed", which is the honest default for a save written before it existed.

- [ ] **Step 4: Implement the leaderboard field**

In `src/engine/leaderboard.ts`, add to the `LeaderboardEntry` interface after `playedAt`:

```ts
  /**
   * Present only on entries whose Keylog replayed and passed its Verdict.
   * Optional, so SCHEMA_VERSION does not move and loadStore's version check
   * still passes. Entries written before integrity existed stay unmarked.
   */
  verified?: true;
```

Change `makeEntry` to accept and carry it:

```ts
export function makeEntry(params: {
  id: string;
  name: string;
  lineCode: LineCode;
  metrics: Metrics;
  weight: number;
  playedAt: number;
  verified?: boolean;
}): LeaderboardEntry {
  const { id, name, lineCode, metrics, weight, playedAt, verified } = params;
  const entry: LeaderboardEntry = {
    id,
    name,
    lineCode,
    wpm: metrics.wpm,
    accuracy: metrics.accuracy,
    score: metrics.score,
    weightedScore: metrics.score * weight,
    playedAt,
  };
  if (verified) entry.verified = true;
  return entry;
}
```

- [ ] **Step 5: Carry the flag through submission**

In `src/data/leaderboardStore.ts`, add `verified?: boolean` to `submitEntry`'s `params` type and pass it through to `makeEntry`:

```ts
export function submitEntry(
  net: NetworkIndex,
  store: LeaderboardStore,
  params: { name: string; lineCode: LineCode; metrics: Metrics; playedAt: number; verified?: boolean },
): SubmitResult {
  const { name, lineCode, metrics, playedAt, verified } = params;
  const q = evaluateRun(net, store, lineCode, metrics);
  const id = `${lineCode}-${playedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = makeEntry({
    id, name: name.trim(), lineCode, metrics, weight: q.weight, playedAt, verified,
  });
```

The rest of the function is unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine/progress.test.ts src/engine/leaderboard.test.ts src/data/leaderboardStore.test.ts`
Expected: PASS.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
npm test
git add src/engine/progress.ts src/engine/progress.test.ts src/engine/leaderboard.ts src/engine/leaderboard.test.ts src/data/leaderboardStore.ts
git commit -m "feat: record integrity failures and mark verified entries

Both fields are optional and additive, so no schema version moves and
existing saves load untouched. The failure log has no UI: it exists so a
false positive shows up in the data before a server depends on it."
```

---

### Task 6: Input provenance and the recorder

**Files:**
- Modify: `src/ui/useKeyboard.ts`
- Modify: `src/ui/TypingInputProvider.tsx`
- Create: `src/ui/useRunRecorder.ts`
- Test: `src/ui/useRunRecorder.test.ts`
- Test: `src/ui/TypingInputProvider.test.tsx`

**Interfaces:**
- Consumes: `KeySource`, `KeyLog`, `beginLog`, `appendKey`, `PLAIN_SOURCE` (Task 1).
- Produces: `runTick(): number`, `interface RunRecorder { record(key: string, source?: KeySource): number; snapshot(): KeyLog; reset(startedAt: number): void }`, `useRunRecorder(startedAt: number): RunRecorder`. The `InputHandler` / key-listener signature becomes `(key: string, source: KeySource) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/useRunRecorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { KEYLOG_VERSION } from '../engine/keylog';
import { runTick, useRunRecorder } from './useRunRecorder';

describe('runTick', () => {
  it('gives whole milliseconds', () => {
    expect(Number.isInteger(runTick())).toBe(true);
  });

  it('does not go backwards', () => {
    const first = runTick();
    expect(runTick()).toBeGreaterThanOrEqual(first);
  });
});

describe('useRunRecorder', () => {
  it('opens a log at the run start', () => {
    const { result } = renderHook(() => useRunRecorder(500));
    expect(result.current.snapshot()).toEqual({
      v: KEYLOG_VERSION, t0: 500, ms: 0, events: [],
    });
  });

  it('accumulates keystrokes and returns the tick each was recorded at', () => {
    const { result } = renderHook(() => useRunRecorder(runTick()));
    let tick = 0;
    act(() => { tick = result.current.record('a'); });
    act(() => { result.current.record('b'); });

    const log = result.current.snapshot();
    expect(log.events.map((e) => e.k)).toEqual(['a', 'b']);
    expect(Number.isInteger(tick)).toBe(true);
  });

  it('carries the source onto the event', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a', { trusted: false, batch: 3 }); });
    const event = result.current.snapshot().events[0]!;
    expect(event.u).toBe(1);
    expect(event.b).toBe(3);
  });

  it('treats an omitted source as an ordinary keystroke', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a'); });
    const event = result.current.snapshot().events[0]!;
    expect(event.u).toBeUndefined();
    expect(event.b).toBeUndefined();
  });

  it('does not re-render the component when recording', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useRunRecorder(0);
    });
    const before = renders;
    act(() => {
      for (let i = 0; i < 50; i++) result.current.record('a');
    });
    expect(renders).toBe(before);
  });

  it('reopens an empty log on reset', () => {
    const { result } = renderHook(() => useRunRecorder(0));
    act(() => { result.current.record('a'); });
    act(() => { result.current.reset(900); });
    expect(result.current.snapshot()).toEqual({
      v: KEYLOG_VERSION, t0: 900, ms: 0, events: [],
    });
  });
});
```

In `src/ui/TypingInputProvider.test.tsx`, first widen the existing probe's handler type so a test can read the Source. Change `ProbeProps` at the top of the file:

```ts
import type { KeySource } from '../engine/keylog';

interface ProbeProps {
  active?: boolean;
  onKey: (key: string, source: KeySource) => void;
}
```

`Probe` and `GameInputOnly` need no other change. Then append this describe block, using the `GameInputOnly` probe the file already defines:

```ts
describe('keystroke provenance', () => {
  function renderProbe(onKey: (key: string, source: KeySource) => void, enabled = true) {
    return render(
      <TypingInputProvider enabled={enabled}>
        <GameInputOnly onKey={onKey} />
      </TypingInputProvider>,
    );
  }

  it('reports how many characters one input event delivered', () => {
    // A paste arrives as a single input event carrying the whole name.
    const received: { key: string; batch: number }[] = [];
    renderProbe((key, source) => received.push({ key, batch: source.batch }));

    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'abc' } });

    expect(received.map((r) => r.key)).toEqual(['a', 'b', 'c']);
    expect(received.every((r) => r.batch === 3)).toBe(true);
  });

  it('reports an ordinary single keystroke as a batch of one', () => {
    const received: { key: string; batch: number }[] = [];
    renderProbe((key, source) => received.push({ key, batch: source.batch }));

    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'a' } });

    expect(received).toEqual([{ key: 'a', batch: 1 }]);
  });

  // jsdom cannot produce a trusted event, so a dispatched keydown is exactly
  // the synthetic case this check exists to catch.
  it('marks a dispatched keydown as untrusted', () => {
    const received: boolean[] = [];
    renderProbe((_key, source) => received.push(source.trusted), false);

    fireEvent.keyDown(window, { key: 'a' });

    expect(received).toEqual([false]);
  });
});
```

The last case passes `enabled={false}` so `useGameInput` routes through `useKeyboard` — the desktop path — rather than the mobile input.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/useRunRecorder.test.ts src/ui/TypingInputProvider.test.tsx`
Expected: FAIL — `Failed to resolve import "./useRunRecorder"`, and the handler receives one argument where the tests read a second.

- [ ] **Step 3: Report provenance from the keyboard**

Replace `src/ui/useKeyboard.ts` entirely:

```ts
import { useEffect } from 'react';
import type { KeySource } from '../engine/keylog';

export type KeyListener = (key: string, source: KeySource) => void;

/**
 * Desktop keyboard event primitive. Suppresses the browser default for
 * printable keys and space so the page never scrolls mid-run. Mobile typing
 * is bridged through TypingInputProvider and useGameInput.
 *
 * Every keystroke carries its Source. This layer never rejects one: blocking
 * an untrusted event here would silently break any assistive tool that
 * dispatches its own, and a player who cannot type has a worse problem than a
 * leaderboard they cannot enter. The Verdict decides; this only reports.
 */
export function useKeyboard(onKey: KeyListener, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || [...e.key].length === 1) e.preventDefault();
      onKey(e.key, { trusted: e.isTrusted, batch: 1 });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, active]);
}
```

- [ ] **Step 4: Report provenance from the mobile input**

In `src/ui/TypingInputProvider.tsx`:

Add the import:

```ts
import type { KeySource } from '../engine/keylog';
```

Change the handler type:

```ts
type InputHandler = (key: string, source: KeySource) => void;
```

Replace `emitInputValue`, `handleInput` and `handleCompositionEnd`:

```ts
  // The whole value is drained and each character emitted, which is how a
  // paste of a full Station name gets in. It is not blocked: an Android
  // predictive keyboard also delivers several characters at once, and
  // telling them apart here is guesswork. The batch size is reported
  // instead, and the Verdict decides.
  const emitInputValue = useCallback((input: HTMLInputElement, trusted: boolean) => {
    const value = input.value;
    input.value = '';
    const characters = [...value];
    const source: KeySource = { trusted, batch: characters.length };
    for (const character of characters) handlerRef.current?.(character, source);
  }, []);

  const handleInput = useCallback((event: FormEvent<HTMLInputElement>) => {
    if (!composingRef.current) emitInputValue(event.currentTarget, event.isTrusted);
  }, [emitInputValue]);

  const handleCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    emitInputValue(event.currentTarget, event.isTrusted);
  }, [emitInputValue]);
```

`useGameInput`'s signature needs no change — `InputHandler` now carries the second parameter, and `useKeyboard` accepts the same shape.

- [ ] **Step 5: Write the recorder**

Create `src/ui/useRunRecorder.ts`:

```ts
import { useCallback, useMemo, useRef } from 'react';
import {
  PLAIN_SOURCE,
  appendKey,
  beginLog,
  type KeyLog,
  type KeySource,
} from '../engine/keylog';

/**
 * The clock a Run is recorded against: whole milliseconds, monotonic.
 *
 * Screens use this rather than `performance.now()` directly for anything a
 * Run's state is stamped with, so the live Run and its Keylog share one clock
 * and a replay reproduces the Run's Metrics exactly.
 */
export function runTick(): number {
  return Math.round(performance.now());
}

export interface RunRecorder {
  /** Records one keystroke and returns the tick it was recorded at. */
  record: (key: string, source?: KeySource) => number;
  snapshot: () => KeyLog;
  reset: (startedAt: number) => void;
}

/**
 * Accumulates a Run's Keylog.
 *
 * Ref-backed on purpose: a 37-station Line Run is roughly 500 keystrokes, and
 * recording one must not re-render anything. This is the only impure unit in
 * the integrity design — everything that judges is pure and lives in engine/.
 */
export function useRunRecorder(startedAt: number): RunRecorder {
  const logRef = useRef<KeyLog | null>(null);
  if (logRef.current === null) logRef.current = beginLog(startedAt);

  const record = useCallback((key: string, source: KeySource = PLAIN_SOURCE) => {
    const now = runTick();
    logRef.current = appendKey(logRef.current!, key, source, now);
    return now;
  }, []);

  const snapshot = useCallback(() => logRef.current!, []);

  const reset = useCallback((next: number) => {
    logRef.current = beginLog(next);
  }, []);

  return useMemo(() => ({ record, snapshot, reset }), [record, snapshot, reset]);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui/useRunRecorder.test.ts src/ui/TypingInputProvider.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. `AdventureScreen` and the other callers pass a one-parameter handler, which is still assignable to a two-parameter listener type — no call site needs changing.

- [ ] **Step 8: Type check and commit**

```bash
npx tsc --noEmit
git add src/ui/useKeyboard.ts src/ui/TypingInputProvider.tsx src/ui/TypingInputProvider.test.tsx src/ui/useRunRecorder.ts src/ui/useRunRecorder.test.ts
git commit -m "feat: report keystroke provenance and record a Run's Keylog

The input layer annotates and never rejects. Blocking an untrusted or
batched event here would break real players — an assistive tool that
dispatches its own events, an Android predictive keyboard — and a player
who cannot type has a worse problem than a leaderboard they cannot enter."
```

---

### Task 7: Gate the leaderboard on the Verdict

**Files:**
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/SummaryScreen.tsx`
- Modify: `src/ui/QuickRunScreen.tsx`
- Modify: `src/ui/summary.css`
- Test: `src/ui/SummaryScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: `SummaryScreen` gains optional props `keylog?: KeyLog` and `leaderboardFrom?: string`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/SummaryScreen.test.tsx`. The file already has `const net`, a `finished` run, and a module-level `beforeEach(() => localStorage.clear())`, so the new cases need no extra setup. Add these imports:

```ts
import { loadProfile } from '../engine/progress';
import { appendKey, beginLog, PLAIN_SOURCE, type KeyLog } from '../engine/keylog';
import { keyLineRun, lineRunRoute } from '../engine/lineRun';
import { startRun } from '../engine/run';
import { stationAt } from '../engine/network';

const INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];

/** Plays a complete MR run, returning both the Run and the Keylog beside it. */
function playMR(source = PLAIN_SOURCE) {
  const route = lineRunRoute(net, 'MR', 'kl-sentral');
  const t0 = 5_000;
  let run = startRun(net, 'kl-sentral', t0);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/SummaryScreen.test.tsx`
Expected: FAIL — `leaderboardFrom` and `keylog` are not props of `SummaryScreen`; the panel renders for every run.

- [ ] **Step 3: Gate the summary**

In `src/ui/SummaryScreen.tsx`, add the imports:

```ts
import { useMemo, useState, useEffect, useRef } from 'react';
import type { KeyLog } from '../engine/keylog';
import { verifyKeyLog, type IntegrityReason } from '../engine/integrity';
import { replayLineRun } from '../engine/replay';
import { loadProfile, recordIntegrityFail, saveProfile } from '../engine/progress';
```

Extend the props:

```ts
export function SummaryScreen({
  net,
  run,
  onExit,
  leaderboardLine = null,
  leaderboardFrom = null,
  keylog = null,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
  leaderboardLine?: LineCode | null;
  /** The terminus the Line Run started from. Needed to replay it. */
  leaderboardFrom?: string | null;
  /** The Run's evidence. Absent for Adventure, which has no board. */
  keylog?: KeyLog | null;
}) {
```

After the existing `const [store, setStore] = useState(() => loadStore());`, add:

```ts
  // Eligibility is decided once per summary, from the Run's own evidence. The
  // Metrics that reach the board are the replayed ones, not the ones the Run
  // reported — the two are identical for an honest Run, and only the replayed
  // pair can be re-derived by anyone else later.
  const eligibility = useMemo(() => {
    if (!leaderboardLine || !leaderboardFrom || !keylog) return null;

    const replayed = replayLineRun(net, leaderboardLine, leaderboardFrom, keylog);
    if (!replayed || !replayed.complete) {
      return { ok: false as const, reason: 'malformed-log' as IntegrityReason, metrics: null };
    }

    const verdict = verifyKeyLog(keylog, replayed.metrics.wpm);
    return verdict.ok
      ? { ok: true as const, metrics: replayed.metrics }
      : { ok: false as const, reason: verdict.reason, metrics: replayed.metrics };
  }, [net, leaderboardLine, leaderboardFrom, keylog]);

  // Kept so a false positive is visible in the data. No UI reads it.
  const failRecorded = useRef(false);
  useEffect(() => {
    if (!eligibility || eligibility.ok || failRecorded.current) return;
    failRecorded.current = true;
    saveProfile(recordIntegrityFail(loadProfile(), {
      t: Date.now(), mode: 'line', reason: eligibility.reason,
    }));
  }, [eligibility]);
```

Change `qualification` to use the replayed Metrics and to exist only for an eligible Run:

```ts
  const boardMetrics = eligibility?.ok ? eligibility.metrics : null;
  const qualification = useMemo(
    () => (leaderboardLine && boardMetrics ? evaluateRun(net, store, leaderboardLine, boardMetrics) : null),
    [leaderboardLine, net, store, boardMetrics],
  );
```

Change `split` so the layout still splits when the message replaces the panel:

```ts
  const split = hasJourney && Boolean(leaderboardLine) && eligibility !== null;
```

Replace the `{leaderboardLine && qualification && (...)}` block with:

```tsx
        {leaderboardLine && eligibility && (
          <div
            className="summary-side"
            style={{ '--line-colour': lineAt(net, leaderboardLine)?.colour ?? pathColour } as React.CSSProperties}
          >
            {eligibility.ok && qualification && boardMetrics ? (
              <LeaderboardPanel
                qualification={qualification}
                score={boardMetrics.score}
                lineName={lineAt(net, leaderboardLine)?.name ?? leaderboardLine}
                knownNames={knownNames(store)}
                onSubmit={(name) => {
                  const result = submitEntry(net, store, {
                    name,
                    lineCode: leaderboardLine,
                    metrics: boardMetrics,
                    playedAt: Date.now(),
                    verified: true,
                  });
                  setStore(result.store);
                  return { overallRank: result.overallRank, lineRank: result.lineRank };
                }}
              />
            ) : (
              // Deliberately reasonless. An honest player knows something
              // happened and can say so; a cheater gets no gradient to tune
              // against.
              <p className="summary-ineligible" role="status">
                This run wasn&apos;t eligible for the leaderboard.
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Style the message**

Append to `src/ui/summary.css`:

```css
.summary-ineligible {
  margin: 0;
  padding: 1rem;
  color: var(--ink-muted);
  font-size: 0.9rem;
  text-align: center;
}
```

`--ink-muted` is defined for both themes in `src/styles/tokens.css:19` and `:50`, so the message dims correctly in paper and midnight alike.

- [ ] **Step 5: Wire the Line Run screen**

In `src/ui/LineRunScreen.tsx`:

Add the imports:

```ts
import { runTick, useRunRecorder } from './useRunRecorder';
import type { KeySource } from '../engine/keylog';
```

Replace the run's initialisation:

```ts
  const [startedAt] = useState(runTick);
  const [run, setRun] = useState<RunState>(() => startRun(net, from, startedAt));
  const recorder = useRunRecorder(startedAt);
```

Replace `onKey` — recording happens in the callback, never inside the updater, because a state updater must stay pure and React may invoke it twice:

```ts
  const onKey = useCallback((key: string, source?: KeySource) => {
    const now = recorder.record(key, source);
    setRun((prev) => keyLineRun(net, route, prev, key, now));
  }, [net, route, recorder]);
```

Update `skipToEnd` — it calls `onKey` directly, so it keeps working unchanged; it is stripped from production builds by `import.meta.env.DEV`.

Pass the evidence to the summary:

```tsx
    return (
      <SummaryScreen
        net={net}
        run={run}
        onExit={onExit}
        leaderboardLine={leaderboardLine}
        leaderboardFrom={from}
        keylog={recorder.snapshot()}
      />
    );
```

- [ ] **Step 6: Wire the Quick Run screen**

In `src/ui/QuickRunScreen.tsx`:

Add the imports:

```ts
import { runTick, useRunRecorder } from './useRunRecorder';
import { replayQuickRun } from '../engine/replay';
import { verifyKeyLog, type Verdict } from '../engine/integrity';
import { recordIntegrityFail } from '../engine/progress';
import type { KeySource } from '../engine/keylog';
```

Add the recorder beside the other run state, after `const [run, setRun] = useState<QuickRunState>(...)`:

```ts
  const [startedAt] = useState(runTick);
  const recorder = useRunRecorder(startedAt);
```

Replace `onKey`:

```ts
  const onKey = useCallback((key: string, source?: KeySource) => {
    const keyNow = recorder.record(key, source);
    setDisplayNow(keyNow);
    setRun((previous) => enterQuickCharacter(net, previous, key, keyNow));
  }, [net, recorder]);
```

In the completion effect (the one guarded by `completionSaved`), gate the best on the Verdict. Replace the opening of that effect with:

```ts
  useEffect(() => {
    if (run.status !== 'completed' || completionSaved.current) return;
    completionSaved.current = true;

    const metrics = quickRunMetrics(run, run.endedAt ?? displayNow);

    // A Quick Run's best is gated on the same evidence a Line Run's board
    // entry is, or instrumenting it would be decorative.
    const log = recorder.snapshot();
    const replayed = replayQuickRun(net, line, initialStart.current, run.initialToward, log);
    const verdict: Verdict = replayed && replayed.complete
      ? verifyKeyLog(log, replayed.metrics.wpm)
      : { ok: false, reason: 'malformed-log' };

    if (!verdict.ok) {
      const updated = recordIntegrityFail(profileRef.current, {
        t: Date.now(), mode: 'quick', reason: verdict.reason,
      });
      profileRef.current = updated;
      saveProfile(updated);
      setProfile(updated);
      setSummaryBest(bestAtStart.current);
      return;
    }

    const previousBest = bestAtStart.current ?? 0;
    if (metrics.score <= previousBest) {
      setSummaryBest(bestAtStart.current);
      return;
    }
```

The rest of that effect — where it calls `recordQuickBest` and sets `newBest` — is unchanged. Add `net`, `line`, and `recorder` to its dependency array.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/ui/SummaryScreen.test.tsx`
Expected: PASS, 5 new tests.

- [ ] **Step 8: Run the full suite and type check**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: PASS across the board. `LineRunScreen.test.tsx`, `QuickRunScreen.test.tsx` and `LeaderboardPanel.test.tsx` all exercise these paths and must stay green.

If a screen test fails because a simulated run is now judged ineligible, the fix is in the test, not the threshold: the test types with a uniform or zero interval, which is precisely what `inhuman-consistency` and `impossible-speed` exist to catch. Give the simulated typing varied intervals, the way `playMR` in `SummaryScreen.test.tsx` does.

- [ ] **Step 9: Commit**

```bash
git add src/ui/LineRunScreen.tsx src/ui/QuickRunScreen.tsx src/ui/SummaryScreen.tsx src/ui/SummaryScreen.test.tsx src/ui/summary.css
git commit -m "feat: gate the leaderboard on a Run's verdict

The score that reaches the board is derived by replaying the Run's Keylog
rather than reported by the Run. A failing run keeps its stats and loses
only its name entry, with no reason shown: an honest player knows
something happened, a cheater gets no gradient to tune against."
```

---

### Task 8: Update the project documents

The glossary and the handoff document are both load-bearing here — `CONTEXT.md` is canonical for naming and `docs/STATUS.md` is what a fresh reader starts from.

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add the new vocabulary**

Append to `CONTEXT.md`, in the **Measuring** section:

```markdown
**Keylog**:
The record of one Run's typing — every keystroke with its timing and how it
arrived. The Run's evidence.
_Avoid_: keystroke log, trace, telemetry

**Source**:
How a keystroke reached the game: whether the browser marked its event trusted,
and how many characters arrived in the same event.
_Avoid_: provenance, origin

**Verdict**:
The result of judging a Keylog: a pass, or a single named Reason for failing.

**Replay**:
Feeding a Keylog back through the Run engine to derive its Metrics, rather than
believing the Metrics the Run reported.

**Eligible**:
A completed Run whose Keylog replays cleanly and passes its Verdict. Only
eligible Runs reach a leaderboard.
```

- [ ] **Step 2: Record the new invariant**

Add to the "Invariants that are easy to break" list in `docs/STATUS.md`:

```markdown
10. **The recorder owns the Run clock.** Screens stamp Run state with
    `runTick()`, not `performance.now()`, and pass the tick the recorder
    returns. One clock means a replayed Keylog reproduces the live Run's
    Metrics exactly rather than approximately — which is the property the whole
    integrity layer rests on. `src/engine/replay.test.ts` guards it.
```

- [ ] **Step 3: Update what exists and what is debt**

In `docs/STATUS.md`, under **What exists**, add after the local leaderboard paragraph:

```markdown
**Run integrity** — Line Run and Quick Run record a Keylog: every keystroke with
its timing and how it arrived. Finishing a Line Run replays that log to derive
the score, and a pure validator judges it before the leaderboard will take it.
The input layer annotates keystrokes but never rejects them, so a false positive
costs a leaderboard entry rather than the ability to play. Design and reasoning
in `docs/superpowers/specs/2026-09-10-run-integrity-design.md`.
```

In the **Known debt** list, remove the bullet stating that Line Run's route and
end rules live in `LineRunScreen.tsx:85-99` with no direct test — Task 2 moved
them into `engine/lineRun.ts` and gave them tests.

Add to **Known debt**:

```markdown
- **`untrusted-input` is a hard fail with an unquantified false-positive rate.**
  Assistive input tools that dispatch synthetic DOM events would be refused the
  leaderboard. `profile.integrityFails` records every refusal so this shows up
  in the data; nothing reads it yet.
```

In the **Document map** table, add:

```markdown
| `docs/superpowers/specs/2026-09-10-run-integrity-design.md` | Run integrity: the Keylog, replay, and the validator. |
| `docs/superpowers/plans/2026-09-11-run-integrity.md` | Plan 3 — 8 tasks. |
```

Update the "Last updated" date at the top of `docs/STATUS.md` and the test count in **Getting started** to whatever `npm test` now reports.

- [ ] **Step 4: Commit**

```bash
npm test
git add CONTEXT.md docs/STATUS.md
git commit -m "docs: record the integrity layer in the glossary and handoff

Adds Keylog, Source, Verdict, Replay and Eligible to CONTEXT.md, the
recorder-owns-the-clock invariant to STATUS.md, and retires the Line Run
route-rule debt that task 2 paid down."
```
