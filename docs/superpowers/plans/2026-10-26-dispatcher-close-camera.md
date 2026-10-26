# Dispatcher close camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With a dev-only camera panel switched on, the Dispatcher's camera pulls in close for the guided lesson, the Service gap and late tips, and for about a second after a typed fix clears an Incident, closest in early Shifts and easing to a lean as the Served network grows.

**Architecture:** A pure `closeFrame` in `src/geo/fit.ts` turns the normal frame and a subject into a closer `ViewBox`. A new `src/ui/dispatchCamera.ts` holds the camera rules (closeness, the frame helpers moved out of `DispatcherScreen.tsx`, and detection of a typed clear). A dev-only hook and panel own the settings. `DispatcherScreen` picks the frame and hands an explicit `ViewBox` to `MapCanvas` through one new prop, `fitView`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest with Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-26-dispatcher-close-camera-design.md`

## Global Constraints

- With the close camera off, behaviour and `MapCanvas` props are exactly as today: same `fitTo`, same `fitKey` strings, no `fitView`. The existing suite passes unchanged.
- No change to the engine (`src/engine/*` outside tests), replay, the judge or evidence.
- `MapCanvas` gets at most one new prop (`fitView`). Another agent is changing `MapCanvas` for F15 and F19 on this branch; touch nothing else in it.
- The dev panel and its storage exist only when `import.meta.env.DEV` is true; a production build strips them.
- Defaults (named constants, one place): early closeness 3× at 14 Stations or fewer, late closeness 1.2× at 40 Stations or more, linear between on the served Station count; hold 1 s. Slider ranges: early 1–5×, late 1–3×, hold 0–3 s.
- Frame order: lesson, tip, lean-in, hold, normal.
- Reduced motion: no camera move for tips or the hold; the lesson keeps its close frame.
- Copy follows `CONTEXT.md` (Station, Shift, Incident, Served network).

## Review Focus

1. Close camera off: every frame's `fitKey` and `fitTo` match today's and `fitView` is undefined (Task 4).
2. Browser storage throws or holds bad JSON: the panel still works on defaults (Task 3).
3. After using a panel control, the next letter reaches the game, and Space on the focused toggle does not type a space (Task 3).
4. Early closeness at 1×: the close frame is the normal frame's size, recentred, never larger (Task 1).
5. Reduced motion with the close camera on: tips and the hold leave the camera on the normal frame; the lesson still frames close (Tasks 4 and 5).

---

### Task 1: `closeFrame` geometry

**Files:**
- Modify: `src/geo/fit.ts` (add `closeFrame` after `fitViewBox`)
- Test: `src/geo/fit.test.ts`

**Interfaces:**
- Consumes: `fitViewBox(points, padding)`, `MIN_SPAN` (200), `EdgePadding`, `Point`, `ViewBox` from `src/geo/fit.ts` / `src/data/types`.
- Produces: `closeFrame(normal: readonly Point[], subject: readonly Point[], padding: number | EdgePadding, closeness: number): ViewBox`.

- [ ] **Step 1: Write the failing tests** in a new `describe('closeFrame')` in `src/geo/fit.test.ts`. Use a normal set spanning 300 × 200 units (for example corners `(0,0)` and `(300,200)`) and `PAD = { top: 0.12, right: 0.24, bottom: 0.3, left: 0.06 }`; `n = fitViewBox(normal, PAD)`.
  - `'a small subject gets a frame closeness times smaller than the normal frame'`: subject `[{x:100,y:100}]`, closeness 3 → `w` ≈ `n.w / 3`, `h` ≈ `n.h / 3` (`toBeCloseTo`).
  - `'the subject sits where the normal frame\'s content centre sits'`: same inputs; with `fx = (150 - n.x) / n.w`, `fy = (100 - n.y) / n.h` (the normal content centre is (150,100)), expect `f.x + fx * f.w` ≈ 100 and `f.y + fy * f.h` ≈ 100.
  - `'a subject wider than the close size grows the frame to fit it'`: subject `[{x:0,y:100},{x:150,y:100}]` (half the content width), closeness 4 → `w` ≈ `n.w * 0.5`.
  - `'never larger than the normal frame'`: subject = the normal corners, closeness 3 → `w` ≈ `n.w`, `h` ≈ `n.h`.
  - `'closeness 1 keeps the normal size, recentred on the subject'`: subject `[{x:100,y:100}]`, closeness 1 → `w` ≈ `n.w`, and `x` differs from `n.x`.
  - `'an empty subject returns the normal frame'`: `closeFrame(normal, [], PAD, 3)` toEqual `n`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/geo/fit.test.ts`
Expected: FAIL, `closeFrame` is not exported.

- [ ] **Step 3: Implement `closeFrame`** in `src/geo/fit.ts`, with a doc comment in the file's style. The algorithm (the tests do not pin the centring rule alone):

```ts
const n = fitViewBox(normal, padding);
if (subject.length === 0) return n;
// The normal frame's content box, floored as fitViewBox floors it.
// cw, ch = max(span, MIN_SPAN); (ncx, ncy) = the normal points' midpoint.
// The subject's raw box: sw, sh; (scx, scy) = its midpoint.
const k = Math.min(1, Math.max(1 / closeness, sw / cw, sh / ch));
const fx = (ncx - n.x) / n.w;
const fy = (ncy - n.y) / n.h;
return { x: scx - fx * n.w * k, y: scy - fy * n.h * k, w: n.w * k, h: n.h * k };
```

Keeping `fx`, `fy` from the normal frame puts the subject where the network's centre sits today, so the panels' padding still holds.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/geo/fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo/fit.ts src/geo/fit.test.ts
git commit -m "feat: closeFrame frames a subject closer than the normal frame"
```

---

### Task 2: The camera rules module

**Files:**
- Create: `src/ui/dispatchCamera.ts`
- Modify: `src/ui/DispatcherScreen.tsx:150-200` (move `withNeighbours`, `leanIn`, `subjectStations` out; import them back)
- Test: `src/ui/dispatchCamera.test.ts`

**Interfaces:**
- Produces, all exported from `src/ui/dispatchCamera.ts`:
  - `withNeighbours`, `leanIn`, `subjectStations`: moved unchanged (same signatures and doc comments).
  - `interface CloseCameraSettings { on: boolean; early: number; late: number; holdMs: number }`
  - `CLOSE_CAMERA_DEFAULTS: CloseCameraSettings = { on: false, early: 3, late: 1.2, holdMs: 1000 }`
  - `CLOSE_EARLY_STATIONS = 14`, `CLOSE_LATE_STATIONS = 40`
  - `CLOSE_RANGES = { early: [1, 5], late: [1, 3], holdMs: [0, 3000] } as const`
  - `closeness(stations: number, settings: Pick<CloseCameraSettings, 'early' | 'late'> = CLOSE_CAMERA_DEFAULTS): number`
  - `typedClears(before: SimState, after: SimState): Incident[]`: the Incidents in `before` that are gone from `after` and whose place is not Out of service in `after`. Callers pass two states at the same tick, so a gap means the player's typing cleared it.

- [ ] **Step 1: Write the failing tests** in `src/ui/dispatchCamera.test.ts`:
  - `closeness`: with the defaults, `closeness(10)` and `closeness(14)` → 3; `closeness(40)` and `closeness(51)` → 1.2; `closeness(27)` → 2.1 (`toBeCloseTo`). With `{ early: 2, late: 2 }`, `closeness(27)` → 2.
  - `typedClears`: build a sim (as `src/engine/dispatchIncidents.test.ts` does) with two Incidents; `after` without the first → `[first]`; `after` without the first but with its place in `outOfService` → `[]`; identical → `[]`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/ui/dispatchCamera.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/ui/dispatchCamera.ts`** with the exports above, moving the three helpers verbatim, and import them in `DispatcherScreen.tsx`. `closeness` interpolates linearly between the two Station counts and clamps outside them.

- [ ] **Step 4: Run the new tests and the screen suite**

Run: `npx vitest run src/ui/dispatchCamera.test.ts src/ui/Dispatcher.test.tsx`
Expected: PASS, with no Dispatcher test changed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dispatchCamera.ts src/ui/dispatchCamera.test.ts src/ui/DispatcherScreen.tsx
git commit -m "refactor: Dispatcher camera rules move to dispatchCamera, with closeness and typedClears"
```

---

### Task 3: The dev camera panel and its settings

**Files:**
- Create: `src/ui/useCloseCamera.ts`, `src/ui/DispatchCameraPanel.tsx`
- Modify: `src/ui/dispatch.css` (panel styles), `src/ui/DispatcherScreen.tsx` (render the panel)
- Test: `src/ui/DispatchCameraPanel.test.tsx`, `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `CloseCameraSettings`, `CLOSE_CAMERA_DEFAULTS`, `CLOSE_RANGES` (Task 2).
- Produces:
  - `DISPATCH_CAMERA_KEY = 'klmetro.dispatchCamera.v1'` (in `useCloseCamera.ts`).
  - `useCloseCamera(): [CloseCameraSettings, (next: CloseCameraSettings) => void]`. Outside DEV it returns `[CLOSE_CAMERA_DEFAULTS, () => {}]` and never touches storage. In DEV it reads the key once (missing, unreadable or bad JSON → defaults; each field clamped to `CLOSE_RANGES`, missing fields from the defaults) and writes on every change, both inside `try/catch` like `dispatchBoardStore.ts`.
  - `DispatchCameraPanel({ settings, onChange, stations, closenessNow }: { settings: CloseCameraSettings; onChange: (next: CloseCameraSettings) => void; stations: number; closenessNow: number })`: an `<aside className="dispatch-camera-panel" aria-label="Camera (dev)">` with a checkbox labelled `Close camera`, ranges labelled `Early closeness` (step 0.1), `Late closeness` (step 0.1) and `Hold after a fix` (step 100 ms), each with its value shown (`3.0×`, `1.2×`, `1.0 s`), and the readout `Now 2.1× at 27 Stations`.

Key rules for the panel: after a pointer releases a range or the checkbox changes, blur that control so focus returns to the page; its `onKeyDown` calls `stopPropagation()` so keys aimed at a focused control never reach the game's window listener. Place it in the bottom-left corner, clear of the typing panel at 1280 px and wider; the chips need not avoid it.

- [ ] **Step 1: Write the failing tests**
  - `src/ui/DispatchCameraPanel.test.tsx`:
    - `'shows the settings and the readout'`: render with the defaults, `stations: 27`, `closenessNow: 2.1` → checkbox `Close camera` unchecked; text `3.0×`, `1.2×`, `1.0 s`, `Now 2.1× at 27 Stations`.
    - `'changing a control reports the new settings and lets go of focus'`: click the checkbox → `onChange` called with `{ ...CLOSE_CAMERA_DEFAULTS, on: true }`, and `document.activeElement` is not the checkbox.
  - `src/ui/Dispatcher.test.tsx`, a new `describe('the dev camera panel')`:
    - `'is on the Dispatcher screen, off by default'`.
    - `'keeps its settings in browser storage'`: check `Close camera`, unmount, render again → still checked.
    - `'falls back to the defaults when storage holds bad JSON'`: `localStorage.setItem(DISPATCH_CAMERA_KEY, '{')` → renders, unchecked.
    - `'falls back to the defaults when storage throws'`: `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); })` → renders, unchecked.
    - `'typing after using the panel reaches the game'`: click `Close camera`, then `type('D')` → the typed line shows `D`.
    - `'Space on the focused toggle does not reach the game'`: focus the checkbox, `fireEvent.keyDown(checkbox, { key: ' ' })` → the typed line stays empty.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/ui/DispatchCameraPanel.test.tsx src/ui/Dispatcher.test.tsx -t "camera panel|DispatchCameraPanel"`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `useCloseCamera`, `DispatchCameraPanel` and the styles; render the panel from `DispatcherScreen`** while play is showing (not on the summary). For now pass `closenessNow = closeness(served.size, settings)` and `stations = served.size`; nothing reads the settings yet.

- [ ] **Step 4: Run the tests and the screen suite**

Run: `npx vitest run src/ui/DispatchCameraPanel.test.tsx src/ui/Dispatcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useCloseCamera.ts src/ui/DispatchCameraPanel.tsx src/ui/DispatchCameraPanel.test.tsx src/ui/dispatch.css src/ui/DispatcherScreen.tsx src/ui/Dispatcher.test.tsx
git commit -m "feat: dev-only camera panel for the Dispatcher's close camera"
```

---

### Task 4: Close frames for the lesson and the train tips

**Files:**
- Modify: `src/render/MapCanvas.tsx` (one prop), `src/ui/DispatcherScreen.tsx:620-670`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `closeFrame` (Task 1); `closeness`, `subjectStations` (Task 2); `useCloseCamera` (Task 3).
- Produces: `MapCanvas` prop `fitView?: ViewBox`, documented as "An explicit frame. When given, it replaces the frame fitted from `fitTo`; `fitKey` still decides when the view refits." `framed` becomes `fitView ?? fitViewBox(fitTo ?? [...layout.values()], fitPadding)`.

Screen rules, close camera on:
- Lesson: `fitView = closeFrame(frame, lessonFrame, DISPATCH_FIT_PADDING, settings.early)`, also under reduced motion; `fitKey = 'dispatch:lesson:close:' + settings.early.toFixed(2)`.
- Tip with a subject (motion allowed): `fitView = closeFrame(frame, tipFrame, padding, c)` with `c = closeness(served.size, settings)`; `fitKey = 'tip:' + id + ':close:' + c.toFixed(2)`.
- `fitTo` keeps today's points in both cases. `frame` is the normal points (`DispatcherScreen.tsx:586`).
- Lean-in and the normal frame unchanged. Close camera off: everything as today.

- [ ] **Step 1: Write the failing tests** in `src/ui/Dispatcher.test.tsx`, with a helper `closeCameraOn(over?: Partial<CloseCameraSettings>)` that writes `{ ...CLOSE_CAMERA_DEFAULTS, on: true, ...over }` to `DISPATCH_CAMERA_KEY` before rendering, and `normalBox()` = `fitViewBox(<served Station points>, DISPATCH_FIT_PADDING)`:
  - `'close camera off: frames, keys and fitView are as today'`: the existing Service gap tip test's setup → `fitKey` `'tip:service-gap'`, `fitView` undefined; lean-in setup → `fitKey` matches `/^fix:1/`, `fitView` undefined.
  - `'the lesson frames its Stations at the early closeness'`: `closeCameraOn()`, render the first-Career lesson as the existing lesson tests do → `fitKey` `'dispatch:lesson:close:3.00'`, `fitView.w` ≈ `normalBox().w / 3`.
  - `'the lesson keeps its close frame under reduced motion'`: same, without `allowMotion()` → `fitView` defined.
  - `'a Service gap tip frames its pair close'`: `closeCameraOn()`, `allowMotion()`, the existing gap setup → `fitKey` matches `/^tip:service-gap:close:/`, `fitView.w < normalBox().w`, `fitTo` still contains Kampung Baru, Dang Wangi, KLCC; dismissing → `fitView` undefined.
  - `'a late tip frames its train close'`: the existing late setup, close camera on → `fitKey` matches `/^tip:late:close:/`, `fitView` defined.
  - `'under reduced motion a tip leaves the camera alone'`: gap setup, close camera on, no `allowMotion()` → `fitView` undefined.
  - `'a closeness change refits the close frame'`: during the gap tip, change the `Early closeness` range (`fireEvent.change`) → `fitKey` differs from before and still matches `/^tip:service-gap:close:/`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/ui/Dispatcher.test.tsx -t "close"`
Expected: FAIL (no `fitView`, old keys).

- [ ] **Step 3: Add the `fitView` prop to `MapCanvas` and wire the lesson and tip close frames in `DispatcherScreen`.**

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/MapCanvas.tsx src/ui/DispatcherScreen.tsx src/ui/Dispatcher.test.tsx
git commit -m "feat: close camera frames the lesson and the train tips (dev panel)"
```

---

### Task 5: The close hold after a typed fix clears an Incident

**Files:**
- Modify: `src/ui/DispatcherScreen.tsx`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: `typedClears`, `withNeighbours`, `closeness` (Task 2); `closeFrame` (Task 1); `fitView` (Task 4).

Screen rules:
- Detect at the player's inputs only. In `onKey`, compare `synced.sim` with the state `enterDispatchCharacter` returns. For `confirm`, compare `advanceCareer(net, prev, now).sim` with the result of the action. Use `typedClears(before, after)`.
- When it returns Incidents, the close camera is on, `holdMs > 0` and motion is allowed: hold on the last one. Its subject is `withNeighbours(net, inc.line, inc.place, served)`; `fitView = closeFrame(frame, subjectPoints, padding, closeness(served.size, settings))`; `fitKey = 'hold:' + inc.id + ':close:' + c.toFixed(2)`. End it after `holdMs` with a `setTimeout`, cleared on unmount and when a new hold replaces it.
- A new typed clear during the hold replaces it and restarts the timer.
- The hold ends at once when the aim locks onto a fix (the lean-in takes over and the hold does not come back), or when the Career leaves `running`/`paused`, or during a failed Shift's hold (`failHold`).
- Frame order in `fitTo`/`fitView`/`fitKey`: lesson, tip, lean-in, hold, normal.

- [ ] **Step 1: Write the failing tests** in the lean-in `describe` of `src/ui/Dispatcher.test.tsx`, with `closeCameraOn({ holdMs: 100 })` and `allowMotion()`:
  - `'clearing a fix holds a close frame on its place, then lets go'`: `surgeWithWaiting()`, `type('Crowd control at Ampang Park')` → `fitKey` matches `/^hold:1:close:/`, `fitView.w < normalBox().w`, `fitTo` contains Ampang Park and its two KJ neighbours; then `await waitFor(() => expect(mapProps().fitKey).toBe(normalKey))`.
  - `'locking onto another fix during the hold hands over to its lean-in'`: extend `surgeWithWaiting` with a second crowd surge at another served KJ Station (`nextIncidentId = 3`); clear the first with `holdMs: 3000`, then type the first letters of the second fix → `fitKey` matches `/^fix:2/`; finish the second fix → `fitKey` matches `/^hold:2:close:/` (its own hold), never `/^hold:1/` again.
  - `'with the close camera off, clearing a fix goes straight back to the normal frame'`: the existing completion test, unchanged, still passes (no new test needed; check it is in the run).
  - `'under reduced motion a cleared fix leaves the camera alone'`: close camera on, no `allowMotion()` → after the fix, `fitKey` is the normal key, `fitView` undefined.
  - `'a hold of 0 s does nothing'`: `closeCameraOn({ holdMs: 0 })` → after the fix, `fitKey` is the normal key.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/ui/Dispatcher.test.tsx -t "hold|cleared fix|another fix"`
Expected: FAIL.

- [ ] **Step 3: Implement the hold in `DispatcherScreen`.**

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DispatcherScreen.tsx src/ui/Dispatcher.test.tsx
git commit -m "feat: close camera holds on an Incident's place after its fix lands (dev panel)"
```

---

### Task 6: Probe, live check, and the tracker

**Files:**
- Create: `src/ui/dispatchCameraProbe.test.ts`
- Modify: `docs/superpowers/dispatcher-playtest-2-feedback.md`

**Interfaces:**
- Consumes: `drive` (`src/engine/dispatchDrive.testutil.ts`), `leanIn`, `subjectStations`, `withNeighbours`, `closeness`, `CLOSE_CAMERA_DEFAULTS` (Task 2), `closeFrame`, `fitViewBox`, `DISPATCH_FIT_PADDING`, `tipSubject`, `networkLayout`.

- [ ] **Step 1: Write the opt-in probe** `it.skipIf(!process.env.DISPATCH_PROBE)('prints the camera zooms', ...)`, following the method in the spec's "How it is checked" exactly (seeds 1–5, `msPerKey: 200`, 30 minutes, score `min(1440 / w, 900 / h)`, zoom = score ÷ the normal frame's score, each lean-in once at the first lock, each tip subject once per Shift, median / p10 / p90 per Shift band 1–3, 4–8, 9+). Print two tables: today's frames (`fitViewBox` of the frame points) and the close camera at its defaults (`closeFrame`), plus the lesson against Shift 1, and a hold row (place and neighbours, at each typed clear the typist makes).

- [ ] **Step 2: Run it**

Run: `DISPATCH_PROBE=1 npx vitest run src/ui/dispatchCameraProbe.test.ts`
Expected: the "today" table matches the spec's (lean-in, late and gap tips 1.00× in Shifts 1–3; about 1.44× median from Shift 9; lesson 1.00×); the close-camera table shows about 3× for tips, the lesson and holds in Shifts 1–3, falling towards 1.2× late.

- [ ] **Step 3: Check the production build strips the panel**

Run: `npm run build && grep -rl "Close camera" dist || echo stripped`
Expected: `stripped`.

- [ ] **Step 4: Check it live** with the `run` skill on the dev server: switch `Close camera` on; screenshot the lesson, a Service gap tip and a cleared fix in an early Shift, and a tip on `?dispatch=full`. Drag `Early closeness` during a tip and see the frame follow; type a Station name after using a slider and see it reach the game.

- [ ] **Step 5: Update the tracker**: add F27 to the summary table (P1, M, `done <commits>`) and a section after F23 with what was built, the probe's before and after numbers, and what was not seen live; note under F11 that its camera part is F27. Add the spec's three "Playtest 3: what to look at" points to "Check in playtest 3". Update "Where it stands".

- [ ] **Step 6: Commit**

```bash
git add src/ui/dispatchCameraProbe.test.ts docs/superpowers/dispatcher-playtest-2-feedback.md docs/superpowers/specs/2026-10-26-dispatcher-close-camera-design.md docs/superpowers/plans/2026-10-26-dispatcher-close-camera.md
git commit -m "docs: tracker logs F27 (close camera behind the dev panel) with its camera probe"
```
