# Dispatcher Service Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bunching becomes a player-caused Service gap Incident with a typed fix ("Hold at <Station>") that holds the rear train, and the Service gap and late tips point the camera at their trains.

**Architecture:** The rules live in the engine beside the other Incidents: `stepIncidents` tracks how long each rear train has stayed in a pair (new `SimState.pairs`), starts a `'service-gap'` Incident after `GAP_TRIGGER_MS`, ends it when the pair breaks up, and lets the existing escalation close its `place`. Completing its fix sets `SimState.gapHolds[train]`, which `heldTrains` honours while that train waits at a Signal. On screen, `dispatchTips.ts` gains a `tipSubject` the screen uses to frame the map and pulse the trains while a pointing tip shows.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-26-dispatcher-service-gap-design.md`

## Global Constraints

- A Career must still replay exactly from its Keylog and action log; bump `DISPATCH_EVIDENCE_VERSION` (2 → 3).
- Service gaps start from sim state only (no rng draws), and only inside `stepIncidents`, so the onboarding lesson (which steps with `stepSim` alone) never gets one.
- Existing Incident rules (spawn, escalation, `INCIDENT_MAX = 3`, `INCIDENT_LIMIT_MS = 17_000`) keep working for the three random kinds.
- Starting values: `GAP_TRIGGER_MS = 6_000`, `GAP_HOLD_MS = 6_000` (Task 3 tunes them).
- Copy: card title "Service gap"; fix item `Hold at <Station>`; closure cause "after a service gap was left unfixed".
- Reduced motion: the camera stays still for pointing tips (as the lean-in does) and the pulse becomes a steady highlight.
- Works at 1440×900 and 1024×768, both themes.

## Review Focus

1. **A pair at the outer end.** The rear train has not called anywhere yet; `place` falls back without crashing and is inside the served range. Test in Task 1.
2. **The fix typed while the rear train is still running.** The hold starts when it reaches its Signal; it must not freeze mid-track. Test in Task 1.
3. **Two pairs on one Line, or a chain of three trains.** Each rear train gets at most one Service gap; the middle train of a chain is both a leader and a rear. Test in Task 1.
4. **The first Incident of a Career is a Service gap.** Only the `service-gap` tip shows, not the generic `incident` tip as well. Test in Task 2.
5. **A pointing tip whose train has gone** (cleared or closed before the tip shows): no crash; the tip shows without a frame change. Test in Task 2.

---

### Task 1: The Service gap Incident in the engine

**Files:**
- Modify: `src/engine/dispatchSim.ts` (`IncidentKind`, `SimState`, `startShiftSim`, `cloneSim`, `heldTrains`; new `pairedRears`)
- Modify: `src/engine/dispatchIncidents.ts` (`stepIncidents`, `fixItems`, `advanceFix`)
- Modify: `src/engine/dispatchBalance.ts` (`GAP_TRIGGER_MS`, `GAP_HOLD_MS`)
- Modify: `src/engine/dispatch.ts` (`DISPATCH_EVIDENCE_VERSION = 3`)
- Modify, only so the build stays typed: `src/ui/DispatchIncidents.tsx` (`INCIDENT_KIND_NAME`), `src/render/incidentGlyphs.ts` (`INCIDENT_GLYPH`), `src/ui/dispatchTips.ts` (`CAUSE_TEXT`)
- Test: `src/engine/dispatchIncidents.test.ts`

**Interfaces:**
- Produces:
  - `IncidentKind` gains `'service-gap'` (so `OosCause` does too).
  - `SimState.pairs: Record<string, number>`: pair key `${rear}:${leader}` → Shift ms the pair began. `SimState.gapHolds: Record<number, number>`: train id → hold ms left.
  - `export function pairedRears(net: NetworkIndex, s: SimState): Map<number, number>` in `dispatchSim.ts`: rear train id → its leader's id, for trains on the same Line and direction within `BUNCH_BLOCKS`, the rear being behind in the direction of travel (positions as `bunchedTrains` computes them). For a chain, each train maps to the nearest train ahead.
  - `GAP_TRIGGER_MS = 6_000`, `GAP_HOLD_MS = 6_000` in `dispatchBalance.ts`, each with a one-line comment.
  - `INCIDENT_KIND_NAME['service-gap'] = 'Service gap'`; `CAUSE_TEXT['service-gap'] = 'after a service gap was left unfixed'`; a distinct `INCIDENT_GLYPH['service-gap']` (Claude's suggestion: two train fronts nose to tail; any shape that differs from the other three).

- [ ] **Step 1: Write the failing tests** in `src/engine/dispatchIncidents.test.ts`, inside a new `describe('Service gap')`, using the file's `run`, `quiet` and `index` helpers and trains placed by hand (as the file's other tests do)

```ts
it('a pair that stays together for GAP_TRIGGER_MS starts a Service gap on the rear train', () => {
  // Rear at Kampung Baru, leader one block ahead at Dang Wangi, both dir 1, both waiting at Signals.
  const s = pairOnKJ('Kampung Baru', 'Dang Wangi');
  run(s, GAP_TRIGGER_MS - TICK_MS, quiet);
  expect(s.incidents.filter((i) => i.kind === 'service-gap')).toEqual([]);
  run(s, TICK_MS, quiet);
  const gap = s.incidents.find((i) => i.kind === 'service-gap')!;
  expect(gap).toMatchObject({ line: 'KJ', train: REAR, stations: [] });
  expect(fixItems(net, gap, s)).toEqual(['Hold at Kampung Baru']);
});

