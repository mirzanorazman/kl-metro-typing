# Rush Hour — handover

## Resume here (updated after every task)

**Active plan:** `docs/superpowers/plans/2026-09-28-rush-hour-tuning.md`
(spec `docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md`),
executed subagent-driven. Ticked boxes in the plan = done and committed.

- **Last done:** Task 3 (reviewed; last code commit `9680641`).
- **Next:** Task 4 — tip copy, detection, and the seen list.
- **Open review notes:** Task 1–2 minors deferred to final review; balance leans noted in the Balance section below.

To resume in a fresh session: "Read `docs/superpowers/rush-hour-handover.md`
and continue the active plan subagent-driven." The controller's detailed
ledger is `.superpowers/sdd/2026-09-28-rush-hour-tuning/progress.md`
(git-ignored; if missing, trust this block and `git log`).

To resume: read this file, then the plan
`docs/superpowers/plans/2026-09-28-rush-hour.md` (ticked boxes = done and
committed). The spec is `docs/superpowers/specs/2026-09-28-rush-hour-design.md`;
read only the section the next task needs. Branch `feat/rush-hour`.

## Current position

All 12 tasks done. Remaining: the tuning amendment (below), then merge `feat/rush-hour`. Browser check used a CDP script driving headless Chrome (no Puppeteer in repo): `ws` from node_modules, Input.dispatchKeyEvent, Page.captureScreenshot.

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

## Balance: decided after playtest

The user's playtest found Rush Hour confusing and not challenging. Root cause
and the agreed fix (spawns centred on the train, 8-seat train, faster Day,
arrival resets the ring, compact Junction rows, just-in-time tips) are in
`docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md`. Plan: `docs/superpowers/plans/2026-09-28-rush-hour-tuning.md`.

Final survey after Task 2 (planner typist; constants unchanged from the spec):

```
median of 5 seeds — run s / delivered / first half-full Queue s; columns 40, 60, 90 WPM
KJ        87s D1 28d c20        161s D2 81d c19       192s D2 140d c22
MR        64s D1 12d c20        93s D1 33d c20        129s D2 75d c26
KJ+AG+SP  146s D2 47d c28       190s D2 96d c25       240s D2 151d c35
ALL       181s D2 31d c54       185s D2 53d c42       246s D2 96d c73
greedy KJ 60 WPM: 50s 2d
```

Known leans left for playtesting (outside the plan's ±40% band, and
predicted by the spec): KJ+AG+SP and all seven Lines lenient at 40 WPM, MR
harsh at 90 WPM. Closing them likely needs Line-set-aware spawning, a logic
change; decide after the user plays.

## Gotchas found

- `onwardOptions` with `arrivedFrom === null` returns every Direction, so the
  starting Station always offers a Junction if it has several.
- zsh does not word-split `$var` in `set -- $cfg`; run such loops under bash.
- Home-map Rush Hour button has no number shortcut: digits 1–9 are taken and
  any letter would collide with typing a Line code. Desktop only; phone shell
  has no entry yet.
- A Rush Hour Run adds its visited Stations to Unlocked but records no
  per-Station best WPM.
