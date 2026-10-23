# Dispatcher Playtest 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the user's first Dispatcher playtest feedback:
- fixes: a confirmed End Career, the mistyped-space bug, music that calms down again, a chime only with something visible;
- signal marks;
- passenger moments, including crowd-surge dispersal;
- the Green wave combo;
- an Incident lean-in;
- morning trains entering from outside;
- a readable full-size map;
- balance for the user's 90 s Shift.

**Architecture:** Game rules change in the pure engine (`src/engine/dispatch*.ts`), so replay stays exact: the combo streak and waves, surge dispersal, call records, and train entry. The UI reads that state: signal marks, the ripple, pops, the lean-in, and map readability in `DispatchOverlay`/`MapCanvas`. The fixes come first and ship on their own. The final balance pass comes last, because the combo and the new train entry both change balance.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Vitest 1 + Testing Library (jsdom), Tone.js. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-dispatcher-playtest-1-design.md`, which amends `docs/superpowers/specs/2026-10-23-dispatcher-design.md`. Read the amendment in full before Task 1. Background on what exists: `docs/superpowers/dispatcher-handover.md`.

## Global Constraints

- Branch `feat/dispatcher`. Commit after every task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `src/engine/*` stays pure: no React, timers, storage or `Math.random`. A Career must still replay exactly from its Keylog plus action log. Every engine change gets a test that a driven Career replays equal (`replayDispatch` in `src/engine/replay.ts`, typist in `src/engine/dispatchDrive.testutil.ts`).
- All tuning numbers live in `src/engine/dispatchBalance.ts`.
- **The user's `SHIFT_PHASES` stay exactly:** Morning peak 35_000 / 1.6 / inbound / 1, Midday 20_000 / 0.7 / none / 0.6, Evening peak 35_000 / 1.6 / outbound / 1.
- Colour is never the only signal: every new mark has a shape or text. Line codes stay as text.
- Copy uses Career, Shift, Signal, Clear, Held, Incident, Out of service, Expansion, Era. Never "fire", "issue", "prompt" or "gate".
- Every new animation has a `prefers-reduced-motion` behaviour stated in the spec (static or simultaneous), handled in CSS where possible.
- Desktop and tablet only. Rush Hour untouched.

## Review Focus

1. **Waves and replay:** a Career where Green waves fire must replay equal, including waves set off by Skip-stops and Incident fixes. Test in Task 5.
2. **A wave crossing its bounds:** a wave must never clear a train on another Line, a train Held by an Incident, or a train approaching an Out-of-service Station. A deliberately held train on another Line must survive. Test in Task 5.
3. **Nothing to type at ready:** every Shift's `'ready'` state, including after an Expansion and on a Line with one outer end, must show at least one typeable Signal. Test in Task 4.
4. **End Career answered by a key:** Enter or Space must never answer the confirmation, the Career keeps running while it shows, and the same holds on the Expansion screen. Test in Task 2.
5. **Surge dispersal arithmetic:** dispersal never makes a count negative, never touches Delivered or Stranded, and copes when the platform holds fewer passengers than the surge's extras. Test in Task 6.

---

### Task 1: Adopt the 90-second Shift

The user's uncommitted `SHIFT_PHASES` edit currently fails 8 balance-coupled tests: the scripted typist never loses, because the failure clocks were sized for the 210 s Shift. This task makes the suite green again with a provisional rescale. Task 11 does the real tuning.

**Files:**
- Modify: `src/engine/dispatchBalance.ts`. Keep the uncommitted `SHIFT_PHASES` exactly. Rescale `OOS_CROWD_MS`, `INCIDENT_LIMIT_MS` and `INCIDENT_FIRST_MS`, starting from ×90/210 of their current values (45_000, 35_000, 10_000).
- Modify only if still needed: the balance-coupled tests in `src/engine/dispatchReplay.test.ts`, `src/engine/dispatchProbe.test.ts` and `src/ui/Dispatcher.test.tsx`. Only seeds or limits may change, and each test's intent must hold: a genuinely failed, replayable Career; a replayed confirm; speed is rewarded.

**Interfaces:** Produces only constant values.

- [ ] **Step 1: Run the failing tests.** Run `npx vitest run src/engine/dispatchReplay.test.ts src/engine/dispatchProbe.test.ts src/ui/Dispatcher.test.tsx`. Expected: the 8 failures from the user's change.
- [ ] **Step 2: Rescale the three failure clocks.** Re-run the command above until it passes. Prefer changing constants over changing tests. If a test must change, write why in the commit body.
- [ ] **Step 3: Run `npm test` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 4: Record a provisional survey.** Run `DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts` and paste the table into the commit body.
- [ ] **Step 5: Commit** `feat: adopt the 90-second Dispatcher Shift`. This commit includes the user's `SHIFT_PHASES`.

---

### Task 2: End Career asks first

**Files:**
- Create: `src/ui/ConfirmEndButton.tsx`
- Modify: `src/ui/DispatcherScreen.tsx`. Replace both `End Career` buttons: the one in the Shift panel and the one beside `DispatchExpansion`.
- Modify: `src/ui/dispatch.css`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const END_CONFIRM_MS = 4_000; // a UI timing, so it lives in the component, not dispatchBalance
  export function ConfirmEndButton(p: { onConfirm: () => void; disabled?: boolean }): JSX.Element;
  ```
  The idle state is a button labelled "End Career". Clicking it shows the text "End Career?" with the buttons "Yes, end it" and "Keep playing". It reverts after `END_CONFIRM_MS`, or on Keep playing. Only "Yes, end it" calls `onConfirm`.

- [ ] **Step 1: Write the failing tests** in `src/ui/Dispatcher.test.tsx`:
  - `one click on End Career doesn't end the Career`: after one click, the Career is still running and "Yes, end it" is shown.
  - `Yes, end it ends it`: the abandoned summary appears.
  - `the question goes away by itself`: with fake timers, advancing `END_CONFIRM_MS` brings back "End Career", and the Career is still running.
  - `Enter and Space never answer it` (Review Focus 4): focus "Yes, end it", then `fireEvent.keyDown` Enter and Space. Assert `defaultPrevented` is true and the Career is not ended.
  - `the Expansion screen asks too`: with `initial` in `'between'`, one click doesn't end it, and Yes does.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/ui/Dispatcher.test.tsx`.
- [ ] **Step 3: Implement `ConfirmEndButton`** and use it in both places. Every button involved stays inside the existing button shield.
- [ ] **Step 4: Run them and confirm they pass.** Then run `npm test`.
- [ ] **Step 5: Commit** `fix: End Career asks before ending a Dispatcher Career`.

---

### Task 3: Mistyped space, calm music, no stray chime

**Files:**
- Modify: `src/render/Prompt.tsx` and/or `src/index.css`. The cause is the `.prompt-miskey-anchor` wrapper (`display: inline-block`, `src/index.css:80`), inside which a lone space collapses.
- Modify: `src/engine/dispatch.ts`. Replace `dispatchOvercrowded` with `dispatchTense`.
- Modify: `src/ui/DispatcherScreen.tsx`. Use `dispatchTense` for the music, and delete the standalone `sound.delivered()` call in the sounds effect. Task 8 brings the chime back alongside a visible pop.
- Test: `src/render/Prompt.test.tsx`, `src/engine/dispatch.test.ts`, `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Produces, in `dispatch.ts`:
  ```ts
  export function dispatchTense(s: CareerState): boolean;
  // true while any Incident is active, or any platform's crowd > PLATFORM_CAPACITY / 2
  ```
  `dispatchOvercrowded` is removed, and its callers and tests are updated.

- [ ] **Step 1: Write the failing tests.**
  - `Prompt`: a mistyped space keeps its width. Render target "Crowd control at Damai" with cursor 13 (the space) and `mistyped: true`. The current character element has the text " " and a computed or inline `white-space` of `pre` or `pre-wrap` (jsdom can't measure width, so assert the style that guarantees it). The "Wrong key" status is present.
  - `dispatchTense`:
    - false with only an Out-of-service Station and calm platforms;
    - true with an active Incident;
    - true with a platform over half capacity.
  - Screen:
    - the music returns to `rushCalm` after a missed Incident leaves a Station Out of service and no Incident remains (spy on `music.play`);
    - `sound.delivered` is never called while passengers are delivered with no pop (spy).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** For the space, give the prompt's character spans `white-space: pre`, or render the mistyped space as a non-breaking space while keeping its `data-space` styling. Check that Line Run and Quick Run still render a wrong space correctly; they share `Prompt`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `fix: mistyped spaces stay visible; Dispatcher music calms after an Incident`.

---

### Task 4: Morning trains enter from outside

**Files:**
- Modify: `src/engine/dispatchSim.ts`: `startShiftSim`, and the reinforcement loop in `stepSim` (it currently adds trains at `range.from`/`range.to` whenever the fleet is short).
- Modify: `src/engine/dispatchBalance.ts` only if a new constant is needed.
- Test: `src/engine/dispatchSim.test.ts`. Replace the old "evenly spread" placement test.

**Interfaces:**
- Produces, in `dispatchSim.ts`:
  ```ts
  export type RangeEnd = 'from' | 'to';
  /** Both ends if the range strictly contains a CENTRAL_STATIONS Station; otherwise the end further from masjid-jamek by straight-line distance between the stations' `geo` (lat/lng in stations.json). */
  export function outerEnds(net: NetworkIndex, range: ServedRange): RangeEnd[];
  ```
  This uses the Station data's own `geo` coordinates, so the engine imports nothing from `geo/` and `startShiftSim`'s signature does not change. The spec says "layout distance"; geographic distance gives the same answer for this purpose.

- [ ] **Step 1: Write the failing tests:**
  - `outerEnds`:
    - for the starting network, KJ 4–17 (passes through KLCC and Masjid Jamek), it is `['from', 'to']`;
    - for a range with no central Station, it is the single end further from Masjid Jamek;
    - for the whole AG Line, it is both ends.
  - `a Shift opens with a train waiting one block in from each outer end, heading inward` (Review Focus 3):
    - `startShiftSim` on `STARTING_NETWORK` has exactly 2 trains, both `stage === 'signal'`;
    - one at `from + 1` with `dir 1`, the other at `to − 1` with `dir −1`;
    - `visibleTargets` is non-empty.
  - `the rest of the fleet enters at outer ends, spaced by headway`:
    - run with Morning trainFactor 1 until the fleet reaches `trainsForLine(range, 1)`;
    - every added train first appears at an outer end heading inward;
    - two entries at the same end are at least `targetHeadwayMs(range) / outerEnds.length` apart.
  - `after an Expansion the next Shift's ready still has a typeable Signal`: drive a Career to `'between'`, apply `expand`, and check `visibleTargets` is non-empty.
  - `block exclusivity still holds`: the existing shared-track tests still pass, plus one on AG+SP served together.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/engine/dispatchSim.test.ts`.
- [ ] **Step 3: Implement.**
  - At shift start, place one waiting train per outer end.
  - Reinforcement adds the remaining trains only at outer ends, heading inward, with the spacing above. Keep the existing reinforcement safety checks.
  - For phases with a lower `trainFactor`, surplus trains leave as before.
- [ ] **Step 4: Run `npm test`.** Some balance-coupled tests may shift. Adjust their seeds or limits only, keep their intent, and note it in the commit body.
- [ ] **Step 5: Commit** `feat: Dispatcher morning trains enter from the outer ends`.

---

### Task 5: Green wave combo, engine

**Files:**
- Modify: `src/engine/dispatchBalance.ts`: `COMBO_EVERY = 3`, `COMBO_MAX_WAVE = 4`.
- Modify: `src/engine/dispatch.ts`: `CareerState`, `startCareer`, `cloneCareer`, `applyTargetKey`, plus a new wave function.
- Test: `src/engine/dispatch.test.ts`, `src/engine/dispatchReplay.test.ts`

**Interfaces:**
- Produces, in `dispatch.ts`:
  ```ts
  export interface Wave {
    id: number;          // 1, 2, 3… within the Career
    line: LineCode;
    origin: string;      // Station id the ripple starts from: the triggering train's Station, or the Incident's place
    cleared: number[];   // train ids, in the order cleared (nearest first)
    atMs: number;        // career gameMs when it fired
  }
  // CareerState gains:
  streak: number;        // clean completions in a row; carries across Shifts
  clean: boolean;        // false once a counted wrong key lands; reset to true after any completion or unlock
  waves: number;         // waves fired so far
  lastWave: Wave | null;
  ```
- The rules, from spec B3:
  - **Streak:** a counted wrong key sets `streak = 0` and `clean = false`.
  - **What counts as a completion:**
    - a Signal Clear;
    - a Skip-stop;
    - the **final** item of an Incident fix (intermediate items don't count; one fix is one completion).
  - **On a completion:** if `clean`, the streak goes up by 1, then `clean = true`. Enter-to-confirm and keys dropped by the wrong-key stall are never counted errors. `unlock` sets `clean = true` and leaves the streak alone.
  - **When a wave fires:** when `streak % COMBO_EVERY === 0` after an increment.
  - **Wave size:** `min(streak / COMBO_EVERY, COMBO_MAX_WAVE)`.
  - **Which Signals it clears:**
    - Candidates are the trains with a visible `signal` Target (`visibleTargets(net, sim)` with `ref.kind === 'signal'`) whose `line` equals the triggering Line. The triggering Line is the cleared or skipped train's Line, or the Incident's `line` for a fix.
    - Sort them by `|train.at − originIndex|`, the Line index distance from the origin, with ties going to the lower train id.
    - Clear the first `size` of them with `clearSignal`.
    - Skip-stop Targets and fix Targets are never cleared. Trains on other Lines are never touched.
  - **Recording:** set `lastWave` even when fewer Signals than `size` are cleared, including 0, and add 1 to `waves`.

- [ ] **Step 1: Write the failing tests:**
  - `a clean third completion fires a wave of one`: drive three clean Clears on KJ with at least 2 KJ trains waiting. `lastWave.cleared` has length 1, holds the KJ train nearest the third Clear's Station, and `streak === 3`.
  - `waves grow with the streak and cap at 4`: build streak values 3, 6, 9, 12 and 15. The `cleared` lengths are 1, 2, 3, 4 and 4, when enough Signals wait. Set up the state directly with a test helper if typing it is impractical.
  - `a wrong key resets the streak`: after a counted error, `streak === 0`, and the next completion leaves it at 0 because that Target wasn't clean.
  - `Enter-confirm, stall-dropped keys and unlock don't reset it`.
  - `an Incident fix counts once, on its final item`.
  - `a wave never crosses its bounds` (Review Focus 2). Set up a KJ completion that fires a wave while waiting trains include:
    - an AG train (left alone, standing in for a deliberately held train on another Line);
    - a KJ train Held by a signal fault (left alone);
    - a KJ train approaching an Out-of-service Station (left alone).

    Only plain KJ Signals are cleared.
  - `a wave on a Line with fewer waiting Signals clears what there is`, and nothing carries over.
  - `the streak carries across Shifts`.
  - `waves replay` (Review Focus 1), in `dispatchReplay.test.ts`: use `drive({ ..., accuracy: 0.99 })`. The test asserts `state.waves > 0`, and `replayDispatch` is complete and equal on delivered, cleared, score and waves.
