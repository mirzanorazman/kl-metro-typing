# Rush Hour — v1 design

**Date:** 2026-09-28
**Status:** Agreed with the user in a grilling session; implementation in progress.
**Supersedes:** the Rush Hour section of `2026-09-03-myrapid-typing-design.md`
where the two disagree. Vocabulary follows `CONTEXT.md`.

## Summary

Rush Hour is the survival Mode. Passengers accumulate in Queues at Stations;
the player's typing speed is the train's throughput; one Station whose Overflow
ring fills ends the Run. Headline score is passengers Delivered.

## Scope

**In v1:** passenger spawning, Queues, Overflow, a one-carriage train, the Day
cycle with per-Day escalation, Walk links with a time cost, pause on blur, a
Keylog plus action log with full Replay, a per-Line-set best, a summary screen.
Desktop and tablet.

**Deferred:** the six upgrades (a second plan), phone-portrait polish (only if
the existing mobile shell carries over for free), any leaderboard.

## Setup

- A **Rush Hour** entry sits on the home map beside Quick Run.
- It opens a **Line set** picker: toggle Lines by clicking them or typing their
  code. One or more Lines. Every Line is selectable from first launch.
- Then a start picker: any Station on the Line set.
- The Run is **ready** until the first printable key; that key starts the clock
  and the sim. As in Adventure, the first thing typed is the starting Station's
  name.

## Movement

Adventure rules, restricted to the Line set:

- Onward Directions come from `onwardOptions`, filtered to Lines in the set.
  One option rolls on; several make a Junction (the sim keeps running while the
  player chooses).
- Turning around mid-Line is allowed.
- A Walk link is offered only when both ends are on Lines in the set. Taking
  one locks typing for `WALK_PENALTY_MS` (5 s) while the sim runs, then the
  train is at the other end with that Station's name to type.

## Passengers

- A **Passenger** carries a target Line. They are **Delivered** on reaching any
  Station that Line serves.
- Spawns happen only at Stations on the Line set, chosen weighted by `demand`.
- A Passenger's target Line is any of the seven Lines that (a) does not serve
  the spawn Station and (b) is served by at least one Station on the Line set
  (so it is reachable). Lines failing (b) never spawn. This keeps one-Line Runs
  playable: a KJ-only Run carries AG/SP/MR/KG riders to KJ's Interchanges.
  A Station for which no target exists (impossible with real data, but
  guarded) never spawns.
- Target choice is uniform over the eligible Lines.

## The train

- **Capacity** 4 (one carriage). **Load** is the Passengers aboard.
- **Arriving** at a Station means typing its name in full. On arrival:
  1. Everyone in the Load whose target Line serves the Station alights and is
     Delivered.
  2. The Queue boards first-in-first-out up to remaining Capacity, regardless of
     direction of travel.

## Queues and Overflow

- Queue Capacity: 6, or 8 at an Interchange.
- A spawn at a full Queue is dropped.
- While a Queue is full, its **Overflow** ring fills at a rate that fills it in
  `OVERFLOW_MS` (20 s). While below Capacity it drains at twice that rate.
- A ring reaching full ends the Run immediately. The summary names the Station.

## The day

| Day phase | Duration | Multiplier |
|---|---|---|
| Off-Peak | 40 s | ×0.5 |
| Morning Peak | 60 s | ×1.6 |
| Midday | 40 s | ×0.8 |
| Evening Peak | 60 s | ×1.8 |
| Late Night | 40 s | ×0.4 |

Day *N* multiplies the whole cycle by `1 + 0.3 × (N − 1)`. The base spawn rate
is normalised by the Line set's total `demand`, so seven Lines are harder
because the passengers are spread out, not because there are seven times more
of them. Every number lives in `src/engine/rushBalance.ts` and is placeholder
tuning, sanity-checked by a test that plays a scripted ~60 WPM typist.

## Determinism, clock, and pausing

- The sim steps in fixed **100 ms ticks** of *game time* driven by a seeded
  PRNG whose state is part of `RushState`. The seed is chosen at start and
  stored with the Run.
- Game time is Run-clock time minus paused time. The engine owns this: pause
  and resume are engine actions stamped with the Run clock.
