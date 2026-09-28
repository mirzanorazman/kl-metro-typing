# Rush Hour tuning, Junction rows, and tips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rush Hour challenging in a way typing speed controls, cut the Junction chooser down to what matters, and teach the mode with one-time tips that freeze the game.

**Architecture:** Spawns are weighted by rail distance from the train, and arrival resets a Station's Overflow ring (pure engine, `src/engine/rushHour.ts`). New constants go in `rushBalance.ts`. The UI gains a Rush-only Junction component and a pure tip-detection module; the screen freezes the Run for a tip with the existing `pause`/`resume` actions, so Replay and bests are untouched. Tip progress lives in an optional Profile field.

**Tech Stack:** TypeScript, React 18, Vite, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md` (amends `docs/superpowers/specs/2026-09-28-rush-hour-design.md`).

## Global Constraints

- Branch `feat/rush-hour`. Vocabulary follows `CONTEXT.md`: say **Passenger(s)**, never "riders" or "cargo", in code, copy and tests.
- The engine stays pure and deterministic: no tips, no UI state, no `Math.random` in `src/engine/rushHour.ts`.
- Every tuning number lives in `src/engine/rushBalance.ts`.
- No Profile schema version bump: new Profile fields are optional and additive.
- Adventure's `JunctionPicker` (`src/ui/JunctionPicker.tsx`) and `StationSearch`'s behaviour for its existing callers must not change.
- `tsconfig.json` has `noUnusedLocals` and `noUnusedParameters`: remove imports you stop using.
- After each task: `npm test` green, `npx tsc --noEmit` clean, commit, tick the box in this plan, and update `docs/superpowers/rush-hour-handover.md` "Current position".
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## File map

| File | Change |
|---|---|
| `src/engine/rushBalance.ts` | `SPAWN_FALLOFF_HOPS`; new Capacity, spawn rate, escalation, Day phases |
| `src/engine/rushHour.ts` | `railHops`, `rushSpawnWeights`, `rushSuggestedStart`; local spawning; arrival resets ring |
| `src/engine/rushHour.test.ts` | New rule tests; Day-phase and FIFO tests updated for new constants |
| `src/engine/rushDrive.testutil.ts` | `steer` and `watch` options |
| `src/engine/rushTypists.testutil.ts` | **New.** Greedy and planner scripted typists |
| `src/engine/rushProbe.test.ts` | Speed-rewards balance test; survey uses the planner |
| `src/engine/progress.ts` (+ test) | `rushTipsSeen?`, `markRushTipSeen`, `resetRushTips` |
| `src/ui/RushJunction.tsx` | **New.** Compact Junction rows with Walk keys |
| `src/ui/rushTips.ts` (+ test) | **New.** Tip copy and `newRushTips` detection |
| `src/ui/RushHourScreen.tsx` | Use `RushJunction`; Load shows `/CARRIAGE_CAPACITY`; tip card and freezing; ready hint |
| `src/ui/StationSearch.tsx` (+ test) | Optional `suggested` Station, picked by Enter |
| `src/ui/RushSetup.tsx` | Step labels, suggested start, How to play |
| `src/ui/rush.css` | Junction row, pips, tip card styles; drop `.junction-note` |
| `src/ui/RushHour.test.tsx` | Junction, tips and setup tests |
| `CONTEXT.md`, `docs/STATUS.md`, handover | Train Capacity 8; status; balance closed |

---

### Task 1: Spawns centre on the train; arrival resets the ring

**Files:**
- Modify: `src/engine/rushBalance.ts`
- Modify: `src/engine/rushHour.ts`
- Test: `src/engine/rushHour.test.ts`

**Interfaces:**
- Produces:
  - `SPAWN_FALLOFF_HOPS: number` (3) in `rushBalance.ts`.
  - `railHops(net: NetworkIndex, lineSet: readonly LineCode[], from: string): ReadonlyMap<string, number>` — rail hops over the Line set, Walk links excluded, cached.
  - `rushSpawnWeights(net: NetworkIndex, lineSet: readonly LineCode[], at: string): number[]` — one weight per `rushGeometry(net, lineSet).spawns` entry, same order.

- [x] **Step 1: Write the failing tests**

In `src/engine/rushHour.test.ts`, add `SPAWN_FALLOFF_HOPS` to the `./rushBalance` import and `railHops, rushSpawnWeights` to the `./rushHour` import. Add after the `rushGeometry` describe block:

```ts
describe('spawns centre on the train', () => {
  it('counts rail hops over the Line set only', () => {
    const hops = railHops(net, ['KJ'], 'gombak');
    expect(hops.get('gombak')).toBe(0);
    expect(hops.get('taman-melati')).toBe(1);
    expect(hops.has('titiwangsa')).toBe(false);
  });

  it('weights a spawn Station by demand, falling off with hops from the train', () => {
    const geo = rushGeometry(net, ['KJ']);
    const hops = railHops(net, ['KJ'], 'gombak');
    const weights = rushSpawnWeights(net, ['KJ'], 'gombak');
    expect(weights).toHaveLength(geo.spawns.length);
    geo.spawns.forEach((p, i) => {
      expect(weights[i]).toBeCloseTo(p.weight * Math.exp(-hops.get(p.station)! / SPAWN_FALLOFF_HOPS));
    });
    const at = (id: string) => weights[geo.spawns.findIndex((p) => p.station === id)]!;
    expect(at('taman-melati')).toBeGreaterThan(at('putra-heights'));
  });

  it('fills Queues near the train, not at the far end of the Line', () => {
    const started = enterRushCharacter(net, startRush(net, ['KJ'], 'gombak', 11), 'g', 1_000);
    const s = advanceRush(net, started, 1_000 + 60_000);
    const hops = railHops(net, ['KJ'], 'gombak');
    let near = 0;
    let far = 0;
    for (const [id, q] of Object.entries(s.queues)) {
      const h = hops.get(id)!;
      if (h <= 5) near += q.passengers.length;
      else if (h >= 20) far += q.passengers.length;
    }
    expect(near).toBeGreaterThan(far);
  });
});
```

In the `typing and movement` describe block, add:

```ts
  it("arriving resets the Station's Overflow ring even when nobody can board", () => {
    let s = begin(['KJ'], 'gombak');
    s = { ...s, load: passengers(Array(CARRIAGE_CAPACITY).fill('AG'), 1) };
    s = withQueue(s, 'gombak', Array(QUEUE_CAPACITY).fill('MR'));
    s = { ...s, queues: { ...s.queues, gombak: { ...s.queues['gombak']!, overflowMs: 10_000 } } };
    const [after] = typeStation(s, 1_000);
    expect(after.queues['gombak']!.passengers).toHaveLength(QUEUE_CAPACITY);
    expect(after.queues['gombak']!.overflowMs).toBe(0);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/rushHour.test.ts`
Expected: FAIL — `railHops` / `rushSpawnWeights` / `SPAWN_FALLOFF_HOPS` are not exported; the ring test fails with `overflowMs` 10 000-plus.

- [x] **Step 3: Add the constant**

In `src/engine/rushBalance.ts`, after `BASE_SPAWN_PER_SECOND`:

```ts
/**
 * A spawn Station's weight is `demand × e^(−hops / SPAWN_FALLOFF_HOPS)`, hops
 * counted by rail from the train. Crowding happens where the player can reach
 * it, so typing speed, not a distant Station's luck, decides the Run.
 */
export const SPAWN_FALLOFF_HOPS = 3;
```

- [x] **Step 4: Implement rail hops and spawn weights**

In `src/engine/rushHour.ts`, add `SPAWN_FALLOFF_HOPS` to the `./rushBalance` import. After `rushGeometry`, add:

```ts
const hopsCache = new WeakMap<NetworkIndex, Map<string, ReadonlyMap<string, number>>>();

/** Rail hops over the Line set from `from` to every Station it reaches. Walk links excluded. */
export function railHops(
  net: NetworkIndex,
  lineSet: readonly LineCode[],
  from: string,
): ReadonlyMap<string, number> {
  const key = `${rushLineSetKey(lineSet)}|${from}`;
  let perNet = hopsCache.get(net);
  if (!perNet) hopsCache.set(net, (perNet = new Map()));
  const cached = perNet.get(key);
  if (cached) return cached;

  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of onwardOptions(net, cur, null)) {
      if (!lineSet.includes(d.line) || dist.has(d.next)) continue;
      dist.set(d.next, dist.get(cur)! + 1);
      queue.push(d.next);
    }
  }
  perNet.set(key, dist);
  return dist;
}