- This task adds `accuracy?: number` to `DriveOptions` in `src/engine/dispatchDrive.testutil.ts`. It means a seeded, deterministic error rate of `1 − accuracy`. When omitted, keep today's every-23rd-key typo so existing tests are unchanged. Task 11 adds wave aiming and the inattentive variant on top.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** inside `applyTargetKey`, after `completeTarget`. Keep it deterministic, with no rng.
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** `feat: Dispatcher Green wave combo`.

---

### Task 6: Passenger moments and surge dispersal, engine

**Files:**
- Modify: `src/engine/dispatchSim.ts`: `Train`, `Incident`, `SimState`, `spawnPassengers`, `exchangePassengers`, `cloneSim`
- Modify: `src/engine/dispatchIncidents.ts`: `advanceFix`
- Test: `src/engine/dispatchSim.test.ts`, `src/engine/dispatchIncidents.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Exchange { station: string; boarded: number; alighted: number; delivered: number; atMs: number }
  // Train gains:     lastExchange: Exchange | null   (set by every call: exchangePassengers)
  // Incident gains:  extra: number                    (crowd-surge only: fractional count of surge-extra arrivals at place; 0 otherwise)
  export interface Dispersal { station: string; count: number; incident: number; atMs: number }
  // SimState gains:  dispersed: number; lastDispersal: Dispersal | null
  ```
