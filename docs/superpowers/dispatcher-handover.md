# Dispatcher — handover

## Resume here (updated after every task)

**Active plan (2026-10-26, implementation started):**
[`2026-10-26-dispatcher-network-reveal.md`](plans/2026-10-26-dispatcher-network-reveal.md),
with [approved design](specs/2026-10-26-dispatcher-network-reveal-design.md).
Eight tasks cover F15 exact served track, F4 entry before the lesson on every
new Career, then F19 Expansion reveals and new-Line badge/chime. Planning branch
`codex/dispatcher-network-reveal`, based on `feat/dispatcher` at `64e0d4d`.
Tasks 1–4 are implemented and have passed spec and quality review; Task 5
(the UI deadline controller) is in progress. Commits: `7e1902a`, `d5dd5ca`,
`36a9ceb`, `075b6f7`, `8e74f29`. The last fixes an entrance/partial-reveal
Station-pop precedence finding from spec review. Baseline: 79 suites, 1,132 tests passed (2 skipped).
The user chose **ignore typing until
the reveal finishes**, without buffering or recording it: 1,000 ms entry,
800 ms Expansion, no wait under reduced motion. F17 counts, shared-track lanes,
zero-new-Station additions and onboarding handoff are included; F11 and F23 are
separate. The feedback tracker links the plan and tracks related improvements.

**Previous implementation plan:** `docs/superpowers/plans/2026-10-24-dispatcher-playtest-1.md`
(spec `docs/superpowers/specs/2026-10-24-dispatcher-playtest-1-design.md`,
which amends `2026-10-23-dispatcher-design.md`), executed subagent-driven on
branch `feat/dispatcher`. All 11 tasks are done; see "Playtest 1" below. The
first plan (`2026-10-23-dispatcher.md`) is done too, apart from its gated
Task 12.

- **Last done:** the onboarding plan
  (`docs/superpowers/plans/2026-10-24-dispatcher-onboarding.md`, spec
  `docs/superpowers/specs/2026-10-24-dispatcher-onboarding-design.md`): F8
  guided first Shift, F5 How to play, F14 new-train tip, and its final
  review's fixes (the lesson's train is never late, the start caption follows
  the lesson for returning players, a 1.2 s hold on finishing, no idle prompt
  or passenger pops during the lesson).
- **Next:** Playtest 2 is done; its feedback is ranked in
  `docs/superpowers/dispatcher-playtest-2-feedback.md` (F1–F21). The P0 items
  (F1, F3, F6, F7, F18) are done, and so is the onboarding group (F8 guided
  first Shift, F5 How to play, F14 new-train tip, with F2). The remaining P1s
  are F15, F11, F19, F4 and F23 (F20 and F22 are done; F21 is set aside).
  F15/F4/F19 now have the approved plan linked above. Note F18 bumped
  `DISPATCH_EVIDENCE_VERSION` to 2, and F22's Service gap Incident (see
  "Service gap balance" below) bumped it to 3. The checklist it answers is
  `docs/superpowers/dispatcher-playtest-2-checklist.md`. The 90 WPM ceiling is
  the open design question. Task 12 of the first plan
  (retire Rush Hour) is still **gated**: do not start it until the user says
  to retire Rush Hour.
- **Deferred minors from the first plan (each review said none blocks the branch):**
  - Task 7: the confirm replay test scans seeds for a Career that needs a
    confirm, so it depends on balance (widened in Task 11, below). No test that
    a failed Career with `endedAt + 1` replays `complete: false`. A forged
    Keylog's length is not capped before replay (same as Rush Hour). Test
    timeouts are 120–900 s against about 2.5 s actual. The typist's `unlock`
    path has no test.
  - Task 8: the `CONTEXT.md` Demand entry still says Rush Hour spawn weight
    (fix at Rush retirement). (Its Run entry now mentions Career.)
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
    The double-submit test reaches
    the handler via `__reactProps$`, which is fragile on a React upgrade. The
    Enter shield covers buttons only, not links or `[role=button]`.
