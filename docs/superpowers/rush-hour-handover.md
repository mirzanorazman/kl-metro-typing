# Rush Hour — handover

To resume: read this file, then the plan
`docs/superpowers/plans/2026-09-28-rush-hour.md` (ticked boxes = done and
committed). The spec is `docs/superpowers/specs/2026-09-28-rush-hour-design.md`;
read only the section the next task needs. Branch `feat/rush-hour`.

## Current position

Next task: **8. Progress** (`rushLineSetKey` already exists in `engine/rushHour.ts`).

Engine API (all pure, in `src/engine/rushHour.ts`): `startRush`, `advanceRush`,
`enterRushCharacter`, `applyRushAction` (choose/turn/walk/pause/resume/abandon —
returns the same object when refused, so log an action only if state changed),
`deliverableAt`, `queueCapacity`, `rushDayPhase`, `rushGeometry`, `rushMetrics`.
Replay: `replayRushHour(net, evidence)` in `engine/replay.ts`; `complete` is
true only for an Overflow end at the recorded tick. Record keys with
`appendKey(..., RUSH_KEYLOG_MAX_EVENTS)` and judge with
`verifyKeyLog(log, wpm, RUSH_KEYLOG_MAX_EVENTS)`. Test driver:
`engine/rushDrive.testutil.ts`.

## Rulings made during implementation (not in the spec)

- An abandoned Run can never set a best.
- Walk links are offered only at a Junction (on arrival), never mid-typing.
  Any Walk option makes the arrival a Junction even with one rail Direction.
- Spawning is deterministic in *timing* (fractional spawn debt accrues per
  tick); only the Station and target are random.

## OPEN: balance finding for the user

A scripted typist (greedy one-step Direction choice, never turns around) shows
survival on long Lines (KJ) and on all seven Lines barely depends on typing
speed: the one-carriage train (Capacity 4) fills with riders deliverable only at
a few central Interchanges, stops boarding, and a far Queue overflows at roughly
the same time regardless of WPM. On MR (short, interchange-dense) speed matters
a lot. Capacity 8 helps modestly. Rerun: `RUSH_PROBE=1 npx vitest run
src/engine/rushProbe.test.ts`. Needs a user decision (e.g. passengers who give
up, larger capacity, spawn weighting toward reachable targets).

## Gotchas found

- `onwardOptions` with `arrivedFrom === null` returns every Direction, so the
  starting Station always offers a Junction if it has several.
- zsh does not word-split `$var` in `set -- $cfg`; run such loops under bash.
