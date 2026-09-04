# A lightweight domain model

**Date:** 2026-09-04
**Status:** proposed

Give MyRapid Typing enough of a domain model that adding a third mode does not
break the rules of the first two. Not DDD: no aggregates, no repositories, no
domain events, no `src/domain/` folder.

The forcing function is **Rush Hour**, the one specified-but-unbuilt mode. It is
a real third case rather than an imagined future, which makes it a test the
design can actually fail.

## The problem, stated concretely

Four leaks, all found in the current code.

1. **Line Run's central rule lives in a React callback.** `LineRunScreen.tsx:85-99`
   decides when the run ends and which way to go at an interchange. Those are
   rules of the game. `engine/lineRun.ts` knows only how to list a route.

2. **`RunState` is one shape serving two games.** `options` and
   `status: 'junction'` are meaningless in Line Run. `route` does not exist, which
   is why it ended up in the screen. Rush Hour would add a third set of fields
   that the other two never read.

3. **A scoring formula is copy-pasted into two React components.**
   `LineRunScreen.tsx:79` and `AdventureScreen.tsx:78` both compute
   `chars / 5 / (ms / 60_000)`. The two agree with each other and with
   `computeMetrics`; the problem is that there are three copies of one definition,
   two of them in the view layer.

4. **`engine/progress.ts` breaks invariant 2.** STATUS.md says every file in
   `src/engine/` is pure. `loadProfile` and `saveProfile` call `localStorage`.
   The original design spec's module table marks `engine/progress` as impure by
   design, so the two documents have disagreed from the start.

Plus vocabulary drift that is visible to players: the same action is labelled
"End run" in `LineRunScreen.tsx:151` and "End journey" in `AdventureScreen.tsx:172`,
and both lead to a summary headed "Journey complete".

## Scope

**In:** a canonical glossary, the renames that make it true, a per-mode
`RunState`, repatriating the leaked rules into `src/engine/`, and splitting
storage out of the engine.

**Out:** branded id types, parse-don't-validate at the data boundary, a
`src/domain/` folder, any policy-object or hook indirection, and building Rush
Hour itself. This spec defines the seam Rush Hour will sit in. It does not
design Rush Hour.

## Ubiquitous language

Becomes `CONTEXT.md` at the repo root. Game domain only — rendering and geometry
terms (`viewBox`, `backdrop`, projection, fit) stay documented in STATUS.md as
implementation invariants.

### Network

**Station**: One stop on the network, identified by a slug. A station serving
several lines is one record.
_Avoid_: stop, node

**Line**: One of the seven Prasarana rail lines, an ordered sequence of stations
between two termini.

**Line code**: The two-letter identifier for a line — `KJ`, `AG`, `SP`, `SA`,
`MR`, `KG`, `PY`.

**Terminus**: A station at either end of a line.

**Interchange**: A station serving more than one line. Changing line is free.
_Avoid_: transfer, connection

**Junction**: A point in a Run where more than one onward direction is available
and the player must choose. A property of the Run, not of the station.

**Direction**: One onward rail option out of a station — a line, the next
station along it, and the terminus it heads toward.
_Avoid_: option, choice

**Walk link**: Two differently-named stations joined by a walkway. Free in
Adventure; costs time in Rush Hour.

### Playing

**Run**: One play session, from a starting station until the game ends it.
_Avoid_: journey, session, game, play

**Mode**: Which kind of Run this is — Line Run, Adventure, or Rush Hour.
_Avoid_: kind, variant, type

**Line Run**: The mode where the player types one line end to end. The route is
fixed and interchanges never prompt.

**Adventure**: The mode where the player roams freely and chooses a direction at
every junction.

**Rush Hour**: The survival mode. Passengers accumulate at stations, typing speed
is the train's throughput, and one overcrowded station ends the Run. Not built.

**Status**: Where a Run is right now — typing, at a junction, or ended.
_Avoid_: phase, state

**Route**: The ordered stations a Line Run will type. Line Run only.

**Visited**: The stations reached during the current Run.

**Unlocked**: The stations reached in any Run, ever. Persisted.
_Avoid_: visited (for the lifetime set), discovered

**Day phase**: Rush Hour's time of day — Off-Peak, Morning Peak, Midday,
Evening Peak, Late Night. The word "phase" is reserved for this.

**Demand**: A station's passenger spawn weight. 1 is an ordinary stop.

### Measuring

**WPM**: Correct characters, divided by five, divided by elapsed minutes.

**Accuracy**: Correct keystrokes over total keystrokes.

