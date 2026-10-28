# Dispatcher Crowding Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-switchable crowding hint for playtest 3: amber Signal chips on the Trains that would relieve a crowded Station (A), plus a countdown ring on the Station (B), and a Declutter switch for Station labels.

**Architecture:** Presentation only. A new pure module `src/render/crowdingHint.ts` derives crowded Stations, relieving Trains and the decluttered label set from the sim state the screen already has. `DispatchOverlay` draws amber chips and rings from that; `MapCanvas`/`mapLabels` gain a `labelOnly` filter; a `useCrowdingHint` hook and three controls in the dev camera panel switch it, mirroring `useCloseCamera`.

**Tech Stack:** TypeScript, React 18, SVG, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-dispatcher-crowding-hint-design.md`

## Global Constraints

- Presentation only: no change to `src/engine/*` rules, balance numbers, `DISPATCH_EVIDENCE_VERSION` or replay.
- With the hint Off and Declutter off, the screen is exactly as before (existing tests pass unchanged).
- The hint never moves a chip: amber is a style on the existing chip; chip placement ignores rings.
- Production builds: hint Off, labels as today, and never touch the `klmetro.dispatchCrowding.v1` storage.
- Development defaults: mode `b`, delay 5 s (range 0–15 s, 1 s steps), Declutter off.
- The ring follows today's rule: fill `fullMs / OOS_CROWD_MS`, gone the tick `fullMs` returns to 0.
- No sound. Nothing shows during the guided lesson, between Shifts, at a Station Out of service.
- Copy uses the glossary: Station, Signal chip, Station label, Held, Clear.

## Review Focus

- A Train with both a Signal chip and an express skip chip: only the Signal chip turns amber (Task 1 test, Task 3 test).
- An Interchange crowded on one Line: a Train on its other Line counts only if that Line's served range includes the Station (Task 1 test).
- A locked or candidate chip that is also relieving must still read as locked/candidate: lock styles win over amber in CSS order (Task 3 CSS order; Task 6 browser check).
- A Station that goes Out of service on the tick it would show: no ring, no amber chips for it (Task 1 test).
- Between Shifts with Declutter on: Expansion offers keep their Station labels (Task 1 `hintLive` test; Task 5 wiring uses it for Declutter too).

---

### Task 1: The crowding rules (`crowdingHint.ts`)

**Files:**
- Create: `src/render/crowdingHint.ts`
- Test: `src/render/crowdingHint.test.ts`

**Interfaces:**
- Produces:
  - `type CrowdingHintMode = 'off' | 'a' | 'b'`
  - `interface CrowdingHintSettings { mode: CrowdingHintMode; delayMs: number; declutter: boolean }`
  - `CROWDING_HINT_DEFAULTS: CrowdingHintSettings = { mode: 'b', delayMs: 5_000, declutter: false }` (development)
  - `CROWDING_HINT_OFF: CrowdingHintSettings = { mode: 'off', delayMs: 5_000, declutter: false }` (production)
  - `CROWDING_DELAY_RANGE = [0, 15_000] as const`, `CROWDING_DELAY_STEP = 1_000`
  - `RELIEVE_BLOCKS = 3`
  - `interface CrowdedStation { id: string; share: number; waiting: number }` — `share` is `min(1, fullMs / OOS_CROWD_MS)`, `waiting` is `crowdAt`.
  - `crowdedStations(sim: SimState, delayMs: number): CrowdedStation[]` — platforms not Out of service with `fullMs > 0 && fullMs >= delayMs`, sorted by id.
  - `relievingTrains(net: NetworkIndex, sim: SimState, crowded: readonly CrowdedStation[], targets: readonly Target[]): Set<number>` — Train ids that have a `kind: 'signal'` Target, on a Line whose served range (`sim.served`) includes the crowded Station's index, with `d = (index - t.at) * t.dir` and `0 <= d <= RELIEVE_BLOCKS`.
  - `hintLive(status: CareerState['status'], inLesson: boolean): boolean` — true only for `ready`, `running`, `paused` outside the lesson.
  - `declutteredLabels(net: NetworkIndex, sim: SimState, targets: readonly Target[], ringed: readonly string[]): Set<string>` — the Station at the Signal of every Train with a `signal` or `skip` Target (`stations[t.at]`, as `dispatchLabelled` does), every Incident's `place`, and `ringed`.

- [ ] **Step 1: Write the failing tests**

Build states like `dispatchLayout.test.ts`'s `lone()`: `startShiftSim(net, STARTING_NETWORK, 1)`, then set `s.trains`, `s.platforms[id].waiting` and `.fullMs` by hand; targets from `visibleTargets(net, s)`. Tests (KJ, `STARTING_NETWORK` serves Gombak–Kerinchi):

```ts
it('a platform counts as crowded once its countdown reaches the delay', () => {
  // klcc fullMs 4_900 -> not crowded at 5_000; 5_000 -> crowded, share 5_000/19_000, waiting = crowdAt
});
it('a platform below 55 is never crowded, even with no delay', () => {
  // fullMs 0, delay 0 -> []
});
it('a Station Out of service is not crowded', () => { /* outOfService.klcc = 'crowding' */ });
it('a Train Held up to three blocks before a crowded Station relieves it', () => {
  // dir 1 Trains at Signals before Ampang Park (d=1), KLCC (d=0), Damai (d=2), Dato' Keramat (d=3) -> all in
  // one at Jelatek (d=4) -> out; one dir 1 at the Signal before Kampung Baru (d=-1, past it) -> out
});
it('a Train heading the other way toward the Station also relieves it', () => {
  // klcc crowded; dir -1 at the Signal before Dang Wangi (d=2) -> in
});
it('a closed Station in between still counts as one of the three blocks', () => {
  // klcc crowded; outOfService['ampang-park']; dir 1 at Dato' Keramat (d=3) -> in; at Jelatek (d=4) -> out
});
it('a Train that must reverse first does not count', () => {
  // crowded Station behind a Train heading to the terminus -> out
});
it('only Signal Targets count: a fix-held Train and a skip Target do not add Trains', () => {
  // Train with signal + skip targets -> its id once; a train held by a signal fault (no Target) -> out
});
it('an Interchange counts Trains only on Lines that serve it', () => {
  // served ranges with KJ and AG; masjid-jamek crowded; AG Train within 3 blocks counts only when AG's range includes masjid-jamek
});
it('the hint is live only while a Shift is ready, running or paused, outside the lesson', () => {
  expect(hintLive('running', false)).toBe(true);
  expect(hintLive('paused', false)).toBe(true);
  expect(hintLive('ready', false)).toBe(true);
  expect(hintLive('between', false)).toBe(false);
  expect(hintLive('ended', false)).toBe(false);
  expect(hintLive('running', true)).toBe(false);
});
it('decluttered labels keep Held Trains’ Stations, Incident places and ringed Stations only', () => {
  // Train at the Signal before Damai, an Incident at bangsar, ringed ['klcc'] -> exactly {damai, bangsar, klcc}
});
```

Fill each comment as a concrete `expect`; the values above are the expected results.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/render/crowdingHint.test.ts`
Expected: FAIL, cannot resolve `./crowdingHint`.