- **Onboarding (plan 2026-10-24), deferred minors:** lesson completion
  detects "any train left its signal" (valid with its one train);
  `startLesson` relies on `startCareer`'s gameMs 0; `inLesson.current` is
  written during render; the lesson's served/lines memos duplicate the
  Career's, with eslint-disable; no tests for no music or clock during the
  lesson, Esc during 'moving', or the hook's rAF advance; How to play tests
  don't assert it is there before the first key or gone during the lesson;
  the new-train copy "during the peaks" is slightly loose (a midday join is
  possible below 0.6 of the fleet); the new-train tip can pause on tick 1
  when an opener is blocked; the lesson frame is only about 2× tighter than
  the Shift frame; Jelatek and Dato' Keramat labels overlap in the lesson
  frame; the reduced-motion cut is not checked live.

To resume in a fresh session: "Read `docs/superpowers/dispatcher-handover.md`
and continue the active plan subagent-driven." The controller's detailed
ledger is `.superpowers/sdd/2026-10-23-dispatcher/progress.md` (git-ignored;
if missing, trust this block and `git log`).

## Playtest 1

The user's first playtest asked for a 90-second Shift, a confirm on End
Career, a combo, livelier passengers and a readable full map. The plan
`docs/superpowers/plans/2026-10-24-dispatcher-playtest-1.md` did it in 11
tasks, one commit each:

| Task | Commit | What changed |
|---|---|---|
| 1 | `c5c4e3f` | The user's 90 s `SHIFT_PHASES` (Morning peak 35 s, Midday 20 s, Evening peak 35 s), with the failure clocks provisionally rescaled. |
| 2 | `d50ee9a` | End Career asks "End Career?" first and reverts after 4 s. The Shift keeps running. |
| 3 | `0fd9165` | A mistyped space stays visible. Music calms once no Incident is active and no platform is over half full. The stray delivered chime is gone. |
| 4 | `15bb30f` | Morning trains enter from the outer ends, spaced target Headway / ends apart per end. At ready, the first train per outer end already waits at a Signal. |
| 5 | `bfa9e30` | The Green wave: every 3rd clean completion in a row clears up to 1, 2, 3, then 4 waiting Signals on that Line, nearest first. The streak carries across Shifts. |
| 6 | `2df92bc` | Each call records its exchange. A fixed crowd surge's extra passengers disperse. |
| 7 | `9e16670` | Signal marks at each waiting train, and the Green wave ripple. |
| 8 | `6524d45` | Passenger pops at each call and the dispersal moment. |
| 9 | `282193a` | The camera leans in while you type an Incident's fix. |
| 10 | `3d60077` | The map stays readable at full size (spec B6). |
| 11 | this commit | Realistic survey typists and the balance for the 90 s Shift. |

### B6 outcome (Task 10)

Acceptance was met after approach 4. On the full network at peak:
0 chip overlaps, 7.32 px smallest mark and 0 stacked at 1440×900; 0, 6.25 px
and 0 at 1024×768. Check two things in playtest: long leader lines that cross
in the centre, and plain interchange names dropped in the centre.

### Final review fixes

The whole-branch review found five things, fixed after Task 11:

