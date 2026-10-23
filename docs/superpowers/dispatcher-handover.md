# Dispatcher — handover

## Resume here (updated after every task)

**Active plan:** `docs/superpowers/plans/2026-10-23-dispatcher.md`
(spec `docs/superpowers/specs/2026-10-23-dispatcher-design.md`), executed
subagent-driven on branch `feat/dispatcher`. Tasks 1–6 were run by a Codex
agent; their boxes are ticked and their record is
`docs/superpowers/2026-10-23-dispatcher-execution-record.md`. Tasks 7–11 are
done and committed but their plan boxes were left unticked; trust `git log`
and the ledger instead.

- **Last done:** Task 11, the balance pass and this handover. Seven constants
  changed in `src/engine/dispatchBalance.ts`; see "Balance" below.
- **Next:** The user playtests Dispatcher. Task 12 (retire Rush Hour) is
  **gated**: do not start it until the user has played Dispatcher and says to
  retire Rush Hour. Ask them. Rush Hour stays playable until then.
- **Deferred minors (each review said none blocks the branch):**
  - Task 7: the confirm replay test scans seeds for a Career that needs a
    confirm, so it depends on balance (widened in Task 11, below). No test that
    a failed Career with `endedAt + 1` replays `complete: false`. A forged
    Keylog's length is not capped before replay (same as Rush Hour). Test
    timeouts are 120–900 s against about 2.5 s actual. The typist's `unlock`
    path has no test.
  - Task 8: the `CONTEXT.md` Demand entry still says Rush Hour spawn weight
    (fix at Rush retirement), and its Run entry doesn't mention Career.
    `submitDispatchEntry` doesn't guard an empty trimmed name; the UI must.
  - Task 9: the fixed and cleared sound heuristics can misfire if the sim
    resolves something itself. Signal chips can cover nearby Station labels.
    The whole screen re-renders every tick. `PauseOverlay` duplicates Rush
    Hour's.
  - Task 10: the shield test's Space half passes without the shield, and its
    "keeps running" assertion is vacuous in jsdom. Board WPM and accuracy come
    from live metrics, not replay. Dismissing a tip resumes even if the window
    blurred meanwhile. The start tip is marked seen on keys the engine ignores.
    `DispatcherScreen` is about 430 lines; its tips and judging could be hooks.
    "How to play" can't reset Dispatcher tips. The double-submit test reaches
    the handler via `__reactProps$`, which is fragile on a React upgrade. The
    Enter shield covers buttons only, not links or `[role=button]`.

To resume in a fresh session: "Read `docs/superpowers/dispatcher-handover.md`
and continue the active plan subagent-driven." The controller's detailed
ledger is `.superpowers/sdd/2026-10-23-dispatcher/progress.md` (git-ignored;
if missing, trust this block and `git log`).

## Where things are

Engine, all pure, in `src/engine/`:

- `dispatchBalance.ts`: every tuning number.
- `dispatchNetwork.ts`: the Served network, Eras and Expansions.
- `dispatchSim.ts`: Trains, blocks, Signals, Passengers and Out of service.
- `dispatchIncidents.ts`: Incidents.
- `dispatchTargets.ts`: typing Targets and narrowing.
- `dispatch.ts`: the Career state machine (`startCareer`, `advanceCareer`,
  `enterDispatchCharacter`, `applyDispatchAction`).
- `dispatchJudge.ts`, with the Dispatcher section of `replay.ts`: replay and
  judging.
- `dispatchDrive.testutil.ts`: the scripted typist.

UI, in `src/ui/`: `DispatcherScreen.tsx`, `DispatchExpansion.tsx`,
`DispatchIncidents.tsx`, `DispatchSummary.tsx`, `dispatchTips.ts`,
`dispatch.css`. The leaderboard store is `src/data/dispatchBoardStore.ts`.

Keys while running:

- Typing narrows to a Target.
- Enter confirms an exact shorter name.
- Backspace releases the aim.
- Escape pauses. While paused, Enter or Space resumes.

## Balance

Run the survey with
`DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts`. It covers
seeds 1–5 at about 40, 60 and 90 WPM (300, 200 and 133 ms per key), with a
30-minute cap per Career.

Final survey (median of 5 seeds):

```
median of 5 seeds — shifts cleared / delivered / score / failure cause; columns 40, 60, 90 WPM
2c 520d 496pts [crowding x5]  |  3c 1177d 1122pts [crowding x5]  |  5c 2307d 2192pts [crowding x5]
```

Before Task 11 it was `1c 482d 460pts | 4c 1138d 1085pts | 6c 2422d 2301pts`.

The five-seed medians are noisy, so Task 11 also checked 80 seeds (1–80)
with a 60-minute cap, which shows the long tail:

| WPM | median | mean | IQR | fail Shift 1 | survive 60 min |
|---|---|---|---|---|---|
| 40 | 2 | 2.4 | 1–3 | 6/80 | 0/80 |
| 60 | 4 | 5.0 | 2–6 | 0/80 | 4/80 |
| 90 | 6 | 8.2 | 4–11 | 0/80 | 13/80 |

Targets: 40 WPM clears 2–3 Shifts and 90 WPM clears 6–8, within ±1. Both 80-seed
medians are in the band. On the five-seed survey, 40 WPM is in the band and
90 WPM is at 5, one under it but within ±1. For comparison, the old constants
on seeds 41–80 gave 4 / 7 / 9, with 15 of 40 runs at 90 WPM surviving
60 minutes. The old five-seed numbers didn't represent the old balance either.

Constants changed (old → new):

| Constant | Old | New |
|---|---|---|
| `TRAIN_CAPACITY` | 60 | 100 |
| `PLATFORM_CAPACITY` | 80 | 55 |
| `OOS_CROWD_MS` | 20 000 | 45 000 |
| `PASSENGER_RATE` | 0.105 | 0.097 |
| `INCIDENTS_PER_MINUTE` | 1.5 | 2 |
| `INCIDENT_FIRST_MS` | 20 000 | 10 000 |
| `INCIDENT_LIMIT_MS` | 40 000 | 35 000 |

Why each change:

- **Train capacity.** The old hubs were limited by Trains, not typing. Even a
  200 WPM typist overflowed KL Sentral in Shift 1, so speed barely mattered.
  Bigger Trains drain a hub when the player keeps up.
- **Platform capacity and crowd time.** A smaller platform with a longer
  full-time limit means:
  - a hub that a Train visits now and then survives;
  - a Station nobody serves still closes;
  - a hub starved by a backlog of Signals closes.

  This made WPM matter more than the Shift's random draws.
- **Passenger rate.** Rebalances the level after the other changes.
- **Incidents.** Incidents start earlier, come more often and escalate
  sooner. Neglect now fails faster and for a named Incident. They also add
  typing load, which slower typists feel most.

**Midday Signal load at 60 WPM:** 0.43 of capacity from Signals alone. With
Incident fix texts it is about 0.53, which meets the "about half" target. The
calculation:

- Measured in Shift 1 Midday, with the 60 WPM typist driving, over 5 seeds:
  53 Signals in 250 s, or 0.212 Signals/s. The mean name is 10.09 characters.
- 0.212 × 10.09 / 5 characters per second = 0.43.
- Incident fix texts add about 0.11.
- It is unchanged from before Task 11, because no constant that sets Train
  count or block timing moved.
- With the 90 WPM typist driving (Signals cleared sooner) the same measure is
  0.49.
- By Shift 3 the 60 WPM Midday load is about 0.70 from Signals, because Signal
  load grows with the network.

**Failure causes.** The scripted typist's failures are all `crowding`:
223 of 223 failed Careers across the 80-seed check, with the other 17 still
running at 60 minutes. They all fall in the Evening peak, between 166 s and
210 s of the 210 s Shift. The typist never lets
an Incident escalate, because it fixes any Incident older than half the limit.
Incident-caused failures come from neglect instead:

- An untouched Shift fails 14 times in 16 by an Incident. With the old
  constants it was 2 in 25, and 2 more were cleared outright.
- An untouched Shift 1 now fails at 126 s by an Incident; it used to last
  169–182 s.
- Later untouched Shifts fail at 126–186 s.
- With the old constants, an untouched Shift 9 (35–42 Stations) was cleared
  outright.

## Leans left for playtesting

- **90 WPM, five-seed survey:** 5, one under the band. The 80-seed median is
  6.
- **60 WPM sits low:** five-seed 3, 80-seed 4. That is only one or two Shifts
  above 40 WPM.
- **A long tail of Careers that never fail.** At 60 minutes, 13 of 80 runs at
  90 WPM and 4 of 80 at 60 WPM were still running. Late networks ease off
  because:
  - Out of service needs 25 % of served Stations, so with 35+ Stations that
    is 9 or more.
  - Most Stations added late are demand-1 suburbs that can't fill in one
    Shift.
  - Hubs on several Lines get more Trains.

  Constants can't fix this without hurting the early game. Lowering
  `OOS_FAIL_SHARE` to 0.2, tried at several passenger rates, cut 90 WPM to a
  median of 3–4 and 40 WPM to 0–1. It needs a logic change, such as:
  - a fixed or demand-weighted fail count;
  - per-Shift escalation before the network is full (`FULL_NETWORK_ESCALATION`
    only starts once every Station is served).
- **Failures cluster in the Evening peak.** Every scripted failure falls in
  its last 45 s, and 90 % fall in the last 22 s (median 204 s of 210 s). Expect "lost with 10 s to go"
  often. Shortening or softening the Evening peak in `SHIFT_PHASES` is
  the lever if that feels cruel.