- [ ] **Step 3: Implement `src/render/crowdingHint.ts`** with the Interfaces above. Import `OOS_CROWD_MS` from `../engine/dispatchBalance` and `crowdAt` from `../engine/dispatchSim`; read nothing else from the engine but types.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/render/crowdingHint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/crowdingHint.ts src/render/crowdingHint.test.ts
git commit -m "feat: crowding hint rules: crowded Stations and the Trains that relieve them"
```

### Task 2: Station labels can be limited to a set (`labelOnly`)

**Files:**
- Modify: `src/render/mapMarks.ts` (`MapLabelInput`, `mapLabels`)
- Modify: `src/render/MapCanvas.tsx` (props near `labelled`, the `mapLabels` call)
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Produces: `MapLabelInput.labelOnly?: ReadonlySet<string> | null` and `MapCanvasProps.labelOnly?: ReadonlySet<string> | null`. When set, a Station is a label candidate only if it is `activeStation` or on screen and in `labelOnly`; `showEveryLabel`, `labelled`, termini and Interchange tiers are ignored. `null`/absent: today's behaviour.

- [ ] **Step 1: Write the failing test** in `MapCanvas.test.tsx`: `it('labelOnly limits Station labels to its set')` — render with a view that would label every Station, `labelOnly={new Set(['klcc'])}`, expect the only `[data-label]` element to be `data-label="klcc"`; render again without it and expect more than one.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx -t labelOnly`
Expected: FAIL (more than one label).

- [ ] **Step 3: Implement** the prop, threaded from `MapCanvas` into `mapLabels`.