it('names as its place the last Station the rear train called at, or the one behind it if none', () => {
  // With lastExchange set on the rear train: place is lastExchange.station.
  // With lastExchange null: place is the Station at rear.at - rear.dir, clamped into the served range.
});

it('ends by itself when the pair breaks up, and its place stays open', () => {
  // Start a gap; move the leader two blocks ahead; one tick later the incident is gone and nothing is out of service.
});

it('the typed fix holds the rear train at its Signal for GAP_HOLD_MS, then lets it go', () => {
  // advanceFix on the gap: incident removed; heldTrains contains REAR while it waits at its Signal;
  // after GAP_HOLD_MS of ticks it is no longer held.
});

it('a fix typed while the rear train is running holds it only once it reaches its Signal', () => {
  // Rear stage 'running': not in heldTrains, keeps moving; on arrival (stage 'signal') it is held for GAP_HOLD_MS.
});

it('unfixed, it closes its place at INCIDENT_LIMIT_MS with cause service-gap', () => {
  // outOfService[place] === 'service-gap' after INCIDENT_LIMIT_MS from the start.
});

it('waits for a free slot when INCIDENT_MAX Incidents are up, and draws nothing from incidentDebt or rng', () => {
  // With 3 random incidents present: no gap starts; remove one: the gap starts on the next tick.
  // incidentDebt and rng are unchanged by a gap starting.
});

it('a chain of three trains gives each rear train at most one Service gap', () => {
  // Trains at three consecutive blocks, same dir: two gaps (middle and last), never two on one train.
});

it('a new leader restarts the pair timer', () => {
  // Pair for GAP_TRIGGER_MS - 1 tick, then swap the leader for a different train: no gap until a full GAP_TRIGGER_MS more.
});
```

Add the small `pairOnKJ(rearName, leaderName)` helper and a `REAR` id constant beside the tests. Fill in each test body from its comment; every comment states the assertion.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/engine/dispatchIncidents.test.ts`
Expected: FAIL (no `service-gap` kind, no `GAP_TRIGGER_MS`).

- [ ] **Step 3: Implement**

- `startShiftSim` initialises `pairs: {}` and `gapHolds: {}`; `cloneSim` copies both.
- `heldTrains` also includes a train with `gapHolds[id] > 0` **only while its stage is `'signal'`** (a running train must keep moving).
- In `stepIncidents`, after the existing closure loop and before random spawning:
  1. Decrement `gapHolds` by `TICK_MS` for trains currently at their Signal; delete at 0 or when the train no longer exists.
  2. `pairedRears` → update `pairs` (keep start times for keys still present, add new keys at `endMs`, drop the rest).
  3. Remove `service-gap` Incidents whose `train` is no longer a rear in `pairedRears`.
  4. For each pair at least `GAP_TRIGGER_MS` old whose rear has no Service gap, while `incidents.length < INCIDENT_MAX`: compute `place` (Review Focus 1); skip if it is out of service or used by another Incident's `place`/`stations`; otherwise push `{ kind: 'service-gap', place, stations: [], line, train: rear, startedMs: endMs, step: 0, extra: 0 }` with `id: s.nextIncidentId++`. No `draw`, no `incidentDebt` change.
