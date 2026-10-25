# Dispatcher closure gauge (F20) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Station closures felt as they build up during a Dispatcher Shift: a closure gauge in the Shift bar, a stamp on the map per closure, an Incident card that closes instead of vanishing, a thud, and a 1.2 s hold before a failed Shift's summary.

**Architecture:** All display. The engine only gains one exported function (`shiftFailCount`) so the gauge and the failure rule share one count. A UI hook (`useClosures`) remembers when each closure was first seen, on the Shift's clock (`sim.shiftMs`), so every moment freezes with the Shift behind a pause or a tip and resumes after. Consumers derive "is this still fresh?" from that memory. A second hook (`useFailHold`) keeps the play view up for 1.2 s after a failed Shift's `endedAt`.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom), Tone.js for sound, plain CSS (`src/ui/dispatch.css`).

**Spec:** `docs/superpowers/specs/2026-10-25-dispatcher-closure-gauge-design.md`

## Global Constraints

- Display only: no new actions, no change to `DISPATCH_EVIDENCE_VERSION`, Keylog, action log, replay or judge. `advanceCareer`'s behaviour is unchanged.
- The red screen edge (`data-urgent`) means typing a fix and nothing else; no closure cue may use it.
- Nothing about a closure pauses the Shift, takes focus or moves the camera.
- Everything works with sound off; sound only adds.
- Reduced motion: no pop, no ring, no scale-in, nothing pulses. Colours, the X and the hold stay.
- Gauge colour bands by filled share: calm (`--ink-muted`) below 0.4, amber from 0.4, red (`--error`) from 0.75.
- Timings: stamp 1 000 ms, closing card 1 500 ms, failure hold 1 200 ms.
- Vocabulary from `CONTEXT.md`: Station, Shift, Incident, Out of service, Served network. UI copy: "Closed", "Out of service".
- The only literal colours allowed are tokens in `src/styles/tokens.css`; add an amber token there if needed (`--warn`, AA on both atmospheres' panel colour).

## Review Focus

1. **Closures already there when the screen mounts** (a passed-in Career, tests' prefilled `outOfService`): no stamp, no pop, no closing card, no thud. Pinned in Task 2.
2. **A closure on the same tick that fails the Shift**: the last slot fills and stamps, the thud plays during the hold, and the judge does not run until the summary shows. Pinned in Task 7.
3. **A failed Shift detected late** (a key or frame landing long after the failing tick, as the existing end-of-Career tests do with a 30-minute jump): `endedAt` is far in the past, so there is no hold and the summary shows at once. Pinned in Task 7.
4. **The first closure firing the `out-of-service` tip**: the card stays and the moment's age does not advance while the tip is up, so it plays out after dismissal. Pinned in Task 5.
5. **The next Shift**: the gauge, stamps and closing cards from the last Shift are gone; closures reset with `startShiftSim`. Pinned in Tasks 2 and 3.

---

### Task 1: One source for the failure count

**Files:**
- Modify: `src/engine/dispatch.ts` (around `advanceCareer`, line ~106)
- Test: `src/engine/dispatch.test.ts`

**Interfaces:**
- Produces: `export function shiftFailCount(net: NetworkIndex, served: Served): number` from `src/engine/dispatch.ts`: `Math.ceil(OOS_FAIL_SHARE * servedStations(net, served).length)`.

- [ ] **Step 1: Write the failing test** in `dispatch.test.ts`:

```ts
it('a Shift fails at a quarter of its Served Stations, rounded up', () => {
  // The starting network is KJ from index 4 to 17: 14 Stations.
  expect(shiftFailCount(net, STARTING_NETWORK)).toBe(4);
  const grown: Served = [{ line: 'KJ', from: 0, to: 23 }];
  expect(shiftFailCount(net, grown)).toBe(Math.ceil(0.25 * servedStations(net, grown).length));
});
```

and change `fails on the last closure before clearing a Shift at the same tick` to take `count` from `shiftFailCount(net, base.served)`.

- [ ] **Step 2: Run** `npx vitest run src/engine/dispatch.test.ts`. Expected: FAIL, `shiftFailCount` is not exported.
- [ ] **Step 3: Implement** `shiftFailCount` and use it in `advanceCareer` in place of the inline `Math.ceil(...)`.
- [ ] **Step 4: Run** `npx vitest run src/engine`. Expected: PASS, including `dispatchReplay.test.ts` and `dispatchProbe.test.ts` unchanged.
- [ ] **Step 5: Commit** `refactor: the Shift's failure count is one exported function`.

---

### Task 2: Remember closures as they happen

**Files:**
- Create: `src/render/useClosures.ts`
- Test: `src/render/useClosures.test.ts` (Testing Library `renderHook`)

**Interfaces:**
- Consumes: `CareerState` (`src/engine/dispatch.ts`), `Incident` (`src/engine/dispatchSim.ts`).
- Produces, from `src/render/useClosures.ts`:

```ts
export const CLOSURE_STAMP_MS = 1_000;
export const CLOSING_CARD_MS = 1_500;
/** One Station closing, as the screen saw it. */
export interface Closing {
  station: string;
  /** `sim.shiftMs` when the screen first saw it closed. */
  atMs: number;
  /** The Incident at that place just before it closed, if any (the engine drops it on closing). */
  incident: Incident | null;
}
/** Closings seen since mount or since the Shift began, oldest first. */
export function useClosures(career: CareerState): Closing[];
/** The closings younger than `windowMs` on the Shift's clock. */
export function freshClosings(closings: readonly Closing[], shiftMs: number, windowMs: number): Closing[];
```

Approach: a layout effect comparing the previous and current `career` (as `usePassengerMoments` does). New entries are the stations in `career.sim.oosOrder` beyond `prev.sim.oosOrder.length`. For each one, `incident` is the entry in `prev.sim.incidents` whose `place` matches. Stations already closed in the first `career` the hook sees are never reported. A change of `career.shift` clears the list. Ages run on `sim.shiftMs`, so they stand still while the Career is paused (Pause, a tip) and during the failure hold (the Career has ended).

- [ ] **Step 1: Write the failing tests** in `useClosures.test.ts`, building Careers with `startCareer(net, 7)` and `closeStation` from `dispatchSim`:
  - `ignores Stations already closed when it mounts`: render with one closed Station → `[]`.
  - `reports a new closure with the Shift time it was seen and the Incident it ended`: rerender with a Career whose sim closed `Masjid Jamek` and whose previous sim had an Incident there → `[{ station: idOf('Masjid Jamek'), atMs: <that sim.shiftMs>, incident: expect.objectContaining({ kind: 'signal-fault' }) }]`.
  - `a crowding closure has no Incident`: `incident: null`.
  - `forgets everything at a new Shift`: rerender with `shift + 1` and a fresh sim → `[]`.
  - `a resume or a repeated render adds nothing`: rerender with the same `oosOrder` → same length.
  - `freshClosings keeps only those younger than the window`: `freshClosings([{atMs: 1_000, ...}, {atMs: 2_000, ...}], 2_500, 1_000)` → only the second.
- [ ] **Step 2: Run** `npx vitest run src/render/useClosures.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/render/useClosures.ts` as above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Dispatcher remembers each closure as the screen sees it (F20)`.

---

### Task 3: The closure gauge in the Shift bar, and the tip that points at it

**Files:**
- Create: `src/ui/ClosureGauge.tsx`
- Modify: `src/ui/DispatcherScreen.tsx` (`ShiftBar`, and where it is rendered), `src/ui/dispatch.css`, `src/ui/dispatchTips.ts` (the `out-of-service` text), `src/styles/tokens.css` (amber token if needed)
- Test: `src/ui/Dispatcher.test.tsx`, `src/ui/dispatchTips.test.ts` if it pins the old text

**Interfaces:**
- Consumes: `shiftFailCount` (Task 1); `useClosures`, `freshClosings`, `CLOSURE_STAMP_MS` (Task 2).
- Produces, from `src/ui/ClosureGauge.tsx`:

```ts
export type ClosureBand = 'calm' | 'warn' | 'danger';
/** calm below 0.4 of the slots filled, warn from 0.4, danger from 0.75. */
export function closureBand(closed: number, slots: number): ClosureBand;
/** Nothing until the first closure; then one slot per closure the Shift can take. */
export function ClosureGauge(props: { closed: number; slots: number; fresh: boolean }): JSX.Element | null;
```

Markup: a "Closed" label, then `role="progressbar"`, `aria-label="Stations closed"`, `aria-valuemin={0}`, `aria-valuemax={slots}`, `aria-valuenow={closed}`, `data-band={band}`, holding `slots` slot spans (`data-filled="true"` on the first `closed`; the last slot `data-line="true"`, drawn as the failure line), then the count text `{closed} / {slots}`. `fresh` puts `data-fresh="true"` on the newest filled slot, which the CSS pops (keyframe, about 300 ms), with no animation under reduced motion. The gauge's width is fixed (about `clamp(6rem, 14vw, 10rem)`) and slots share it (`flex: 1`, gap 2px), so 20+ slots shrink rather than widening the bar. Band colours come from tokens. `ShiftBar` takes `closed`, `slots` and `fresh` props; `DispatcherScreen` passes `run.sim.oosOrder.length`, `shiftFailCount(net, run.served)` and `freshClosings(closings, run.sim.shiftMs, CLOSURE_STAMP_MS).length > 0`, with `closings = useClosures(run)`.

The `out-of-service` tip text becomes exactly: `A station is out of service. Each closure fills the gauge at the top; when it is full, the Shift fails.`

Test helpers to add near the top of `Dispatcher.test.tsx`; later tasks reuse them:

```ts
/** KLCC overflows on the first tick after the Shift starts; `closed` are already Out of service. */
function closingCareer(closed: string[] = []): CareerState {
  const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]);
  initial.sim.platforms[idOf('KLCC')] = {
    waiting: { [idOf('KL Sentral')]: 200 }, fullMs: OOS_CROWD_MS - 100, lastCall: {},
  };
  for (const name of closed) {
    initial.sim.outOfService[idOf(name)] = 'crowding';
    initial.sim.oosOrder.push(idOf(name));
  }
  return initial;
}
/** Starts the Shift and lets 1 s pass: KLCC closes. */
const closeKlcc = (clock: { now: number }) => { type('J'); clock.now += 1_000; type('e'); };
const gauge = () => screen.queryByRole('progressbar', { name: 'Stations closed' });
```

- [ ] **Step 1: Write the failing tests** in a new `describe('the closure gauge')`:
  - `closureBand marks calm, warn and danger by share`: `closureBand(1, 4)` → `'calm'`, `(2, 4)` → `'warn'`, `(3, 4)` → `'danger'`, `(5, 13)` → `'calm'`, `(6, 13)` → `'warn'`, `(10, 13)` → `'danger'`.
  - `there is no gauge until the first closure`: `renderShift(closingCareer())`, `type('J')` → `gauge()` is null.
  - `the first closure brings the gauge: one slot per closure the Shift can take`: `fakeClock()`, `closeKlcc` → `aria-valuenow` `'1'`, `aria-valuemax` `'4'`, four slots, one `data-filled`, the last `data-line="true"`, text `1 / 4`, `data-band` `'calm'`.
  - `it turns red near the line`: `closingCareer(['Bangsar', 'Damai'])` then `closeKlcc` → `aria-valuenow` `'3'`, `data-band` `'danger'`.
  - `the newest slot pops while the closure is fresh`: after `closeKlcc`, the third slot of `closingCareer(['Bangsar', 'Damai'])` has `data-fresh="true"`; after `clock.now += 1_500; press('Shift')` it no longer does.
  - `the gauge is gone at the next Shift`: a Career at `status: 'ready'`, `shift: 2`, with a fresh `startShiftSim` sim → `gauge()` null (render `initial` directly).
  - Update `a tip pauses the Career...`: it already asserts `'A station is out of service.'`; add `expect(tip.textContent).toContain('Each closure fills the gauge at the top')`.
- [ ] **Step 2: Run** `npx vitest run src/ui/Dispatcher.test.tsx -t "closure gauge|tip pauses"`. Expected: FAIL.
- [ ] **Step 3: Implement** `ClosureGauge.tsx`, wire it into `ShiftBar`, add the CSS (and its reduced-motion block), and change the tip text.
- [ ] **Step 4: Add the pop's selector** to the reduced-motion CSS check (`the edge pulse and the glow hold still under reduced motion`, around line 1416) if that test lists the animated selectors explicitly.
- [ ] **Step 5: Run** `npx vitest run src/ui`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: a closure gauge in the Dispatcher Shift bar (F20)`.

