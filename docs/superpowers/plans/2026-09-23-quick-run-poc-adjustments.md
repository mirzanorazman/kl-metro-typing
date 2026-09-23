# Quick Run POC Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved 30-second, multi-Line Quick Run adjustments, including replay-safe leg traces, live metrics, persistent typo feedback, closer camera framing, and phone-landscape play blocking.

**Architecture:** Keep Quick Run rules in the deep `src/engine/quickRun.ts` module. The engine owns eligible-leg enumeration, random live selection, trace construction, deadline precedence, and state transitions; replay supplies recorded legs instead of regenerating randomness. React screens only record input, render engine state, persist verified results, and enforce a shared phone-landscape policy. Extend the shared typing state for persistent error feedback so all Modes behave consistently.

**Tech Stack:** TypeScript, React 18, Vite, Vitest, Testing Library, CSS.

---

## Task 1: Establish the Quick Run leg model and 30-second initial-leg rules

**Files:**

- Modify: `CONTEXT.md`
- Modify: `src/engine/quickRun.ts`
- Modify: `src/engine/quickRun.test.ts`

- [x] **Step 1: Write failing engine tests for the new duration and minimum distance**

Add tests that assert `QUICK_RUN_MS === 30_000`, the first printable character sets a 30-second deadline, all prepared starts are at least four advances from `toward`, previous starts are excluded when another eligible choice exists, and an insufficient Line throws a specific unavailable error.

Use a deterministic helper in the test rather than asserting one fragile production-data Station:

```ts
function advancesToTerminus(net: NetworkIndex, leg: QuickLeg): number {
  const stations = net.lines.get(leg.line)!.stations;
  return Math.abs(stations.indexOf(leg.at) - stations.indexOf(leg.toward));
}
```

- [x] **Step 2: Run the focused test and confirm the red state**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: failures still show a 45-second deadline and starts fewer than four advances away.

- [x] **Step 3: Add the leg types and eligible-leg helpers**

In `src/engine/quickRun.ts`, add the public evidence vocabulary and constants:

```ts
export const QUICK_RUN_MS = 30_000;
export const QUICK_RUN_MIN_ADVANCES = 4;
export const QUICK_LEG_TRACE_VERSION = 1;

export interface QuickLeg {
  line: LineCode;
  at: string;
  toward: string;
}

export interface QuickLegTrace {
  version: 1;
  legs: QuickLeg[];
}
```

Add `eligibleQuickLegs(net, lineCode, toward?)`, `isEligibleQuickLeg(net, leg)`, and a clamped random picker. Change `prepareQuickRun` to choose only eligible initial legs and retain the previous-start fallback behavior. Store the active leg and a trace containing exactly that first leg in `QuickRunState`.

- [x] **Step 4: Update canonical domain language**

In `CONTEXT.md`, define Quick Run as a timed multi-Line Mode, define a leg and jump, reserve Route for Line Run, and describe `quickBest` as legacy plus `quickBestOverall` as the active record.

- [x] **Step 5: Run the focused test and confirm green**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: all initial-leg and timing tests pass.

- [x] **Step 6: Commit the engine foundation**

```bash
git add CONTEXT.md src/engine/quickRun.ts src/engine/quickRun.test.ts
git commit -m "feat: define quick run legs and 30 second starts"
```

## Task 2: Replace Terminus reversal with deterministic multi-Line jumps

**Files:**

- Modify: `src/engine/quickRun.ts`
- Modify: `src/engine/quickRun.test.ts`

- [x] **Step 1: Write failing selection and transition tests**

Cover these cases with a small synthetic multi-Line network:

```ts
it('jumps to a different line after completing a terminus', () => { /* ... */ });
it('prefers an unused line before reusing one', () => { /* ... */ });
it('prefers an untyped landing station on the chosen line', () => { /* ... */ });
it('weights eligible lines equally before choosing a leg', () => { /* ... */ });
it('appends only activated legs to the trace', () => { /* ... */ });
it('interrupts with a continuation error when no different line is eligible', () => { /* ... */ });
it('lets the deadline win over a terminus completion at the deadline', () => { /* ... */ });
```

