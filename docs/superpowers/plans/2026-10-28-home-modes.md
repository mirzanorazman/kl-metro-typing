# Home screen by kind of play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire Rush Hour, let Quick Run be left with Escape, ring direction
buttons in their Line's colour, and turn the desktop home panel into three
labelled kinds of play: Career, Challenge, Explore.

**Architecture:** The home panel gets a `view` state (`'modes' | 'explore'`).
The modes view is a new `HomeModes` component of three cards. The explore view
is today's Line list, moved out of `HomeMap` into a new `ExploreList`. A random
Quick Run is picked in `App` by a new pure `randomQuickRoute` and handed to the
unchanged `QuickRunScreen` route, so replay and eligibility rules don't move.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library, plain CSS
with tokens in `src/styles/tokens.css`.

**Spec:** [specs/2026-10-28-home-modes-design.md](../specs/2026-10-28-home-modes-design.md)

Run test first, one commit per task. `npm test` and `npm run build` must pass
at the end of every task.

## Global Constraints

- Desktop and tablet home only; `MobileShell`, `MobileTransit` and
  `MobileAdventureSetup` are not edited.
- Section labels, in order: `Career`, `Challenge`, `Explore`.
- Dispatcher copy, exactly: "Your first day in the control room. Keep the
  trains moving, fix faults before stations shut, and earn new lines one Shift
  at a time."
- Quick Run copy, exactly: "30 seconds against the clock. How fast are you today?"
- Explore title "Line Run & Adventure"; copy, exactly: "No clock. Ride a whole
  line, or roam freely and unlock stations."
- Home keys: `0` Resume, `1` Dispatcher, `2` Quick Run, `3` Explore,
  `4` Leaderboard. Explore view keys: `0` Resume, `1–7` Lines, `8` Start anywhere.
- Hint line on the modes view: "Press a number, or type a line code."
- Chips read `Best · N Shifts` (`Best · 1 Shift`), `Best · N`, `V / T`; CSS
  uppercases them. A chip with nothing to show is not rendered.
- Use CONTEXT.md vocabulary in copy and names (Station, Line, Run, Shift, Career).

## Review Focus

1. Escape with the station search open in the Explore view closes only the
   search; the Explore view stays. (Task 5 test.)
2. A Line code typed on the modes view, then Escape in the direction chooser,
   lands on the Explore view, not the modes view. (Task 5 test.)
3. The random Quick Run never picks a Line and Direction with no eligible leg.
   Every Line has two Directions, and short ones exist. (Task 4 test.)
4. Escape never enters a Quick Run's Keylog. After Escape in `ready`, nothing is
   recorded and `onBack` fires once. (Task 2 test.)
5. Old muscle memory: `9` no longer opens the Leaderboard and must do nothing.
   (Task 5 test.)

---

### Task 1: Retire Rush Hour

Follow Task 12 of `docs/superpowers/plans/2026-10-23-dispatcher.md` exactly.
Its gate is met: the user said to retire Rush Hour on 2026-10-28.

**Files:** as listed in that task. In addition:
- `src/ui/HomeMap.tsx`: remove `onOpenRush` and its button.
- `src/ui/App.tsx`: remove the `rush-setup` and `rush` screens.
- Any Rush cases in `src/ui/App.test.tsx` and `src/ui/HomeMap.test.tsx`.

- [ ] **Step 1:** Write `migrate strips Rush Hour keys` in `src/engine/progress.test.ts`. A stored profile with `rushHigh` and `rushTipsSeen` loads without either key.
- [ ] **Step 2:** Run `npx vitest run src/engine/progress.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Delete and edit as Task 12 lists, including renaming the music tracks to `dispatchSetup` / `dispatchCalm` / `dispatchTense`.
- [ ] **Step 4:** Run `grep -rni "rush" src CONTEXT.md`. The only hits left are the `'rush'` value of `IntegrityFail.mode` and the migration.
- [ ] **Step 5:** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: retire Rush Hour in favour of Dispatcher`.

