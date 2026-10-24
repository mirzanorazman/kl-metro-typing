# Dispatcher Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time Dispatcher player learns the core loop on one train up close (type Jelatek, watch it go, type Setiawangsa) before Shift 1, can replay it from How to play, and gets a one-time tip when trains join mid-Shift.

**Architecture:** The lesson is a small pure engine module (`dispatchLesson.ts`) holding its own throwaway `CareerState`, stepped with `stepSim` on a quiet phase (no demand, no Incidents, no extra trains). `DispatcherScreen` runs it as a mode through a `useDispatchLesson` hook: while a lesson is up, the map, overlay and typing line show the lesson's state and its keys go to the lesson, never to the recorder. When it ends, the map refits to the Shift's frame (MapCanvas already eases between frames) and the Career sits in its normal `ready` state. The lesson's "seen" flag is the string `'lesson'` in the profile's existing `dispatchTipsSeen`, so `resetDispatchTips` (How to play) brings it back.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-24-dispatcher-onboarding-design.md`

## Global Constraints

- Lesson input never reaches the Keylog, the action log or the Career state; existing replay tests pass untouched.
- Once seen, opening Dispatcher goes straight to the ready screen as today.
- Not shown in the dev-only `?dispatch=full` Career (it passes `initial`; no lesson when `initial` is given).
- Works at 1440×900 and 1024×768, both themes.
- Copy is in Dispatcher vocabulary (Station, Shift, Line capitalised as the existing tips do).

## Review Focus

1. **Esc during the lesson** skips to the ready screen; it must not leave Dispatcher (F1 made Esc on the ready screen leave). A second Esc then leaves. Test in Task 2.
2. **The first Career key after a lesson** is the Keylog's first event, and the judged Career replays complete. Test in Task 2.
3. **A wrong key in the lesson** stalls and is undone by Backspace exactly as in a Shift, and counts toward nothing. Test in Task 1 (engine) and Task 2 (screen shows "Wrong key", then not).
4. **Leaving mid-lesson with Back to map** does not mark it seen, so it shows next time. Test in Task 2.
5. **How to play after tips were seen** shows the lesson and then the start caption again. Test in Task 3.

---

### Task 1: The lesson engine

**Files:**
- Create: `src/engine/dispatchLesson.ts`
- Create: `src/engine/dispatchLesson.test.ts`
- Modify: `src/engine/dispatch.ts` (export the existing private `applyTargetKey`)

**Interfaces:**
- Consumes: `startCareer`, `applyTargetKey` (now exported, unchanged signature `(net: NetworkIndex, state: CareerState, key: string) => CareerState`) from `dispatch.ts`; `startShiftSim`, `stepSim`, `cloneSim`, `type PhaseNow` from `dispatchSim.ts`; `visibleTargets`, `backspaceAim`, `reconcileAim` from `dispatchTargets.ts`; `TICK_MS` from `dispatchBalance.ts`.
- Produces (all in `src/engine/dispatchLesson.ts`):
  - `export const LESSON_SEEN = 'lesson'` (the id stored in `dispatchTipsSeen`)
  - `export const LESSON_NAMES = ['Jelatek', 'Setiawangsa'] as const`
  - `export type LessonStep = 'first' | 'moving' | 'second' | 'done'`
  - `export interface Lesson { career: CareerState; step: LessonStep; clockAt: number }`
  - `export function startLesson(net: NetworkIndex, now: number): Lesson`
  - `export function lessonStations(net: NetworkIndex): string[]` (ids of Dato' Keramat, Jelatek, Setiawangsa: the camera frame)
  - `export function advanceLesson(net: NetworkIndex, lesson: Lesson, now: number): Lesson`
  - `export function lessonKey(net: NetworkIndex, lesson: Lesson, key: string, now: number): Lesson` (advances to `now` first; printable keys and `'Enter'` type)
  - `export function lessonBackspace(net: NetworkIndex, lesson: Lesson, now: number): Lesson`

- [ ] **Step 1: Write the failing tests** in `src/engine/dispatchLesson.test.ts`

```ts
const names = (l: Lesson) => visibleTargets(net, l.career.sim).map((t) => t.text);
const typeAll = (l: Lesson, text: string, now: number) => [...text].reduce((s, k) => lessonKey(net, s, k, now), l);