- `fixItems` `'service-gap'`: `[\`Hold at ${name(nextStationId(net, train) ?? inc.place)}\`]`.
- `advanceFix`: when a `'service-gap'` completes, set `gapHolds[inc.train] = GAP_HOLD_MS`.
- `DISPATCH_EVIDENCE_VERSION = 3`, with its comment updated ("3: Service gap Incidents").
- The three typed maps (name, glyph, cause text) as in Interfaces.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run src/engine/dispatchIncidents.test.ts` — Expected: PASS.
Run: `npx vitest run && npx tsc --noEmit` — Expected: all pass. Replay and seed-scanning tests may need their seeds or expectations updated because Careers now play differently; update them only where the change is caused by Service gaps, and say which in the report.

- [ ] **Step 5: Commit**

```bash
git add src/engine src/ui/DispatchIncidents.tsx src/render/incidentGlyphs.ts src/ui/dispatchTips.ts
git commit -m "feat: a pair that stays bunched becomes a Service gap Incident, fixed by holding the rear train"
```

---

### Task 2: Tips that point at their trains

**Files:**
- Modify: `src/ui/dispatchTips.ts` (replace `bunching` with `service-gap`; `incident` for random kinds only; `tipSubject`)
- Modify: `src/ui/DispatcherScreen.tsx` (frame and pulse while a pointing tip shows)
- Modify: `src/render/DispatchOverlay.tsx` (`spotlight` prop), `src/ui/dispatch.css` (pulse, reduced-motion steady highlight)
- Test: `src/ui/dispatchTips.test.ts`, `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: Task 1's `'service-gap'` kind and `Incident.train`.
- Produces:
  - `DISPATCH_TIPS`: `bunching` removed; `{ id: 'service-gap', text: "You sent these two trains too close together, so the Station behind them has no train coming. Type the fix to hold the second one, or leave it at its signal for a moment." }` in its place. The `late` text becomes: "This train is late: its next platform has waited too long. Type the farther Station on its name to run it express."
  - `export function tipSubject(net: NetworkIndex, career: CareerState, id: DispatchTipId): { trains: number[]; stations: string[] } | null` in `dispatchTips.ts`. `service-gap`: the newest Service gap's rear train and its leader (from `pairedRears`), and its `place`. `late`: the first late train (by id) and its Station. Any other id, or a subject that no longer exists: `null`.
  - `DispatchOverlay` prop `spotlight?: ReadonlySet<number>`: trains in it render with `data-spotlight="true"`.

- [ ] **Step 1: Write the failing tests**

In `src/ui/dispatchTips.test.ts`, replace "sees Trains start bunching" with:

```ts
it('sees the first Service gap start, and not as a generic Incident', () => {
  const prev = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Dang Wangi')]);
  const next = withSim(prev, (sim) => { sim.incidents.push({ ...fault, id: 9, kind: 'service-gap', stations: [], train: 2 }); });
  expect(newDispatchTips(net, prev, next, none)).toEqual(['service-gap']);
});

it('tipSubject points at the Service gap pair and its place, or the late train, and null when gone', () => {
  // service-gap: { trains: [rear, leader], stations: [place] }; late: { trains: [id], stations: [its Station] };
  // after the subject train is removed: null; for 'expansion': null.
});
```

Update the "has the agreed copy" test for the new `service-gap` and `late` texts and the id order.

In `src/ui/Dispatcher.test.tsx`, replace `'bunching'` with `'service-gap'` in `ALL_TIPS`, and add:

```ts
it('a Service gap tip frames its pair and pulses both trains while it shows', () => {
  allowMotion();
  // A Career whose sim has a pair and a fresh service-gap Incident, tips seen except 'service-gap';
  // drive one tick so the tip queues.
  expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/too close together/);
  expect(mapProps().fitKey).toBe('tip:service-gap');
  expect(trainEl(REAR).getAttribute('data-spotlight')).toBe('true');
  expect(trainEl(LEADER).getAttribute('data-spotlight')).toBe('true');
  press('x'); // dismiss
  expect(mapProps().fitKey).not.toBe('tip:service-gap');
  expect(document.querySelector('[data-spotlight]')).toBeNull();
});

it('under reduced motion the pointing tip keeps the camera still, and the highlight still shows', () => {
  // matchMedia reduced (the file default): fitKey unchanged by the tip; data-spotlight still set.
});

it('a pointing tip whose train has gone shows without moving the camera', () => {
  // tipSubject null: the tip shows; fitKey unchanged; no data-spotlight.
});
```

