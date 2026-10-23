# Dispatcher execution record

Plan: `plans/2026-10-23-dispatcher.md`; design: `specs/2026-10-23-dispatcher-design.md`.

Implementation uses a fresh implementer per task, followed by spec and quality reviews.

## Workspace and interpretations

- Reuse the existing isolated Codex worktree. `feat/dispatcher` is checked out in the primary checkout, so this work uses `codex/dispatcher`, based on `76c8a1e` (the committed plan).
- `servedStations` returns sorted unique ids as its interface promises; tests check the starting range's route endpoint separately.
- New-Line Expansion sizes count the existing anchor in the 2–5 Station total, matching the design and acceptance test. Extensions add 2–5 Stations, clipped at the available end.
- Terminal turnaround replaces base dwell in the target Headway cycle. On very short shared ranges, initial placement and reinforcement defer trains that cannot safely circulate, potentially indefinitely. Physical block exclusivity takes precedence over reaching each Line's desired fleet size. A private wait-for-cycle guard prevents through trains and turnbacks closing a circular wait; reinforcement requires both terminal platform directions free.
- `heldTrains(net, s)` takes the network index to resolve numeric Train positions. Incident processing uses the ending time of the pending tick, keeping escalation and resulting simulation time aligned.
- Real names have complete-prefix collisions (Ampang/Ampang Park, Sentul/Sentul Timur, Glenmarie/Glenmarie 2, Subang/Subang Jaya). Pending user preference, use Enter to confirm an exact shorter name while longer matches remain; unique names still complete automatically. Confirmation will be an action in replay evidence, not a counted keystroke.
- Rush Hour remains playable. Task 12 requires the user's playtest and explicit retirement instruction.

## Task progress

- [x] 1. Balance constants, Served network, Eras and Expansions
- [x] 2. Trains, blocks and Signals
- [x] 3. Passengers, crowding, on-time and Out of service
- [x] 4. Incidents
- [x] 5. Targets and narrowing
- [x] 6. Career
- [ ] 7. Replay, judge and scripted typist
- [ ] 8. Leaderboard store, profile fields and vocabulary
- [ ] 9. Shift screen
- [ ] 10. Expansion screen, summary, tips and wiring
- [ ] 11. Balance pass and handover
- [ ] 12. Retire Rush Hour — awaits playtest and explicit user instruction

## Verification and review

- Baseline: `npm test` — 65 files passed; 743 tests passed, 1 opt-in survey skipped.
- Task 1: `a225c6c`; missing-module red observed, 14 network tests green, TypeScript check passed. Independent spec and quality reviews approved without findings.
- Task 2: `d4317c5` plus `33be372`; initial quality review caught a shared-track reinforcement deadlock. Fix has 26 simulation tests and 83 relevant tests passing, with red reproductions of full deadlock and reinforcement starvation. Spec and quality re-reviews approved; quality reviewer additionally swept 3,000 overlapping range combinations with phase fleet changes without a stalled surviving train.
- Task 3: `9149d89`; 49 simulation tests, full suite 806 passed / 1 skipped, TypeScript passed. Spec and quality approved. Quality probes checked 908 shared-track/OOS configurations and conserved 77,347 passengers over 75,000 ticks across 25 seeds, including clone determinism.
- Task 4: `9829c8e`; 9 Incident tests plus 49 simulation regressions passed; full suite 815 passed / 1 skipped and TypeScript passed. Spec and quality reviews approved without findings.
- Task 5: `e67c53d`; 32 targeting/express tests, 104 Dispatcher tests overall, TypeScript and whitespace checks passed. Spec and quality reviews approved, including exact-prefix confirmation and physical express circulation.
- Task 6: `46c3f29` plus regression `e5bf548`; 15 Career tests, 119 Dispatcher tests overall and TypeScript passed. Spec and quality approved. Quality probes covered batched/incremental time, three Shift transitions, typed Skip completions and deeply frozen inputs. Live metrics include the running sub-tick fraction, following Rush Hour; stopped metrics use exact game time.
