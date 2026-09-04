---
status: accepted
---

# A Run's state is a shared core plus one extension per mode

Line Run, Adventure and Rush Hour share most of what a Run is — position,
typing, timings, keystroke counters — but each needs fields the others never
read. So a Run's state is a `RunCore` of the shared fields, extended per mode
and discriminated on `mode`, rather than one struct carrying every mode's
fields as optionals.

## Considered options

**One struct for every mode.** This is what the code did, and it is why Line
Run's route rule ended up inside a React callback: `RunState` had `options`,
which Line Run never reads, and no `route`, which Line Run needs. Adding Rush
Hour would have put passenger queues on Line Run too.

**A policy object.** A `RunRules` interface with `onArrive` and `isOver`,
implemented once per mode and dispatched through a table. Rejected: its hook
points must be guessed before the third mode exists. Rush Hour's Express
upgrade — a perfect streak skips the next station — is exactly the rule that
would need a hook nobody predicted.

**A shared core plus per-mode extensions.** Chosen.

## Consequences

**Core is a toolkit, not a pipeline.** `engine/runCore.ts` exports composable
pieces — apply a keystroke, begin a station, record an arrival — and never calls
into a mode module. Each mode composes them into its own advance-and-end rule.
There are no hook points to guess wrong. `engine/run.ts` holds the union and
dispatches to the modes, so the imports stay acyclic and screens never switch on
mode themselves.

**A Run advances two ways.** Rush Hour accumulates passengers on elapsed time,
not on keystrokes, so there is a `tickRun` beside `stepRun`. Line Run and
Adventure return unchanged from it. Time still enters as a `now` parameter; the
engine owns no timer.

**This overrides the original design spec's `src/sim/` folder.** That spec put
Rush Hour's simulation in `src/sim/` separate from `src/engine/`. With one mode
module per mode, splitting them across two folders would make "where does a mode
live?" answerable only as "it depends". All three live in `src/engine/`, which
STATUS.md already describes as pure game logic.