Use the file's existing helpers (`careerWith`, `waiting`, `seenTips`, `mapProps`, `allowMotion`, `press`); add a `trainEl(id)` helper that finds the overlay's train group by its train id if none exists.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/dispatchTips.test.ts src/ui/Dispatcher.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `newDispatchTips`: hit `service-gap` when a new `'service-gap'` Incident appears; hit `incident` only for new Incidents of the three random kinds. Remove the bunching detection.
- Screen: while `tips[0]` has a non-null `tipSubject` and motion is allowed, `fitTo` is the subject's Stations plus the subject trains' Stations, and `fitKey` is `` `tip:${id}` ``; the overlay gets `spotlight` = the subject's trains (also under reduced motion). The lean-in for a typed fix keeps priority only when no tip shows.
- CSS: `[data-spotlight='true']` pulses (a ring or scale pulse, matching the existing train styling); under `prefers-reduced-motion: reduce` it is a steady highlight instead.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run && npx tsc --noEmit` — Expected: all pass.

- [ ] **Step 5: Check it in the browser** (`.claude/launch.json` config `dev`, port 5179; keep the browser pane visible, since a hidden pane throttles animation). Play until a Service gap appears, at 1440×900 and 1024×768, in both themes: the card reads "Service gap" with its own glyph; the first one's tip frames the pair and both trains pulse; typing "Hold at …" holds the rear train and its name disappears for a few seconds. If you cannot run a browser, say so in the report rather than claiming it.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/render
git commit -m "feat: the Service gap and late tips frame and pulse the trains they are about (F22)"
```

---

### Task 3: Balance, the hold experiment, and the docs

**Files:**
- Modify: `src/engine/dispatchProbe.test.ts` (report Service gaps per Shift)
- Modify: `src/engine/dispatchBalance.ts` (tuned `GAP_TRIGGER_MS`, `GAP_HOLD_MS`, if needed)
- Modify: `docs/superpowers/dispatcher-handover.md`, `docs/superpowers/dispatcher-playtest-2-feedback.md`

**Interfaces:**
- Consumes: Task 1's constants and Incident kind. The scripted typist (`dispatchDrive.testutil.ts`) already types any `fix` Target, urgent ones first; it needs no new habit unless the survey shows otherwise.

- [ ] **Step 1: Add a Service gaps per Shift column** to the probe's report, counted from new `'service-gap'` Incidents seen through `drive`'s `watch`.

- [ ] **Step 2: Run the survey**

Run: `DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts`
Expected: a table per typist (40, 60, 90 WPM, inattentive 60) with Career length, Shifts cleared and Service gaps per Shift.

- [ ] **Step 3: Tune to the spec's target** by adjusting `GAP_TRIGGER_MS` and `GAP_HOLD_MS` only: at 60 WPM about one Service gap every Shift or two; more at 90 WPM; Career lengths at 40 and 60 WPM within about 10 % of the handover's current survey table. If the probe's balance assertions fail because of Service gaps, update their bounds only to the measured, on-target values, and record before → after.

- [ ] **Step 4: Rerun the hold experiment** as a throwaway (do not commit it): copy `dispatchDrive.testutil.ts` into a scratch folder, add a `hold` option that skips the rear train of a pair (via `pairedRears`) until it has waited that many ms, and run 8 seeds at 60 and 90 WPM with hold 0, 4 s and 8 s for up to 15 minutes. Report median Career length, delivered per minute, on-time % and failed Careers. The spec's question: does holding now measurably pay for the 60 WPM typist? Report the answer either way; do not keep tuning to force one.

- [ ] **Step 5: Update the docs.** Handover: the new survey table and the hold experiment results, the tuned constants, and that `DISPATCH_EVIDENCE_VERSION` is 3. Tracker: F22 `done` with a "Done:" paragraph, including the hold experiment's answer.

- [ ] **Step 6: Run the suite**

Run: `npx vitest run && npx tsc --noEmit` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/dispatchProbe.test.ts src/engine/dispatchBalance.ts docs/superpowers
git commit -m "test: Service gap balance survey and hold experiment; constants tuned (F22)"
```