**Score**: `wpm × accuracy²`. Squaring prices sloppiness above raw speed.

**Profile**: The player's persisted record — unlocked stations, best WPM per
station, Adventure resume position, Rush Hour high scores, WPM history.

### One word, three senses

"Line" is unavoidably overloaded and the glossary names each sense:

1. `RunCore.line` — the line the train travels on **now**. Changes during a Run.
2. Rush Hour's `lines` — the line-set chosen before the Run starts. Fixed.
3. "Line Run" — a mode name.

## Design

### `RunState`: a shared core plus one extension per mode

```ts
export type RunStatus = 'typing' | 'junction' | 'ended';

export interface RunCore {
  at: string;
  arrivedFrom: string | null;
  line: LineCode | null;
  status: RunStatus;
  typing: TypingState;
  visited: string[];
  stationTimes: StationTime[];
  startedAt: number;
  stationStartedAt: number;
  correctChars: number;
  keystrokes: number;
  errors: number;
}

export type RunState =
  | (RunCore & { mode: 'line-run';  route: string[] })
  | (RunCore & { mode: 'adventure'; options: Direction[] })
  | (RunCore & { mode: 'rush-hour'; /* fields added when Rush Hour is built */ });
```

Each mode carries only fields it reads. Line Run gains the `route` it always
needed; Adventure keeps `options`; neither carries the other's.

The `rush-hour` arm is a placeholder. Rush Hour is not designed here, and adding
its arm is the change this design exists to make cheap.

### Core is a toolkit, not a pipeline

`engine/runCore.ts` exports composable pieces. It never calls into a mode
module, which keeps the imports acyclic: mode modules depend on the core, the
dispatcher depends on the modes, and the core depends on neither.

- `applyKeystroke(core, key)` — typing state and the three counters
- `beginStation(net, core, to, line, now)` — start typing a station's name
- `recordArrival(core, now)` — append to `visited` and `stationTimes`

`recordArrival` also stores the station's character count, which is what lets
`stationWpm` work without a station lookup.

Each mode module composes these into its own advance-and-end rule. The rejected
alternative was a fixed pipeline with per-mode hooks: its hook points must be
guessed before the third mode exists, and Rush Hour's **Express** upgrade — a
perfect streak skips the next station — is exactly the rule that would need a
hook nobody predicted. A toolkit has no hook points to guess wrong.

### Two entry points

```ts
export function stepRun(net: NetworkIndex, s: RunState, key: string, now: number): RunState;
export function tickRun(net: NetworkIndex, s: RunState, now: number): RunState;
```

Both live in `engine/run.ts`, switch on `s.mode`, and delegate to the mode
module. Screens never switch on mode themselves. Each mode module exports its own
arm of the union — `LineRunState`, `AdventureState` — and `run.ts` unions them.

`tickRun` exists because Rush Hour advances on elapsed time, not on keystrokes —
passengers pile up while the player sits still. Line Run and Adventure return
their state unchanged, so a screen can call it every frame without knowing which
mode it is showing.

Time still enters as a `now` parameter. Invariant 2 holds: the engine owns no
timer, the screen does.

### Module layout

```
src/engine/
  runCore.ts    RunCore, RunStatus, the toolkit. Depends on no mode.
  run.ts        the RunState union, stepRun/tickRun dispatch
  lineRun.ts    route, and Line Run's advance-and-end rule
  adventure.ts  junction choice, walk transfer, turn around
  rushHour.ts   not written yet
  profile.ts    pure Profile rules (was progress.ts)
  network.ts    unchanged
  typing.ts     unchanged
  metrics.ts    gains stationWpm
src/storage/
  profileStore.ts   localStorage read/write, schema version
```

This overrides the original design spec's `src/sim/` folder for Rush Hour.
STATUS.md already describes `engine/` as "pure game logic", which is what Rush
Hour's simulation is; splitting modes across two folders makes "where does a
mode live?" answerable only as "it depends". Recorded in ADR 0001.

`balance.ts` — Rush Hour's tuning constants — lands in `engine/` when Rush Hour
is built. Not created now.

### Storage split

`engine/profile.ts` keeps the pure rules: `emptyProfile`, `recordStation`,
`recordRun`, `saveAdventurePosition`. No storage, no React, no clock.

`storage/profileStore.ts` owns `loadProfile`, `saveProfile`, `STORAGE_KEY`,
`SCHEMA_VERSION`, and `migrate`. Invariant 2 becomes true.