- **Surge extras:** while a crowd surge is active at a Station, each tick adds `spawned × (CROWD_SURGE_MULTIPLIER − 1) / CROWD_SURGE_MULTIPLIER` to its `extra`, where `spawned` is the Passengers spawned there that tick. This uses no rng, so the spawn stream is unchanged.
- **Dispersal:** when `advanceFix` completes the final item of a crowd surge, `count = min(floor(extra), crowdAt(place))` passengers leave that platform. They are taken from destinations in ascending id order, reducing counts deterministically. Then `dispersed += count` and `lastDispersal` is set.
- **Delivered and Stranded are untouched.**
- **`Exchange.delivered`** is the alighted passengers whose destination was this Station. `alighted` also counts transferring passengers.

- [ ] **Step 1: Write the failing tests:**
  - `every call records its exchange`: after a Clear's dwell, the train's `lastExchange` has the right `station`, `boarded` equals the change in load, and `delivered` equals the change in `sim.delivered`.
  - `a surge's extras accumulate`: over 10 s of an active surge, `extra` is within 1 of `0.75 ×` the spawns at that place.
  - `fixing a surge disperses its extras` (Review Focus 5):
    - the platform crowd drops by `min(floor(extra), crowd)`;
    - `dispersed` and `lastDispersal` are set;
    - `delivered` and `stranded` are unchanged;
    - no waiting count is negative.
  - `dispersal when most extras already boarded`: with a crowd smaller than `extra`, it disperses exactly the crowd and leaves 0.
  - `exposing exchanges changes nothing else`: two sims from one seed, compared with and without reading the new fields, have identical `delivered`, `stranded` and `calls` after 60 s.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Update `cloneSim` for the new fields.