### Task 2: Quick Run can be left with Escape

**Files:**
- Modify: `src/ui/QuickRunScreen.tsx` (`onKey`, ~line 197; panel JSX, ~line 410)
- Modify: `src/index.css` (hint style next to `.quick-run-metrics`, if needed)
- Test: `src/ui/QuickRunScreen.test.tsx`

**Interfaces:** no prop changes.

- [ ] **Step 1: Write the failing tests** in `QuickRunScreen.test.tsx`, using `renderQuick`:
  - `leaves on Escape before the clock starts`: `fireEvent.keyDown(window, { key: 'Escape' })` → `onBack` called once; the Prompt is gone (the screen returns `null`).
  - `interrupts on Escape once the clock is running`: type one correct character, then Escape. Expect heading `Run interrupted` and status `This result was not saved as a personal best.`; `onBack` not called.
  - `keeps Escape out of the Keylog`: type one correct character, then Escape. The interrupted Summary shows Accuracy `100.0%`. Had Escape been recorded as a wrong keystroke, it would read `50.0%`.
  - `shows the Escape hint on desktop only`: desktop shows text `Esc to leave`; with `phone = true` it does not.
- [ ] **Step 2:** Run `npx vitest run src/ui/QuickRunScreen.test.tsx`. Expected: the four new tests FAIL.
- [ ] **Step 3: Implement.** In `onKey`, before `recorder.record`, handle `key === 'Escape'`:
  - `ready`: `dismissedRef.current = true; blurInput(); setDismissed(true); onBack();`, the same as the existing phone-landscape `ready` branch.
  - `running`: `commitRun(interruptQuickRun(currentRun.current, performance.now()))`, after `setDisplayNow` to the same timestamp.
  - In both cases return without recording.

  Render `<p className="hint"><kbd>Esc</kbd> to leave</p>` in the panel when `!phone`.
- [ ] **Step 4:** Run the file again. Expected: PASS, including the existing tests.
- [ ] **Step 5:** Commit: `fix: Escape leaves a Quick Run (home before the clock, Summary after)`.

### Task 3: Direction buttons ring in the Line's colour

**Files:**
- Modify: `src/index.css` (`.junction button`, ~line 314)
- Test: `src/smoke.test.ts`

- [ ] **Step 1:** Write a test in `src/smoke.test.ts`, `rings direction buttons in their Line's colour`:
  ```ts
  expect(indexCss).toMatch(/\.junction button\s*\{[^}]*border:\s*1px solid var\(--line-colour, var\(--panel-edge\)\);/);
  expect(indexCss).not.toMatch(/\.junction button\s*\{[^}]*border-left:/);
  expect(indexCss).toMatch(/\[data-theme='midnight'\] \.junction button\s*\{[^}]*box-shadow:[^}]*0 0 24px -6px var\(--line-colour, transparent\);/);
  ```
- [ ] **Step 2:** Run `npx vitest run src/smoke.test.ts`. Expected: FAIL.
- [ ] **Step 3:** In `.junction button`, replace the two border declarations with `border: 1px solid var(--line-colour, var(--panel-edge));`. Add a `[data-theme='midnight'] .junction button` rule with `box-shadow: 0 0 24px -6px var(--line-colour, transparent);`. Keep the hover/focus rule, which switches the border to `--focus-ring`.
- [ ] **Step 4:** Run it again. Expected: PASS. Then check in the browser: the home direction chooser and an Adventure junction in midnight and paper, and a phone-width Adventure junction.
- [ ] **Step 5:** Commit: `style: direction buttons ring in their Line's colour instead of a side stripe`.

### Task 4: Random Quick Run route, and "Run again" for it

**Files:**
- Modify: `src/engine/quickRun.ts` (new export)
- Modify: `src/ui/QuickRunScreen.tsx` (new optional prop)
- Modify: `src/ui/App.tsx` (new `startRandomQuick`, Quick Run `key`)
- Test: `src/engine/quickRun.test.ts`, `src/ui/QuickRunScreen.test.tsx`