- [ ] **Step 4: Run** `npx vitest run src/render/MapCanvas.test.tsx` — expected PASS, all existing tests too.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapMarks.ts src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx
git commit -m "feat: the map can limit Station labels to a given set"
```

### Task 3: The overlay draws amber chips and rings

**Files:**
- Modify: `src/render/DispatchOverlay.tsx`
- Modify: `src/render/dispatchLayout.ts` (`overlayObstacles`)
- Modify: `src/ui/dispatch.css`
- Test: `src/render/DispatchOverlay.test.tsx` (create)

**Interfaces:**
- Consumes: `CrowdedStation` (Task 1).
- Produces:
  - `DispatchOverlayProps.hint?: CrowdingHintView` where `interface CrowdingHintView { relieving: ReadonlySet<number>; rings: readonly CrowdedStation[] }` (exported from `crowdingHint.ts`; add it there).
  - `overlayObstacles(net, layout, career, targets, marks, m, frame = null, rings: readonly CrowdedStation[] = [])` — appends one `circleBox` per ring at its Station, radius `RING_CLEAR_R * m`.
  - Exported from `DispatchOverlay.tsx` or `dispatchLayout.ts`: `RING_R = 11`, `RING_CLEAR_R = 22` (nominal units, times `markScale`) *(values: builder may tune in the browser check, keeping labels clear of the count)*.

- [ ] **Step 1: Write the failing tests** (render `<svg><DispatchOverlay … /></svg>` with a sim built as in Task 1 and `networkLayout().geo`):
  - `it('a relieving Train’s Signal chip is marked, its skip chip is not')` — `[data-testid="dispatch-signal"][data-relieve="true"]` count 1; no `[data-testid="dispatch-skip"][data-relieve]`.
  - `it('no hint marks nothing')` — without `hint`, no `[data-relieve]` and no `[data-testid="crowding-ring"]`.
  - `it('a ring shows the countdown and the count')` — `rings: [{ id: 'klcc', share: 0.5, waiting: 62 }]` → one `[data-testid="crowding-ring"][data-station="klcc"]`, its arc's `stroke-dasharray` starts with `0.5`, and text `62`.
  - `it('rings do not move chips')` — `overlayLayout(...)` chip positions identical with and without rings (rings never reach `overlayLayout`).
  - `it('labels keep clear of rings')` — `overlayObstacles(..., rings)` has one more box than without, centred on klcc.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/render/DispatchOverlay.test.tsx`
Expected: FAIL (no `data-relieve`, no ring).

- [ ] **Step 3: Implement.**
  - Chips: `data-relieve={chip.kind === 'signal' && hint?.relieving.has(chip.ref.train) ? 'true' : undefined}`.
  - Rings: drawn after the Out of service marks and before Trains, one `<g data-testid="crowding-ring" data-station={id} className="crowding-ring">` per ring: a track circle, an arc circle with `pathLength={1}`, `strokeDasharray={`${share} 1`}`, rotated −90° about the Station, and a `<text className="crowding-count">` with `waiting`, above-right of the ring, font `10 * m`. Non-scaling strokes like the other marks.
  - CSS, placed **before** the `data-candidate`/`data-locked` chip rules so they win: `.dispatch-chip[data-relieve='true'] rect { stroke: var(--warn); stroke-width: 2px; fill: color-mix(in srgb, var(--warn) 12%, var(--panel)); }`; `.crowding-ring-track { stroke: var(--paper-edge) }`, `.crowding-ring-arc { stroke: var(--warn) }`, `.crowding-count { fill: var(--warn); font-weight: 700 }`. No animation.

- [ ] **Step 4: Run** `npx vitest run src/render` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/DispatchOverlay.tsx src/render/DispatchOverlay.test.tsx src/render/dispatchLayout.ts src/render/crowdingHint.ts src/ui/dispatch.css
git commit -m "feat: the Dispatcher overlay draws amber relieving chips and crowding rings"
```

### Task 4: Settings hook and dev panel controls

**Files:**
- Create: `src/ui/useCrowdingHint.ts`
- Modify: `src/ui/DispatchCameraPanel.tsx`
- Test: `src/ui/DispatchCameraPanel.test.tsx`

**Interfaces:**
- Consumes: `CrowdingHintSettings`, `CROWDING_HINT_DEFAULTS`, `CROWDING_HINT_OFF`, `CROWDING_DELAY_RANGE`, `CROWDING_DELAY_STEP` (Task 1).
- Produces:
  - `DISPATCH_CROWDING_KEY = 'klmetro.dispatchCrowding.v1'`
  - `useCrowdingHint(): [CrowdingHintSettings, (next: CrowdingHintSettings) => void]` — a copy of `useCloseCamera`'s pattern: dev loads/clamps/saves (unknown `mode` → default, `delayMs` clamped to the range, non-boolean `declutter` → default); production returns `[CROWDING_HINT_OFF, noChange]` and never touches storage.
  - `DispatchCameraPanelProps` gains optional `crowding?: CrowdingHintSettings` and `onCrowdingChange?: (next: CrowdingHintSettings) => void`. When given, a "Crowding" group renders under the camera controls: a `<select aria-label="Crowding hint">` with options `off` "Off", `a` "A: amber chips", `b` "B: chips and ring"; a slider "Hint delay" in seconds (0–15, step 1) with output `5 s`; a checkbox "Declutter labels". Each control blurs after use, as the camera ones do.

- [ ] **Step 1: Write the failing tests:**
  - `it('shows the crowding controls when given settings')` — default settings render select value `b`, `5 s`, checkbox unchecked.
  - `it('each crowding control reports the new settings')` — select `a` → `{ ...CROWDING_HINT_DEFAULTS, mode: 'a' }`; slider `8` → `delayMs: 8_000`; checkbox → `declutter: true`.
  - Keep the existing `has no hold slider` test passing: it renders without `crowding`, so two sliders.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/DispatchCameraPanel.test.tsx`