---

### Task 4: The closure stamp on the map

**Files:**
- Modify: `src/render/DispatchOverlay.tsx` (the `sim.outOfService` marks, around line 227), `src/ui/DispatcherScreen.tsx` (pass the prop), `src/ui/dispatch.css`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `useClosures`, `freshClosings`, `CLOSURE_STAMP_MS` (Task 2).
- Produces: `DispatchOverlayProps.stamping?: ReadonlySet<string>`, the Stations whose closure is younger than `CLOSURE_STAMP_MS` (default empty). `DispatcherScreen` passes `freshClosings(closings, run.sim.shiftMs, CLOSURE_STAMP_MS)` station ids, or an empty set while the lesson shows.

A stamping Station's `.dispatch-oos` group gets `data-stamp="true"`, and the CSS scales its X in from about 1.6× to 1 over about 300 ms. When motion is allowed (`!prefersReducedMotion()`), it also renders a ring: `<circle data-testid="oos-ring" className="dispatch-oos-ring" />` at the Station, growing from the mark's radius to about 4× and fading over `CLOSURE_STAMP_MS`. Animations freeze with the Shift: the `.dispatcher` root gets `data-paused="true"` while `run.status === 'paused'` or a tip shows, and the CSS sets `animation-play-state: paused` on the stamp, the ring and the gauge pop under it. The resting X is unchanged. The camera is not touched.