**Interfaces:**
- Produces `randomQuickRoute(net: NetworkIndex, random: () => number): { line: LineCode; toward: string }` in `src/engine/quickRun.ts`. Candidates are every Line in `net.lines` order, each with both termini from `terminiOf` as `toward`, kept only where `eligibleQuickLegs(net, line, toward).length > 0`. It returns `candidates[Math.floor(random() * candidates.length)]`.
- Produces the `QuickRunScreen` prop `onAgain?: () => void`. When it is given, the Summary's "Run again" calls it instead of the internal `runAgain`.
- Produces `startRandomQuick(): void` in App, passed to `HomeMap` in Task 5 as `onStartQuick`.

- [ ] **Step 1: Write the failing tests.**
  - `quickRun.test.ts`, `randomQuickRoute picks only eligible routes`: for `random` returning each of `0, 0.25, 0.5, 0.75, 0.9999`, the result satisfies `eligibleQuickLegs(net, r.line, r.toward).length > 0`.
  - `randomQuickRoute spans the candidates`: `random = () => 0` and `() => 0.9999` give different results, and the first result is on `net.lines`' first Line.
  - `QuickRunScreen.test.tsx`, `hands Run again to onAgain when given`: render with `onAgain = vi.fn()` and finish the Run (as the existing "runs again" test does). Clicking `Run again` calls `onAgain` once, and `onStartingStation` is not called a second time.
  - The existing `runs again after focusing, preserving route choices…` test stays unchanged and passes. It pins the phone path.
- [ ] **Step 2:** Run both files. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `randomQuickRoute`, and the `onAgain` prop: `onAgain={onAgain ?? runAgain}` on `QuickRunSummary`.
- [ ] **Step 4: App.**
  - Add `const [quickRound, setQuickRound] = useState(0)`.
  - Add `startRandomQuick = useCallback(() => { const r = randomQuickRoute(net, Math.random); startQuick(r.line, r.toward); setQuickRound((n) => n + 1); }, [net, startQuick])`.
  - Add `fromCard: boolean` to the `quick` screen variant. `startQuick` becomes `(code, toward, fromCard = false)`. Phone callers leave the default; `startRandomQuick` passes `true`.
  - Render `QuickRunScreen` with `key={quickRound}` and `onAgain={screen.fromCard ? startRandomQuick : undefined}`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: a random Quick Run route, and Run again draws a fresh one when started from home`.

### Task 5: Home panel by kind of play

**Files:**
- Create: `src/ui/HomeModes.tsx`, for the three cards and their chips
- Create: `src/ui/ExploreList.tsx`, for today's Line list, Resume and Start anywhere rows, moved out of `HomeMap`
- Modify: `src/ui/HomeMap.tsx` (view state, keys, props)
- Modify: `src/ui/DirectionChooser.tsx` (drop `onQuick` and the Quick Run buttons and note)
- Modify: `src/data/dispatchBoardStore.ts` (new export)
- Modify: `src/ui/App.tsx` (pass `onStartQuick={startRandomQuick}`)
- Modify: `src/index.css` (section labels, cards, emphasised Dispatcher card, `.mode-chip`)
- Modify: `CONTEXT.md` ("Mode" lists Dispatcher), `docs/STATUS.md` (new home screen; Rush Hour gone)
- Test: `src/ui/HomeMap.test.tsx`, `src/ui/DirectionChooser.test.tsx`, `src/data/dispatchBoardStore.test.ts`

**Interfaces:**
- Consumes `startRandomQuick` (Task 4).
- Produces `bestShifts(board: DispatchBoard): number | null` in `dispatchBoardStore.ts`. It returns the max `shifts` over entries, or `null` when there are no entries or the max is 0.
- `HomeMapProps.onStartQuick` becomes `onStartQuick?: () => void`.
- `HomeModes` props: `{ resumeName: string | null; bestShifts: number | null; quickBest: number | null; visited: number; total: number; onDispatcher?: () => void; onQuick?: () => void; onExplore: () => void; onResume: () => void }`. A card whose callback is absent is not rendered.
- `ExploreList` props: `{ net: NetworkIndex; visited: Set<string>; resumeName: string | null; searching: boolean; onResume; onChooseLine: (code: LineCode) => void; onToggleSearch; onPickStation }`.

- [ ] **Step 1: Rewrite the `HomeMap.test.tsx` cases that change, and add the new ones.** Delete `says what Dispatcher is, under its name`, `starts a quick run with the selected line and direction` and `numbers the menu rows…`. Add:
  - `shows three kinds of play in order`: the labels `Career`, `Challenge`, `Explore` appear in that document order. Each card's copy matches the Global Constraints exactly.
  - `numbers the home cards 0 to 4`: with a saved Adventure, the `menu-key` texts are `['0','1','2','3','4']`.
  - `starts a Dispatcher Career with 1`, `starts a Quick Run with 2` (`onStartQuick` called with no arguments), `opens the Leaderboard with 4`.
  - `ignores 9 on the home cards`: `onOpenLeaderboard` not called.
  - `opens Explore with 3, showing the seven Lines and Start anywhere`: Line names visible; `menu-key`s `['0'…'8']` with a saved Adventure.
  - `goes back from Explore on Escape`: the cards are back.
  - `closes only the search on Escape in Explore`: open Explore (`3`), open search (`8`), Escape. The search field is gone and the Line rows are still there.
  - `jumps to a Line's directions when its code is typed on the home cards, and Escape returns to Explore`: type `K`,`J` → "Kelana Jaya Line — which way?"; Escape → the Line rows are visible.
  - `resumes from the home cards with 0`.
  - Chips: no chips beyond `V / T` on an empty profile; `Best · 68` with `quickBestOverall: 67.6`; `Best · 7 Shifts` with a saved board entry of `shifts: 7`; `Best · 1 Shift` for `shifts: 1`.
  - Keep and adapt (reach them through `3` first) the existing Line-click, Line-code, search, resume, recovery, sound, music, intro and StrictMode tests.