- [ ] **Step 4: Run `npm test`.**
- [ ] **Step 5: Commit** `feat: Dispatcher exchanges and crowd-surge dispersal`.

---

### Task 7: Signal marks and the Green wave ripple, UI

**Files:**
- Modify: `src/render/DispatchOverlay.tsx`, `src/ui/DispatcherScreen.tsx` (`TypingLine`), `src/ui/dispatch.css`, `src/ui/dispatchTips.ts` (start tip copy)
- Test: `src/ui/Dispatcher.test.tsx`, `src/ui/dispatchTips.test.ts`

**Interfaces:** Consumes Task 5's `streak`, `waves` and `lastWave`, plus `visibleTargets`.

- [ ] **Step 1: Write the failing tests:**
  - **Signal mark on a waiting train:** every train with a visible signal Target has a `data-testid="signal-mark"` at its faced Station. The mark has a post shape (a `path`) and a lamp with `data-lamp="red"`.
  - **Signal mark on a Clear:** the mark switches to `data-lamp="green"`, then is removed after its fade. Use fake timers; the fade is about 500 ms.
  - **The ripple:**
    - after a wave, the overlay renders `data-testid="wave-pulse"` on the wave's Line;
    - each cleared train's mark turns green in `lastWave.cleared` order, about 150 ms apart (assert the order with fake timers, or with per-mark `animation-delay`/`data-order` attributes).
  - **Reduced motion:** with `matchMedia('(prefers-reduced-motion: reduce)')` true, there is no `wave-pulse`, and every mark turns green at once.
  - **Streak count:** the typing line shows the streak as `data-testid="streak"` with the text "Streak 2". On a wave it carries `data-wave="true"` for its flash.
  - **Start tip:** the new start tip text mentions the red signal marks, and the banned-words test still passes.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Marks are drawn at the faced Station's layout point, offset towards the train's approach side, sized with `markScale`.
  - The ripple is a stroke along the Line's polyline from `origin` outward, using the existing layout points. It must replay visually only from `lastWave`, not keep its own timers in engine state.