1. **Chips under the panels.** Signal and fix chips could land under the
   Incidents panel, the typing panel or the top bar, or past the screen's
   edge. `MapCanvas` now hands its overlay the live view, the measured screen
   and the lane geometry (`OverlayView`). The Dispatcher measures its panels
   after every render, before paint, and on resize (`usePanelRects`, so a
   growing Incidents list counts at once), and `overlayFrame` turns them into
   layout units. `layoutChips` keeps every chip on the visible map and out
   from under the panels (`placeLabels`' new `within` and `hard`), and tries
   farther rings, out to 28× the gap. `measureReadability` counts a hidden
   chip as an overlap, using `dispatchPanels`, a model of the panels' CSS
   measured in the browser (91 px a card, 162/184 px typing panel).
   Before → after, with the same measure:
   - Seeds 1–6, 60 s flowing, 5–40 s held (48 states a size): states with a
     hidden chip 23 → 0 at 1024×768 and 2 → 0 at 1440×900; chip-on-chip 0.
   - Seed 2, 90 s + 40 s: 2 chip-on-chip → 0 at 1440×900; 4 hidden + 2
     chip-on-chip → 0 at 1024×768.
   - The same peak with 3 Incident cards: 1 → 0 at 1440×900, 13 hidden → 0
     at 1024×768. With 4: 1 hidden + 3 chip-on-chip → 0, and 14 hidden + 3
     chip-on-chip → 0.
   The acceptance test runs all five peaks at both sizes. Watch in playtest:
   with a tall Incidents panel some chips sit far out on long leader lines.
2. **Pops under chips.** Exchange pops are laid out after the chips
   (`layoutPops`, through `placeLabels` with the chips as obstacles), so they
   yield to them; chips stay drawn on top. Every pop still shows.
3. **Urgent edge behind dialogs.** `data-urgent` is set only while the Career
   is running and no tip shows.
4. **Green wave pulse between the lanes.** The pulse and a held stretch now
   follow their Line's own lane on shared track, as the map draws it.
5. **Skip-stop waves.** A replay test drives a typist that takes every
   express skip (`skips` in `dispatchDrive.testutil.ts`) and checks a wave
   fired by a Skip-stop starts from the skipped train's Line and Station, and
   that the Career replays equal.

### Survey typists (Task 11)

The scripted typist in `dispatchDrive.testutil.ts` now plays like a person:

- **Accuracy.** Each typist has one. A key is a typo with probability
  1 − accuracy, from a seeded stream.
- **Wave aiming.** When its streak is one short of a multiple of
  `COMBO_EVERY`, it prefers a Target on the Line with the most waiting
  Signals. An urgent fix still comes first.
- **Inattentive.** With `inattentive: true` it ignores a fix Target until the
  Incident is older than 0.75 × `INCIDENT_LIMIT_MS`.

The survey typists are 40 WPM at 94 %, 60 WPM at 96 % and 90 WPM at 98 %,
plus an inattentive 60 WPM at 96 %.

### Final survey

Run it with `DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts`.
Medians of seeds 1–5, with a 30-minute cap. A cause is the first closure of
the failed Shift; `running` means the Career was still going at the cap.

| Typist | Career | Shifts cleared | Waves | First closure, seeds 1–5 |
|---|---|---|---|---|
| 40 WPM, 94 % | 6.0 min | 3 | 6 | crowd surge, crowding, crowd surge, crowd surge, signal fault |
| 60 WPM, 96 % | 19.5 min | 12 | 56 | crowding, crowding, running, running, crowding |
| 90 WPM, 98 % | 29.9 min (cap) | 19 | 222 | running ×5 |
| 60 WPM, 96 %, inattentive | 7.5 min | 4 | 19 | signal fault ×2, crowd surge ×3 |

Before Task 11 (Tasks 1–10's constants, same typists): 40 WPM 9.0 min,
60 WPM 29.9 min, 90 WPM 29.9 min, inattentive 4.3 min.

Over seeds 1–20 the final constants give 40 WPM a median of 6.0 min
(quartiles 4.5–7.5) and 60 WPM 18.0 min (quartiles 12–30+). No 40 or 60 WPM
Career fails Shift 1. An Incident starts the collapse in 15 of 20 Careers at
40 WPM, 3 of 20 at 60 WPM and 20 of 20 inattentive ones.

The targets, and where they stand:

- **40 WPM lasts 5–8 minutes.** Met: 6.0 min.
- **Shift 1 is winnable by a new player.** Met: every seed at 40 and 60 WPM
  clears it.
- **Some failures are Incident-caused.** Met. Slow and inattentive typists
  mostly lose to an Incident; 60 WPM mostly to crowding.
- **An Era every 3–5 minutes.** Met: `SHIFTS_PER_ERA` 3 is about 4.5 minutes.
- **90 WPM lasts 15–25 minutes.** Not met. Every 90 WPM Career is still
  running at 30 minutes, and at 60 minutes too. The test for it is
  `it.fails` in `dispatchProbe.test.ts`, so it flags when a change meets it.

Constants changed in Task 11 (old → new):

| Constant | Old | New | Why |
|---|---|---|---|
| `STATIONS_PER_TRAIN` | 5 | 4 | More trains per Line (the starting stretch gets 4, not 3). With 5 and the other new values, a 300 WPM test typist (40 ms a key) still lost a Career to crowding, and 90 WPM lost one in Shift 4. With 4, losses come from typing. |
| `PASSENGER_RATE` | 0.19 | 0.25 | Brings failure back once the network has more trains. It is cliff-like: 0.24 left 60 WPM surviving 30 min on most seeds. |
| `CENTRAL_PULL` | 3 | 2 | At 3, with the other new values, the Evening peak overflowed the central hubs (Masjid Jamek, KL Sentral, KLCC) whatever the player typed: a 300 WPM test typist (40 ms a key) lost 3 of 5 Careers, and 90 WPM lost all 5 by 7.5 min. At 2 the 300 WPM typist survives all 5, so every loss is down to the player. |
| `INCIDENT_LIMIT_MS` | 21 000 | 17 000 | Back below `OOS_CROWD_MS` (19 000). At 16 000 the 40 WPM median was 5.2 min over 20 seeds; at 18 000, 60 WPM rarely failed. |
| `SHIFTS_PER_ERA` | 2 | 3 | An Era every ~4.5 minutes rather than every 3. |

Kept: `OOS_CROWD_MS` 19 000, `INCIDENT_FIRST_MS` 4 000 and
`INCIDENTS_PER_MINUTE` 2. A per-minute rate needs no rescaling for a shorter
Shift: 2.25 cut 40 WPM to 4.5 min, and 1.75 removed most Incident failures.
No entry-spacing constant was added. A share of 0.25–0.5 of Headway / ends
didn't move the 90 WPM result, and it made trains enter almost at once,
which undoes Task 4's spread. `SHIFT_PHASES`, `COMBO_EVERY` and
`COMBO_MAX_WAVE` are the user's and were not touched.

### Leans for the next playtest

- **A ceiling around 70 WPM.** Above it a Career doesn't end. At 60 minutes,
  90 WPM at 98 % was running on all 5 seeds, and 75 WPM at 96 % on 4 of 5.
  The Green wave isn't the cause: with a 16 s Incident limit, 90 WPM at 94 %
  (far fewer waves) also ran on all 5. The first plan's handover found the same tail,
  and the shorter Shift sharpens it:
  - A Shift fails at 25 % of served Stations Out of service, so the bar
    rises with every Expansion.
  - Most late Stations are demand-1 suburbs. Unserved, one gathers about
    45 passengers in a 90 s Shift, under `PLATFORM_CAPACITY` 55, so it can
    never close by crowding.
  - Bigger networks are therefore *easier* per closure needed. Bigger
    Expansions (3–8 Stations) made 60 WPM survive longer, not shorter.
  - `FULL_NETWORK_ESCALATION` never starts, because the network never fills
    within an hour. Constants that make suburbs fillable make the early hubs
    overflow for any typist instead.

  It needs a logic change, such as per-Shift escalation before the network is
  full, or a fail count weighted by demand.
- **60 WPM splits in two.** It fails between 9 and 20 minutes, or doesn't
  fail at all (2 of 5 survey seeds). Once a Career gets past Shift 10 it
  rarely ends.
- **Balance is cliff-like.** `PASSENGER_RATE` 0.24 against 0.25, or
  `INCIDENT_LIMIT_MS` 16 s against 18 s, moves the 60 WPM median by 15
  minutes. Expect play to feel different from the survey numbers.
- **Neglect is punished fast.** The inattentive typist loses in a median of
  5–7.5 minutes, always to an Incident. A 17 s limit is short for someone
  still reading the start tip.
- **Slow typists lose mostly to Incidents** (15 of 20 at 40 WPM). Fix texts
  compete with the Signals. Check whether that feels fair.
- **The Green wave is mostly a fast typist's tool.** It fires about 12 times
  a Shift at 90 WPM, 4 at 60 WPM and 2 at 40 WPM.
- **Gentler peaks.** `CENTRAL_PULL` 2 makes the morning flow out of the
  suburbs, and the evening flow out of the centre, less steep.
- **Long Lines still never get their full fleet** within a 90 s Shift
  (Task 4).
- **Map readability:** leader lines crossing in the centre and dropped centre
  names (B6, above). Task 7–9's playtest notes (ripple timing, pop lag and
  eviction, the subtle lean-in, small marks) are in
  `dispatcher-playtest-2-checklist.md`; the plan's ledger was deleted at the
  end of the run.

## Service gap balance (F22, 2026-10-26)

Spec `specs/2026-10-26-dispatcher-service-gap-design.md`, plan
`plans/2026-10-26-dispatcher-service-gap.md`. A bunched pair that stays a pair
for `GAP_TRIGGER_MS` starts a Service gap Incident on its rear train; typing
"Hold at <Station>" holds that train for `GAP_HOLD_MS`.
`DISPATCH_EVIDENCE_VERSION` is 3 (Service gap Incidents), so Careers recorded
under version 2 would replay differently.

The Service gap and late tips ship with final copy, not the spec's drafts.
The Service gap tip no longer says the player sent the trains too close or
that the Station has no train coming, since most gaps form behind a waiting
leader; it says the Station behind waits longer, and offers holding the
second train or getting the front one moving. Both tips frame their
Stations with their Served neighbours, as the fix lean-in does.

**How Service gaps per Shift are counted here:** all Service gaps divided by
all Shifts played, pooled over the seeds (the Shift a Career ended or stopped
in counts as played). Where a table shows another figure, it says so. The
probe prints a different one, the median over seeds of each Career's own
rate. It can read very differently: at 60 WPM it reads much lower, because
a few long Careers hold most of the gaps.

| Constant | Start | Tuned | Why |
|---|---|---|---|
| `GAP_TRIGGER_MS` | 6 000 | 16 000 | At 6 s, 60 WPM Careers were about 11 % shorter (mean, 20 seeds) and a 60 WPM typist met 2.35 Service gaps a Shift (20 seeds). At 16 s the rate is 1.58 a Shift (40 seeds; 1.59 over 100) and 60 WPM Careers stay close to before (below). |
| `GAP_HOLD_MS` | 6 000 | 6 000 | 3, 6 and 9 s give the same Career lengths and gap rates within noise. |

### Survey with Service gaps

Seeds 1–5, 30-minute cap. The probe's own column is the median per Career;
the pooled rate is beside it.

| Typist | Career | Shifts cleared | Waves | Service gaps per Shift, pooled | Probe's median per Career | First closure, seeds 1–5 | Career before |
|---|---|---|---|---|---|---|---|
| 40 WPM, 94 % | 6.0 min | 3 | 6 | 0.39 | 0.25 | crowd surge, crowding, crowd surge, crowd surge, signal fault | 6.0 min |
| 60 WPM, 96 % | 15.0 min | 9 | 40 | 1.36 | 0.33 | crowding, crowding, crowd surge, running, crowding | 19.5 min |
| 90 WPM, 98 % | 29.9 min (cap) | 19 | 217 | 0.49 | 0.55 | running, crowding, running ×3 | 29.9 min (cap) |
| 60 WPM, 96 %, inattentive | 6.0 min | 3 | 13 | 0.15 | 0.20 | signal fault ×2, crowd surge ×2, train fault | 7.5 min |

The probe's medians make 90 WPM look busier than 60 WPM (0.55 against 0.33).
That is an artefact of five seeds and of the median: at 60 WPM one seed that
ran to the cap had 60 of the 75 Service gaps, and the median skips it. Pooled,
the same five seeds give 1.36 at 60 WPM and 0.49 at 90 WPM. Trust the 20-seed
comparison below, not the probe row.

With Service gaps turned off the probe reproduces the "Final survey" table
above exactly. The five-seed 60 WPM drop (19.5 to 15.0 min) is noise:
any gap or hold shifts train timings, so the random Incidents land elsewhere
and each seed's Career reshuffles. At a 20 s trigger seed 5 still drops from
15.0 to 13.5 min with only 1 Service gap in it. Judge on many seeds. Over
seeds 1–100 (40 and 60 WPM, hold 6 s):

| Trigger | 40 WPM mean / median | 60 WPM mean / median | 60 WPM running at 30 min | Service gaps per Shift, 40 / 60 WPM |
|---|---|---|---|---|
| none | 6.5 / 6.0 min | 22.0 / 24.0 min | 48 of 100 | — |
| 10 s | 6.2 / 6.0 min | 20.1 / 19.5 min | 35 | 0.79 / 2.19 |
| 12 s | 6.4 / 6.0 min | 20.9 / 21.0 min | 40 | 0.76 / 2.04 |
| 14 s | 6.6 / 6.0 min | 20.5 / 19.5 min | 35 | 0.67 / 1.66 |
| **16 s** | **6.2 / 6.0 min** | **21.4 / 21.0 min** | **46** | **0.44 / 1.59** |
| 20 s | 6.2 / 6.0 min | 21.7 / 22.5 min | 45 | 0.29 / 1.20 |

The steadiest signal is how many 60 WPM Careers are still running at the
30-minute cap: 48 of 100 with no Service gaps, 46 at 16 s. By the mean,
Careers are within 5 % of before (40 WPM 6.2 against 6.5 min, −5 %; 60 WPM
21.4 against 22.0, −3 %). By the median, 40 WPM is unchanged (6.0) but
60 WPM is 21.0 against 24.0 min, −12.5 %, which is outside the spec's "about
10 %". The 60 WPM median is unstable: about half of those Careers hit the
30-minute cap, so the median sits on the edge of that pile-up and jumps a
Shift (1.5 min) when one or two seeds move. 16 s was chosen over 20 s
because both keep Careers as before (46 and 45 of 100 running at the cap),
and 16 s keeps more Service gaps (1.59 against 1.20 a Shift at 60 WPM), which
the player needs to meet for the Incident to teach anything.

The rate climbs with the network. At 16 s and 60 WPM (seeds 1–100, per Shift
played in each band): 0.13 a Shift in Shifts 1–6, 1.25 in Shifts 7–12, 4.28
from Shift 13. The probe's balance assertions all pass unchanged. Two tests
moved with the trigger: the "waits for a free slot" Service gap test now
dates its three blocking Incidents so that none escalates during the longer
wait, and "waves replay" is back on seed 2 (Task 1 had moved it to seed 3,
which now runs to the 30-minute cap).

**Do Service gaps crowd out random Incidents?** Barely. The random spawner
adds nothing to its budget while all `INCIDENT_MAX` slots are taken, and a
Service gap takes a slot. Measured over seeds 1–100 at 60 WPM (30-minute cap;
throwaway probe, not committed), random Incidents per Shift played, with
Service gaps / without: Shifts 1–6 3.00 / 3.00, Shifts 7–12 3.00 / 3.00,
Shift 13 on 2.96 / 3.00 (per completed Shift 2.98 / 3.00). Only 8 of 329
completed Shifts from Shift 13 on lost one random Incident, and none before.
Seeds 1–20 alone read the same (3.00, 3.00, 2.96 against 3.00 throughout).
All three slots are full 2.9 % of the running time with Service gaps, never
without. It stays small because a Shift's budget comes to just under 4
Incidents (about 3.99 before the full-network escalation), so a Shift spawns
3 unless more than about one Incident's worth of budget is lost.

What the survey found:

- **Service gaps do not lengthen Careers.** Task 1 saw one 60 WPM seed
  (seed 2, 0.99 accuracy) go from failing at about 12 min to still running
  at the 30-minute cap of the "waves replay" test, with a 6 s trigger; seed
  1 moved the other way. That is the reshuffle above, not a trend: at 16 s
  seed 2 fails at 12.0 min again. Short triggers shorten 60 WPM Careers a
  little (−9 % mean at 10 s): more Stations close to unfixed gaps (192 in
  100 Careers at 10 s, 99 at 16 s), and the fixes cost keys.
- **90 WPM gets fewer Service gaps than 60 WPM, not more.** Seeds 1–20,
  Service gaps per Shift at 60 / 90 WPM: 6 s 2.35 / 1.51, 10 s 2.27 / 0.94,
  16 s 1.57 / 0.51. The median per Career says the same (1.64 / 1.50,
  1.00 / 0.90, 1.10 / 0.55). At the same Shift number 90 WPM sees 0.1–0.4 a
  completed Shift until Shift 14. The spec's "more at 90 WPM" is not met at
  any setting tried.
- **Service gaps mostly mark a backlog, not a rush.** When one starts at
  60 WPM, both trains are waiting at their Signals 72 % of the time (90 WPM:
  49 %), and 76 % of all trains are waiting. A train queued behind a waiting
  leader is a pair, whoever typed what. Holding the rear does not break such
  a pair; clearing the leader does. The scripted typist always clears the
  longest-waiting train first, so it rarely rushes a rear train after its
  leader; a human who types the nearest name might.

### The hold experiment, again

The experiment from the spec's Why section, with Service gaps in the rules: a
throwaway copy of the scripted typist skips the rear train of a pair
(`pairedRears`) until it has waited 4 s or 8 s. Seeds 1–8, 15-minute cap.
Delivered per minute and on-time % are pooled over the 8 Careers.

| Rules | Typist | Hold | Median Career | Delivered / min | On time | Failed |
|---|---|---|---|---|---|---|
| No Service gaps | 60 WPM | 0 | 14.9 min | 45.0 | 66.3 % | 2 of 8 |
| | | 4 s | 14.9 min | 46.7 | 66.3 % | 3 of 8 |
| | | 8 s | 11.2 min | 50.8 | 66.8 % | 5 of 8 |
| | 90 WPM | 0 / 4 / 8 s | 15.0 min | 98.1 / 98.3 / 98.3 | 66.3 / 66.3 / 65.9 % | 0 of 8 |
| Service gaps, 16 s | 60 WPM | 0 | 14.9 min | 44.1 | 66.2 % | 2 of 8 |
| | | 4 s | 14.9 min | 46.8 | 66.4 % | 3 of 8 |
| | | 8 s | 11.2 min | 50.5 | 66.4 % | 5 of 8 |
| | 90 WPM | 0 / 4 / 8 s | 15.0 min | 98.6 / 97.1 / 97.8 | 66.6 / 66.2 / 66.0 % | 0 of 8 |
| Service gaps, 6 s | 60 WPM | 0 | 14.9 min | 45.7 | 66.8 % | 2 of 8 |
| | | 4 s | 13.4 min | 47.4 | 66.1 % | 4 of 8 |
| | | 8 s | 12.7 min | 47.4 | 66.7 % | 4 of 8 |
| | 90 WPM | 0 / 4 / 8 s | 15.0 / 14.9 / 14.9 min | 96.6 / 97.4 / 96.3 | 66.5 / 65.8 / 66.0 % | 0 of 8 |

**Holding shows no gain at 60 WPM.** On-time % does not move (66–67 % in
every row). Failed Careers were 2, 3 and 5 of 8 for no hold, 4 s and 8 s
(at a 6 s trigger, 2, 4 and 4); with no Service gaps the same 2, 3, 5. That
is inconclusive at 8 seeds, not a trend: it says holding does not help, not
that it hurts. Delivered per minute rises, but over shorter Careers. Holding
by hand cuts the Service gaps (0.48 to 0.24 a Shift at 16 s; at 6 s, only
1.44 to 1.19; Service gaps ÷ Shifts played, pooled over the 8 seeds), but
they were too rare in a 15-minute Career, and too often formed behind a
waiting leader, to change the outcome. A Service gap now makes
bunching visible and gives it a typed fix, but in today's rules leaving a
rear train waiting is still not a winning strategy for the scripted typist.
This is for the user to decide on, not something to tune.

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

This section is the first plan's balance for the 210 s Shift. It is
superseded by "Playtest 1" above, and kept for its history and reasoning.

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
    neglected seed-7 Career now fails from Incidents, not crowding. Since the
    final review the summary names the first closure, so the assertion expects
    "Shift 1 ended: it started when Masjid Jamek went out of service after a
    train fault was left unfixed."

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

## Final review changes

The final whole-branch review found five issues. Each was fixed test-first on
`feat/dispatcher`:

1. **The summary names what started the collapse.** `Failure` was
   `{ shift, station, cause }` for the *last* Station to close. The spec says
   the summary names "the Incident, Bunching or crowding that started it". It
   is now `{ shift, closures }`: every closure of the failed Shift, in order,
   each with its cause. `failureText` leads with the first ("Shift 3 ended: it
   started when Masjid Jamek went out of service after a signal fault was left
   unfixed."), and the summary lists every closure with `closureText`.
   `Failure` is built only from `sim.oosOrder` and `sim.outOfService`, so
   Replay stays deterministic. The crowding wording is now "because its
   platform overflowed".
2. **The Keylog holds a long Career.** `DISPATCH_KEYLOG_MAX_EVENTS` went from
   60,000 to 200,000, over five hours at 120 WPM. At 60,000 a 120 WPM player
   truncated at about 108 minutes, and an honest Career was then recorded as an
   integrity fail. Appending one key at the ceiling measured about 0.5 ms (the
   log is copied per key). The judge now waits for the summary to paint (a
   frame, then a task), and the summary says "Checking your Career…" until the
   judgement arrives.
3. **Each Incident kind has its own glyph:** a signal head for a signal fault,
   a Train front for a train fault and a crowd of three for a crowd surge
   (`src/render/incidentGlyphs.ts`). They appear on the map, on a paper badge,
   and on the Incident cards. Before, every kind drew the same triangle.
4. **End Career between Shifts.** The Expansion screen now has an End Career
   button. It abandons the Career, which `applyDispatchAction` already allowed
   in `'between'`.
5. **The wrong-key stall shows.** The engine rule is unchanged: keys inside the
   500 ms stall are dropped. While `gameMs < aim.stallUntil` the typing line
   now dims, carries `data-stalled="true"` and shows a "Wait…" status with a
   draining bar. Under reduced motion the bar holds still.

