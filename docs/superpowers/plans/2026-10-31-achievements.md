# Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 36 tiered and 11 secret achievements across the four Modes, recorded from verified Run facts, stored in the Profile, announced on Summaries, listed on an achievements screen, and drawn as poster-style SVG badges.

**Architecture:** The engine gains the facts it doesn't record yet (per-Station wrong keys, a key streak, a Dispatcher tally). A pure achievements module turns per-Mode Run facts into an updated `AchievementState` and a list of newly earned tiers. Screens call it once per Run after verification, save it in `Profile.achievements`, and hand the announcements to their Summary. Badges are React SVG components sharing one poster frame.

**Tech Stack:** TypeScript, React 18, Vite, Vitest with Testing Library and jsdom, Tone.js for sound.

**Spec:** `docs/superpowers/specs/2026-10-31-achievements-design.md`. Badge reference: `docs/superpowers/achievement-badges-spike.html` (open it in a browser).

## Global Constraints

- `src/engine/*` stays pure: no React, timers or storage. Time enters as a parameter (`at`, epoch ms); local date and hour are derived from it with `new Date(at)`.
- `SCHEMA_VERSION` in `src/engine/progress.ts` does not move. `Profile.achievements` is optional and additive, carried through `migrate`'s spread, with a `clean` function so a malformed value loads as empty.
- No network requests at runtime. Badge art is SVG in code.
- Colour is never the only signal: every tier is written as text ("Silver · 75 stations").
- Red against green in badge art differs by brightness and shape too: vivid red `#D8452C`, light mint `#7FDCC6`.
- Motion is CSS, suppressed by the existing `prefers-reduced-motion` block in `src/index.css`.
- Never call `setState` inside another state updater; persistence runs from effects or event handlers.
- Speed and accuracy achievements count Eligible Runs only. Counts and exploration count every Run. Dispatcher counts only Careers that ended (`failed` or `retired`) and whose `judgeCareer` judgement is `eligible`.
- Copy uses the Glossary's words (`CONTEXT.md`): Station, Line, Run, Career, Shift, Signal, Incident, Service gap, Interchange, Terminus, Unlocked, Eligible.
- Exact copy: "New achievements", "+{n} more", "{earned} of 47", "{found} of 11 found", "Secret", "Locked · {label} for Bronze", "{n} more to {Tier}", "We found {n} achievement(s) from your earlier travels", "Dispatcher is played on a larger screen."
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A Run recorded twice.** React StrictMode runs effects twice in development, and Summaries re-render. One Run must change each counter exactly once. Every recording effect is guarded by a ref, the way `completionSaved` guards Quick Run's best. Tested in Task 8 under `<StrictMode>`.
2. **A stale Profile saved over a newer one.** `AdventureScreen` keeps `profileRef`, and a junction choice or walk writes the Profile between two Station arrivals. No increment may be lost. Every achievement write loads the Profile fresh (`loadProfile()`) immediately before applying and saving, and screens that keep a Profile ref refresh it from what they saved. Tested in Task 8.
3. **Station ids the network no longer has** (renamed or removed in `src/data/`) in `visited` or stored sets must be ignored, not counted and not crash. "All" thresholds come from the current data. Tested in Task 4.
4. **A long-time player's run log.** It must stay at most 10 + 10 entries however many Runs are recorded, keeping the first 10. Tested in Task 5.
5. **The same day twice, or the clock moving backwards.** Days are a set of local `YYYY-MM-DD` strings, so a day counts once. Day Pass starts a new day's set only when the date string changes. Tested in Task 5.

---

### Task 1: Per-Station wrong keys and a key streak in Line Run, Adventure and Quick Run

**Files:**
- Modify: `src/engine/run.ts` (`StationTime`, `RunState`, `startRun`, `arrive`, `keyRun`)
- Modify: `src/engine/quickRun.ts` (`QuickStationTime`, `QuickRunState`, where Stations complete and keys apply)
- Test: `src/engine/run.test.ts`, `src/engine/quickRun.test.ts`