- [ ] **Step 1: Write the failing tests** in `describe('the closure stamp')`:
  - `a closing Station is stamped on the map, with a ring, for about a second`: `allowMotion()`, `fakeClock()`, `closeKlcc` → the `dispatch-oos` for KLCC has `data-stamp="true"` and one `oos-ring`; after `clock.now += 1_000; press('Shift')`, no `data-stamp` and no `oos-ring`, while the X stays.
  - `under reduced motion the stamp has no ring`: default matchMedia (reduced) → `data-stamp="true"`, and `queryByTestId('oos-ring')` is null.
  - `a Station closed before the screen opened is not stamped`: `closingCareer(['Bangsar'])`, `type('J')` → Bangsar's `dispatch-oos` has no `data-stamp`.
  - `the camera does not move for a closure`: `mapProps().fitKey` is the same before and after `closeKlcc`.
- [ ] **Step 2: Run** `npx vitest run src/ui/Dispatcher.test.tsx -t "closure stamp"`. Expected: FAIL.
- [ ] **Step 3: Implement** the prop, the ring, `data-paused` on the root, and the CSS (with its reduced-motion block).
- [ ] **Step 4: Run** `npx vitest run src/ui src/render`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: each closure stamps its X on the Dispatcher map (F20)`.

---

### Task 5: The Incident card closes instead of vanishing

**Files:**
- Modify: `src/ui/DispatchIncidents.tsx`, `src/ui/DispatcherScreen.tsx` (pass the prop), `src/ui/dispatch.css`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `useClosures`, `freshClosings`, `CLOSING_CARD_MS`, `Closing` (Task 2).
- Produces: `DispatchIncidents` takes `closing?: readonly Closing[]` (default `[]`). `DispatcherScreen` passes `freshClosings(closings, run.sim.shiftMs, CLOSING_CARD_MS)` filtered to `incident !== null`.

Each closing entry renders as a card in the same list, merged with the active cards and sorted by Incident `id`, so it stays where it was. It has `data-closed="true"`, the same head (glyph, kind, Line badge), the place struck through, the text `Out of service` in place of the fix line, and its timer full with `data-critical="true"`. A closed card is not a target (closed places already aren't). "No Incidents" shows only when there are no active and no closing cards. Under reduced motion it appears and leaves without animation.

- [ ] **Step 1: Write the failing tests** in `describe('a closing Incident')`, with a Career whose Signal fault at Masjid Jamek has `startedMs: -(INCIDENT_LIMIT_MS - 100)` so it closes on the first tick:
  - `its card stays, marked Out of service, for about 1.5 s`: `fakeClock()`, `type('J'); clock.now += 1_000; type('e')` → the Incidents list has one `listitem` with `data-closed="true"` and text `Out of service` and `Masjid Jamek`; after `clock.now += 1_500; press('Shift')`, the list is gone and `No Incidents` shows.
  - `it waits behind the out-of-service tip`: `seenTips(ALL_TIPS.filter((id) => id !== 'out-of-service'))`, same Career → tip shows and the closed card is there; `clock.now += 5_000`, dismiss with `type('x')` → the closed card is still there (the Shift's clock did not run); after `clock.now += 1_600; press('Shift')` it is gone.
  - `a crowding closure leaves no card`: `closeKlcc` on `closingCareer()` → `No Incidents`.
- [ ] **Step 2: Run** `npx vitest run src/ui/Dispatcher.test.tsx -t "closing Incident"`. Expected: FAIL.
- [ ] **Step 3: Implement** the `closing` prop in `DispatchIncidents`, the wiring, and the CSS.
- [ ] **Step 4: Run** `npx vitest run src/ui`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a closing Incident's card says Out of service before it goes (F20)`.