- Every action applies at a timestamp: the engine first advances the sim to that
  timestamp (whole ticks), then applies the action. A key, a Direction choice,
  a turn-around, a Walk, a pause, a resume — all the same.
- The screen calls `advanceRush(state, runTick())` once per animation frame.
- Pause on blur or tab-hide, with a resume overlay; resuming is an explicit
  action (a key or click), never automatic.
- The player can end a Run early. An abandoned Run shows its summary but can
  never set a best — otherwise quitting before an Overflow would bank a score.

## Integrity

- Rush Hour records a **Keylog** (as Line Run and Quick Run do) and an **action
  log** of every non-key action with its tick: Direction chosen, turn-around,
  Walk, pause, resume. The action log is Rush Hour's analogue of Quick Run's
  Leg trace.
- A Rush Hour Keylog can be far longer than the 5 000-event cap sized for other
  modes, so the cap becomes a parameter; Rush Hour uses 60 000.
- **Replay** rebuilds the Run from Line set, start Station, seed, Keylog and
  action log, merged by time, then advances to the recorded end tick. It must
  end by Overflow at exactly that tick, at the same Station, with the same
  Delivered count; otherwise Replay returns null.
- A Run is **Eligible** when it ended by Overflow, replays cleanly, and passes
  `verifyKeyLog` with the replayed WPM. Only an Eligible Run updates `rushHigh`.
  A failing Verdict is appended to the integrity-failure log like other modes.
- WPM for Rush Hour is correct characters over **typing time**: game time minus
  Walk lockouts.

## Presentation

- The map dims Lines outside the Line set.
- Each Station on the Line set shows its Queue as pips coloured by target Line
  **with the Line code as text**, and an Overflow ring that fills.
- HUD: Day and Day phase with a progress bar, Delivered, WPM, and Load by target
  Line code (e.g. `KG ×2 · MR ×1`).
- At a Junction, the Direction chooser annotates each Direction with how many
  of the Load its Line alone would deliver at the next Station.
- The follow camera frames the train more widely than Quick Run's, so nearby
  crowding Stations are visible.
- Sound: existing arrival and error cues; a new delivered cue; a warning cue
  when any Overflow ring crosses 50%.

## Score and persistence

- **Score = Delivered.**
- `Profile.rushHigh[lineSetKey]` where `lineSetKey` is the sorted Line codes
  joined with `+` (e.g. `AG+KJ`). Updated only by an Eligible Run that beats it.
- Summary: Delivered, Day and Day phase reached, the Station that overflowed,
  WPM, Accuracy, and whether it is a new best for this Line set.
- No schema version change: `rushHigh` already exists and is already defaulted.

## Module layout

| Module | Role | Pure |
|---|---|---|
| `src/engine/rushBalance.ts` | every tuning constant | data |
| `src/engine/rng.ts` | seeded PRNG (mulberry32), state as a number | yes |
| `src/engine/rushHour.ts` | `RushState`, start, keys, choices, walk, pause, advance, metrics | yes |
| `src/engine/replay.ts` | adds `replayRushHour` | yes |
| `src/engine/progress.ts` | adds `recordRushBest` | I/O, as today |
| `src/ui/RushSetup.tsx` | Line set + start picker | view |
| `src/ui/RushHourScreen.tsx` | the Run | view |
| `src/ui/RushSummary.tsx` | the summary | view |
| `src/render/*` | Queue pips, Overflow ring, Load HUD | view |

`RushState.status` is `ready | running | paused | ended`, with
`endReason: 'overflow' | 'abandoned' | null`.

## Testing

- `rng`: reproducible sequences, state round-trips.
- `rushHour`: spawn eligibility (including one-Line sets), demand weighting,
  full-Queue drops, FIFO boarding to Capacity, delivery on any Station of the
  target Line, overflow fill/drain/end, Day phase transitions and escalation,
  pause freezing game time, Walk lockout, Line-set-restricted Directions, the
  first key starting the Run.
- `replay`: a live-driven Run replays to identical Delivered/end tick/Metrics;
  tampered action logs, seeds, or keys return null.
- Balance sanity: a scripted 60 WPM typist on one Line survives past the first
  Morning Peak and eventually overflows.
- UI: setup picker, pause overlay, summary, and best-saving gated on Eligible.