- [x] **Step 2: Run the focused test and confirm reversal causes failures**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: reversal tests conflict with the new jump assertions.

- [x] **Step 3: Implement hierarchical jump selection in the engine**

Track `usedLines` from the trace and typed Stations from completed Station records. Implement the approved hierarchy exactly:

1. eligible Lines other than the current Line;
2. unused Lines if any;
3. equal random choice by Line;
4. eligible legs on that Line;
5. untyped landing Stations if any; and
6. random choice within the remaining legs.

Change `enterQuickCharacter` to accept the injected random function and use it only if a pre-deadline keystroke completes a Terminus. On a jump, update active Line/Direction/Station immediately, reset `arrivedFrom` to `null` so no false rail segment is drawn, append the leg to the trace, and increment a `jumpRevision` used only for presentation. Add a specific interruption reason to state when no continuation exists.

- [x] **Step 4: Keep non-Terminus advancement unchanged and remove reversal**

The just-completed Terminus must be appended to `completedStations` before the new leg is activated. A normal Station completion advances one position on the same Line. No transition reverses direction.

- [x] **Step 5: Run the engine tests**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: all Quick Run transition and selection tests pass.

- [x] **Step 6: Commit the jump engine**

```bash
git add src/engine/quickRun.ts src/engine/quickRun.test.ts
git commit -m "feat: jump between lines in quick run"
```

## Task 3: Make leg traces part of replayed evidence

**Files:**

- Modify: `src/engine/replay.ts`
- Modify: `src/engine/replay.test.ts`
- Modify: `src/engine/integrity.test.ts`
- Modify: `src/ui/useRunRecorder.ts`
- Test: `src/ui/useRunRecorder.test.ts`

- [x] **Step 1: Write failing replay tests for trace validation**

Change the public input to:

```ts
export interface QuickRunEvidence {
  keylog: KeyLog;
  trace: QuickLegTrace;
}

replayQuickRun(net, evidence)
```

Test a valid multi-Line replay plus invalid first leg, same-Line jump, too-short leg, missing leg, extra leg, and a leg outside the currently preferred unused-Line or untyped-Station tier.

- [x] **Step 2: Run replay tests and confirm the old signature fails**

Run: `npm test -- src/engine/replay.test.ts src/engine/integrity.test.ts`

Expected: compile/test failures until replay consumes evidence.

- [x] **Step 3: Add an explicit replay leg source without duplicating transitions**

Refactor the internal terminus continuation to accept a leg provider. Live play uses the random selector; replay uses the next trace entry. Both paths call the same validation and state-application function, ensuring scoring and deadline behavior cannot drift.

Replay must validate the active preference tier from replay state before applying each recorded leg, consume one entry per actual jump, and reject leftover entries after completion. It must never call `Math.random` or reproduce candidate ordering from a seed.

- [x] **Step 4: Snapshot Keylog and trace together**

Extend the recorder-facing API or compose evidence in `QuickRunScreen` so each completed attempt captures a fresh immutable Keylog plus the engine-owned `run.trace`. Ensure `Run again` resets both records.

- [x] **Step 5: Run replay and integrity tests**

Run: `npm test -- src/engine/replay.test.ts src/engine/integrity.test.ts src/ui/useRunRecorder.test.ts`

Expected: valid evidence reproduces Metrics and invalid traces return `null`; existing Verdict thresholds remain green.

- [x] **Step 6: Commit evidence replay**

```bash
git add src/engine/replay.ts src/engine/replay.test.ts src/engine/integrity.test.ts src/ui/useRunRecorder.ts src/ui/useRunRecorder.test.ts
git commit -m "feat: replay quick runs from leg traces"
```

## Task 4: Persist a mode-wide Quick Run personal best

**Files:**

- Modify: `src/engine/progress.ts`
- Modify: `src/engine/progress.test.ts`

- [x] **Step 1: Write failing migration and update tests**