---

### Task 6: The closure thud

**Files:**
- Modify: `src/audio/sound.ts`, `src/ui/DispatcherScreen.tsx` (the sounds effect, around line 425)
- Test: `src/audio/sound.test.ts`, `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `closureBand` (Task 3), `shiftFailCount` (Task 1).
- Produces: `sound.closure(heavy: boolean): void`. Starting values: light is `error.triggerAttackRelease('E1', 0.3)`; heavy is `error.triggerAttackRelease('B0', 0.5)`. Longer and lower than `warning` (two short A1 pulses) and `error` (C2, 0.09 s).

In the sounds effect, after the `prev.shift !== run.shift` guard: if `run.sim.oosOrder.length > prev.sim.oosOrder.length`, call `sound.closure(closureBand(run.sim.oosOrder.length, shiftFailCount(net, run.served)) === 'danger')`. It fires on the failing tick too, since that tick's render is still compared with the one before.

- [ ] **Step 1: Write the failing tests:**
  - `sound.test.ts`, `a closure is one low membrane hit, lower and longer when heavy`: unlock as `plays through Tone once unlocked` does, then `closure(false)` → `membraneTrigger` called with `('E1', 0.3)`; `closure(true)` → `('B0', 0.5)`.
  - `Dispatcher.test.tsx`, `a closure thuds, heavy in the red band`: spy `sound.closure`; `closeKlcc` on `closingCareer()` → called once with `false`; a new render of `closingCareer(['Bangsar', 'Damai'])` plus `closeKlcc` → last call `true`.
  - `no thud for closures already there when the screen opened`: `closingCareer(['Bangsar'])`, `type('J')` → not called.
- [ ] **Step 2: Run** `npx vitest run src/audio src/ui/Dispatcher.test.tsx -t "closure|thud"`. Expected: FAIL.
- [ ] **Step 3: Implement** `sound.closure` and the effect branch.
- [ ] **Step 4: Run** `npx vitest run src/audio src/ui`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a closure thuds, heavier near the failure line (F20)`.