it('starts with one KJ train waiting at the signal for Jelatek, and nothing else', () => {
  const l = startLesson(net, 1_000);
  expect(l.step).toBe('first');
  expect(names(l)).toEqual(['Jelatek']);
  expect(l.career.sim.trains).toHaveLength(1);
  expect(l.career.sim.incidents).toEqual([]);
});

it('typing Jelatek sends the train on, and it waits again for Setiawangsa', () => {
  let l = typeAll(startLesson(net, 1_000), 'Jelatek', 1_000);
  expect(l.step).toBe('moving');
  l = advanceLesson(net, l, 1_000 + 30_000);
  expect(l.step).toBe('second');
  expect(names(l)).toEqual(['Setiawangsa']);
});

it('typing Setiawangsa finishes the lesson', () => {
  let l = advanceLesson(net, typeAll(startLesson(net, 1_000), 'Jelatek', 1_000), 31_000);
  l = typeAll(l, 'Setiawangsa', 31_000);
  expect(l.step).toBe('done');
});

it('stays quiet however long it runs: no passengers, Incidents or extra trains', () => {
  const l = advanceLesson(net, startLesson(net, 0), 120_000);
  expect(l.career.sim.trains).toHaveLength(1);
  expect(l.career.sim.incidents).toEqual([]);
  expect(Object.values(l.career.sim.platforms).every((p) => Object.keys(p.waiting).length === 0)).toBe(true);
  expect(l.step).toBe('first');
});