Test that old profiles load with no mode-wide best, finite non-negative values survive, invalid values are discarded independently, and a higher score replaces the record while an equal/lower/invalid score preserves referential identity. Assert legacy `quickBest` remains stored and untouched.

- [x] **Step 2: Run the focused test and confirm red**

Run: `npm test -- src/engine/progress.test.ts`

- [x] **Step 3: Implement the additive profile field**

Add `quickBestOverall?: number`, sanitize it in `migrate`, and replace the Line-keyed writer used by new Runs with:

```ts
export function recordQuickBestOverall(profile: Profile, score: number): Profile {
  const current = profile.quickBestOverall ?? 0;
  if (!Number.isFinite(score) || score < 0 || score <= current) return profile;
  return { ...profile, quickBestOverall: score };
}
```

Keep `quickBest` and its sanitizer for backward-compatible reads, but do not update it from the new Mode.

- [x] **Step 4: Run focused tests and commit**

Run: `npm test -- src/engine/progress.test.ts`

```bash
git add src/engine/progress.ts src/engine/progress.test.ts
git commit -m "feat: add mode wide quick run best"
```

## Task 5: Add persistent wrong-key feedback that survives reduced motion

**Files:**

- Modify: `src/engine/typing.ts`
- Modify: `src/engine/typing.test.ts`
- Modify: `src/render/Prompt.tsx`
- Modify: `src/render/Prompt.test.tsx`
- Modify: `src/index.css`

- [x] **Step 1: Write failing state and rendering tests**

Add a `mistyped` boolean to `TypingState`. Test that a wrong printable key sets it, repeated wrong keys keep it set, the correct expected character clears it, and a newly begun prompt starts clear. Render tests must find a current character with `data-miskey="true"` and a visible `role="status"` containing `Wrong key` only while `mistyped` is true.

- [x] **Step 2: Run focused tests and confirm red**

Run: `npm test -- src/engine/typing.test.ts src/render/Prompt.test.tsx`

- [x] **Step 3: Implement persistent semantic feedback**

Set `mistyped: false` in `beginTyping`, set it true on wrong input, and false on the next correct input. Make Prompt use `state.mistyped` for persistent semantics while retaining `errorTick` only as the remount key that restarts the optional bounce.

Add non-animated error colour and a double underline to the base `[data-miskey='true']` rule. Keep transform animation in its own rule and under the existing reduced-motion override; do not hide the colour, underline, or status in reduced motion.

- [x] **Step 4: Run tests and commit**

Run: `npm test -- src/engine/typing.test.ts src/render/Prompt.test.tsx`

```bash
git add src/engine/typing.ts src/engine/typing.test.ts src/render/Prompt.tsx src/render/Prompt.test.tsx src/index.css
git commit -m "fix: keep wrong key feedback visible"
```

## Task 6: Render multi-Line Quick Run state, live metrics, closer framing, and summary

**Files:**

- Modify: `src/ui/QuickRunScreen.tsx`
- Modify: `src/ui/QuickRunScreen.test.tsx`
- Modify: `src/ui/QuickRunSummary.tsx`
- Modify: `src/ui/QuickRunSummary.test.tsx`
- Modify: `src/ui/mobile.css`

- [x] **Step 1: Write failing screen tests**

Cover `—` WPM/Accuracy before input, once-per-second displayed refresh, immediate Line/prompt changes at a jump, input accepted during map transition, persistent jump announcement until the first correct landing character, no unrelated `previousStation`, one-behind/two-ahead camera request, ordered Lines in Summary, mode-wide personal best, and fresh evidence on `Run again`.

- [x] **Step 2: Run the screen tests and confirm red**

Run: `npm test -- src/ui/QuickRunScreen.test.tsx src/ui/QuickRunSummary.test.tsx`

- [x] **Step 3: Wire the screen to current engine state and evidence**

Use `run.line` and the active leg for context, map emphasis, colour, fit extent, and Direction. Pass `randomRef.current` into live character entry. On normal completion, call `replayQuickRun(net, { keylog: recorder.snapshot(), trace: run.trace })`, apply the existing Verdict, and write only `quickBestOverall`.

