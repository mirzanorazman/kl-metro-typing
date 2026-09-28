# Rush Hour — handover

## Resume here (updated after every task)

**Active plan:** `docs/superpowers/plans/2026-09-28-rush-hour-tuning.md`
(spec `docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md`),
executed subagent-driven. Ticked boxes in the plan = done and committed.

- **Last done:** Task 1 (reviewed; last code commit `7ac4dfc`).
- **Next:** Task 2 — new constants, planner typist, speed-rewards balance test.
- **Open review notes:** Task 1 minors deferred to final review (see ledger).

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
`docs/superpowers/specs/2026-09-28-rush-hour-tuning-design.md`. Next step: an
implementation plan for it, then merge.

## Gotchas found

- `onwardOptions` with `arrivedFrom === null` returns every Direction, so the
  starting Station always offers a Junction if it has several.
- zsh does not word-split `$var` in `set -- $cfg`; run such loops under bash.
- Home-map Rush Hour button has no number shortcut: digits 1–9 are taken and
  any letter would collide with typing a Line code. Desktop only; phone shell
  has no entry yet.
- A Rush Hour Run adds its visited Stations to Unlocked but records no
  per-Station best WPM.