- [ ] **Step 4: Run `npm test`.**
- [ ] **Step 5: Browser check.** Run `npm run dev`, play until a wave fires, and record what you saw in the commit body. Say plainly if you couldn't check.
- [ ] **Step 6: Commit** `feat: Dispatcher signal marks and Green wave ripple`.

---

### Task 8: Passenger moments, UI

**Files:**
- Modify: `src/render/DispatchOverlay.tsx`, `src/ui/DispatchIncidents.tsx`, `src/ui/DispatchExpansion.tsx`, `src/ui/DispatcherScreen.tsx` (sounds effect), `src/ui/dispatch.css`
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:** Consumes Task 6's `lastExchange`, `lastDispersal` and `dispersed`, plus the Shift's `delivered` (`career.history` for the cleared Shift).

- [ ] **Step 1: Write the failing tests:**
  - **Exchange pop:** after a train the player cleared calls, a pop `data-testid="exchange-pop"` shows "+N boarded", plus "−M off" when `alighted > 0`. It fades after about 1 s.
  - **Chime:** `sound.delivered` plays only when such a pop shows with `delivered > 0` (spy).
  - **Pops at peak:** when several land in the same frame, the player's own Clear's pop is always present. Merging or dropping the others is the builder's choice, but at most 4 pops show at once.
  - **Crowd surge card:** the Incident card shows the waiting count at the place.
  - **Surge fixed:**
    - fixing the surge shows `data-testid="dispersal"` at the place, with the count dropping and a burst of person glyphs (`data-testid="person"`, several), about 1 s;
    - under reduced motion, it shows a static count and no burst.
  - **Shift cleared:** in `'between'`, before the offers, the Expansion screen shows "N passengers moved this Shift" and the Shift's on-time %.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Pops key off `lastExchange.atMs`/`lastDispersal.atMs`, so a new event replaces the old one. The player's own Clear is the train whose Signal the player's last completion cleared; the UI already knows the completed ref.