**Interfaces:**
- Produces:
  - `StationTime { id: string; ms: number; errors: number }`: `errors` is the wrong keys typed on that Station (the Station's `TypingState.errors` at arrival).
  - `QuickStationTime { id: string; ms: number; errors: number }`, the same.
  - `RunState.keyStreak: number` and `RunState.bestKeyStreak: number`: correct keys in a row (reset to 0 by a wrong key) and the Run's maximum. Both start at 0.
  - `QuickRunState.keyStreak` and `QuickRunState.bestKeyStreak`, the same.

- [ ] **Step 1: Write the failing tests**

In `run.test.ts`, `describe('station errors and key streak')`:
- `it('records wrong keys per Station')`: start a Run, type one wrong key then the full first Station name. `stationTimes[0].errors` is `1`. Type the next Station cleanly; `stationTimes[1].errors` is `0`.
- `it('tracks the best run of correct keys')`: type 5 correct keys, 1 wrong, 3 correct. `keyStreak` is `3`, `bestKeyStreak` is `5`.

In `quickRun.test.ts`, the same two tests against `enterQuickCharacter`, asserting on `completedStations[0].errors`, `keyStreak` and `bestKeyStreak`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/run.test.ts src/engine/quickRun.test.ts`
Expected: FAIL on the new tests (`errors` and `bestKeyStreak` are undefined).

- [ ] **Step 3: Implement the fields**

`keyRun` already knows `gainedChar`: a correct key adds 1 to `keyStreak` and raises `bestKeyStreak`, a wrong key sets `keyStreak` to 0. `arrive` takes `errors` from `state.typing.errors` before typing is reset. Quick Run mirrors this where it applies a key and completes a Station.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. Replay tests (`src/engine/replay.test.ts`) must still pass unchanged: the new fields derive from the same keys, so live and replayed state agree. If a test compares whole `stationTimes` arrays, update its expected objects to include `errors`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/run.ts src/engine/quickRun.ts src/engine/run.test.ts src/engine/quickRun.test.ts
git commit -m "feat: Runs record wrong keys per Station and the best key streak"
```

---

### Task 2: A Dispatcher tally, carried through replay and the judge

**Files:**
- Modify: `src/engine/dispatchBalance.ts` (add `CLOSE_CALL_MS = 3_000`)
- Modify: `src/engine/dispatch.ts` (`CareerTally`, `CareerState.tally`, `startCareer`, `cloneCareer`, `advanceCareer`, `applyTargetKey`, `completeTarget`)
- Modify: `src/engine/replay.ts` (`DispatchReplayResult`)
- Modify: `src/engine/dispatchJudge.ts` (`DispatchJudgement`)
- Test: `src/engine/dispatch.test.ts`, `src/engine/dispatchReplay.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CareerTally {
  clears: number;        // Signals Cleared by typing (Green-wave clears don't count)
  fixes: number;         // breakdown Incidents fixed: signal-fault, train-fault, crowd-surge
  gapsHeld: number;      // Service gap Incidents fixed by typing the hold
  express: number;       // skip chips typed
  keyStreak: number;
  bestKeyStreak: number;
  perfectRun: number;    // cleared Shifts in a row with no Station Out of service
  bestPerfectRun: number;
  closeCall: boolean;    // an Incident fixed within CLOSE_CALL_MS of escalating
  againstOdds: boolean;  // a Shift cleared after 3+ Stations went Out of service in it
  ampang: boolean;       // Enter completed "Ampang" while "Ampang Park" still matched
  trio: number[] | null; // ids of the first 3 Incidents seen active at once this Shift
  survivedTrio: boolean; // all of `trio` fixed, none escalated
}
```

- `CareerState.tally: CareerTally`, all zero/false/null from `startCareer`.
- `DispatchReplayResult` gains `tally: CareerTally`, `history: ShiftRecord[]`, `correctChars: number`.
- `DispatchJudgement` gains the same three fields plus `metrics: Metrics`, all from the replay (zero/empty values when the replay is null).

- [ ] **Step 1: Write the failing tests**

In `dispatch.test.ts`, `describe('career tally')`, driving a seeded Career with the helpers in `src/engine/dispatchDrive.testutil.ts`:
- `it('counts typed Signal clears but not Green-wave clears')`
- `it('counts breakdown fixes and Service gap holds separately')`
- `it('counts skip chips taken')`
- `it('tracks the best key streak across Shifts')`
- `it('counts cleared Shifts in a row with nothing Out of service')`: a Shift with a closure resets `perfectRun` to 0; `bestPerfectRun` keeps the maximum.
- `it('marks a close call for a fix within 3 s of escalating')`, and a fix with 3.1 s left does not mark it.
- `it('marks against the odds when a Shift clears after 3 closures')`
- `it('marks Ampang when Enter confirms it over Ampang Park')`
- `it('survives a trio only when all three are fixed')`, and a trio where one escalates leaves `survivedTrio` false.

In `dispatchReplay.test.ts`:
- `it('replays the same tally the live Career reached')`: the replayed `tally` deep-equals the live final state's `tally`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/dispatch.test.ts src/engine/dispatchReplay.test.ts`
Expected: FAIL (`tally` is undefined).

- [ ] **Step 3: Implement the tally**

- In `applyTargetKey`, after `completeTarget` succeeds: `signal` adds to `clears`; `skip` adds to `express`; a `fix` that finishes its Incident adds to `gapsHeld` for kind `service-gap` and to `fixes` otherwise. Every counted key updates `keyStreak` and `bestKeyStreak` the same way Task 1 does.
- Close call: when a fix finishes, compare the Shift time to the moment that Incident would put its place Out of service. Use the same expression `stepIncidents` in `src/engine/dispatchIncidents.ts` uses to escalate it (`INCIDENT_LIMIT_MS` from `startedMs` for breakdowns; check the Service gap rule there too). If `CLOSE_CALL_MS` or less was left, set `closeCall`.
- Ampang: when the key is `'Enter'` and the completed target's text is `Ampang`.
- Trio: when `trio` is null and 3 or more Incidents are active, take the first three ids. A fix removes its id; when the list empties, set `survivedTrio`. If a trio Incident leaves `sim.incidents` without being fixed, set `trio` to null. A new Shift (`expand`) resets `trio` to null.
- At a cleared Shift in `advanceCareer`: `againstOdds` if `s.sim.oosOrder.length >= 3`; `perfectRun` adds 1 when `oosOrder` is empty and resets to 0 otherwise; update `bestPerfectRun`.
- `cloneCareer` copies `tally`, including the `trio` array.
- `replayDispatch` returns the final state's `tally`, `history` and `correctChars`; `judgeCareer` passes them through with `metrics`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the existing Dispatcher replay and sim tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dispatchBalance.ts src/engine/dispatch.ts src/engine/replay.ts src/engine/dispatchJudge.ts src/engine/dispatch.test.ts src/engine/dispatchReplay.test.ts
git commit -m "feat: a Dispatcher Career tallies clears, fixes and close calls, and replay reproduces it"
```

---

### Task 3: Achievement definitions, state, and the Profile field

**Files:**
- Create: `src/engine/achievementDefs.ts`
- Create: `src/engine/achievementState.ts`
- Modify: `src/engine/progress.ts` (`Profile.achievements`, `migrate`)
- Test: `src/engine/achievementDefs.test.ts`, `src/engine/achievementState.test.ts`, `src/engine/progress.test.ts`

**Interfaces:**
- Produces, in `achievementState.ts`:

```ts
export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
export type Award = Tier | 'secret';
export interface EarnedTier { id: string; award: Award; at: number }
export interface RunLogEntry { at: number; wpm: number; accuracy: number }

export interface AchievementState {
  v: 1;
  earned: Record<string, { award: Award; at: Partial<Record<Award, number>> }>;
  unannounced: EarnedTier[];
  backfilled: string[] | null;
  counters: {
    junctions: number; lineStations: number; linePersonalBests: number;
    quickCompleted: number; quickClean: number;
    clears: number; fixes: number; gapsHeld: number; express: number;
    characters: number; comebacks: number;
  };
  sets: {
    walkLinks: string[]; adventureLines: LineCode[]; quickStarts: LineCode[];
    longNames: string[]; days: string[]; linesCompleted: LineCode[]; lineDirections: string[];
  };
  bests: {
    lineScore: Partial<Record<LineCode, number>>; lineAccuracy: number;
    quickScore: number; quickFirstScore: number | null; quickJumps: number; quickChain: number;
    keyStreak: number; era: number; delivered: number; perfectShifts: number; onTime: number;
    longRide: number;
  };
  dayPass: { day: string; lines: LineCode[] } | null;
  quickChain: { count: number; summaryAt: number } | null;
  runLog: { first: RunLogEntry[]; recent: RunLogEntry[]; lastAccuracy: number | null };
  adventureRun: { start: string; visited: string[]; lines: LineCode[] } | null;
  flags: string[];
}
export function emptyAchievements(): AchievementState;
export function cleanAchievements(raw: unknown): AchievementState | undefined;
```

- Produces, in `achievementDefs.ts`:

```ts
export type Category = 'explorer' | 'line' | 'quick' | 'dispatch' | 'craft' | 'secret';
export interface EvalContext { visited: readonly string[]; phone: boolean }
export interface TieredDef {
  id: string; name: string; category: Exclude<Category, 'secret'>;
  thresholds: (net: NetworkIndex) => readonly [number, number, number];
  value: (s: AchievementState, ctx: EvalContext, net: NetworkIndex) => number;
  label: (threshold: number, tier: Tier, net: NetworkIndex) => string;
}
export interface SecretDef { id: string; name: string; category: 'secret' }
export type AchievementDef = TieredDef | SecretDef;
export const ACHIEVEMENTS: readonly AchievementDef[];
export const CATEGORY_ORDER: readonly Category[]; // explorer, line, quick, dispatch, craft, secret
export function networkCounts(net: NetworkIndex): {
  stations: number; interchanges: number; termini: number; walkLinks: number; lines: number; longNames: number;
};
export function isLongName(name: string): boolean; // 20+ characters
```

- `Profile.achievements?: AchievementState`.

- [ ] **Step 1: Write the failing tests**

`achievementDefs.test.ts`:
- `it('has 36 tiered and 11 secret achievements with unique ids')`
- `it('has at least 7 per category')`
- `it('lists the ids in the spec')`: the ids are exactly the spec's tables, in table order (`explorer.unlocked` … `secret.merdeka`).
- `it('counts the network')`: against the real data (`buildNetwork(loadNetworkData())`), `networkCounts` returns `{ stations: 154, interchanges: 21, termini: 11, walkLinks: 5, lines: 7, longNames: 9 }`.
- `it('derives "all" thresholds from the data')`: `explorer.unlocked` thresholds are `[25, 75, 154]`; `explorer.termini` `[3, 7, 11]`; `craft.longNames` `[3, 6, 9]`.
- `it('labels tiers in words')`: `explorer.unlocked`'s gold label is `'all 154 stations'` and its silver `'75 stations'`; `line.accuracy` silver is `'99% accuracy'`; `dispatch.era` silver is `'2015–17'` (labels from `ERAS` in `src/engine/dispatchNetwork.ts`).

`achievementState.test.ts`:
- `it('cleans a malformed value to undefined')` for `null`, `'x'`, `{ v: 2 }`.
- `it('keeps a valid state and drops unknown ids in sets')`: a set with a non-string entry loses that entry.

`progress.test.ts`:
- `it('loads an old profile without achievements unchanged')`
- `it('loads a malformed achievements value as absent')`

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/achievementDefs.test.ts src/engine/achievementState.test.ts src/engine/progress.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the definitions and state**

Thresholds, units and wording come from the spec's tables. Values that are fractions (accuracy, on-time share) are stored as 0–1 and labelled as percentages. `dispatch.era` uses the `ERAS` index with thresholds `[1, 2, 4]`. `craft.allRounder` has thresholds `[1, 2, 3]` (tier index); its `value` is the minimum, over the required categories, of the highest tier index in `state.earned` among that category's achievements (Explorer, Line Run, Quick Run, plus Dispatcher unless `ctx.phone`).

Each other `value` reads the state field of the same meaning. The ones that aren't a single field: `explorer.unlocked`, `explorer.interchanges` and `explorer.termini` count `ctx.visited` ids that exist in `net` and qualify; `line.score` is the maximum of `bests.lineScore`; `line.bothWays` counts Lines with both of their directions in `sets.lineDirections`; `line.dayPass` is `dayPass?.lines.length ?? 0`; `quick.improved` is `bests.quickScore − bests.quickFirstScore` (0 while that is null); `craft.speedUp` is defined in Task 5. Interchange: a Station with more than one Line code. Terminus: the first or last Station of any Line. `cleanAchievements` follows `cleanQuickBest`: wrong types become empty, never throw.

`migrate` sets `achievements: cleanAchievements(rec.achievements)`.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/achievementDefs.ts src/engine/achievementState.ts src/engine/progress.ts src/engine/achievementDefs.test.ts src/engine/achievementState.test.ts src/engine/progress.test.ts
git commit -m "feat: achievement definitions and their stored state"
```

---

### Task 4: Evaluating tiers, announcements, unlock-based Explorer achievements and the backfill

**Files:**
- Create: `src/engine/achievements.ts`
- Test: `src/engine/achievements.test.ts`

**Interfaces:**
- Consumes: Task 3's types, `ACHIEVEMENTS`, `networkCounts`.
- Produces:

```ts
export interface Recorded { state: AchievementState; earned: EarnedTier[] }
export function localDay(at: number): string;            // 'YYYY-MM-DD', local time
export function evaluate(net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number): Recorded;
export function recordUnlocks(net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number): Recorded;
export function takeAnnouncements(state: AchievementState): { state: AchievementState; items: EarnedTier[] };
export function backfill(net: NetworkIndex, profile: Profile, at: number): AchievementState;
export function progressOf(net: NetworkIndex, state: AchievementState, ctx: EvalContext, id: string):
  { value: number; tier: Tier | null; next: { tier: Tier; threshold: number } | null };
```

`evaluate` compares each tiered achievement's value with its thresholds and each secret's presence in `flags`. For every tier newly reached it records `earned[id]` (highest award, plus the time each tier was reached), and appends to both the returned `earned` and `state.unannounced`. If one evaluation crosses two tiers, only the higher tier is announced (the spec: "A tier upgrade shows the new tier, not a second row"); both get a time in `at`. `recordUnlocks` is `evaluate` under another name, so screens can say what they're doing.

- [ ] **Step 1: Write the failing tests**

- `it('awards Bronze when 25 Stations are Unlocked')`: `visited` of 25 real ids gives `earned` with `{ id: 'explorer.unlocked', award: 'bronze' }`.
- `it('announces only the highest tier crossed at once')`: 75 Stations gives one item, `silver`; `earned['explorer.unlocked'].at` has both `bronze` and `silver`.
- `it('does not award the same tier twice')`: evaluating twice gives an empty `earned` the second time.
- `it('ignores Station ids the network does not have')` (Review Focus 3): 24 real ids plus 5 unknown ones award nothing; an unknown id with two Line codes is not counted as an Interchange; nothing throws.
- `it('awards a secret from its flag')`
- `it('takeAnnouncements returns and clears the unannounced list')`
- `it('All-Rounder needs Dispatcher on desktop but not on a phone')`: Bronze in Explorer, Line Run and Quick Run only; `phone: true` awards All-Rounder Bronze, `phone: false` does not.
- `it('backfills from visited and the Quick Run best, without announcing')`: a Profile with 30 visited and `quickBestOverall: 65` gives `explorer.unlocked` Bronze and `quick.score` Silver in `earned`, an empty `unannounced`, `backfilled` listing both ids, and `bests.quickScore` 65.
- `it('progressOf reports the next tier')`: 48 Stations gives `{ value: 48, tier: 'bronze', next: { tier: 'silver', threshold: 75 } }`.
- `it('localDay uses local time')`: `localDay(new Date(2026, 7, 31, 23, 59).getTime())` is `'2026-08-31'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/achievements.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `achievements.ts`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/engine/achievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/achievements.ts src/engine/achievements.test.ts
git commit -m "feat: evaluate achievement tiers, queue announcements, and backfill existing players"
```

---

### Task 5: Recording Line Runs and Quick Runs, and the typing-craft achievements

**Files:**
- Create: `src/engine/achievementRuns.ts`
- Test: `src/engine/achievementRuns.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `localDay` (Task 4); `StationTime.errors`, `bestKeyStreak` (Task 1).
- Produces:

```ts
export interface TypingFacts {
  eligible: boolean;
  metrics: Metrics;                 // the replayed Metrics when eligible, else the live ones
  correctChars: number;
  bestKeyStreak: number;
  stations: { id: string; ms: number; errors: number }[];
}
export interface LineRunFacts extends TypingFacts { line: LineCode; from: string; complete: boolean }
export interface QuickRunFacts extends TypingFacts {
  startLine: LineCode; jumps: number; lastStationLeftMs: number | null; openedAt: number;
}
export function recordLineRun(net: NetworkIndex, state: AchievementState, facts: LineRunFacts, ctx: EvalContext, at: number): Recorded;
export function recordQuickRun(net: NetworkIndex, state: AchievementState, facts: QuickRunFacts, ctx: EvalContext, at: number): Recorded;
export function recordRunEnd(state: AchievementState, at: number): AchievementState; // day, Night Owl, Merdeka!
```

`recordLineRun` and `recordQuickRun` call `recordRunEnd` and then `evaluate`. `lastStationLeftMs` is the time left on the Quick Run clock when its last Station completed (`deadline − (startedAt + Σ ms)`), or null when none did. `openedAt` and `at` are wall-clock (`Date.now()`) times, for One More Go.

What each records (spec tables, Eligible-only marked E):
- Line Run: `lineStations += stations.length` always. If `complete`: add to `linesCompleted`, add `` `${line}:${from}` `` to `lineDirections`, update `dayPass` for `localDay(at)`. E and complete: `lineAccuracy` max, `lineScore[line]` (when a previous best exists and is beaten, `linePersonalBests += 1`; the first completion only sets the baseline).
- Quick Run: `quickCompleted += 1`, add `startLine` to `quickStarts`, update `quickChain` (continues when `openedAt <= previous summaryAt + 60_000`, else restarts at 1; `bests.quickChain` keeps the max; `summaryAt = at`). E: `quickScore` max, `quickFirstScore` if null, `quickJumps` max, `quickClean += 1` at accuracy 1, Last Train Home flag when `lastStationLeftMs !== null && lastStationLeftMs <= 1_000`.
- Craft, E only: `characters += correctChars`, `bests.keyStreak` max, `longNames` gains each 20+ character Station typed with `errors === 0`, the `secret.sixteen` flag for `16-sierra` with no errors, the `secret.puchong` flag for `taman-perindustrian-puchong` with no errors at 60+ WPM for that Station (`chars / 5 / (ms / 60_000)`). Back on Track: when `runLog.lastAccuracy < 0.9` and this Run's accuracy `>= 0.97`, `comebacks += 1`; then `lastAccuracy` = this accuracy. The run log (Line Runs and Quick Runs only, for Picking Up Speed) keeps the first 10 entries in `first` and the latest 10 in `recent`; Picking Up Speed's value is the mean WPM of `recent` minus that of `first`, and 0 until 20 Runs are logged.
- `recordRunEnd`: adds `localDay(at)` to `days`; sets `secret.nightOwl` when the local hour is 0–3; sets `secret.merdeka` on local 31 August or 16 September.

- [ ] **Step 1: Write the failing tests**

- `it('counts Long Line from every Line Run, complete or not')`
- `it('records End to End and Both Ways from complete Line Runs only')`
- `it('ignores an ineligible Line Run for Spotless and Line Speed')`
- `it('counts a Personal Best only after a baseline exists')`: first completion of KJ at Score 30 counts 0; a second at 35 counts 1; a third at 34 counts 1.
- `it('Day Pass counts distinct Lines on one local day and restarts on the next')` (Review Focus 5): two Lines on 1 Nov, then one on 2 Nov, gives `dayPass` `{ day: '2026-11-02', lines: [that one] }` and Bronze Day Pass earned on 1 Nov.
- `it('counts a day once, even when the clock goes backwards')` (Review Focus 5): Runs at 1 Nov 10:00, 1 Nov 09:00, 1 Nov 11:00 leave `days` as `['2026-11-01']`.
- `it('records Quick Run counts for any completed Run but Score only when eligible')`
- `it('Up the Line measures from the first eligible Quick Run')`: first eligible Score 40, later best 52, value 12 (Bronze).
- `it('chains One More Go only within 60 s of the last Summary')`
- `it('awards Last Train Home with a second or less left')`, and 1.2 s left does not.
- `it('Mouthful counts distinct long names typed with no wrong key')`
- `it('Sweet Sixteen and Puchong need a clean, eligible Station')`
- `it('Back on Track needs 97% straight after under 90%')`
- `it('keeps the run log at 10 + 10 entries')` (Review Focus 4): after 500 Runs, `first.length` is 10 with the first 10 Runs' WPM, `recent.length` is 10.
- `it('Picking Up Speed is 0 before 20 Runs and the mean difference after')`
- `it('Night Owl at 02:30 local, not at 04:00')`
- `it('Merdeka! on 31 August and 16 September only')`

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/achievementRuns.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `recordLineRun`, `recordQuickRun` and `recordRunEnd`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/engine/achievementRuns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/achievementRuns.ts src/engine/achievementRuns.test.ts
git commit -m "feat: record Line Run, Quick Run and typing-craft achievements"
```

---

### Task 6: Recording Dispatcher Careers and Adventure

**Files:**
- Modify: `src/engine/achievementRuns.ts`
- Test: `src/engine/achievementRuns.test.ts`

**Interfaces:**
- Consumes: `DispatchJudgement` with `tally`, `history`, `metrics`, `correctChars`, `cleared` (Task 2); `eraFor` from `src/engine/dispatchNetwork.ts`.
- Produces:

```ts
export function recordCareer(net: NetworkIndex, state: AchievementState, judgement: DispatchJudgement, ctx: EvalContext, at: number): Recorded;
export function startAdventure(state: AchievementState, start: string, resume: boolean): AchievementState;
export function recordAdventureArrival(net: NetworkIndex, state: AchievementState, station: string, line: LineCode | null, ctx: EvalContext, at: number): Recorded;
export function recordJunctionChoice(net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number): Recorded;
export function recordWalk(net: NetworkIndex, state: AchievementState, from: string, to: string, ctx: EvalContext, at: number): Recorded;
export function recordAdventureEnd(net: NetworkIndex, state: AchievementState, ctx: EvalContext, at: number): Recorded;
```

- Mouthful, Sweet Sixteen and Puchong in One Breath come from Line Runs and Quick Runs only. A plan-level decision: Dispatcher's typing narrows across several targets at once, so it has no per-Station wrong-key count to judge them by.
- `recordCareer` does nothing (returns the state unchanged, `earned: []`) unless `judgement.eligible`. Otherwise: lifetime `clears`, `fixes`, `gapsHeld`, `express` add the tally's; `bests.era` max of `eraFor(judgement.cleared)`; `bests.delivered` max of `judgement.delivered`; `bests.perfectShifts` max of `tally.bestPerfectRun`; `bests.onTime` max over cleared `ShiftRecord`s of `onTimeCalls / calls` (skip `calls === 0`); flags `secret.closeCall`, `secret.againstOdds`, `secret.ampang`, `secret.rushHour` (`survivedTrio`). Craft: `characters`, `bests.keyStreak`, Back on Track's `lastAccuracy` from `metrics.accuracy`. The run log for Picking Up Speed is not touched. Then `recordRunEnd` and `evaluate`.
- `startAdventure` keeps `adventureRun` when `resume` is true and one exists; otherwise sets `{ start, visited: [], lines: [] }`.
- `recordAdventureArrival` adds the Station to `adventureRun.visited` (distinct), and `line` (when not null) to `adventureRun.lines` and `sets.adventureLines`; `bests.longRide` max of the visited count; flags `secret.sevenColours` at 7 Lines and `secret.roundTrip` when `station === start` with 20 or more other distinct Stations visited; adds today to `days`; then `evaluate`.
- `recordWalk` adds the link as its two ids sorted and joined by `|`, only when `net.walk` links them.
- `recordAdventureEnd` is `recordRunEnd` then `evaluate`.

- [ ] **Step 1: Write the failing tests**

- `it('ignores an ineligible Career')`
- `it('adds a Career tally to the lifetime counts')`
- `it('Through the Eras reads the Era from Shifts cleared')`: `cleared` 3, 6, 12 give Era index 1, 2, 4 and Bronze, Silver, Gold.
- `it('Right on Time takes the best cleared Shift')`, skipping a failed Shift with a higher share.
- `it('sets the Dispatcher secrets from the tally')`
- `it('a Career does not feed Picking Up Speed')`
- `it('a resumed Adventure continues its record and a new one replaces it')`
- `it('Long Ride, Seven Colours and Round Trip are awarded on arrival')`
- `it('counts a Walk link once in either direction')`
- `it('ignores a walk between Stations that are not linked')`

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/achievementRuns.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement the Dispatcher and Adventure recorders**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/achievementRuns.ts src/engine/achievementRuns.test.ts
git commit -m "feat: record Dispatcher Careers and Adventure for achievements"
```

---

### Task 7: The badge frame, the Badge component, and the four approved drawings

**Files:**
- Create: `src/render/badges/Badge.tsx`, `src/render/badges/BadgeFrame.tsx`, `src/render/badges/art/index.ts`, `src/render/badges/art/explorer.tsx`, `src/render/badges/art/quick.tsx`, `src/render/badges/art/dispatch.tsx`, `src/render/badges/badges.css`
- Test: `src/render/badges/Badge.test.tsx`

**Interfaces:**
- Produces:

```tsx
export type BadgeAward = Award | null;            // null: locked
export function Badge(props: { id: string; award: BadgeAward; size: number; hidden?: boolean }): JSX.Element;
export const BADGE_ART: Partial<Record<string, () => JSX.Element>>;  // art/index.ts merges the category files
```

`hidden` draws the unearned-secret badge: a "?" in the locked style. Without art for an id, `Badge` draws a placeholder subject (a plain station roundel) so the screen works before Tasks 10–12.

The frame reproduces the spike's poster treatment in a `0 0 200 200` viewBox: paper `#EFDDBB` with a lower band `#E3CFA6`, a sun disc `#E7A673` at r 60 with a halftone dot pattern, a faint grain, the art scaled to 0.84 about the centre with a charcoal (`#2A2A2E`) key line offset by (1.8, −1.2), and a rounded-square frame (`rx 28`, stroke 8) in the tier metal. Bronze `#F6C08F / #B86B33 / #6B3512`, silver `#F7F9FB / #A7B0BA / #545D68`, gold `#FFEB94 / #E2A72A / #855505`; gold adds the corner sparkle. Locked uses the silver metal with `filter: grayscale(1)` and opacity 0.5 from `badges.css`. Secrets use one frame colour of the implementer's choosing, distinct from the three metals. Pattern and clip ids come from React's `useId` so many badges can share a page.

Drawings come from the spike's `SUBJECTS` for `explorer.unlocked` (folded map and pin), `dispatch.clears` (signal lamp, red `#D8452C` above a mint `#7FDCC6` lamp), `explorer.termini` (buffer stop), and `quick.jumps` (train leaping between tracks; redraw it so the leap reads as a leap, with the train clearly airborne above a gap).

- [ ] **Step 1: Write the failing tests**

- `it('names the badge for screen readers')`: `role="img"` with the achievement's name and award, e.g. `"Jalan-Jalan, Silver"`, and `"Locked"` when `award` is null.
- `it('draws the tier metal on the frame')`: the frame's stroke differs for bronze, silver and gold.
- `it('marks a locked badge for the greyscale style')`: a `badge--locked` class.
- `it('draws the hidden secret without its art')`
- `it('gives each badge its own pattern ids')`: two badges render with different `id`s on their patterns.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/render/badges/Badge.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the frame, `Badge` and the four drawings**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/render/badges/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/badges
git commit -m "feat: poster-style badge frame and the first four badges"
```

---

### Task 8: Recording in every Mode and announcing on its Summary

**Files:**
- Create: `src/ui/NewAchievements.tsx`, `src/ui/achievementsStore.ts`
- Modify: `src/audio/sound.ts` (`sound.achievement`)
- Modify: `src/ui/SummaryScreen.tsx`, `src/ui/LineRunScreen.tsx`, `src/ui/AdventureScreen.tsx`, `src/ui/QuickRunScreen.tsx`, `src/ui/QuickRunSummary.tsx`, `src/ui/DispatcherScreen.tsx`, `src/ui/DispatchSummary.tsx`, `src/ui/App.tsx`, `src/ui/summary.css`
- Test: `src/ui/NewAchievements.test.tsx`, `src/ui/SummaryScreen.test.tsx`, `src/ui/AdventureScreen.test.tsx`, `src/ui/QuickRunScreen.test.tsx`, `src/ui/Dispatcher.test.tsx`

**Interfaces:**
- Consumes: every recorder from Tasks 4–6, `takeAnnouncements`, `backfill`, `Badge`.
- Produces:

```ts
// achievementsStore.ts: the one place that loads, applies and saves.
export function updateAchievements(
  apply: (state: AchievementState, visited: readonly string[]) => Recorded | AchievementState,
): EarnedTier[];
export function claimAnnouncements(): EarnedTier[];   // takeAnnouncements on the saved state, saved back
export function NewAchievements(props: { net: NetworkIndex; items: readonly EarnedTier[] }): JSX.Element | null;
```

`updateAchievements` calls `loadProfile()`, applies to `profile.achievements ?? emptyAchievements()`, saves, and returns the newly earned (Review Focus 2). Screens that keep a Profile ref (`AdventureScreen`, `QuickRunScreen`) set it from `loadProfile()` after each call so their next save doesn't overwrite it.

`NewAchievements` renders nothing for no items. Otherwise a section headed "New achievements" with up to three rows (`Badge` at 56px, the name, the tier label such as "Silver · 75 stations"), then "+{n} more" as a button that opens the achievements screen (prop `onMore`, added in Task 9; until then render it as text). On mount it plays `sound.achievement()` once; the rows enter with a CSS animation under the reduced-motion block.

Where each screen records, each guarded by a ref so it runs once (Review Focus 1):
- **Stations Unlocked**, all three typing Modes: after the existing `recordStation` loop, `updateAchievements(recordUnlocks …)`.
- **Line Run:** `SummaryScreen` already computes `eligibility`. When `mode === 'line'`, an effect calls `recordLineRun` with `complete` = `leaderboardLine !== null`, the replayed Metrics when eligible, and the Run's `stationTimes` and `bestKeyStreak`; then `claimAnnouncements()` into state passed to `NewAchievements`. `LineRunScreen` passes the Line and `from` it already has.
- **Adventure:** `AdventureScreen` calls `startAdventure(…, resume)` once on mount, with `resume` true when `startAt` equals the saved `profile.adventure?.at`. Each arrival calls `recordAdventureArrival` with `run.line`; `onChoose` calls `recordJunctionChoice`; `onWalk` calls `recordWalk(prev.at, to)`. `SummaryScreen` with `mode === 'adventure'` calls `recordAdventureEnd`, then claims.
- **Quick Run:** in the completion effect, after the existing verification, in both the eligible and ineligible branches: `recordQuickRun` with `jumps = run.trace.legs.length - 1`, `startLine = run.trace.legs[0].line`, `openedAt` captured with `Date.now()` on mount, `lastStationLeftMs` from the deadline. Then claim and pass to `QuickRunSummary` as a new `achievements` prop. An interrupted Run records nothing.
- **Dispatcher:** once `judgement` is set for a `failed` or `retired` Career, `recordCareer`, claim, and pass to `DispatchSummary` as `achievements`.
- `ctx.phone` comes from `usePhoneLayout()`; `ctx.visited` is supplied by `updateAchievements`.
- **Backfill:** `App` runs one effect on mount: when `loadProfile().achievements` is undefined, save `backfill(net, profile, Date.now())`.

- [ ] **Step 1: Write the failing tests**

- `NewAchievements.test.tsx`: `it('shows up to three and counts the rest')` with five items shows three rows and "+2 more"; `it('renders nothing with no items')`; `it('plays the cue once')` (mock `sound.achievement`).
- `SummaryScreen.test.tsx`: `it('announces a Line Run achievement once under StrictMode')` (Review Focus 1): render a completed, eligible Line Run Summary inside `<StrictMode>` with a Profile that is one Line Run short of a tier; the tier is shown once, and the saved `counters.lineStations` went up by the Run's Station count exactly once.
- `AdventureScreen.test.tsx`: `it('keeps a junction choice made between arrivals')` (Review Focus 2): arrive, choose at a junction, arrive again; the saved state has `junctions: 1` and both Stations in `adventureRun.visited`.
- `QuickRunScreen.test.tsx`: `it('records a completed Quick Run and shows its achievements')`; `it('records nothing for an interrupted Quick Run')`.
- `Dispatcher.test.tsx`: `it('records a retired, verified Career')`; `it('records nothing for an abandoned Career')`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/NewAchievements.test.tsx src/ui/SummaryScreen.test.tsx src/ui/AdventureScreen.test.tsx src/ui/QuickRunScreen.test.tsx src/ui/Dispatcher.test.tsx`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement the store, the component, the sound cue and the wiring**

`sound.achievement` follows the existing cues in `src/audio/sound.ts` (`play(({ complete }) => …)`): a short rising two-note chime, distinct from `complete`.

- [ ] **Step 4: Run the suite and the build**

Run: `npm test && npm run build`
Expected: PASS, and the build succeeds.

- [ ] **Step 5: Check it in the browser**

Start the dev server, complete a short Line Run (the Monorail, 11 Stations) and a Quick Run, and screenshot both Summaries in the `paper` and `midnight` themes at desktop and phone widths.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/audio/sound.ts
git commit -m "feat: every Mode records achievements and its Summary announces them"
```

---

### Task 9: The achievements screen

**Files:**
- Create: `src/ui/AchievementsScreen.tsx`, `src/ui/achievements.css`
- Modify: `src/ui/App.tsx` (`Screen` kind `'achievements'`), `src/ui/HomeMap.tsx` (key `5`), `src/ui/HomeModes.tsx` (an Achievements entry beside Leaderboard), `src/ui/MobileShell.tsx` (`MobileDestination` gains `'achievements'`, label "Achievements"), `src/ui/NewAchievements.tsx` (`onMore`)
- Test: `src/ui/AchievementsScreen.test.tsx`, `src/ui/HomeMap.test.tsx`, `src/ui/MobileShell.test.tsx`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `CATEGORY_ORDER`, `progressOf`, `claimAnnouncements`, `Badge`.
- Produces: `AchievementsScreen(props: { net: NetworkIndex; onExit?: () => void; embedded?: boolean })`, following `LeaderboardScreen`'s props and its `embedded` use inside `MobileShell`.

Rules from the spec:
- Header "{earned} of 47", counting each achievement once at any award.
- Sections in `CATEGORY_ORDER`, titled Explorer, Line Run, Quick Run, Dispatcher, Typing craft, Secrets.
- A row: `Badge` (56px), the name, then "Silver · 75 stations"; under it, when not Gold, "{n} more to {Tier}" from `progressOf`. Gold rows say "Gold · all 154 stations" with no progress line.
- Locked row: grey badge, "Locked · 25 stations for Bronze".
- Secrets: the section header says "{found} of 11 found"; an unearned secret shows the hidden badge, the name "Secret", and no condition.
- On a phone layout, the Dispatcher section shows "Dispatcher is played on a larger screen." under its title.
- Opening the screen calls `claimAnnouncements()` once; the claimed ids are marked "New" in their rows for this visit.
- If `backfilled` is a non-empty list, show "We found {n} achievement(s) from your earlier travels" once, then save `backfilled: null`.
- A row is a button with `aria-expanded`. Enter or a tap opens its detail: the three thresholds with their labels and the date each tier was earned (`toLocaleDateString()`).
- Escape returns home, as `LeaderboardScreen` does.

- [ ] **Step 1: Write the failing tests**

- `it('lists 47 achievements in six sections')`
- `it('shows the overall count')`: one Bronze and one secret earned gives "2 of 47".
- `it('shows a locked row with what Bronze needs')`
- `it('shows progress to the next tier')`
- `it('hides an unearned secret')`: no secret name appears in the document until its flag is earned.
- `it('notes Dispatcher on a phone')`
- `it('marks claimed achievements as new and clears them')`
- `it('shows the backfill note once')`
- `it('opens a row's detail with all three thresholds')`
- `HomeMap.test.tsx`: `it('opens achievements with 5')`.
- `MobileShell.test.tsx`: `it('offers an Achievements destination')`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/AchievementsScreen.test.tsx src/ui/HomeMap.test.tsx src/ui/MobileShell.test.tsx`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement the screen and its entry points**

- [ ] **Step 4: Run the suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Check it in the browser**

Screenshot the achievements screen with a backfilled Profile in both themes at desktop and phone widths, and with a row's detail open.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: an achievements screen, from home and the phone menu"
```

---

### Tasks 10–12: The remaining badge drawings

One task per group, each with the same steps. Each badge is one simple object in the poster style (Task 7's frame), with no text and no logos, and must read at 48px. Where red and green both carry meaning, use the Global Constraints' colours.

| Task | Group | Ids still to draw |
|---|---|---|
| 10 | Explorer and Line Run | `explorer.interchanges`, `explorer.walk`, `explorer.junctions`, `explorer.longRide`, `explorer.lines`; all 7 `line.*` |
| 11 | Quick Run and Dispatcher | `quick.score`, `quick.completed`, `quick.clean`, `quick.improved`, `quick.starts`, `quick.backToBack`; `dispatch.era`, `dispatch.delivered`, `dispatch.incidents`, `dispatch.gaps`, `dispatch.perfect`, `dispatch.onTime`, `dispatch.express` |
| 12 | Typing craft and Secrets | all 7 `craft.*`; all 11 `secret.*` |

**Files:** the category files under `src/render/badges/art/` (add `line.tsx`, `craft.tsx`, `secret.tsx` as needed) and `src/render/badges/Badge.test.tsx`.

- [ ] **Step 1: Write the failing test**

`it('has art for every <group> achievement')`: every id in the group is a key of `BADGE_ART`. Task 12 changes this to `it('has art for every achievement')` over all of `ACHIEVEMENTS`, which also removes the need for the placeholder; delete the placeholder in Task 12.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/render/badges/Badge.test.tsx`
Expected: FAIL, listing the missing ids.

- [ ] **Step 3: Draw the group**

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/render/badges/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check them in the browser**

On the achievements screen, screenshot the group at 56px, and at 48px with a temporary size, in both themes and locked (greyscale). Every subject must be recognisable at 48px; redraw any that blur.

- [ ] **Step 6: Commit**

```bash
git add src/render/badges
git commit -m "feat: badge art for <group>"
```

---

### Task 13: Documentation

**Files:**
- Modify: `CONTEXT.md`, `docs/STATUS.md`

- [ ] **Step 1: Add the Glossary entries**

In `CONTEXT.md`, under "Measuring", add **Achievement** (a goal recorded in the Profile, tiered Bronze, Silver and Gold, or a single-award Secret), **Tier**, and **Secret**, and add `achievements` to the **Profile** entry. Correct the Profile entry's mention of WPM history: `recordRun` has no callers, so `wpmHistory` stays empty, and achievements keep their own run log.

- [ ] **Step 2: Update the status document**

In `docs/STATUS.md`, add an **Achievements** paragraph under "What exists" (counts, where they're announced, the screen and key 5, poster-style SVG badges, the spec path), and add the spec and this plan to the document map.

- [ ] **Step 3: Run the full check**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/STATUS.md
git commit -m "docs: achievements in the glossary and status"
```