Expected: FAIL (no "Crowding hint" control).

- [ ] **Step 3: Implement** the hook and the group.

- [ ] **Step 4: Run** `npx vitest run src/ui/DispatchCameraPanel.test.tsx` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useCrowdingHint.ts src/ui/DispatchCameraPanel.tsx src/ui/DispatchCameraPanel.test.tsx
git commit -m "feat: dev panel switches the crowding hint, its delay and Declutter"
```

### Task 5: Wire it into the Dispatcher screen

**Files:**
- Modify: `src/ui/DispatcherScreen.tsx` (hooks near `useCloseCamera` at ~300; derived values near `labelled` at ~640; `MapCanvas` at ~688; `DispatchOverlay`; the dev panel at ~793)
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Write the failing test** in `Dispatcher.test.tsx`, following its existing setup for a running Career: with `localStorage` holding `{ mode: 'b', delayMs: 0, declutter: false }` under `klmetro.dispatchCrowding.v1` (dev build in tests), advance until a platform's `fullMs > 0` (or seed the sim through the test's existing hooks) and expect a `[data-testid="crowding-ring"]`; with `mode: 'off'` expect none and no `[data-relieve]`. If the existing harness cannot reach a crowded platform cheaply, assert instead that the panel shows the Crowding group and that switching it to Off removes any ring present — and note the gap for the browser check.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/Dispatcher.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `const [crowding, setCrowding] = useCrowdingHint();`
  - `const live = hintLive(shown.status, lesson !== null)`; `const crowded = live && crowding.mode !== 'off' ? crowdedStations(shown.sim, crowding.delayMs) : []`; `relieving = relievingTrains(net, shown.sim, crowded, targets)`; `rings = crowding.mode === 'b' ? crowded : []`.
  - `labelOnly = live && crowding.declutter ? declutteredLabels(net, shown.sim, targets, rings.map((r) => r.id)) : null` → `MapCanvas labelOnly`.
  - `labelAvoid` passes `rings` to `overlayObstacles`; `DispatchOverlay hint={{ relieving, rings }}`.
  - Dev panel: `crowding={crowding} onCrowdingChange={setCrowding}`.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — expected all PASS (85+ suites), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DispatcherScreen.tsx src/ui/Dispatcher.test.tsx
git commit -m "feat: the Dispatcher shows the crowding hint and Declutter from the dev panel"
```

### Task 6: Probe, browser check and tracker

**Files:**
- Create: `src/ui/crowdingHintProbe.test.ts` (opt-in, like `dispatchCameraProbe.test.ts`)
- Modify: `docs/superpowers/dispatcher-playtest-2-feedback.md` (F29 row and section)

- [ ] **Step 1: Write the probe**, skipped unless `DISPATCH_PROBE=1`: drive 60 WPM (`msPerKey: 200, accuracy: 0.96`), seeds 1–5, 30 minutes, with `watch`; for each running sample, `crowdedStations(sim, 5_000)` and `relievingTrains`. Print, per Shift band (1–3, 4–8, 9+): share of running time any ring shows, mean rings when any, mean amber chips when any, and the share of crowding closures preceded by at least one amber chip in their last 14 s.

- [ ] **Step 2: Run it**

Run: `DISPATCH_PROBE=1 npx vitest run src/ui/crowdingHintProbe.test.ts`
Expected: a table per band; copy it into the F29 section of the tracker.

- [ ] **Step 3: Browser check** on `npm run dev` at 1280 × 800 and 390 px wide: Shift 1's Evening peak (about 55–90 s in) at Masjid Jamek or KLCC with A then B — amber chips on the right Trains, the ring filling and vanishing when a Train calls, a locked amber chip still reading as locked; a later network (`?dispatch=full`) with Declutter on and off; between Shifts with Declutter on, offer names still shown. Screenshot each.

- [ ] **Step 4: Update the tracker**: F29 status `done <first>..<last>` with what was seen live and what was not, and the probe table.

- [ ] **Step 5: Commit**

```bash
git add src/ui/crowdingHintProbe.test.ts docs/superpowers/dispatcher-playtest-2-feedback.md
git commit -m "test: crowding hint probe; F29 verified for playtest 3"
```