/**
 * Each spawn Station's weight with the train at `at`, in `rushGeometry` spawn
 * order. Stations the train cannot reach by rail weigh 0; if none can be
 * reached the weights fall back to plain `demand`.
 */
export function rushSpawnWeights(net: NetworkIndex, lineSet: readonly LineCode[], at: string): number[] {
  const { spawns } = rushGeometry(net, lineSet);
  const hops = railHops(net, lineSet, at);
  const weights = spawns.map((p) => {
    const h = hops.get(p.station);
    return h === undefined ? 0 : p.weight * Math.exp(-h / SPAWN_FALLOFF_HOPS);
  });
  return weights.some((w) => w > 0) ? weights : spawns.map((p) => p.weight);
}
```

- [x] **Step 5: Use the weights in the tick**

Replace `pickWeighted` with an index picker:

```ts
function pickIndex(weights: readonly number[], r: number): number {
  let x = r * weights.reduce((n, w) => n + w, 0);
  for (let i = 0; i < weights.length; i++) {
    if (x < weights[i]!) return i;
    x -= weights[i]!;
  }
  return weights.length - 1;
}
```

In `tick`, replace

```ts
      const point = pickWeighted(geo.spawns, geo.totalWeight, r);
```

with

```ts
      const point = geo.spawns[pickIndex(rushSpawnWeights(net, s.lineSet, s.at), r)]!;
```

The PRNG draw count is unchanged (one for the Station, one for the target).

- [x] **Step 6: Reset the ring on arrival**

In `arrive`, change the `queues` line to:

```ts
    queues: {
      ...state.queues,
      [at]: { passengers: queue.passengers.slice(boarding.length), overflowMs: 0 },
    },
```

- [x] **Step 7: Run the tests**

Run: `npx vitest run src/engine/rushHour.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. Then `npm test`. If `src/engine/rushProbe.test.ts` "lets a 60 WPM typist…" now fails, leave it: Task 2 replaces that test. Everything else must pass.

- [x] **Step 8: Commit**

```bash
git add src/engine/rushBalance.ts src/engine/rushHour.ts src/engine/rushHour.test.ts
git commit -m "feat: centre rush hour spawns on the train and reset rings on arrival

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New constants, planner typist, speed-rewards balance test

**Files:**
- Modify: `src/engine/rushBalance.ts`
- Modify: `src/engine/rushDrive.testutil.ts`
- Create: `src/engine/rushTypists.testutil.ts`
- Modify: `src/engine/rushProbe.test.ts`
- Modify: `src/engine/rushHour.test.ts` (Day-phase and FIFO tests)
- Modify: `src/ui/RushHourScreen.tsx` (Load denominator)
- Modify: `CONTEXT.md` (train Capacity)

**Interfaces:**
- Consumes: `railHops` (Task 1).
- Produces:
  - `DriveOptions.steer?: (s: RushState) => boolean` and `DriveOptions.watch?: (s: RushState) => void`.
  - `rushTypists.testutil.ts`: `greedyChoose(s: RushState): RushActionBody`, `plannerChoose(s: RushState): RushActionBody`, `plannerSteer(s: RushState): boolean`.

- [x] **Step 1: Update the tests that pin constants**

In `src/engine/rushHour.test.ts`, replace the body of `it('walks the day and escalates later Days', …)`:

```ts
    expect(rushDayPhase(0)).toMatchObject({ day: 1, name: 'Off-Peak', multiplier: 0.8 });
    expect(rushDayPhase(10_000)).toMatchObject({ day: 1, name: 'Morning Peak', multiplier: 1.8 });
    expect(rushDayPhase(124_999)).toMatchObject({ day: 1, name: 'Late Night' });
    const day2 = rushDayPhase(125_000);
    expect(day2).toMatchObject({ day: 2, name: 'Off-Peak' });
    expect(day2.multiplier).toBeCloseTo(0.8 * 1.5);
    expect(rushDayPhase(5_000).progress).toBeCloseTo(0.5);
```

Replace the FIFO test so the Queue is longer than the room left (it must not depend on the Capacity value):

```ts
  it('arriving delivers matching Load, then boards the Queue first-in-first-out', () => {
    let s = begin(['KJ'], 'gombak');
    const staying = Array(CARRIAGE_CAPACITY - 2).fill('AG') as LineCode[];
    s = { ...s, load: passengers(['KJ', ...staying], 1) };
    s = withQueue(s, 'gombak', ['AG', 'MR', 'SP', 'AG', 'MR', 'SP']);
    const [after] = typeStation(s, 1_000);
    expect(after.delivered).toBe(1);
    expect(after.load).toHaveLength(CARRIAGE_CAPACITY);
    expect(after.load.slice(-2).map((p) => p.id)).toEqual([1000, 1001]);
    expect(after.queues['gombak']!.passengers.map((p) => p.id)).toEqual([1002, 1003, 1004, 1005]);
  });