Domain field names and stored JSON keys stay identical — no mapping layer. There
is one persisted shape, and a mapping layer is an abstraction with one caller.

**`SCHEMA_VERSION` goes to 2 with no migration written.** This is a deliberate
choice for a pre-production project. Renaming `Profile.visited` to
`Profile.unlocked` without the bump would be worse than a reset: `migrate` spreads
the stored record over a fresh profile, so a v1 record would satisfy the version
check, contribute a dead `visited` key, and leave `unlocked` empty — progress
lost silently. The bump makes `migrate` reject v1, which routes through the
existing `recovered: true` path and shows the player a notice. Local saves reset
once, visibly.

### Metrics repatriation

`StationTime` gains the character count, so per-station WPM needs no station
lookup:

```ts
export interface StationTime { id: string; ms: number; chars: number; }
export function stationWpm(t: StationTime): number;
```

One definition, in `metrics.ts`. Both screens' persistence effects drop from six
lines to two, and neither computes a score any more.

Per-station WPM stays pure speed with no accuracy term, matching the field name
`bestWpm` and the raw WPM already stored in `wpmHistory`. Accuracy over a name of
roughly twelve characters is too noisy to be a fair per-station judgement.

### Renames

| From | To | Why |
|---|---|---|
| `RunState.phase` | `RunState.status` | "Phase" is reserved for Rush Hour's day cycle |
| `Profile.visited` | `Profile.unlocked` | STATUS.md already writes the rule as "stations unlock permanently" |
| `useLayoutMode` `mode` / `setMode` / `LayoutMode` | `view` / `setView` / `LayoutView` | The buttons already say "Schematic view"; frees "mode" for the game mode |
| `engine/progress.ts` | `engine/profile.ts` | Named for the type it owns, once storage moves out |
| `DirectionChooser` | `TerminusChooser` | It picks a starting terminus, not a `Direction` |
| "End journey" (UI) | "End run" | One word for one concept |
| "Journey complete" (UI) | "Run complete" | Same |

`DirectionChooser` and `JunctionPicker` currently share the `aria-label`
"Choose a direction" for two different concepts, so a screen reader hears one
label for both. `TerminusChooser` takes "Choose a starting terminus";
`JunctionPicker` keeps "Choose a direction", which now matches the glossary.

`RunState.visited` keeps its name.

## Does Rush Hour fit?

Checked against the specification in
`docs/superpowers/specs/2026-09-03-myrapid-typing-design.md`.

| Rush Hour needs | Where it goes | Fits? |
|---|---|---|
| Passenger queues per station | `rush-hour` arm | Yes |
| Seeded RNG for reproducible tests | `rush-hour` arm | Yes |
| Chosen line-set as difficulty dial | `rush-hour` arm | Yes |
| Advance on elapsed time | `tickRun` | Yes |
| Day phases and days | `rush-hour` arm | Yes, once "phase" is freed |
| Overflow ends the Run | `rushHour.ts` owns its end rule | Yes |
| Walk transfers cost time | `rushHour.ts` composes its own walk | Yes |
| Upgrades that change core behaviour | `rushHour.ts` composes the toolkit | Yes — and this is why core is a toolkit |
| Tuning constants | `engine/balance.ts`, added then | Yes |

The line-set lives in the `rush-hour` arm rather than in `RunCore`. Only Rush
Hour treats it as a constraint: Line Run's single line is implied by its `route`,
and Adventure has no limit to record. Putting it in the core would restore
exactly the unused-field problem the split exists to remove.

## Testing

The 159 existing tests must stay green; most changes are renames the compiler
catches.

New coverage:

- Line Run's route-complete and interchange rules, now testable in
  `engine/lineRun.ts` without rendering a screen. They have never had a direct
  test, because they lived in a React callback.
- `tickRun` returns Line Run and Adventure states unchanged.
- `stationWpm` against known character counts and durations.
- `profileStore` round-trip, and a v1 record producing a recovered profile.

## Decision record

One ADR: `docs/adr/0001-run-state-per-mode.md`, covering the core-plus-extension
shape and, in its consequences, the override of the original spec's `src/sim/`
folder. Everything else here is a rename or a file move.

## New in this spec

Three consequences that follow from the decisions but were not put to review
individually. Flagged for the spec review rather than assumed:

- `engine/progress.ts` renamed to `engine/profile.ts`.
- `DirectionChooser` renamed to `TerminusChooser`, with a distinct `aria-label`.
- `StationTime` gains a `chars` field so `stationWpm` needs no station lookup.