---

### Task 7: A failed Shift holds 1.2 s before its summary

**Files:**
- Create: `src/ui/useFailHold.ts`
- Modify: `src/ui/DispatcherScreen.tsx` (the summary branch around line 564, the judge effect around line 500, `usePanelRects`'s `live`, the panel's buttons), `docs/superpowers/dispatcher-playtest-2-feedback.md`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `CareerState`, `runTick` (`src/ui/useRunRecorder`).
- Produces: `export const FAIL_HOLD_MS = 1_200;` and `export function useFailHold(run: CareerState): boolean` from `src/ui/useFailHold.ts`. It is true while `run.status === 'ended'`, `run.endReason === 'failed'` and `runTick() - run.endedAt < FAIL_HOLD_MS`, as decided on the first render that sees the failed end, so the summary never flashes first. It then turns false once, via a timeout for the remaining time. An end found already past the hold (a late key or frame) never holds. A retired or abandoned end never holds.

While holding, `DispatcherScreen` keeps the play view: map, overlay, Shift bar (full gauge), Incidents panel and `TypingLine`, but no hint, no End Career and no How to play. `usePanelRects` stays live. The judge effect waits until the hold is over, so replay never janks the hold. Keys are already ignored once ended (`onKey`'s `cur.status === 'ended'`), and music already stops (the track is `null` unless running). Nothing else changes.

- [ ] **Step 1: Write the failing tests** in `describe('the end of a Career')`:
  - `a failing closure holds the map 1.2 s, with the gauge full, before the summary`: `vi.useFakeTimers()`, `const clock = fakeClock()`, `renderShift(closingCareer(['Bangsar', 'Damai', 'Ampang Park']))`, then `type('J'); clock.now += 100; type('e')` (one tick: KLCC closes and the Shift fails, so the hold starts about now; `closeKlcc`'s 1 s step would use up most of it) → no `Career summary` region; `gauge()` has `aria-valuenow` `'4'` and `data-band` `'danger'`; KLCC's `dispatch-oos` has `data-stamp="true"`; no `End Career` button; `judgeSpy` not called. `clock.now += 1_000; act(() => { vi.advanceTimersByTime(1_000); })` → still no summary. `clock.now += 200; act(() => { vi.advanceTimersByTime(200); })` → the `Career summary` region shows; the judge runs after it (advance timers again, then `expect(judgeSpy).toHaveBeenCalledTimes(1)`).
  - `the failing closure thuds during the hold`: spy `sound.closure`; same setup → called with `true` before the summary shows.
  - `a failure found long after the fact shows the summary at once`: the existing `a failed Career shows its summary before the judgement, then the result` (30-minute jump) must pass unchanged. Run it as part of Step 4; no edit.
  - `ending a Career is never held`: the existing `a Career ended mid-Shift is abandoned...` passes unchanged.
  - `keys during the hold do nothing`: during the hold, `type('Jelatek'); press('Escape')` → no `Paused` dialog, and the evidence the judge later receives has the same Keylog as without those keys (`judgeSpy.mock.calls[0]![1].keylog.events.map((e) => e.k).join('')` equals `'J'`).
- [ ] **Step 2: Run** `npx vitest run src/ui/Dispatcher.test.tsx -t "end of a Career"`. Expected: the new tests FAIL; the existing ones PASS.
- [ ] **Step 3: Implement** `useFailHold.ts` and the `DispatcherScreen` changes.
- [ ] **Step 4: Run** the whole suite: `npm test`, then `npm run build` (typecheck). Expected: all PASS, no type errors.
- [ ] **Step 5: Update the tracker** `docs/superpowers/dispatcher-playtest-2-feedback.md`: set F20's status in the summary table to `done <sha of the Task 7 commit, or the range from Task 1>`, add a **Done** paragraph under F20 naming what shipped and anything not seen live (the sound, the pop, phone width), and add an F20 bullet to "Check in playtest 3" from the spec's own list.
- [ ] **Step 6: Commit** `feat: a failed Dispatcher Shift holds 1.2 s on the map before its summary (F20)`, including the tracker.
