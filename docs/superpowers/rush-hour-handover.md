# Rush Hour — handover

To resume: read this file, then the plan
`docs/superpowers/plans/2026-09-28-rush-hour.md` (ticked boxes = done and
committed). The spec is `docs/superpowers/specs/2026-09-28-rush-hour-design.md`;
read only the section the next task needs. Branch `feat/rush-hour`.

## Current position

Next task: **1. Vocabulary**.

## Rulings made during implementation (not in the spec)

- An abandoned Run can never set a best.

## Gotchas found

- `onwardOptions` with `arrivedFrom === null` returns every Direction, so the
  starting Station always offers a Junction if it has several.