Derive ordered Lines from `run.trace.legs.map(leg => leg.line)` and pass them to Summary. Keep Station progress persistence idempotent across jumps.

- [x] **Step 4: Add independent one-second metric display cadence**

Keep the existing 100 ms deadline tick. Add separate displayed metrics state: `—` until the run starts, then sample `quickRunMetrics(runRef.current, performance.now())` once per second. Do not use the one-second display state to decide completion.

- [x] **Step 5: Add jump presentation and closer camera**

Use `followPoints(linePositions, currentIndex, { behind: 1, ahead: 2 })`. Key the map reframe by active Line plus `jumpRevision`, set `previousStation={null}` immediately after a jump, and apply a maximum 250 ms fade class. Under reduced motion, disable only the fade. Keep the visible `Jumped to CODE · Station` status until the first correct character advances the landing prompt.

- [x] **Step 6: Update Summary**

Change its context from a single starting Line to `30 seconds` plus ordered Line codes. Preserve completed Stations, WPM, Accuracy, Score, interruption labeling, and Run-again controls.

- [x] **Step 7: Run focused tests and commit**

Run: `npm test -- src/ui/QuickRunScreen.test.tsx src/ui/QuickRunSummary.test.tsx`

```bash
git add src/ui/QuickRunScreen.tsx src/ui/QuickRunScreen.test.tsx src/ui/QuickRunSummary.tsx src/ui/QuickRunSummary.test.tsx src/ui/mobile.css
git commit -m "feat: present multi line quick runs"
```

## Task 7: Block Run play on phone landscape without blocking tablets

**Files:**