- [ ] **Step 2: `DirectionChooser.test.tsx`.** Delete the three Quick Run tests (`disables short-Line Quick…`, `renders no quick-run actions…`, `offers one compact quick-run action…`). Add `offers no Quick Run`: no button named `/Quick Run/`.
- [ ] **Step 3: `dispatchBoardStore.test.ts`.** Add `bestShifts`: `null` for an empty board; `null` when every entry has `shifts: 0`; `7` for entries `[3, 7, 5]`.
- [ ] **Step 4:** Run the three files. Expected: the new and rewritten tests FAIL.
- [ ] **Step 5: Implement** `bestShifts`, `HomeModes`, `ExploreList`, the `HomeMap` view state and key handling, and the `DirectionChooser` removal.
  - `HomeMap`: `view` starts `'modes'`. Typing a Line code sets `view` to `'explore'` and `selected`. The direction chooser's `onCancel` clears `selected` only.
  - Escape in the explore view (with `selected === null` and not searching) sets `view` to `'modes'`.
  - Map `fitTo` behaviour is unchanged.
- [ ] **Step 6: CSS.** Style section labels, cards, the emphasised Dispatcher card and `.mode-chip` with existing tokens, in both themes. Model them on the brainstorm mockup: `.superpowers/brainstorm/7967-1793166039/content/home-layout-v2.html`, copy 2.
- [ ] **Step 7:** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 8: Check it live.** Run `npm run dev` and look at the home screen in midnight and paper on a fresh profile (no chips but `V / T`) and on a played one. Walk through keys 0–4, Explore, a typed Line code, Escape chains, and a Quick Run from `2` followed by Run again.
- [ ] **Step 9:** Update `CONTEXT.md` ("Mode": Line Run, Quick Run, Adventure, Dispatcher) and `docs/STATUS.md` (home screen section; Rush Hour removed; Next steps).
- [ ] **Step 10:** Commit: `feat: home screen shows Career, Challenge and Explore as kinds of play`.