```

- [x] **Step 2: Add `steer` and `watch` to the driver**

In `src/engine/rushDrive.testutil.ts`, add to `DriveOptions`:

```ts
  /** Before the first key of each Station; returning true turns the train around. */
  steer?: (s: RushState) => boolean;
  /** Sees the state after every sim advance, e.g. to time the first crowding. */
  watch?: (s: RushState) => void;
```

In `drive`, add `let turnedAt = -1;` beside `let keys = 0;`. After `state = advanceRush(net, state, now);` add `o.watch?.(state);`. Insert this branch immediately before the `state.stage === 'typing'` branch:

```ts
    } else if (
      state.status !== 'paused' && state.stage === 'typing' && state.typing.cursor === 0 &&
      state.arrivedFrom !== null && turnedAt !== keys && o.steer?.(state)
    ) {
      turnedAt = keys;
      act({ a: 'turn' });
```

(`turnedAt` allows at most one turn between keys, so a typist cannot spin in place.)

- [x] **Step 3: Create the typists**

Create `src/engine/rushTypists.testutil.ts`:

```ts
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { CARRIAGE_CAPACITY, OVERFLOW_MS } from './rushBalance';
import { deliverableAt, queueCapacity, railHops, type RushActionBody, type RushState } from './rushHour';

/** Test support: scripted Rush Hour routing, for balance tests and the probe. */

const net = buildNetwork(loadNetworkData());

/** Picks the Direction whose next Station delivers most, then has most waiting. Never turns. */
export function greedyChoose(s: RushState): RushActionBody {
  let best = s.options[0]!;
  let score = -1;
  for (const o of s.options) {
    const v = deliverableAt(net, s, o.next) * 3 + (s.queues[o.next]?.passengers.length ?? 0);
    if (v > score) {
      score = v;
      best = o;
    }
  }
  return { a: 'choose', line: best.line, next: best.next };
}

/**
 * The Station a sensible player heads for from `from`: what it would deliver
 * plus how urgent its Queue is, discounted by distance.
 */
function goal(s: RushState, from: string): string {
  const room = CARRIAGE_CAPACITY - s.load.length;
  let best = from;
  let bestScore = -Infinity;
  for (const [id, hops] of railHops(net, s.lineSet, from)) {
    if (hops === 0) continue;
    const q = s.queues[id]!;
    const fill = q.passengers.length / queueCapacity(net, id);
    const urgency = q.overflowMs > 0 ? 10 + (20 * q.overflowMs) / OVERFLOW_MS : fill * fill * 8;
    const value = deliverableAt(net, s, id) * 2 + (room > 0 ? urgency : urgency * 0.3);
    const score = value / (1 + hops * 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

const hopsTo = (s: RushState, from: string, to: string) => railHops(net, s.lineSet, from).get(to) ?? Infinity;

/** At a Junction, takes the Direction that gets closest to the goal. */
export function plannerChoose(s: RushState): RushActionBody {
  const g = goal(s, s.at);
  let best = s.options[0]!;
  for (const o of s.options) if (hopsTo(s, o.next, g) < hopsTo(s, best.next, g)) best = o;
  return { a: 'choose', line: best.line, next: best.next };
}

/** Turns around when the Station just left is closer to the goal than the one ahead. */
export function plannerSteer(s: RushState): boolean {
  if (s.arrivedFrom === null) return false;
  const g = goal(s, s.arrivedFrom);
  return hopsTo(s, s.arrivedFrom, g) < hopsTo(s, s.at, g);
}
```

- [x] **Step 4: Replace the balance test and the survey**

Replace the whole of `src/engine/rushProbe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { LineCode } from '../data/types';
import { buildNetwork } from './network';
import { drive } from './rushDrive.testutil';
import { queueCapacity, rushDayPhase, rushGeometry, type RushState } from './rushHour';
import { greedyChoose, plannerChoose, plannerSteer } from './rushTypists.testutil';

const net = buildNetwork(loadNetworkData());
const ALL: LineCode[] = ['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY'];
/** ≈ 40, 60 and 90 WPM. */
const SLOW = 300;
const MID = 200;
const FAST = 133;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const halfFull = (s: RushState) =>
  rushGeometry(net, s.lineSet).stations.some((id) => s.queues[id]!.passengers.length * 2 >= queueCapacity(net, id));

function play(lineSet: LineCode[], start: string, seed: number, msPerKey: number) {
  let firstCrowdMs = Infinity;
  const { state } = drive({
    lineSet, start, seed, msPerKey, limitMs: 20 * 60_000,
    choose: plannerChoose,
    steer: plannerSteer,
    watch: (s) => {
      if (firstCrowdMs === Infinity && halfFull(s)) firstCrowdMs = s.gameMs;
    },
  });
  return { state, firstCrowdMs };
}

const survival = (lineSet: LineCode[], start: string, msPerKey: number) =>
  median([1, 2, 3].map((seed) => play(lineSet, start, seed, msPerKey).state.gameMs));

describe('rush hour balance', () => {
  it('rewards speed: 90 WPM outlasts 40 WPM on a long Line and on every Line', () => {
    expect(survival(['KJ'], 'masjid-jamek', FAST)).toBeGreaterThan(survival(['KJ'], 'masjid-jamek', SLOW));
    expect(survival(ALL, 'masjid-jamek', FAST)).toBeGreaterThan(survival(ALL, 'masjid-jamek', SLOW));
  }, 120_000);

  it('crowds some Queue to half its Capacity within the first minute', () => {
    for (const seed of [1, 2, 3]) {
      expect(play(['KJ'], 'masjid-jamek', seed, MID).firstCrowdMs).toBeLessThan(60_000);
    }
  }, 120_000);

  // Opt-in survey for tuning: RUSH_PROBE=1 npx vitest run src/engine/rushProbe.test.ts
  it.skipIf(!process.env.RUSH_PROBE)('prints survival across speeds and Line sets', () => {
    const sets: [LineCode[], string][] = [
      [['KJ'], 'masjid-jamek'],
      [['MR'], 'hang-tuah'],
      [['KJ', 'AG', 'SP'], 'masjid-jamek'],
      [ALL, 'masjid-jamek'],
    ];
    console.log('median of 5 seeds — run s / delivered / first half-full Queue s; columns 40, 60, 90 WPM');
    for (const [lineSet, start] of sets) {
      const cells = [SLOW, MID, FAST].map((ms) => {
        const runs = [1, 2, 3, 4, 5].map((seed) => play(lineSet, start, seed, ms));
        const secs = median(runs.map((r) => r.state.gameMs)) / 1000;
        const delivered = median(runs.map((r) => r.state.delivered));
        const crowd = median(runs.map((r) => r.firstCrowdMs)) / 1000;
        const day = rushDayPhase(median(runs.map((r) => r.state.gameMs))).day;
        return `${Math.round(secs)}s D${day} ${delivered}d c${Math.round(crowd)}`.padEnd(22);
      });
      console.log(`${lineSet.length === ALL.length ? 'ALL' : lineSet.join('+')}`.padEnd(10) + cells.join(''));
    }
    // The greedy typist never turns around: a floor for what thoughtless routing gets.
    const greedy = drive({ lineSet: ['KJ'], start: 'masjid-jamek', seed: 1, msPerKey: MID, choose: greedyChoose });
    console.log(`greedy KJ 60 WPM: ${Math.round(greedy.state.gameMs / 1000)}s ${greedy.state.delivered}d`);
  }, 600_000);
});
```

- [x] **Step 5: Run the new tests to verify they fail on the old constants**

Run: `npx vitest run src/engine/rushProbe.test.ts src/engine/rushHour.test.ts`
Expected: FAIL — the Day-phase test (old phases). The rewritten FIFO test is Capacity-independent and passes on both old and new values; the speed and crowding tests may already pass thanks to Task 1. That is fine: they guard the tuning in Step 9.

- [x] **Step 6: Set the new constants**

In `src/engine/rushBalance.ts`:

```ts
export const CARRIAGE_CAPACITY = 8;
export const BASE_SPAWN_PER_SECOND = 0.6;
export const DAY_ESCALATION = 0.5;

export const DAY_PHASES: readonly DayPhaseSpec[] = [
  { name: 'Off-Peak', ms: 10_000, multiplier: 0.8 },
  { name: 'Morning Peak', ms: 40_000, multiplier: 1.8 },
  { name: 'Midday', ms: 20_000, multiplier: 1.0 },
  { name: 'Evening Peak', ms: 40_000, multiplier: 2.0 },
  { name: 'Late Night', ms: 15_000, multiplier: 0.6 },
];
```

Update the `CARRIAGE_CAPACITY` doc comment to "Passengers per carriage. v1 has one carriage of 8." Leave the other constants unchanged.

- [x] **Step 7: Show the real Capacity in the HUD**

In `src/ui/RushHourScreen.tsx`, import `CARRIAGE_CAPACITY` alongside `OVERFLOW_MS` from `../engine/rushBalance` and change `<dd>{run.load.length}/4</dd>` to:

```tsx
              <dd>{run.load.length}/{CARRIAGE_CAPACITY}</dd>
```

In `CONTEXT.md`, the **Capacity** entry: change "the train (4 per carriage)" to "the train (8 per carriage)".

- [x] **Step 8: Run everything**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. If `src/engine/rushReplay.test.ts` fails because the Run now ends before its `pauseAt: 30_000`, change that driver call to `pauseAt: 10_000, resumeAt: 20_000` and rerun. Do the same for any other test whose scripted Run now ends before the moment it scripts.

- [x] **Step 9: Tuning pass**

Run: `RUSH_PROBE=1 npx vitest run src/engine/rushProbe.test.ts`
Compare against the spec's goal table (first half-full Queue under ~60 s; roughly 1.5 / 2.5 / 4 min at 40 / 60 / 90 WPM; Delivered rising with speed on every row). The spec's measured table is the expected ballpark. Adjust only constants in `rushBalance.ts`, one at a time, rerunning the survey and `npm test` each time. Stop when every row rises with speed and no Line set is far off the goal (within about ±40 %). Paste the final survey output into the handover under "Balance: decided after playtest".

- [x] **Step 10: Commit**

```bash
git add src/engine src/ui/RushHourScreen.tsx CONTEXT.md docs/superpowers/rush-hour-handover.md
git commit -m "feat: retune rush hour so typing speed decides the run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Compact Junction rows with Walk keys

**Files:**
- Create: `src/ui/RushJunction.tsx`
- Modify: `src/ui/RushHourScreen.tsx`
- Modify: `src/ui/rush.css`
- Test: `src/ui/RushHour.test.tsx`

**Interfaces:**
- Consumes: `deliverableAt`, `queueCapacity`, `RushState` from `../engine/rushHour`.
- Produces: `RushJunction({ net, run, onChoose, onWalk })` rendering `role="group"` named "Choose a direction"; `rushJunctionChoices(run): RushJunctionChoice[]`.

- [x] **Step 1: Write the failing test**

In `src/ui/RushHour.test.tsx`, add imports:

```ts
import { enterRushCharacter, startRush, type RushState } from '../engine/rushHour';
import { RushJunction } from './RushJunction';
```

Add:

```ts
describe('RushJunction', () => {
  /** A quiet KJ+KG Run standing at the KL Sentral Junction, which also offers a Walk. */
  const atKlSentral = (): RushState => {
    let s: RushState = { ...startRush(net, ['KJ', 'KG'], 'kl-sentral', 3), spawnDebt: -1e9 };
    for (const ch of s.typing.target) s = enterRushCharacter(net, s, ch, 1_000);
    return s;
  };

  it('shows one compact row per way, with Walks numbered after the rails', () => {
    let run = atKlSentral();
    const first = run.options[0]!;
    run = {
      ...run,
      load: [{ id: 1, target: first.line }],
      queues: { ...run.queues, [first.next]: { passengers: [{ id: 2, target: 'AG' }], overflowMs: 500 } },
    };
    const onChoose = vi.fn();
    const onWalk = vi.fn();
    render(
      <TypingInputProvider enabled={false}>
        <RushJunction net={net} run={run} onChoose={onChoose} onWalk={onWalk} />
      </TypingInputProvider>,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(run.options.length + 1);
    expect(rows[0]!.textContent).toContain('↓1');
    expect(screen.queryByText(/toward/)).toBeNull();
    const pips = rows[0]!.querySelector('.rush-pips')!;
    expect(pips.getAttribute('data-filling')).toBe('true');
    expect(pips.getAttribute('aria-label')).toMatch(/^1 of \d+ waiting$/);

    const walkKey = String(run.options.length + 1);
    expect(rows[run.options.length]!.textContent).toContain(`${walkKey}🚶Walk to Muzium Negara`);
    fireEvent.keyDown(window, { key: walkKey });
    expect(onWalk).toHaveBeenCalledWith('muzium-negara');
    fireEvent.keyDown(window, { key: '1' });
    expect(onChoose).toHaveBeenCalledWith(first);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/RushHour.test.tsx -t RushJunction`
Expected: FAIL — cannot resolve `./RushJunction`.

- [x] **Step 3: Create the component**

Create `src/ui/RushJunction.tsx`:

```tsx
import { useCallback } from 'react';
import { lineAt, stationAt, type Direction, type NetworkIndex } from '../engine/network';
import { deliverableAt, queueCapacity, type RushState } from '../engine/rushHour';
import { LineBadge } from './LineBadge';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';

export type RushJunctionChoice = { kind: 'rail'; dir: Direction } | { kind: 'walk'; to: string };

/** Rail Directions first, then Walks; the keys are 1, 2, 3… in this order. */
export function rushJunctionChoices(run: Pick<RushState, 'options' | 'walks'>): RushJunctionChoice[] {
  return [
    ...run.options.map((dir) => ({ kind: 'rail' as const, dir })),
    ...run.walks.map((to) => ({ kind: 'walk' as const, to })),
  ];
}

function QueuePips({ count, capacity, filling }: { count: number; capacity: number; filling: boolean }) {
  return (
    <span className="rush-pips" data-filling={filling ? 'true' : undefined} aria-label={`${count} of ${capacity} waiting`}>
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} data-on={i < count ? 'true' : undefined} />
      ))}
    </span>
  );
}

export interface RushJunctionProps {
  net: NetworkIndex;
  run: RushState;
  onChoose: (dir: Direction) => void;
  onWalk: (to: string) => void;
}

/**
 * Rush Hour's Junction chooser: per way only the next Station, how many of
 * the Load get off there, and its Queue. Adventure keeps `JunctionPicker`.
 */
export function RushJunction({ net, run, onChoose, onWalk }: RushJunctionProps) {
  const { focusInput } = useTypingInputControls();
  const choices = rushJunctionChoices(run);
  const take = useCallback((c: RushJunctionChoice) => {
    focusInput();
    if (c.kind === 'rail') onChoose(c.dir);
    else onWalk(c.to);
  }, [focusInput, onChoose, onWalk]);
  const onKey = useCallback((key: string) => {
    const n = Number(key);
    const choice = Number.isInteger(n) && n >= 1 ? choices[n - 1] : undefined;
    if (choice) take(choice);
  }, [choices, take]);
  useGameInput(onKey);

  return (
    <div className="junction rush-junction" role="group" aria-label="Choose a direction">
      <h2>Which way?</h2>
      <ul>
        {choices.map((c, i) => {
          if (c.kind === 'walk') {
            return (
              <li key={`walk-${c.to}`}>
                <button type="button" onClick={() => take(c)}>
                  <kbd>{i + 1}</kbd>
                  <span aria-hidden="true">🚶</span>
                  <span className="rush-junction-next">Walk to {stationAt(net, c.to)?.name}</span>
                </button>
              </li>
            );
          }
          const line = lineAt(net, c.dir.line);
          const queue = run.queues[c.dir.next];
          const off = deliverableAt(net, run, c.dir.next);
          return (
            <li key={`${c.dir.line}-${c.dir.next}`}>
              <button
                type="button"
                style={{ '--line-colour': line?.colour } as React.CSSProperties}
                onClick={() => take(c)}
              >
                <kbd>{i + 1}</kbd>
                {line && <LineBadge code={c.dir.line} colour={line.colour} />}
                <span className="rush-junction-next">{stationAt(net, c.dir.next)?.name}</span>
                {off > 0 && <strong className="rush-junction-off" aria-label={`${off} get off`}>↓{off}</strong>}
                <QueuePips
                  count={queue?.passengers.length ?? 0}
                  capacity={queueCapacity(net, c.dir.next)}
                  filling={(queue?.overflowMs ?? 0) > 0}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

If `React.CSSProperties` does not resolve, match `JunctionPicker.tsx`, which uses the same expression.

- [x] **Step 4: Use it in the run screen**

In `src/ui/RushHourScreen.tsx`:
- Replace the `JunctionPicker` import with `import { RushJunction } from './RushJunction';`.
- Delete the `deliveryNote` callback and remove `deliverableAt` from the `../engine/rushHour` import.
- Replace the `<JunctionPicker … />` element with:

```tsx
              <RushJunction net={net} run={run} onChoose={onChoose} onWalk={onWalk} />
```

- [x] **Step 5: Style the rows**

In `src/ui/rush.css`, delete the `.junction-note` rule and add:

```css
.rush-junction button {
  display: flex;
  align-items: center;
  gap: var(--s2);
}

.rush-junction-next {
  flex: 1;
}

.rush-junction-off {
  font: var(--t-xs) var(--font-mono);
}

.rush-pips {
  display: inline-flex;
  gap: 2px;
}

.rush-pips > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--ink-muted);
}

.rush-pips > span[data-on='true'] {
  background: var(--ink);
  border-color: var(--ink);
}

.rush-pips[data-filling='true'] > span[data-on='true'] {
  background: var(--error);
  border-color: var(--error);
}
```

- [x] **Step 6: Run the tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, including the existing `RushHourScreen` test that reaches the Junction.

- [x] **Step 7: Commit**

```bash
git add src/ui/RushJunction.tsx src/ui/RushHourScreen.tsx src/ui/rush.css src/ui/RushHour.test.tsx
git commit -m "feat: compact rush hour junction rows with walk keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tip copy, detection, and the seen list

**Files:**
- Create: `src/ui/rushTips.ts`
- Test: `src/ui/rushTips.test.ts`
- Modify: `src/engine/progress.ts`
- Test: `src/engine/progress.test.ts`

**Interfaces:**
- Produces:
  - `RUSH_TIPS: readonly { id: RushTipId; text: string }[]`, `type RushTipId = 'start' | 'board' | 'deliver' | 'junction' | 'walk' | 'overflow'`, `rushTipText(id: RushTipId): string`.
  - `newRushTips(prev: RushState, next: RushState, seen: ReadonlySet<string>): RushTipId[]` — moments between two states, in `RUSH_TIPS` order, minus `seen`. Never returns `'start'`.
  - `Profile.rushTipsSeen?: string[]`, `markRushTipSeen(profile: Profile, id: string): Profile`, `resetRushTips(profile: Profile): Profile`.

- [x] **Step 1: Write the failing tests**

Create `src/ui/rushTips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRush, type RushState } from '../engine/rushHour';
import { newRushTips, RUSH_TIPS, rushTipText } from './rushTips';

const net = buildNetwork(loadNetworkData());
const base = (): RushState => ({ ...startRush(net, ['KJ', 'KG'], 'kl-sentral', 1), status: 'running' });
const none = new Set<string>();

describe('newRushTips', () => {
  it('finds nothing when nothing happened', () => {
    const s = base();
    expect(newRushTips(s, s, none)).toEqual([]);
  });

  it('sees boarding and delivery on one arrival, in tip order', () => {
    const prev = { ...base(), load: [{ id: 1, target: 'AG' as const }] };
    const next = { ...prev, load: [{ id: 2, target: 'MR' as const }], delivered: 1 };
    expect(newRushTips(prev, next, none)).toEqual(['board', 'deliver']);
  });

  it('sees reaching a Junction, and a Walk when one is offered', () => {
    const prev = base();
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: [] }, none)).toEqual(['junction']);
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: ['muzium-negara'] }, none))
      .toEqual(['junction', 'walk']);
  });

  it('sees an Overflow ring start to fill', () => {
    const prev = base();
    const next = { ...prev, queues: { ...prev.queues, gombak: { passengers: [], overflowMs: 100 } } };
    expect(newRushTips(prev, next, none)).toEqual(['overflow']);
    expect(newRushTips(next, next, none)).toEqual([]);
  });

  it('skips tips already seen', () => {
    const prev = base();
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: ['muzium-negara'] }, new Set(['junction'])))
      .toEqual(['walk']);
  });

  it('has copy for every tip, in Passenger vocabulary', () => {
    for (const { id } of RUSH_TIPS) expect(rushTipText(id)).not.toMatch(/rider/i);
    expect(rushTipText('start')).toBe('Type the station name to start. Passengers appear near your train.');
  });
});
```

In `src/engine/progress.test.ts`, add `markRushTipSeen, resetRushTips` to the `./progress` import and add:

```ts
describe('Rush Hour tips seen', () => {
  it('records each tip once and resets to none', () => {
    let p = markRushTipSeen(emptyProfile(), 'junction');
    p = markRushTipSeen(p, 'junction');
    expect(p.rushTipsSeen).toEqual(['junction']);
    expect(resetRushTips(p).rushTipsSeen).toEqual([]);
  });

  it('survives a save, and older saves load without it', () => {
    saveProfile(markRushTipSeen(emptyProfile(), 'start'));
    expect(loadProfile().rushTipsSeen).toEqual(['start']);
    saveProfile(emptyProfile());
    expect(loadProfile().rushTipsSeen).toBeUndefined();
  });

  it('drops junk from a stored list', () => {
    saveProfile({ ...emptyProfile(), rushTipsSeen: ['walk', 7 as unknown as string] });
    expect(loadProfile().rushTipsSeen).toEqual(['walk']);
  });
});
```

(Check how the existing theme tests in that file clear `localStorage` between tests and follow the same setup.)

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/rushTips.test.ts src/engine/progress.test.ts`
Expected: FAIL — `./rushTips` missing; `markRushTipSeen` not exported.

- [x] **Step 3: Implement the tips module**

Create `src/ui/rushTips.ts`:

```ts
import type { RushState } from '../engine/rushHour';

/** One-time Rush Hour tips, in the order they queue when moments coincide. */
export const RUSH_TIPS = [
  { id: 'start', text: 'Type the station name to start. Passengers appear near your train.' },
  { id: 'board', text: 'Passengers board automatically. The badge shows the line they want.' },
  { id: 'deliver', text: 'Passengers get off at any station on their line.' },
  { id: 'junction', text: 'Pick a way by its number. ↓ = passengers getting off there, dots = people waiting.' },
  { id: 'walk', text: 'Walk to switch lines. Typing locks for 5 s.' },
  { id: 'overflow', text: 'A full station starts to overflow. Visit it to reset the ring — if it fills, the Run ends.' },
] as const;

export type RushTipId = (typeof RUSH_TIPS)[number]['id'];

export function rushTipText(id: RushTipId): string {
  return RUSH_TIPS.find((t) => t.id === id)!.text;
}

/**
 * The tip moments that happened between two states, minus those `seen`.
 * `start` is not a moment: the screen shows it while the Run is ready.
 */
export function newRushTips(prev: RushState, next: RushState, seen: ReadonlySet<string>): RushTipId[] {
  const hit = new Set<RushTipId>();
  const aboard = new Set(prev.load.map((p) => p.id));
  if (next.load.some((p) => !aboard.has(p.id))) hit.add('board');
  if (next.delivered > prev.delivered) hit.add('deliver');
  if (next.stage === 'junction' && prev.stage !== 'junction') {
    hit.add('junction');
    if (next.walks.length > 0) hit.add('walk');
  }
  const ringStarted = Object.entries(next.queues).some(
    ([id, q]) => q.overflowMs > 0 && (prev.queues[id]?.overflowMs ?? 0) === 0,
  );
  if (ringStarted) hit.add('overflow');
  return RUSH_TIPS.map((t) => t.id).filter((id) => hit.has(id) && !seen.has(id));
}
```

- [x] **Step 4: Add the Profile field and helpers**

In `src/engine/progress.ts`, add to `Profile` after `integrityFails`:

```ts
  /**
   * Rush Hour tips already shown, by id. Optional and additive, so older saves
   * carry forward through migrate's spread, the path `theme` took.
   */
  rushTipsSeen?: string[];
```

In `migrate`, add to the returned object:

```ts
    rushTipsSeen: Array.isArray(rec.rushTipsSeen)
      ? rec.rushTipsSeen.filter((id): id is string => typeof id === 'string')
      : undefined,
```

After `recordRushBest`, add:

```ts
export function markRushTipSeen(profile: Profile, id: string): Profile {
  const seen = profile.rushTipsSeen ?? [];
  return seen.includes(id) ? profile : { ...profile, rushTipsSeen: [...seen, id] };
}

/** "How to play": every tip shows again on the next Run. */
export function resetRushTips(profile: Profile): Profile {
  return { ...profile, rushTipsSeen: [] };
}
```

- [x] **Step 5: Run the tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/ui/rushTips.ts src/ui/rushTips.test.ts src/engine/progress.ts src/engine/progress.test.ts
git commit -m "feat: detect rush hour tip moments and remember tips seen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tips in the run screen, freezing the Run

**Files:**
- Modify: `src/ui/RushHourScreen.tsx`
- Modify: `src/ui/rush.css`
- Test: `src/ui/RushHour.test.tsx`

**Interfaces:**
- Consumes: `newRushTips`, `rushTipText`, `RUSH_TIPS`, `RushTipId` (Task 4); `markRushTipSeen`, `loadProfile`, `saveProfile`, `emptyProfile` (Task 4 / existing).
- Produces: a tip card with `role="dialog"` and name "Tip"; the ready hint "Type the station name to start".

- [x] **Step 1: Keep the existing screen tests tip-free**

In `src/ui/RushHour.test.tsx`, add imports `emptyProfile, saveProfile` from `../engine/progress` and `RUSH_TIPS` from `./rushTips`, then add a helper below `type`:

```ts
const seeAllTips = () => saveProfile({ ...emptyProfile(), rushTipsSeen: RUSH_TIPS.map((t) => t.id) });
```

Call `seeAllTips();` as the first line of both existing `RushHourScreen` tests.

- [x] **Step 2: Write the failing test**

In the `RushHourScreen` describe block, add:

```ts
  it('shows the start tip, then freezes on the first Junction until a key dismisses the tip', () => {
    renderRun();
    expect(screen.getByText('Type the station name to start. Passengers appear near your train.')).toBeTruthy();
    type('Hang Tuah');
    expect(screen.queryByText(/Passengers appear near your train/)).toBeNull();

    const tip = screen.getByRole('dialog', { name: 'Tip' });
    expect(tip.textContent).toMatch(/Pick a way by its number/);
    expect(screen.queryByRole('group', { name: 'Choose a direction' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Choose a direction' })).toBeTruthy();
    expect(loadProfile().rushTipsSeen).toEqual(expect.arrayContaining(['start', 'junction']));
  });

  it('shows each tip only once', () => {
    saveProfile({ ...emptyProfile(), rushTipsSeen: ['start', 'junction'] });
    renderRun();
    expect(screen.queryByText(/Passengers appear near your train/)).toBeNull();
    type('Hang Tuah');
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Choose a direction' })).toBeTruthy();
  });
```

- [x] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/ui/RushHour.test.tsx`
Expected: FAIL — no start tip text, no Tip dialog.

- [x] **Step 4: Implement the tip card and tip state**

In `src/ui/RushHourScreen.tsx`, add `markRushTipSeen` to the `../engine/progress` import, and add:

```ts
import { newRushTips, rushTipText, type RushTipId } from './rushTips';
```

Beside `PauseOverlay`, add:

```tsx
/** A one-time tip. The Run is paused while it shows; any key or click dismisses it. */
function TipCard({ id, onDismiss }: { id: RushTipId; onDismiss: () => void }) {
  return (
    <div className="rush-paused rush-tip" role="dialog" aria-label="Tip">
      <p>{rushTipText(id)}</p>
      <button type="button" onClick={onDismiss}>
        <kbd>any key</kbd> Got it
      </button>
    </div>
  );
}
```

Inside `RushHourScreen`, after the `actions` ref:

```ts
  // Tips: the seen list is read once; a tip is marked seen when it is shown.
  const seenTips = useRef(new Set(loadProfile().rushTipsSeen ?? []));
  const [tips, setTips] = useState<RushTipId[]>([]);
  const tipsShowing = useRef(false);
  tipsShowing.current = tips.length > 0;
  const tipPaused = useRef(false);
  const markSeen = useCallback((ids: RushTipId[]) => {
    let profile = loadProfile();
    for (const id of ids) {
      seenTips.current.add(id);
      profile = markRushTipSeen(profile, id);
    }
    saveProfile(profile);
  }, []);
  const dismissTip = useCallback(() => setTips((queue) => queue.slice(1)), []);
```

- [x] **Step 5: Route keys: a tip swallows one key; the first key marks `start` seen**

In `onKey`, directly after the `if (phoneLandscape || cur.status === 'ended') return;` line, add:

```ts
    if (tipsShowing.current) return dismissTip();
    if (cur.status === 'ready' && !seenTips.current.has('start') && key.length === 1) markSeen(['start']);
```

and add `dismissTip, markSeen` to its dependency array.

- [x] **Step 6: Detect moments, pause, and resume when the queue empties**

After the sounds effect, add:

```ts
  // Tips freeze the Run with the ordinary pause action, so Replay and bests
  // see nothing unusual.
  const tipPrev = useRef(run);
  useEffect(() => {
    const prev = tipPrev.current;
    tipPrev.current = run;
    if (run.status === 'ended' || run.status === 'ready') return;
    const fresh = newRushTips(prev, run, seenTips.current);
    if (fresh.length === 0) return;
    markSeen(fresh);
    setTips((queue) => [...queue, ...fresh]);
    if (currentRun.current.status === 'running') {
      tipPaused.current = true;
      act({ a: 'pause' });
    }
  }, [run, act, markSeen]);

  useEffect(() => {
    if (tips.length > 0 || !tipPaused.current) return;
    tipPaused.current = false;
    if (currentRun.current.status === 'paused') act({ a: 'resume' });
  }, [tips, act]);
```

- [x] **Step 7: Render the start tip, the tip card, and the new ready hint**

Just above `{run.stage === 'typing' && <Prompt … />}`, add:

```tsx
            {run.status === 'ready' && !seenTips.current.has('start') && (
              <p className="rush-tip-inline" role="note">{rushTipText('start')}</p>
            )}
```

In the hint, change `'Start typing to open the doors. '` to `'Type the station name to start · '`.

Replace `{run.status === 'paused' && <PauseOverlay onResume={() => act({ a: 'resume' })} />}` with:

```tsx
            {tips.length > 0 ? (
              <TipCard id={tips[0]!} onDismiss={dismissTip} />
            ) : (
              run.status === 'paused' && <PauseOverlay onResume={() => act({ a: 'resume' })} />
            )}
```

- [x] **Step 8: Style**

In `src/ui/rush.css`, add:

```css
.rush-tip p {
  max-width: 32ch;
  margin: 0;
  text-align: center;
}

.rush-tip-inline {
  margin: 0;
  padding: var(--s) var(--s2);
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  background: var(--panel);
  font-size: var(--t-sm);
}
```

- [x] **Step 9: Run the tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. If the new test sees a `board` tip before the Junction tip (a Passenger spawned during typing), dismiss tips in a loop until the Junction tip is shown, rather than changing the engine.

- [x] **Step 10: Commit**

```bash
git add src/ui/RushHourScreen.tsx src/ui/rush.css src/ui/RushHour.test.tsx
git commit -m "feat: show one-time rush hour tips that freeze the run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Setup — step labels, suggested start, How to play

**Files:**
- Modify: `src/engine/rushHour.ts` (+ `src/engine/rushHour.test.ts`)
- Modify: `src/ui/StationSearch.tsx` (+ `src/ui/StationSearch.test.tsx`)
- Modify: `src/ui/RushSetup.tsx`
- Test: `src/ui/RushHour.test.tsx`

**Interfaces:**
- Consumes: `resetRushTips` (Task 4).
- Produces: `rushSuggestedStart(net: NetworkIndex, lineSet: readonly LineCode[]): string`; `StationSearch` prop `suggested?: string`.

- [ ] **Step 1: Write the failing tests**

In `src/engine/rushHour.test.ts`, import `rushSuggestedStart` and add to the `rushGeometry` block:

```ts
  it('suggests the busiest Interchange on the Line set as the start', () => {
    for (const lineSet of [['KJ'], ['MR'], ['KJ', 'AG', 'SP']] as LineCode[][]) {
      const id = rushSuggestedStart(net, lineSet);
      const pick = stationAt(net, id)!;
      expect(rushGeometry(net, lineSet).stations).toContain(id);
      expect(linesOf(pick).length).toBeGreaterThan(1);
      const busiest = Math.max(...rushGeometry(net, lineSet).stations
        .map((s) => stationAt(net, s)!)
        .filter((s) => linesOf(s).length > 1)
        .map((s) => s.demand));
      expect(pick.demand).toBe(busiest);
    }
  });
```

In `src/ui/StationSearch.test.tsx`, add:

```ts
describe('StationSearch suggestion', () => {
  it('lists the suggested Station while the search is empty, and Enter picks it', () => {
    const onPick = vi.fn();
    render(<StationSearch net={net} onPick={onPick} suggested="masjid-jamek" />);
    expect(screen.getByRole('button', { name: /Masjid Jamek/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('masjid-jamek');
  });

  it('does nothing on Enter without a suggestion', () => {
    const onPick = vi.fn();
    render(<StationSearch net={net} onPick={onPick} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

In `src/ui/RushHour.test.tsx`, import `rushSuggestedStart` from `../engine/rushHour` and `markRushTipSeen` from `../engine/progress`, and add to the `RushSetup` block:

```ts
  it('labels the steps and starts at the suggested Station on Enter', () => {
    const onStart = vi.fn();
    render(<RushSetup net={net} onStart={onStart} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: '1 · Lines' })).toBeTruthy();
    type('MR');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: /2 · Start station/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onStart).toHaveBeenCalledWith(['MR'], rushSuggestedStart(net, ['MR']));
  });

  it('How to play brings the tips back', () => {
    saveProfile(markRushTipSeen(emptyProfile(), 'junction'));
    render(<RushSetup net={net} onStart={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /How to play/ }));
    expect(loadProfile().rushTipsSeen).toEqual([]);
    expect(screen.getByText(/Tips will show on your next Run/)).toBeTruthy();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/rushHour.test.ts src/ui/StationSearch.test.tsx src/ui/RushHour.test.tsx`
Expected: FAIL — `rushSuggestedStart` missing, no `suggested` behaviour, headings not found, no How to play button.

- [ ] **Step 3: Implement `rushSuggestedStart`**

In `src/engine/rushHour.ts`, after `queueCapacity`:

```ts
/** The start Setup offers first: Interchanges before ordinary stops, then higher demand, then name. */
export function rushSuggestedStart(net: NetworkIndex, lineSet: readonly LineCode[]): string {
  const rank = (id: string) => {
    const s = stationAt(net, id)!;
    return { hub: linesOf(s).length > 1 ? 1 : 0, demand: s.demand, name: s.name };
  };
  return [...rushGeometry(net, lineSet).stations].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return y.hub - x.hub || y.demand - x.demand || x.name.localeCompare(y.name);
  })[0]!;
}
```

- [ ] **Step 4: Add `suggested` to `StationSearch`**

In `src/ui/StationSearch.tsx`, add `stationAt` to the `../engine/network` import. Add the prop to the destructuring and type:

```ts
  /** Listed while the search is empty; Enter picks the top result. Rush Hour's start step. */
  suggested?: string;
```

Replace the `results` memo and wire Enter:

```tsx
  const results = useMemo(() => {
    const found = searchStations(net, query, filter);
    if (found.length > 0 || query.trim() !== '' || suggested === undefined) return found;
    const s = stationAt(net, suggested);
    return s ? [s] : [];
  }, [net, query, filter, suggested]);
  const pick = (id: string) => {
    sound.select();
    onPick(id);
  };
```

On the `<input>`, add:

```tsx
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || suggested === undefined || !results[0]) return;
          e.preventDefault();
          pick(results[0].id);
        }}
```

and change the result button's `onClick` to `() => pick(s.id)`.

- [ ] **Step 5: Update `RushSetup`**

In `src/ui/RushSetup.tsx`:
- Imports: add `rushSuggestedStart` to the existing `../engine/rushHour` import (the one that brings `rushLineSetKey`), `resetRushTips` and `saveProfile` to the `../engine/progress` import, and `stationAt` to the `../engine/network` import.
- Change `<h2>Which lines?</h2>` to `<h2>1 · Lines</h2>`.
- Change the `Start where?{' '}` heading text to `2 · Start station{' '}`.
- Next to `const key = …`, add `const suggested = chosen.length > 0 ? rushSuggestedStart(net, chosen) : null;`. In the picking branch (where `chosen.length > 0`, so `suggested` is set) pass `suggested={suggested ?? undefined}` to `StationSearch`, and below it add:

```tsx
              {suggested && (
                <p className="hint">
                  <kbd>Enter</kbd> starts at {stationAt(net, suggested)?.name}, or search for another station.
                </p>
              )}
```

- Add state `const [tipsReset, setTipsReset] = useState(false);` and, just before the "Back to map" button:

```tsx
          <button
            type="button"
            onClick={() => {
              saveProfile(resetRushTips(loadProfile()));
              setTipsReset(true);
            }}
          >
            <span>How to play</span>
          </button>
          {tipsReset && <p className="hint" role="status">Tips will show on your next Run.</p>}
```

- [ ] **Step 6: Run the tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, including the original `RushSetup` test (its button name "Choose a starting station" is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/engine/rushHour.ts src/engine/rushHour.test.ts src/ui/StationSearch.tsx src/ui/StationSearch.test.tsx src/ui/RushSetup.tsx src/ui/RushHour.test.tsx
git commit -m "feat: clearer rush hour setup with a suggested start and how to play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser check and docs

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/superpowers/rush-hour-handover.md`
- Modify: this plan (tick boxes)

- [ ] **Step 1: Browser check**

Follow the handover's method (a CDP script driving headless Chrome with `ws` from `node_modules`, `Input.dispatchKeyEvent`, `Page.captureScreenshot`; write the script in the scratchpad, not the repo). With `npm run dev` running and a clean `localStorage`:
1. Rush Hour setup: headings "1 · Lines" and "2 · Start station", the suggested start and its hint, the How to play button.
2. Run on KJ: the start tip before the first key; the Load reads `/8`.
3. First Junction: the tip card, then compact rows (key, badge, next Station, ↓N, pips) after a key.
4. A Line set with a Walk (KJ+KG from KL Sentral): the Walk row has a number and works by key.
5. Play on for 60 s: Queues crowd near the train within the first minute, and a ring turns the pips red.
Screenshot each; look at them. Fix anything broken, with a test where the break is testable.

- [ ] **Step 2: Update docs**

- `docs/STATUS.md`: in the Rush Hour entry, replace the **Open:** balance sentence with one line naming the tuning spec (`docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md`): spawns centre on the train, 8-seat train, 125 s Day, compact Junction rows, one-time tips. In the "Rush Hour v2" line, drop "and the balance decision above".
- `docs/superpowers/rush-hour-handover.md`: "Current position" says the tuning plan is done and the branch is ready to finish; keep the final survey table from Task 2.
- Tick every box in this plan.

- [ ] **Step 3: Full verification and commit**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

```bash
git add docs/STATUS.md docs/superpowers/rush-hour-handover.md docs/superpowers/plans/2026-09-28-rush-hour-tuning.md
git commit -m "docs: record rush hour tuning, junction rows, and tips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then use superpowers:finishing-a-development-branch.