- Create: `src/ui/usePhoneLandscape.ts`
- Create: `src/ui/usePhoneLandscape.test.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx`
- Modify: `src/ui/MobileTransit.tsx`
- Modify: `src/ui/MobileTransit.test.tsx`
- Modify: `src/ui/MobileAdventureSetup.tsx`
- Modify: `src/ui/MobileAdventureSetup.test.tsx`
- Modify: `src/ui/QuickRunScreen.tsx`
- Modify: `src/ui/QuickRunScreen.test.tsx`
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/LineRunScreen.test.tsx`
- Modify: `src/ui/AdventureScreen.tsx`
- Modify: `src/ui/AdventureScreen.test.tsx`
- Modify: `src/ui/mobile.css`

- [x] **Step 1: Test the shared phone-landscape predicate**

Implement a small hook that observes resize/orientation changes and returns true only when both conditions hold: the existing phone presentation is active and `window.innerWidth > window.innerHeight`. Test phone portrait, phone landscape, desktop landscape, and a transition event.

- [x] **Step 2: Test disabled starts and interruption semantics**

In App/Mobile tests assert Run actions are disabled with `Rotate to portrait to play` while other navigation remains available. In screen tests assert a ready Quick Run cancels without Summary, a running Quick Run interrupts and reveals its Summary on return to portrait, and active Line Run/Adventure also end or interrupt consistently. Assert desktop/tablet presentation is not blocked by landscape alone.

- [x] **Step 3: Run the focused tests and confirm red**

Run: `npm test -- src/ui/usePhoneLandscape.test.ts src/ui/App.test.tsx src/ui/MobileTransit.test.tsx src/ui/MobileAdventureSetup.test.tsx src/ui/QuickRunScreen.test.tsx src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.test.tsx`

- [x] **Step 4: Centralize the policy in App and pass explicit state**

Compute `phoneLandscape` once in `App`. Pass it to mobile setup components to disable start actions and to active Run screens to react to rotation. Do not infer tablet behavior from `orientation`; the existing `phone` presentation decision is the first gate.

For Quick Run, ready rotation calls `onBack`; running rotation calls `interruptQuickRun`, hides the active play UI while landscape persists, and reveals the interrupted Summary in portrait. For Line Run and Adventure, use their existing safe end/exit mechanics and never leave hidden input focused.

- [x] **Step 5: Add the blocking message and styling**

Use one reusable inline/overlay presentation with the exact instruction `Rotate to portrait to play`. It must not prevent Transit, Adventure setup, Ranking, theme, or other browsing actions.

- [x] **Step 6: Run focused tests and commit**

Run: `npm test -- src/ui/usePhoneLandscape.test.ts src/ui/App.test.tsx src/ui/MobileTransit.test.tsx src/ui/MobileAdventureSetup.test.tsx src/ui/QuickRunScreen.test.tsx src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.test.tsx`

```bash
git add src/ui/usePhoneLandscape.ts src/ui/usePhoneLandscape.test.ts src/ui/App.tsx src/ui/App.test.tsx src/ui/MobileTransit.tsx src/ui/MobileTransit.test.tsx src/ui/MobileAdventureSetup.tsx src/ui/MobileAdventureSetup.test.tsx src/ui/QuickRunScreen.tsx src/ui/QuickRunScreen.test.tsx src/ui/LineRunScreen.tsx src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.tsx src/ui/AdventureScreen.test.tsx src/ui/mobile.css
git commit -m "feat: block phone landscape play"
```

## Task 8: Update all 30-second labels and finish verification

**Files:**

- Modify: `src/ui/DirectionChooser.tsx`
- Modify: `src/ui/DirectionChooser.test.tsx`
- Modify: `src/ui/MobileTransit.tsx`
- Modify: `src/ui/MobileTransit.test.tsx`
- Modify: `src/ui/HomeMap.test.tsx`
- Modify: `src/ui/App.test.tsx`
- Modify: `docs/STATUS.md`
- Modify: `docs/superpowers/specs/2026-09-23-quick-run-poc-adjustments-design.md`

- [ ] **Step 1: Change all player-facing duration labels**

Replace `45s Quick Run` and `Start 45s Quick Run` with their 30-second equivalents. Update accessible labels and assertions together.

- [ ] **Step 2: Update implementation status documentation**

Record the shipped 30-second multi-Line behavior, leg-trace integrity, mode-wide best, live metrics, error feedback, camera framing, and phone-landscape policy in `docs/STATUS.md`. Change the design spec status to `Implemented` only after verification succeeds.

- [ ] **Step 3: Scan for stale product text**

Run: `rg -n "45s Quick Run|Start 45s|45-second|45 seconds|per-line Quick|per line Quick" src CONTEXT.md docs/STATUS.md docs/superpowers/specs/2026-09-23-quick-run-poc-adjustments-design.md`

Expected: no stale active-product claims; historical comparison text in the design spec may remain.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: all tests pass with no unhandled React warnings.

- [ ] **Step 5: Run the production build and diff checks**

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Perform browser verification at representative viewports**

Verify a desktop viewport, phone portrait, and phone landscape. Exercise one Quick Run through a jump; confirm prompt/context update immediately, no false path is drawn, WPM/Accuracy update once per second, the error state survives reduced motion, and returning to portrait after rotation shows an interrupted Summary. Record iPad Mini landscape as a separate compatibility follow-up, not a release blocker.

- [ ] **Step 7: Commit final integration and docs**

```bash
git add src/ui/DirectionChooser.tsx src/ui/DirectionChooser.test.tsx src/ui/MobileTransit.tsx src/ui/MobileTransit.test.tsx src/ui/HomeMap.test.tsx src/ui/App.test.tsx docs/STATUS.md docs/superpowers/specs/2026-09-23-quick-run-poc-adjustments-design.md
git commit -m "docs: mark quick run adjustments implemented"
```

## Final review checklist

- [ ] Every approved design decision has an automated test or an explicit manual compatibility gate.
- [ ] Quick Run selection and replay share validation instead of maintaining parallel rule implementations.
- [ ] The UI never chooses a Line, Direction, or landing Station.
- [ ] Randomness is injected for live tests and absent from replay.
- [ ] Legacy `quickBest` data remains readable but is neither displayed nor mutated by new Runs.
- [ ] Reduced motion removes motion only, not information.
- [ ] Landscape blocking depends on phone presentation plus aspect ratio, so an iPad is not rejected solely for being landscape.
- [ ] No placeholder comments, skipped tests, `any` casts, or debug logging remain.