- **Shift 1 at 40 WPM:** 6 of 80 Careers fail it. The spec wants the first
  Shift winnable on the first try, with tips.
- **Incidents arrive from 10 s.** The first one is around 30 s into Shift 1,
  which may be early for someone still reading the start tip.
- **The scripted typist never ignores an Incident**, so the survey doesn't show
  how a human who misses one fares. Watch for this in playtest.

## Gotchas found

- **Balance is chaotic at the edge.**
  - At the old constants, `PASSENGER_RATE` 0.095 against 0.105 flipped 40 WPM
    from surviving an hour in most seeds to failing Shift 2.
  - Neighbouring settings swing the five-seed median by 2–3 Shifts.
  - Judge a change on at least 20 seeds, and over 60 minutes, not only the
    30-minute survey.
  - The survey's 30-minute cap stops at about 8 cleared Shifts, so it hides
    Careers that never fail.
- **A fast tuning loop.** Copy `src` and the config files into a few scratch
  directories, symlink `node_modules`, and run vitest in each in parallel with
  a rewritten `dispatchBalance.ts`. 8 configurations × 20 seeds takes about
  40 s. The temporary probe isn't committed.
- **The 25 % fail share counts Stations, not demand.** See the late-game lean
  above.
- **Two tests depended on balance.** Task 11 adjusted both:
  - `dispatchReplay.test.ts`, "confirm actions replay": no seed in 1–12 needed
    a confirm any more. Names that prefix another name only meet in larger,
    later networks. It now scans seeds 1–25 with a 60-minute cap. Its intent is
    unchanged: a driven Career with a confirm replays identically.
  - `Dispatcher.test.tsx`, "a live failed Career is judged once…": the
    neglected seed-7 Career now fails from a signal fault, not crowding. The
    summary assertion now expects that sentence.

  The other replay tests (seed 3 at 60 WPM must fail within 30 minutes) still
  pass unchanged.

## Deviations from the spec made during implementation

Decided during Tasks 1–6, as recorded in the execution record:

- **Station order.** `servedStations` returns sorted unique ids, as its
  interface promises. Tests check the starting range's route endpoints
  separately.
- **Expansion size.**
  - A new-Line Expansion counts the existing anchor in its 2–5 Stations.
  - Extensions add 2–5 Stations, clipped at the available end.
- **Headway and fleet size.**
  - Terminal turnaround replaces base dwell in the target Headway cycle.
  - On very short shared ranges, placing and reinforcing Trains defers any
    Train that can't circulate safely, possibly forever. Exclusive physical
    blocks take precedence over a Line's desired fleet size.
  - A private wait-for-cycle guard stops through Trains and turnbacks from
    closing a circular wait.
  - Reinforcement needs both terminal platform directions free.
- **Engine plumbing.** `heldTrains(net, s)` takes the network index to resolve
  numeric Train positions. Incident processing uses the ending time of the
  pending tick, so escalation and sim time stay aligned.
- **Enter-to-confirm.** Real names include complete-prefix pairs: Ampang and
  Ampang Park, Sentul and Sentul Timur, Glenmarie and Glenmarie 2, Subang and
  Subang Jaya.
  - **Enter confirms an exact shorter name** while longer matches remain.
    Unique names still complete on their last letter.
  - Confirmation is a logged `confirm` action in replay evidence, not a counted
    keystroke. An Enter that confirms nothing costs nothing.
  - Confirmed by the user on 2026-10-23.
- **Where the work ran.** It began in a Codex worktree on `codex/dispatcher`
  and moved to `feat/dispatcher` after Task 6 (fast-forward to `c9799de`).
- **Rush Hour stays playable** until the user's playtest and explicit
  instruction (Task 12).

Rulings made by the controller for Tasks 7–10 (in the ledger):

- **Confirm in the typist and the picker.** The scripted typist sends `confirm`
  when its chosen name is fully typed but a longer candidate still matches. The
  Expansion picker uses the same Enter rule, and clicking always works.
- **Enter on the Shift screen.** Enter maps to `confirm` while running and
  still resumes while paused. Game keys never fire a focused button, so Enter
  can't abandon a Career by accident.
- **Sounds.** The Clear and fix sound plays independently of the Delivered
  chime.
- **Top bar.** It shows Career totals for Delivered and on-time %. The spec
  says "Delivered so far", which is ambiguous.
- **Extra tests for the leaderboard path:**
  - the live screen's recorded evidence replays;
  - a Career that expands and then fails replays complete;
  - a double submit is guarded.

From Task 11:

- **Balance results.**
  - The five-seed survey has 90 WPM one under the band.
  - The late-game tail of Careers that never fail is left for a logic change,
    after playtest.
  - Every failure has a named cause in the summary. Neglect fails by Incident;
    a player who keeps typing fails by crowding.