- [ ] **Step 4: Run `npm test`.**
- [ ] **Step 5: Commit** `feat: Dispatcher passenger moments`.

---

### Task 9: Lean in while typing an Incident's fix

**Files:**
- Modify: `src/ui/DispatcherScreen.tsx` (map framing props), `src/render/DispatchOverlay.tsx` (place glow), `src/ui/dispatch.css` (edge pulse)
- Modify `src/render/MapCanvas.tsx` only if its existing `fitTo`/`fitKey` transition can't ease. It reframes when `fitKey` changes; check whether that is animated.
- Test: `src/ui/Dispatcher.test.tsx`

**Interfaces:** No new exports needed. When `career.aim.lock?.kind === 'fix'`:
- `fitTo` = the Incident place's point + every Station with a visible signal Target + the place's neighbours on its Line;
- `fitKey` = `fix:${incident id}`.

Otherwise both are the normal whole-network frame. The frame must always include every waiting train.

- [ ] **Step 1: Write the failing tests:**
  - **While locked onto a fix:**
    - the screen root has `data-urgent="true"`;
    - the place has `data-testid="incident-glow"`;
    - `MapCanvas` gets a `fitKey` starting with `fix:`;
    - the `fitTo` points include every waiting train's Station (spy on `MapCanvas` props via `vi.mock` pass-through, as Task 10 of the earlier plan did for `judgeCareer`).
  - **After the fix completes or Backspace lets go:** `data-urgent` is gone, and the normal `fitKey` is back.
  - **Reduced motion:** a static edge and static glow; the CSS rule exists under the media query. Assert the class or attribute; jsdom can't run CSS animation.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** The camera eases if `MapCanvas` already animates refits; if it snaps, add easing within `MapCanvas` without changing other screens' behaviour (default unchanged).
- [ ] **Step 4: Run `npm test`.**
- [ ] **Step 5: Commit** `feat: Dispatcher leans in on an Incident fix`.

---

### Task 10: A readable map at full size

Spec B6. This is an experiment with a finish line: try the approaches in order and stop when acceptance is met.

**Files:**
- Create: `src/render/dispatchReadability.ts`, pure measurement helpers
- Modify: `src/render/MapCanvas.tsx` (minimum sizes, parallel shared track), `src/render/DispatchOverlay.tsx` (`layoutChips`, label filtering), `src/ui/DispatcherScreen.tsx` (`labelled` set)
- Modify: `src/ui/App.tsx`, dev-only. Under `import.meta.env.DEV`, the query `?dispatch=full` opens a Dispatcher Career whose `initial` has every Line fully served, for the browser check. It's stripped from production by Vite.
- Test: `src/render/dispatchReadability.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ReadabilityReport { chipOverlaps: number; minMarkPx: number; stackedSharedSegments: number }
  export function measureReadability(net: NetworkIndex, career: CareerState, viewport: { w: number; h: number }): ReadabilityReport;
  ```
  It uses the same pure layout code the overlay renders with: `layoutChips`, `markScale` and the label placement. Extract them so the measure and the render can't drift apart.