it('a wrong key stalls and Backspace undoes it, as in a Shift', () => {
  let l = typeAll(startLesson(net, 0), 'Jx', 0);
  expect(l.career.aim).toMatchObject({ typed: 'J', misses: 1 });
  l = lessonBackspace(net, l, 0);
  expect(l.career.aim).toMatchObject({ typed: 'J', misses: 0 });
  expect(lessonKey(net, l, 'e', 0).career.aim.typed).toBe('J'); // still stalled
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/engine/dispatchLesson.test.ts`
Expected: FAIL, cannot find module `./dispatchLesson`.

- [ ] **Step 3: Export `applyTargetKey` from `src/engine/dispatch.ts`** (add `export`; no other change).

- [ ] **Step 4: Implement `src/engine/dispatchLesson.ts`**

- Served stretch: `{ line: 'KJ', from: 3, to: 6 }` (Sri Rampai to Dato' Keramat), so Setiawangsa (index 4) is not the stretch's end and its train waits at a normal signal. If the "waits again for Setiawangsa" test shows otherwise, widen the stretch; the test is the contract.
- `startLesson`: `startCareer(net, 0)`, then replace `served` with the stretch and `sim` with `startShiftSim(net, [stretch], 0)` whose `trains` is exactly one train `{ id: 1, line: 'KJ', dir: -1, at: <index of Jelatek>, stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null }` and `nextTrainId: 2`. Set `status: 'running'`, `startedAt: now`, and `clockAt: now`. Never pass this state to `advanceCareer` or `applyDispatchAction`: they step the real phases.
- `advanceLesson`: while `career.gameMs + TICK_MS <= now - clockAt`, `stepSim` a cloned sim with `QUIET: PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 0, escalation: 1 }` (trainFactor 0 keeps the fleet at one train) and add `TICK_MS` to `gameMs`, reconciling the aim as `advanceCareer` does. Then: `'moving'` becomes `'second'` once `visibleTargets` contains `LESSON_NAMES[1]`.
- `lessonKey`: `advanceLesson` to `now`, then `applyTargetKey`. A completion while `'first'` makes it `'moving'`; while `'second'`, `'done'`. Detect a completion by the train leaving `stage: 'signal'`.
- `lessonBackspace`: `advanceLesson` to `now`, then the aim becomes `backspaceAim(targets, reconcileAim(targets, aim)) ?? aim`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/engine/dispatchLesson.test.ts src/engine/dispatch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/dispatchLesson.ts src/engine/dispatchLesson.test.ts src/engine/dispatch.ts
git commit -m "feat: Dispatcher lesson engine: one train, Jelatek then Setiawangsa, nothing else running"
```

---

### Task 2: The lesson on the Dispatcher screen

**Files:**
- Create: `src/ui/useDispatchLesson.ts`
- Modify: `src/ui/DispatcherScreen.tsx` (route keys, map, overlay and panel to the lesson while it is up)
- Modify: `src/ui/dispatchTips.ts` (new `start` copy)
- Modify: `src/ui/dispatchTips.test.ts` (the agreed-copy test's `start` text)
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: Task 1's `startLesson`, `advanceLesson`, `lessonKey`, `lessonBackspace`, `lessonStations`, `LESSON_SEEN`, `LESSON_NAMES`, `Lesson`.
- Produces:
  - `export function useDispatchLesson(net: NetworkIndex, autoStart: boolean): { lesson: Lesson | null; start(): void; skip(): void; leave(): void; onKey(key: string): void }` in `src/ui/useDispatchLesson.ts`. `autoStart`: start on mount when true. `skip()` and finishing mark `LESSON_SEEN` with `markDispatchTipSeen` and clear the lesson; `leave()` clears it without marking. `onKey` handles Escape (skip), Backspace, Enter and printable keys; any other key just advances the lesson to `runTick()`. The hook runs its own `requestAnimationFrame` loop calling `advanceLesson` while a lesson is up, and plays `sound.key` / `sound.error` / `sound.arrive` from lesson state changes as the screen does for the Career.
  - Captions, exact copy, in `DispatcherScreen.tsx` (or beside the hook):
    - `first`: "This train is waiting at a red signal. Type Jelatek to send it on."
    - `moving`: "There it goes."
    - `second`: "It stopped at Jelatek and is waiting again. Every Station needs you. Type Setiawangsa."
  - New `start` tip text in `dispatchTips.ts` (the step-5 caption, shown inline on the ready screen as now): "Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift."
  - `TypingLine` gets `showStreak = true`; the lesson passes `false`.

- [ ] **Step 1: Write the failing tests** in a new `describe('The guided first Shift')` in `src/ui/Dispatcher.test.tsx`

First, in the file's setup, add `'lesson'` to `ALL_TIPS` so every existing test skips the lesson, and update `START_TIP` to the new copy. Then add two helpers:

```ts
/** A profile that has seen every tip but the lesson and the start caption. */
const fresh = () => seenTips(ALL_TIPS.filter((id) => id !== 'lesson' && id !== 'start'));
/** The screen as a first-time player opens it: no Career passed in, the seed fixed. */
const renderLesson = (onExit = () => {}, seed = 7) => render(
  <TypingInputProvider enabled={false}>
    <DispatcherScreen net={net} onExit={onExit} onAgain={() => {}} lessonFor={{ seed }} />
  </TypingInputProvider>,
);
```


```ts
it('opens on the lesson the first time: one train, zoomed in, with its caption', () => {
  fresh();
  renderLesson();
  expect(screen.getByText('This train is waiting at a red signal. Type Jelatek to send it on.')).toBeTruthy();
  expect(mapProps().fitKey).toBe('dispatch:lesson');
  expect(signalLabels().map((el) => el.textContent)).toEqual(['Jelatek']);
  expect(screen.queryByTestId('streak')).toBeNull();
});

it('typing both names ends the lesson on the ready screen; its keys never reach the Keylog', async () => {
  fresh();
  const clock = fakeClock();
  renderLesson(() => {}, 21);
  type('Jelatek');
  clock.now += 30_000; press('Shift');
  expect(screen.getByText(/Type Setiawangsa\./)).toBeTruthy();
  type('Setiawangsa');
  expect(screen.getByText(START_TIP)).toBeTruthy();
  expect(mapProps().fitKey).not.toBe('dispatch:lesson');
  expect(loadProfile().dispatchTipsSeen).toContain('lesson');
  const first = visibleTargets(net, startCareer(net, 21).sim)[0]!.text;
  type(first.slice(0, 2));
  clock.now += 30 * 60_000; type('x');
  await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
  expect(judgeSpy.mock.calls[0]![1].keylog.events.map((e) => e.k).join('')).toBe(first.slice(0, 2));
});

it('a wrong key in the lesson shows, and Backspace takes it back', () => {
  fresh(); renderLesson();
  type('Jx');
  expect(screen.getByText('Wrong key')).toBeTruthy();
  press('Backspace');
  expect(screen.queryByText('Wrong key')).toBeNull();
});

it('Esc or Skip ends the lesson and marks it seen; Esc again then leaves', () => {
  fresh();
  const onExit = vi.fn();
  renderLesson(onExit);
  press('Escape');
  expect(onExit).not.toHaveBeenCalled();
  expect(screen.getByText(START_TIP)).toBeTruthy();
  expect(loadProfile().dispatchTipsSeen).toContain('lesson');
  press('Escape');
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('Back to map mid-lesson leaves without marking it seen', () => {
  fresh();
  const onExit = vi.fn();
  renderLesson(onExit);
  fireEvent.click(screen.getByRole('button', { name: /Back to map/ }));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(loadProfile().dispatchTipsSeen ?? []).not.toContain('lesson');
});

it('a Career passed in (the dev full-network Career) never shows the lesson', () => {
  fresh();
  renderShift(careerWith([waiting(1, 'KJ', 'Damai')]));
  expect(screen.queryByText(/Type Jelatek to send it on/)).toBeNull();
});
```

Also add a "Skip" button check to the Esc test (clicking `/Skip/` behaves as Esc).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/Dispatcher.test.tsx -t "guided first Shift"`
Expected: FAIL, no lesson caption.

- [ ] **Step 3: Implement**

- `DispatcherScreen` gains an optional prop `lessonFor?: { seed: number }`, a test seam that fixes the new Career's seed while still allowing the lesson (today `initial` both fixes the seed and stands for the dev Career). Show the lesson automatically when `initial` is undefined and `LESSON_SEEN` is not in the profile's `dispatchTipsSeen`.
- In `onKey`: while `lesson` is up (and no tip shows), hand every key to `lesson.onKey` and return before the Career code. The recorder is never called.
- While `lesson` is up, the map's `visited`/`emphasisSet` come from the lesson's served stretch, `fitTo` is `lessonStations(net)` mapped through the layout, `fitKey` is `'dispatch:lesson'`, and the overlay, `usePassengerMoments` and `TypingLine` get `lesson.career`. The panel shows the caption for `lesson.step` (`role="note"`), the `TypingLine` without streak, a Skip button (`<kbd>Esc</kbd> Skip`) and the Back to map button; Back to map calls `lesson.leave()` then `onExit()`.
- When the lesson ends, everything falls back to `run` and the ready screen as today, with the new `start` copy inline.
- Update the `start` text in `DISPATCH_TIPS` and the agreed-copy test in `dispatchTips.test.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/Dispatcher.test.tsx src/ui/dispatchTips.test.ts`
Expected: PASS, including every existing test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useDispatchLesson.ts src/ui/DispatcherScreen.tsx src/ui/dispatchTips.ts src/ui/dispatchTips.test.ts src/ui/Dispatcher.test.tsx
git commit -m "feat: Dispatcher opens on a guided first Shift: Jelatek, then Setiawangsa, then zoom out (F8)"
```

---

### Task 3: How to play

**Files:**
- Modify: `src/ui/DispatcherScreen.tsx`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `useDispatchLesson(...).start()`; `resetDispatchTips`, `loadProfile`, `saveProfile` from `src/engine/progress.ts`.
- Produces: a "How to play" button on the ready screen beside Back to map, shown under the same condition (`run.startedAt === null`) and not while a lesson is up.

- [ ] **Step 1: Write the failing test**

```ts
it('How to play replays the lesson, then the start caption and every tip show again', () => {
  seenTips(ALL_TIPS); // everything seen, lesson included
  renderLesson();
  expect(screen.queryByText(START_TIP)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /How to play/ }));
  expect(screen.getByText('This train is waiting at a red signal. Type Jelatek to send it on.')).toBeTruthy();
  expect(loadProfile().dispatchTipsSeen).toEqual([]);
  press('Escape');
  expect(screen.getByText(START_TIP)).toBeTruthy();
});

it('How to play is gone once the Shift has started', () => {
  renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
  type('J');
  expect(screen.queryByRole('button', { name: /How to play/ })).toBeNull();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/ui/Dispatcher.test.tsx -t "How to play"`
Expected: FAIL, no How to play button.

- [ ] **Step 3: Implement.** On click: `saveProfile(resetDispatchTips(loadProfile()))`, clear the screen's `seenTips` ref set (it is read once on mount), then `lesson.start()`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/Dispatcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DispatcherScreen.tsx src/ui/Dispatcher.test.tsx
git commit -m "feat: Dispatcher How to play replays the lesson and its tips (F5)"
```

---

### Task 4: The new-train tip, and closing the loop

**Files:**
- Modify: `src/ui/dispatchTips.ts`
- Test: `src/ui/dispatchTips.test.ts`
- Modify: `docs/superpowers/dispatcher-playtest-2-feedback.md`, `docs/superpowers/dispatcher-handover.md`

**Interfaces:**
- Produces: tip id `'new-train'` in `DISPATCH_TIPS`, placed after `'late'`, with text: "A new train has joined at the end of the line. Trains join during the peaks until each line has its full fleet; longer lines get more trains."

- [ ] **Step 1: Write the failing tests** in `src/ui/dispatchTips.test.ts`, using its `running`, `withSim` and `waiting` helpers

```ts
it('sees a train join mid-Shift, once', () => {
  const prev = running([waiting(1, 'KJ', 'Jelatek')]);
  const next = withSim(prev, (sim) => { sim.trains.push(waiting(2, 'KJ', 'Damai')); sim.nextTrainId = 3; });
  expect(newDispatchTips(net, prev, next, none)).toEqual(['new-train']);
  expect(newDispatchTips(net, prev, next, new Set(['new-train']))).toEqual([]);
});

it('a new Shift\'s fresh trains are not a train joining', () => {
  const prev = running([waiting(1, 'KJ', 'Jelatek')]);
  const next = { ...withSim(prev, (sim) => { sim.trains.push(waiting(2, 'KJ', 'Damai')); sim.nextTrainId = 3; }), shift: 2 };
  expect(newDispatchTips(net, prev, next, none)).not.toContain('new-train');
});
```

Add the new copy to the "has the agreed copy" test.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/ui/dispatchTips.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Inside the existing same-Shift block of `newDispatchTips`: `after.nextTrainId > before.nextTrainId` hits `'new-train'`. Before shipping, read `stepSim`'s train entry (`dispatchSim.ts`, around the `trainsForLine(range, phase.trainFactor)` checks) and confirm the copy is true; adjust the wording if not, and say so in the commit.

- [ ] **Step 4: Run the full suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Check it in the browser** (`.claude/launch.json` config `dev`, port 5179). Clear the profile's `dispatchTipsSeen` (or use How to play), open Dispatcher at 1440×900 and 1024×768, both themes: the lesson frames Dato' Keramat to Setiawangsa readably, the train visibly travels, the zoom-out eases (cuts under reduced motion), and the start caption shows on the ready screen.

- [ ] **Step 6: Update the docs.** In the tracker, set F8, F5 and F14 to `done` with a line each on what shipped; in the handover's "Next", point at the remaining P1s (F20, F15, F11, F19, F4).

- [ ] **Step 7: Commit**

```bash
git add src/ui/dispatchTips.ts src/ui/dispatchTips.test.ts docs/superpowers/dispatcher-playtest-2-feedback.md docs/superpowers/dispatcher-handover.md
git commit -m "feat: a one-time tip when a train joins mid-Shift (F14); onboarding done in the tracker"
```