- [ ] **Step 1: Write the failing acceptance test.** Build a full-network Career with a busy peak state: run the sim with `trainFactor` 1 for 60 s with nothing cleared, so many Signals wait. At 1440×900 and 1024×768, `measureReadability` must give:
  - `chipOverlaps === 0`;
  - `minMarkPx >= 6`;
  - `stackedSharedSegments === 0`.

  It should fail today.
- [ ] **Step 2: Spike.** On a throwaway branch or a scratch commit you will drop, render `?dispatch=full` in the browser at both sizes with approaches 1–3 from the spec:
  1. minimum on-screen sizes;
  2. label only what matters;
  3. parallel shared track.

  Take screenshots, and note in the report what each approach fixed.
- [ ] **Step 3: Implement the approaches in order,** re-running the test after each:
  1. min sizes (`markScale` gets a floor in screen pixels);
  2. label only what matters (`labelled` = Stations with a waiting train, Incident or signal mark, plus interchanges and range ends);
  3. parallel shared track (offset consecutive shared segments, e.g. AG/SP Sentul Timur–Chan Sow Lin);
  4. chip placement with leader lines using `render/labels.ts`.

  Stop as soon as the test passes.
- [ ] **Step 4: Stop gate.** If the test still fails after approach 4, do not invent a fifth approach. Commit what helped. Mark the acceptance test `it.todo`-style with the measured numbers in its title. Report BLOCKED-for-user with the screenshots and numbers. The spec makes a deeper fix the user's decision.
- [ ] **Step 5: Run `npm test`, and check the other screens are unchanged.** The existing `MapCanvas` tests must pass, and the new behaviour must sit behind props that default off.
- [ ] **Step 6: Commit** `feat: Dispatcher map stays readable at full size`.

---

### Task 11: Realistic typists, final balance and handover

**Files:**
- Modify: `src/engine/dispatchDrive.testutil.ts`. Add `inattentive?: boolean` to `DriveOptions`, plus wave aiming. `accuracy` already exists from Task 5.
- Modify: `src/engine/dispatchProbe.test.ts`. Use the new typists and report per typist.
- Modify: `src/engine/dispatchBalance.ts`. Any constant except `SHIFT_PHASES`, `COMBO_EVERY` and `COMBO_MAX_WAVE` (which are the user's rules).
- Modify: `docs/superpowers/dispatcher-handover.md`, `docs/STATUS.md`

**Interfaces:**
- Produces: `inattentive?: boolean` in `DriveOptions`.
- **Typist behaviour, from spec Part C:**
  - **Wave aiming:** when `streak % COMBO_EVERY === COMBO_EVERY − 1`, prefer a Target on the Line with the most waiting Signals.
  - **Inattentive variant:** it ignores fix Targets until the Incident's age is over `0.75 × INCIDENT_LIMIT_MS`.
- **Survey typists:** 40 WPM at 0.94, 60 WPM at 0.96, 90 WPM at 0.98, plus an inattentive 60 WPM.

- [ ] **Step 1: Write the failing tests** in `dispatchProbe.test.ts`, at seeds 1–5:
  - the median Career at 40 WPM / 0.94 lasts 5–8 minutes of Career game time;
  - at 90 WPM / 0.98 it lasts 15–25 minutes;
  - every seed at 60 WPM / 0.96 clears Shift 1;
  - at least one inattentive Career fails with an Incident cause first in `failure.closures`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the typists, then tune `dispatchBalance.ts`** until those tests pass.
  - **Era pacing:** an Era roughly every 3–5 minutes of play, so `SHIFTS_PER_ERA` is about 3.
  - **Opt-in survey:** report per typist the median Career minutes, Shifts cleared, waves fired and the failure-cause mix.
- [ ] **Step 4: Run `npm test`.** Fix any balance-coupled tests by seed or limit only, keeping their intent.
- [ ] **Step 5: Update the handover and STATUS.**
  - Handover: a new "Playtest 1" section with what changed (Tasks 1–10), the final survey, leans left for the next playtest, and the B6 outcome.
  - STATUS: the Dispatcher section.
- [ ] **Step 6: Commit** `feat: Dispatcher balance for the 90-second Shift, combo and new train entry`.
