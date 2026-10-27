# Dispatcher — playtest 2 feedback tracker

The user's notes from playtest 2 (2026-10-24, branch `feat/dispatcher`), ranked
so that later sessions can take one item or one group at a time. Item numbers
(F1–F21) match the order of the original notes, so they stay stable when
priorities move.

**Where it stands (2026-10-27, Kuala Lumpur):** all P0s and the first-time-clarity group
are done (F1, F3, F6, F7, F18; F2, F5, F8, F9, F14, F17), and so are F20,
F22 and F27 (close camera on by default, with a development tuning panel).
F21 is set aside. F15/F4/F19 are implemented and verified, and so is F28
(tips close with Enter only). F23 (small bug), then F11 remain open.
`feat/dispatcher` was merged to `main` on 2026-10-27 at the user's request,
before playtest 3; see "Check in playtest 3" at the end.

**Merged (2026-10-27):** the close camera work (F27, F28) and Codex's
network reveal work (F15, F4, F19) were merged on `feat/dispatcher`
(`cdd8300`), then into `main`. Verified on the merged tree: TypeScript
passes, 85 suites with 1,238 tests pass (3 skipped), the Vite build passes
and has no dev camera panel in it. Seen live where the two meet: on a first
Career the reveal draws the served track in, then the lesson frames Jelatek
close, with only the served stretch painted.

**Verified (2026-10-27):** the user approved F15, F4 and F19 as one served-track
and network-reveal group. [Design](specs/2026-10-26-dispatcher-network-reveal-design.md)
and [eight-task implementation plan](plans/2026-10-26-dispatcher-network-reveal.md)
were implemented on `codex/dispatcher-network-reveal`, with separate spec and
quality reviews for Tasks 1–8. Whole-branch review of `f3879b3..0d68fd0`
passed with no findings. Full verification passed: 83 suites, 1,197 tests
and 2 skipped; TypeScript/Vite build and whitespace checks passed. Browser
verification found and fixed narrow Shift-bar growth/count overflow in
`9d98057`. See [observations, screenshots and limitations](dispatcher-network-reveal-verification.md).
Native audio, live reduced-motion toggling and real phone keyboard behavior
remain playtest checks; automated coverage is recorded separately. Decisions
and implemented improvements are tracked below. F11 and F23 stay separate.

The checklist this answers is `dispatcher-playtest-2-checklist.md`; the
background is in `dispatcher-handover.md`.

**How to use:** pick an item, read its context, settle any **Decide** line
with the user first, then do the work and set its status here
(`open` → `in progress` → `done <commit>`).

Sizes are rough: **S** is under an hour, **M** is a task, **L** needs its own
spec and plan.

## Summary

| # | Item | Pri | Size | Status | Depends on |
|---|---|---|---|---|---|
| F1 | No way back before the first Shift starts | P0 | S | done 42b595c | |
| F7 | Tense music keeps playing after an Incident is fixed | P0 | S–M | done 42b595c | |
| F18 | Backspace drops the whole name, typists expect one character | P0 | M | done 42b595c | |
| F3 | Ending a Career between Shifts never reaches the leaderboard | P0 | M | done 42b595c | |
| F6 | Colour the "Yes, end it" button | P0 | S | done 42b595c | |
| F8 | Guided first Shift: zoom to one Station, type, watch the train go | P1 | L | done a68225a (+ fixes to 3a2bf0f) | F5 |
| F5 | How to play toggle and walkthrough, as in Rush Hour | P1 | M | done d61b018 | |
| F2 | Home screen subtitle for Dispatcher (rename to Career?) | P1 | S | done d06af61 | |
| F14 | How to play explains why new trains appear | P1 | S | done 62d318a | F5 |
| F21 | Explain the thin line from a name to its train | P1 | S | set aside | F5 |
| F4 | Line Track transition on first entry | P1 | S–M | done ca689f1 | F15 |
| F20 | List of closed Stations during the Shift | P1 | M | done f6b446e..e5bed05 | |
| F17 | Show the network growing (Lines and Stations in service) | P1 | S–M | done fb732cc | |
| F15 | Paint a Line only as far as it is served | P1 | M | done d5dd5ca | |
| F9 | A sound for the Green wave | P1 | S | done a28dbf4 | |
| F11 | A real moment when a crowd surge is cleared | P1 | M | open | |
| F19 | Celebrate a new Line joining the network | P1 | M | done 0f5bf3a | F4, F15 |
| F22 | Tips point at the train they are about (bunching, late) | P1 | L | done d470e0a..2042dbd | |
| F23 | Tip card is trapped in the typing panel; panel text shows through | P1 | S | open | |
| F27 | The camera pulls in close for the lesson, tips and a fix being typed; on by default | P1 | M | done 1a9d6e5..7212d03 | |
| F28 | Tips close on any key, so a stray Station key skips one unread | P1 | S | done 6f3a628 | |
| F12 | Difficulty weighted by the player's WPM | P2 | L | open | checklist §5 ceiling decision |
| F16 | Repetition, unattended trains, what to prioritise | P2 | L | open | F12 |
| F10 | Combo spacing: every 3, or growing gaps (3, 7, 13)? | P2 | S | open | F12 |
| F13 | The full-size map (`?dispatch=full`) | Parked | L | parked | |
| F24 | Service gap trigger: count a pair only while its front train moves? | Parked | M | parked | F22 |
| F25 | "Reset train at" can name a Signal the train has passed | P2 | S | open | |
| F26 | Service gap card sits at the Station left behind but names the next Signal | P2 | S | watch in playtest | F22 |

**P0** is broken or blocks a normal session; do these next, roughly in this
order. **P1** is what a first-time player needs to understand and feel the
game. **P2** is balance and depth that needs a design talk before any code.

Playtest result worth keeping: 45 WPM, 96 %, 12 Shifts cleared, score 459,
51 Stations, 65 % on time. That matches the survey's 60 WPM typist
(12 Shifts). The fatal Shift was a cascade: a crowd surge closed Ara
Damansara, then 12 more Stations overflowed one after another. Green wave
ripple timing was rated excellent; leave it alone.

---

## P0: fix next

### F1. No way back before the first Shift starts

**Reported:** once on the Dispatcher screen, before typing anything, there is
no way back to the home map. Critical.

**Now:** in `ready`, Esc sends `pause`, which the engine refuses unless the
Career is `running` (`src/engine/dispatch.ts:225`). End Career is disabled
until `startedAt` is set (`src/ui/DispatcherScreen.tsx:570`). So the only exit
is reloading the page.

**Done:** until the first Shift's first key (`startedAt === null`), Esc and a
"Back to map" button (in End Career's place) call `onExit`. Waiting to start a
later Shift is mid-Career, so End Career stays there. `ConfirmEndButton` lost
its `disabled` prop. Phone layout not checked.

### F7. Tense music keeps playing after an Incident is fixed

**Reported:** after an Incident was cleared, the music carried on as if it
were still active. Playtest 1's fix (Task 3, `0fd9165`) did not settle it.

**Now:** the track is `rushTense` while `dispatchTense` holds
(`src/engine/dispatch.ts:281`): any Incident active **or any platform over
half full**. The track is picked in `src/ui/DispatcherScreen.tsx:403`.

**Likeliest cause:** the platform half of the rule. On a network of 30+
Stations at peak, some platform is nearly always over half full, so fixing
the Incident never brings calm. It was a guess in playtest 1 and it reads
as "the Incident music didn't stop".

**Diagnosed:** a scripted 60 WPM typist, seeds 1–3: with no Incident
active, crowding alone kept the music tense 35–46 % of running time; calm
played only 20–26 %. Even "a platform full and counting down to closure"
was 24–33 %.

**Done (user's call):** tense exactly while an Incident is active
(`dispatchTense`). Full platforms get no music cue; if they need one, it
belongs with F20 or F16.

### F18. Backspace drops the whole name

**Reported:** "Backspace to let go" is a trap. Typists reach for Backspace to
correct a typo, and lose everything they typed.

**Now:** Backspace sends `unlock` (`src/ui/DispatcherScreen.tsx:310`), which
clears the whole aim and sets `clean` back to true
(`src/engine/dispatch.ts:212`).

**Key fact:** a wrong key never enters the typed name (it is rejected and
stalls), so a plain one-letter delete would eat a correct letter.

**Done (user's calls):** "undo, never punish". The aim counts `misses`
(wrong keys since the last right one, replacing the `mistyped` flag).
Backspace swallows one miss at a time, then takes back one letter, keeping
the lock only while the shorter name still means one Station; taking back
the last letter (or pressing it with only a fix's lock) lets go
(`backspaceAim`). The stall is kept. A typo breaks the streak whatever
follows: Backspace no longer restores `clean`. The action is now
`backspace` (was `unlock`) and `DISPATCH_EVIDENCE_VERSION` is 2; v1
evidence is refused, which is fine because evidence is judged at once and
never stored. The Expansion picker's Backspace undoes the same way (Esc
still clears). Hint: "Backspace to undo".

### F3. Ending a Career between Shifts never reaches the leaderboard

**Reported:** if a player has cleared Shifts and chooses to stop, the Career
should still be saved to the leaderboard.

**Now:** only a failed Career is judged
(`src/ui/DispatcherScreen.tsx:443`, comment: "an abandoned one never reaches
the judge"). This matters more than it looks: above about 70 WPM a Career
never fails (checklist §5), so **a fast player can never post a score at
all.**

**Done (user's call: between Shifts only):** End Career on the Expansion
screen, or before the next Shift's first key, ends the Career as
`retired`: judged and offered the board like a failed one ("Career
retired"). Mid-Shift it stays `abandoned` and unranked. The confirm now says
which ("Your Career will be ranked." / "Mid-Shift, it won't be ranked.
Clear the Shift to keep your score."). Replay counts a retired Career as
complete. The checklist's "clear the leaderboard?" is still open.

### F6. Colour the "Yes, end it" button

**Reported:** the confirm flow is good, but the confirming button needs a
colour for clear UX.

**Done:** new `--danger` / `--on-danger` tokens (AA in both atmospheres);
"Yes, end it" is filled red, "Keep playing" stays neutral.

---

## P1: first-time clarity

These six overlap; F8 and F5 are the core, and F2, F14, F21 are text that
lives in them. Worth one spec for the group.

### F8. Guided first Shift

**Reported:** "Type a waiting Station's name" is still unclear at the very
start, even with signal marks and the start tip (checklist §2 "Signal
marks"). Idea: zoom into one Station on the KJ Line (e.g. Jelatek), show the
train and its red signal, the player types the name, the train moves on to
the next Station and its signal, type again, then zoom out to the Line and
start the Shift.

**Direction:** a short scripted lesson before Shift 1, shown on the first
Career only (`dispatchTipsSeen` in the profile already tracks seen tips).
Clock stopped, two Stations, camera fitted on them (`fitTo` / `fitKey` already
drive the camera). Then zoom out and start normally.
**Watch:** keep it outside the recorded Career, or before `startedAt`, so
replay and the judge never see it. Reachable again from How to play (F5).

**Done:** the first Career opens on a guided Shift (`dispatchLesson.ts`): one
train, nothing else running; the camera frames Jelatek, the player types it,
then Setiawangsa, then the view zooms out (cuts under reduced motion) and the
start caption shows on the ready screen. The lesson lives outside the recorded
Career.

Spec `specs/2026-10-24-dispatcher-onboarding-design.md`, plan
`plans/2026-10-24-dispatcher-onboarding.md`, run subagent-driven with a review
per task and a final review. The final review's fixes (fe61455..74e84af):

- a returning player (who has played a Career before) also gets the start
  caption after finishing or skipping the lesson;
- the lesson's train is never "late", so waiting on step 1 no longer adds an
  express "Sri Rampai" name that could strand the lesson;
- a finished lesson holds about 1.2 s so the second train is seen pulling away;
- no "Type a waiting Station's name" line while the train is moving, and no
  "+0 boarded" pop during the lesson.

Known rough edges, left for playtest 3 (also in the handover): the lesson's
frame is only about 2× tighter than the Shift's; the Jelatek and Dato'
Keramat labels overlap in it; the reduced-motion cut was not checked live.

### F5. How to play toggle and walkthrough

**Reported:** give Dispatcher the same How to play toggle and walkthrough as
Rush Hour.

**Now:** Dispatcher has one-off tips (`src/ui/dispatchTips.ts`); "How to
play" cannot reset them (handover, deferred minors of Task 10).

**Direction:** reuse Rush Hour's pattern. Pages: dispatch a train, Incidents
and fixes, the Green wave (no tip today, F9), new trains (F14), what the marks
and lines mean (F21), Shifts and Expansions, how a Shift fails. Include a
"replay the guided Shift" entry (F8).

**Done:** a How to play button on the ready screen (before a Shift starts)
replays the guided Shift and clears the seen tips, so each one shows again. It
reuses the tips rather than adding walkthrough pages.

### F2. Home screen subtitle (rename to Career?)

**Reported:** the home screen needs a line saying what Dispatcher is; should
the mode be called Career?

**Direction:** keep the mode name **Dispatcher** and add a subtitle, e.g.
"Run the network Shift by Shift: type Station names to send trains, fix
Incidents before they spread." In the domain language a Career is one
playthrough (End Career, Career over), so naming the mode Career makes
"start a new Career in Career" awkward.

**Done (user kept "Dispatcher"):** the home button reads "Run the network
Shift by Shift: type Station names to send trains, and fix Incidents before
they spread." Rush Hour has no subtitle yet and now looks bare beside it.

### F14. Why new trains appear

**Reported:** explain in How to play why trains spawn.
**Direction:** one How to play page: morning trains enter from the outer ends
heading into the city (Task 4), and more join as demand rises. Needs F5.

**Done:** a one-time `new-train` tip, shown the first time a train joins
mid-Shift (not for a new Shift's fresh fleet): "A new train has joined at the
end of the line. Trains join during the peaks until each line has its full
fleet; longer lines get more trains." It is replayed by How to play (F5).

### F21. What is the thin line on the train?

**Set aside by the user** (2026-10-24) before the onboarding spec; not part
of that work.

**Reported:** "What does the dotted line on the train indicate?"

**Probably:** the leader line (`.dispatch-leader`, `src/ui/dispatch.css:306`).
When a Station's name chip has to move away from its train to stay readable,
a thin grey line joins the chip to the train, as in the Muzium Negara
screenshot. Other dashed marks: a fix chip has a dashed red border
(`dispatch.css:311`), and between Shifts an offered Expansion's track is drawn
dashed. **Confirm** with the user which they saw, then explain it in How to
play, and perhaps make the leader line clearer (line colour, a dot at the
train end).

### F4. Line Track transition on first entry

**Reported (nice to have):** show the Line Track transition animation when
entering Dispatcher for the first time.
**Direction:** reuse the transition the other modes use on entry. Small if it
is a shared component.

**Done (`ca689f1`):** every normal new Career reveals its exact starting served
network for 1,000 ms before an owed lesson or the ready Shift. Early typing is
discarded without advancing the Career; lesson completion, Skip and How to play
do not replay entry. Reduced motion removes both animation and input wait.

### Planning group: served track and network reveals (F15, F19, F4)

**Why brainstorm first:** F15 defines the track that is actually in service;
F4 and F19 animate that same track at different moments. Agree on timing,
onboarding and Expansion feedback together before planning their shared
rendering changes. This group does not include F11's crowd-surge camera work.

**Agreed with the user (2026-10-26):** F4 plays on **every new Career**, before
the guided lesson when it is shown. The lesson and the entry reveal run in
sequence. Every Expansion draws its added stretch outward from the existing
network; the Line badge and chime are reserved for a Line joining for the
first time. **Ignore typing until the reveal finishes**: do not buffer or
forward those keys, and do not let them start the Shift clock. This overrides
the suggested cut-short-on-typing behavior.

**Approved design:** keep the complete network faded,
paint only served stretches and their Stations, reuse the existing draw-on
style for entry, and draw only the newly added stretch after an Expansion.
Reserve a Line badge and chime for the first time a Line joins; ordinary
extensions get the quieter draw. Alternatives considered: static served
track with badge-only Expansion feedback (less work, weaker sense of growth),
or a dedicated camera move and celebration screen (more work and interruption).

Entry takes 1,000 ms and an Expansion 800 ms, including Station pops. The
new-Line code/name notice sits above the typing prompt until the next Shift's
first accepted key; exit controls remain usable. Reduced motion immediately
settles the network and removes the input wait, retaining the notice and
optional sound. The user approved this design in chat. See the linked spec
and plan for geometry, lifecycle and verification details.

**Related improvements included in the plan** (unchecked means not implemented):

- [x] **F15 — exact served geometry:** use inclusive served-range endpoints;
  brighten only edges inside the range and Station marks/labels served by at
  least one active range. An Interchange must not light the unserved arms of
  its other Lines. Out-of-service Stations keep their closure marks; closure
  does not change the Career's served ranges.
- [x] **Shared-track alignment:** replaced the subset-ignoring local helper
  with shared Station-aware slicing of the full offset Line geometry. Partial
  track, dashed Expansion previews, trains and overlays now use the same lanes;
  shared SP preview/reveal alignment was also checked in the browser.
- [x] **Expansion difference and direction:** compare previous and next served
  ranges, rather than using `Expansion.added` (which counts only globally new
  Stations). A new Line on shared track can add zero Stations and still need
  its own reveal. Include the old endpoint so extensions join without a gap;
  reveal from the existing network toward the new far end in either direction.
- [x] **F17 — growth feedback:** coordinate the existing +Lines/+Stations
  counts with the reveal; only new Stations pop, and existing track and
  Interchanges should not replay their entrance. A complete-network Continue
  with no added track has no Expansion reveal.
- [x] **F4/F8/F5 — onboarding handoff:** the entry reveal precedes the guided
  lesson; finishing, skipping or replaying How to play must not accidentally
  replay the Career entrance. Ignore typing during the reveal (user's choice),
  without recording it or advancing the Career. Typing never skips the reveal;
  Back to map/End Career stay usable.
- [x] **F19 — readable and audible feedback:** show the new Line's code/name
  as well as colour; audio follows the sound preference and gesture unlock.
  The notice sits above the typing prompt until the next Shift starts.
- [x] **Reduced motion and lifecycle:** show the resulting served network
  immediately under reduced motion, with readable new-Line feedback; avoid
  replaying animations or sounds on ticks, camera changes or StrictMode effect
  re-runs. The typing gate lasts only as long as the reveal; under reduced
  motion there is no animation wait.
- [x] **Verification:** cover exact range boundaries, shared-track and
  zero-new-Station additions, extension in both directions, entry/lesson
  sequencing, no-op Continue, reduced motion and sound deduplication. Browser
  checks must cover reveal timing, lane alignment and panel/badge overlap;
  regression-check callers using whole-Line emphasis and the home entrance.

Verification results and the distinction between browser-observed and
automated-only checks are in the [verification record](dispatcher-network-reveal-verification.md).
The 390 px Shift-bar fix (`9d98057`) keeps every metric and +N delta visible,
with the closure gauge and Incidents below the enlarged header. Audible chime,
native reduced-motion and real device checks remain for playtest 3.

**Retimed (2026-10-28):** the user found the reveals laggy and not smooth.
Frame rate was not the cause (120 fps throughout, about 2 ms of React work a
frame during an Expansion). The reveals had reused the home map's hard
ease-out (`DRAW_EASE`), which suits seven lines drawn one after another: a
lone line was 55 % drawn by 100 ms, and 12 of Shift 1's 14 Stations popped
within 160 ms, then the line crawled. On an Expansion the camera's 500 ms
ease-in-out refit started with the draw, so the line was about 90 % drawn
before the camera really moved. Reveals now use `REVEAL_EASE`
(`cubic-bezier(0.45, 0, 0.55, 1)`, within 1 % of the camera's `easeInOut`),
and Station pops follow it. Measured live: on an Expansion the draw and the
camera stay within 5 points of each other (51 % and 46 % at 258 ms). On entry,
Stations pop steadily from about 80 ms to 750 ms. The typing block keeps its
1,000 ms and 800 ms, as the user asked.

**Implementation order agreed:** F15's served geometry, F4's entry reveal
and lesson handoff, then F19's Expansion reveal and new-Line celebration.
Keep presentation state outside Career evidence; these changes should not
need new engine actions or an evidence-version change. F23 remains a separate
open overlay defect; check it when verifying any new feedback near the panel.

## P1: feedback and stakes

### F20. List of closed Stations during the Shift

**Reported:** when a Station goes out of service there should be a list on
screen that builds up, so the panic builds slowly.

**Now:** the Incidents panel shows active Incidents only; closures show as an
X on the map (screenshot: Titiwangsa) and are listed only on the summary.

**Direction:** a "Closed" section under the Incidents panel, newest first,
with the cause, plus a count against the failure line ("3 closed · Shift
fails at 13"). Mind the chip layout: `usePanelRects` already measures the
panel, so a taller panel is accounted for.

**Brainstormed (2026-10-25):** nothing can be read mid-Shift, so it is not a
list. The user chose a closure gauge in the Shift bar (one slot per closure
the Shift can take, shown from the first closure, grey → amber → red) and a
stamp on the map for each closure. An Incident's card closes instead of
vanishing, a failed Shift holds 1.2 s before the summary, the red screen edge
stays for fixes only, and sound is additive. Spec
`specs/2026-10-25-dispatcher-closure-gauge-design.md`; mockups
https://claude.ai/artifact/4BfEfBopBTRhLjKh2bWzN1.

**Done:** a "Closed" gauge appears in the Shift bar at the first closure (one
slot per closure the Shift can take; grey, amber from 40 %, red from 75 %),
each closure stamps an X with a ring on the map for a second, a closing
Incident's card says "Out of service" for 1.5 s before it goes, and each
closure thuds, heavier in the red band. The tip that pauses at the first
closure holds the moment until it is dismissed. A failed Shift now holds
the play view 1.2 s (full gauge, the last stamp, the heaviest thud) before
its summary; the judge starts after the hold. Reduced motion keeps the hold,
colours and X but drops the pop, ring and scale-in. The gauge's last slot
is outlined in red so the failure line shows before it is reached. The Shift
bar layout was checked in headless Chrome with the real CSS and font: one
32 px line, clear of the Incidents panel, at 1024, 1280, 1440 and 1920 px
wide with 0, 4, 13 and 22 slots and a long phase label ("Shift 12", "Evening
peak · outbound", 6 Lines, 51 Stations); the bar is wider (68 rem) and
tightens at 1100 px and below so 22 slots stay at 3 px or more. Not seen
live: the animations (pop, ring, card), the thud, and phone width (unit
tested only).

### F17. Show the network growing

**Reported:** an indicator, during and after each Shift, of how many Lines
and Stations are in service, to show growth.
**Done:** the Shift bar counts Lines and Stations. After an Expansion each
count shows what it added ("+6", in signal green) until the next Shift's
first key, and the Shift-cleared screen says "Network: 1 Line · 14
Stations" above the offers. The reveal work now keeps deltas until the first
accepted key after the fixed reveal wait. Browser fixtures confirmed +1 Line
with zero new Stations, +Lines/+Stations together, and the phone-width layout
fix (`9d98057`); the exact 799 ms input/evidence boundary is integration-tested.

### F15. Paint a Line only as far as it is served

**Reported:** after an Expansion, the whole Line is painted. Only the served
stretch should be: in Shift 1 the KJ Line is painted up to Kerinchi and the
rest stays faded like other Lines.

**Now:** the map gets `emphasisSet={lines}`, whole Line ids
(`src/ui/DispatcherScreen.tsx:538`), while the served state is a stretch per
Line (`career.served`: line, from, to).

**Direction:** let `MapCanvas` take emphasised stretches instead of (or as
well as) whole Lines, and draw the unserved rest faded. Check the other
modes that pass `emphasisSet`. Pairs with F19: the newly served stretch can
animate in.

**Done (`d5dd5ca`):** `career.served` supplies inclusive bright ranges;
unserved tails and arms stay faded. Station marks and labels are bright only
when served by at least one range, while closure marks remain intact. Shared
track slices the original lane geometry. Browser Shift 1 showed 14 bright KJ
points through Kerinchi, with Universiti faded.

### F9. A sound for the Green wave

**Reported:** the wave works; a first-timer may miss that the combo caused
it. Add an audio cue when a wave fires. Ripple timing is excellent.
**Done:** `sound.wave`: a quick two-note lift as the wave fires, then one
rising note per cleared Signal, landing as each mark flips
(`waveNoteDelays`, from the ripple timing); under reduced motion the notes
come quickly in a row, since the marks turn at once. Not heard live yet.

### F11. A real moment when a crowd surge is cleared

**Reported:** clearing a crowd surge still needs more: zoom into the Station
while the player types, and something that shows the crowd is gone.

**Now:** the camera leans in while a fix is typed (Task 9), but on a small
network the lean is barely visible (checklist §2). The dispersal pop shows
"N → M waiting, −K dispersed" with walking people.

**Direction:** a stronger lean for fixes, holding about a second after the
clear, a crowd-burst animation, a "Crowd cleared" stamp and a sound. Keep
reduced motion still.

**Camera part done in F27** (behind the dev camera panel): the camera zooms
in on the Incident while its fix is typed and out when it clears. What is
left here is the burst, the stamp and the sound.

### F19. Celebrate a new Line joining

**Reported (nice to have):** when a new Line joins (e.g. the Kajang Line for
the first time), animations and sounds that celebrate it.
**Direction:** the new stretch draws in (`MapCanvas` already animates dashes
in), its Line badge pops, a chime. Depends on F15 for drawing only the new
stretch.

**Done (`0f5bf3a`):** accepted Expansions reveal only added edges for 800 ms;
new Lines add a code/name notice and one optional chime. Shared-track Lines
celebrate even with zero globally new Stations; extensions have no new-Line
notice or cue. The notice and growth counts clear on the next Shift's first
accepted key. Native audible sound remains unobserved; unlock/mute/scheduling
and deduplication are automated checks.

---

## P1: found after playtest 2 (2026-10-25)

### F22. Tips point at the train they are about

**Reported:** "Trains are bunching" is confusing: how does bunching show in
the game, and why would not clearing a train help? Same for the late-train
tip. "We still need to zoom into what train it is indicating."

**Now:** a bunched pair is two trains on the same Line and direction within
one block of each other (`bunchedTrains`, `BUNCH_BLOCKS = 1`); each gets a
thin dashed white ring (`.dispatch-bunch-ring`), easy to miss. A train is
late when the platform ahead has waited more than 1.5× the Line's target
headway (`isLate`, `LATE_FACTOR`); it then offers a second name, a Station
two ahead, to run express. The tips (`dispatchTips.ts`) are one sentence,
shown in a card with no link to the trains, and the map does not move.

**Direction:** the same idea as the guided first Shift (F8). While the tip
pauses the Career, the camera leans in on the trains it is about (the lean
used for Incidents, Task 9 of playtest 1, already does this) and those
trains pulse. The copy says what you are looking at and why it matters, in
game terms:

- Bunching: these two trains are right behind each other (the dashed
  outline). The second reaches platforms the first just emptied, while
  Stations behind them wait longer. Leaving it at its signal a moment
  spreads them out.
- Late: this train's next platform has waited too long. Type the farther
  Station on its chip to run it express and catch up.

Check the "why" against the sim before writing final copy (what bunching
actually costs: calls, on-time %, crowding). Consider the same pointing for
the Incident, out-of-service and new-train tips.

**Reshaped (2026-10-26):** measuring showed holding back does not pay in
today's rules, and the user judged that players in a frantic typing game
won't read numbers or refrain from typing. Bunching becomes a player-caused
**Service gap Incident** with a typed fix ("Hold at <Station>"), and the
bunching tip becomes a pointing Service gap tip; the late tip points too.
Spec: `specs/2026-10-26-dispatcher-service-gap-design.md`.

**Done:** a pair that stays bunched for 16 s (`GAP_TRIGGER_MS`) starts a
Service gap Incident on its rear train, with its own card and glyph. Its
place is the last Station the rear train called at. Typing "Hold at
<Station>" holds the rear train at that Signal for 6 s (`GAP_HOLD_MS`). The
Incident ends by itself if the pair breaks up, and unfixed it closes its
place like any Incident. The bunching tip is replaced by a Service gap tip,
and it and the late tip lean the camera in on their trains, which pulse
(a steady ring under reduced motion). `DISPATCH_EVIDENCE_VERSION` is 3. Survey
(100 seeds): 46 of 100 60 WPM Careers still run at the 30-minute cap,
against 48 before. By the mean, 40 and 60 WPM Careers are within 5 % of
before; by the median, 60 WPM is 12.5 % shorter (21.0 against 24.0 min),
outside the spec's "about 10 %", though that median is unstable because
about half those Careers hit the cap. A 60 WPM typist meets 1.59 Service
gaps a Shift (all gaps ÷ all Shifts played, 100 seeds), rising with the
network from 0.13 in Shifts 1–6 to 4.28 from Shift 13; 90 WPM meets fewer,
not more (0.51 against 1.57, 20 seeds). Service gaps barely crowd out random
Incidents (3.00 against 3.00 a Shift through Shift 12, 2.96 against 3.00
after). The hold experiment, rerun with Service gaps: holding the rear train
4 s or 8 s shows **no on-time gain** at 60 WPM (66 % throughout); failed
Careers were 2, 3, 5 of 8, which is inconclusive at this sample. Most
Service gaps form behind a leader that is itself waiting at its Signal (72 %
at 60 WPM), where holding the rear changes nothing. Numbers and reasons are
in `dispatcher-handover.md`, "Service gap balance". For the user: whether
the trigger should only count a pair whose leader is moving, so a Service
gap marks a rushed train rather than a backlog.

### F23. Tip card is trapped in the typing panel

**Seen in a screenshot (2026-10-25):** the tip card ("Trains are bunching…")
sits inside the typing panel, and the panel's own text shows through it
("Type a waiting Station's name", "End Career" behind "Got it").

**Likely cause:** `.dispatch-paused` is `position: fixed; inset: 0` with an
80 % paper backdrop, but it renders inside the panel, and the panel's
`backdrop-filter` makes it the containing block for fixed children. So the
"full-screen" overlay only covers the panel. The Pause dialog shares the
class and probably has the same problem.

**Direction:** render the tip and pause cards outside the panel (a portal,
or move them out of `PlayLayout`'s panel slot), or give the card its own
solid background. Pairs with F22: if the map is meant to stay visible behind
a pointing tip, the card should sit over the panel only, opaque.

### F27. The camera pulls in close when something matters

**Reported (2026-10-26, from measuring):** the camera never got closer in
Shifts 1–8. Every frame is floored at 200 layout units (`MIN_SPAN`, `fit.ts`)
and Shift 1's 14 Stations span 154 × 137, so the lesson, the tips and the fix
lean-in only panned. The user wants close views for the lesson, the train
tips and Incidents, closest early and easing to a lean as the network grows,
and wants to playtest whether that feels special or gets old.

Spec `specs/2026-10-26-dispatcher-close-camera-design.md`, plan
`plans/2026-10-26-dispatcher-close-camera.md`, run inline with one final
review.

**Done:** a dev-only camera panel (bottom left; development builds only, so
playtest 3 runs on `npm run dev`): a Close camera toggle, Early closeness (1–5×,
default 3× at 14 Stations or fewer), Late closeness (1–3×, default 1.2× at 40 or
more, linear between) and a readout of the closeness now. Settings stay in
browser storage. With it on, the lesson and the Service gap and late tips
frame close (`closeFrame`, through a new `MapCanvas` prop `fitView`), and
locking onto a fix zooms in on the Incident's place and its neighbours
(leaving the waiting trains out of the frame); clearing or Backspacing the
fix zooms straight out. A signal fault stays close through all its names.
Reduced motion keeps the camera still for tips and fixes; the lesson stays
close. Off, the camera is exactly as before.

**Amended 2026-10-27:** the first build held a close view for 1 s *after* a
fix landed and kept today's lean-in while typing. Playing it, the user saw
the zoom arrive after the fix and called it a bug: the intent was always
zoom in while typing, out on the clear. The hold and its slider are gone.
The new-train and out-of-service tips now point too (2026-10-27): the first
at the train that joined (it pulses), the second at the closed Station and
its neighbours. Like the Service gap and late tips, they lean in with the
close camera off and zoom close with it on. Seen live in Shift 1.

**On by default (2026-10-27):** the user played it and kept 3× early and
1.2× late. The close camera is now on in every build, production included,
with those numbers fixed there; the dev panel stays in development, where
Close camera can be switched off to compare.

Probe (`DISPATCH_PROBE=1 npx vitest run src/ui/dispatchCameraProbe.test.ts`,
60 WPM, seeds 1–5), zoom against the normal frame, median:

| Frame | Shifts 1–3 | Shifts 4–8 | Shift 9+ |
|---|---|---|---|
| Late tip, today → close | 1.00× → 2.79× | 1.02× → 2.17× | 1.44× → 1.20× |
| Service gap tip, today → close | 1.00× → 2.72× | 1.12× → 1.89× | 1.44× → 1.20× |
| Lean-in, today | 1.00× | 1.00× | 1.10× |
| Fix being typed, close camera | 3.00× | 1.82× | 1.20× |
| Lesson against Shift 1 | 1.00× → 3.00× | | |

**Worth knowing:** from Shift 9 the close camera at its 1.2× default frames
tips *wider* than today's (1.44×), because the close size comes from the
closeness, not the subject's own fit. Raise Late closeness if that feels
wrong. Seen live (1440 × 900): the lesson at 3× and 5×, a slider moving the
camera at once, a Station name typed right after clicking the panel, the
late tip on `?dispatch=full`. Not seen live: a Service gap tip (unit tested
only); the close view on a fix is checked live after the amendment.

### F28. Tips close with Enter only

**Reported (2026-10-27):** "Any key" dismissed a tip, and the user sometimes
typed a Station name into one and never saw it.

**Done (`6f3a628`):** a tip closes with Enter or a click on its button
("Enter Got it"); every other key is dropped while it shows. Rush Hour's tips
still close on any key (not asked for).

## P2: balance and depth (design talk first)

### F12. Difficulty weighted by the player's WPM

**Reported:** weigh difficulty on WPM: record the average WPM in the first
Shift and tune how many Incidents spawn from there, like the demand-weighted
idea. More to discuss.

**Context:** this is the open "fast-player ceiling" decision in checklist §5
(above about 70 WPM a Career never ends). The two ideas there: a fixed or
demand-weighted number of closures fails a Shift instead of a 25 % share,
and demand that keeps climbing every Shift.

**Points for the talk:**
- Base it on a rolling WPM (last Shift or two), not Shift 1 alone, or players
  learn to type slowly in Shift 1.
- WPM comes from the recorded keys, so replay and the judge can recompute it;
  the adaptive rule stays deterministic.
- Leaderboard fairness: if difficulty adapts, scores are no longer like for
  like. Show a tier on the board, or weight the score by difficulty.
- Suggestion: fix the ceiling with a rule change first (the closure rule or
  climbing demand), then add WPM weighting as a second layer on Incident
  rate. Rerun the probe survey after each.

### F16. Repetition, unattended trains, what to prioritise

At 45–60 WPM the user noticed three separate things. Split them when
picked up.

1. **Early repetition.** By Shift 3 the same few names repeat and Incidents
   clear quickly. Ideas: earlier or bigger Expansions for quick players (ties
   to F12), more varied Stations early.
2. **An unattended train costs nothing visible.** In Shift 7 a train at Sri
   Rampai sat undispatched unnoticed. The user wants that punished. Ideas: a
   chip that ages (amber, then red, then pulsing) with wait time; past a
   limit the platform behind it fills faster, or it becomes an Incident.
3. **Paralysis when it's busy.** With many chips and no Incidents, nothing
   says what matters most. Maybe by design, but an urgency cue (the ageing
   chip above, or a platform-fill tint) would help. Item 2's ageing chip may
   answer both.

### F10. Combo spacing

**Reported:** the Green wave fires every 3 clean names (3, 6, 9, …). Should
the gaps grow (3, 7, 13)?

**Now:** `COMBO_EVERY = 3` (`src/engine/dispatchBalance.ts:83`); waves clear
1, 2, 3, then 4 Signals. Survey: about 12 waves a Shift at 90 WPM, 4 at 60, 2
at 40.

**Trade-off:** growing gaps make later waves rarer and so narrow the gap
between fast and slow typists (helps the ceiling problem, F12), but long
streaks feel less rewarding unless the wave grows too. Every 3 is easy to
learn, which matters while there is no tip (F5). Settle with F12, then rerun
the survey; the code change itself is small.

---

## Parked

### F24. Service gap trigger: rushing or falling behind?

**Parked by the user (2026-10-26)** after F22 shipped, to decide after
playtesting it.

**The finding.** F22 was meant to teach "don't rush: not everything needs to
be fast". The shipped trigger counts any pair of trains that stays within one
block for `GAP_TRIGGER_MS` (16 s). Because every train waits at every Signal,
a pair that persists is mostly a front train the player has not cleared yet,
not a rear train sent too early:

- 72 % of 60 WPM Service gaps start with the front train also waiting at its
  Signal (a backlog, not rushing).
- 90 WPM players get fewer Service gaps than 60 WPM players.
- Holding the rear train back still does not pay: no on-time gain, and failed
  Careers 2, 3, 5 of 8 for no hold, 4 s and 8 s (inconclusive at 8 seeds).
- A random signal fault or train fault that holds a front train can also build
  a pair behind it, so the gap's tip can blame the player for an Incident.

The tip copy was made true in both cases ("…Type the fix to hold the second
one, or get the front one moving."), so nothing on screen is wrong today.

**The option on the table.** Count a pair only while its front train is
moving (running, or dwelling and about to leave), so only a rear train sent
too close behind a moving one starts the timer. That targets real rushing and
leaves Incident-held front trains out. It would need the survey and the hold
experiment rerun, and possibly the tip copy changed back toward "hold the
second one".

**Decide (after playtest):** keep the current trigger, switch to "front train
moving", or something else. Numbers: `dispatcher-handover.md`, Service gap
section.

### F25. "Reset train at" can name a Signal the train has passed

Found during F22 (pre-existing). A train fault's fix text and `strain()` use
`nextStationId`, which for a train already cleared through its Signal names
that Signal, not the next one. F22 fixed the same problem for Service gaps
with `nextSignalStationId`; the train fault should use it too. Small; check
that `strain()` should change as well.

### F26. Service gap card place vs fix text

The Service gap's fix chip sits at its `place` (the Station the pair left
behind, which closes if it escalates) but reads "Hold at <next Signal>", so
the map can show "Hold at Kampung Baru" beside KLCC. The spec allows it.
Watch in the playtest whether it confuses; if it does, move the chip to the
Signal named, or say both in the text.

### F13. The full-size map (`?dispatch=full`)

**Reported:** "Feels like a mess." Parked by the user for a later discussion.
Context for then: Task 10 and the final review fixes made it pass the
readability measures (no hidden chips, no chip overlaps, marks at least
6.25 px), so what's wrong is likely what the measures don't capture: long
leader lines crossing in the centre, dropped interchange names, shared track
1 px apart (checklist §3). Start the talk with screenshots at peak.

---

## Still open from the checklist

These checklist §5 decisions were not answered in this playtest:
clear the Dispatcher leaderboard (pair with F3) and retire Rush Hour (Task 12
of the first plan, gated). On merging: the user first chose to keep
`feat/dispatcher` as is until they had playtested the onboarding, then asked
for it to be merged to `main` on 2026-10-27, before playtest 3.

---

## Check in playtest 3

What changed since playtest 2, and what to look at. Clear the profile's
Dispatcher tips first (or press How to play) to see the lesson again.

- **The lesson (F8).** Is the start now obvious? Is the zoom close enough on
  Jelatek? Does the train's trip to the next signal feel too long? Does the
  pause after Setiawangsa feel right (meant to be about 1.2 s; measured
  slower in a hidden browser pane, so unconfirmed)?
- **How to play (F5).** Does replaying the lesson and the tips cover what
  you wanted from a walkthrough?
- **Tips.** The new start caption ("Every red signal on your Line…") and
  the new-train tip (F14): clear, and not too many interruptions?
  Tips now close with Enter only (or a click), not any key, so a Station
  name typed by mistake no longer skips one unread (2026-10-27). Does Enter
  feel natural?
- **P0 fixes.** Back to map before starting (F1); "Yes, end it" in red (F6);
  calm music once the last Incident is fixed (F7); Backspace undoes instead
  of letting go (F18); ending between Shifts reaches the leaderboard (F3).
- **Quick wins.** The home subtitle (F2); the Green wave sound (F9); the
  Lines and Stations counts and "+N" after an Expansion (F17).
- **Served track and reveals (F15/F4/F19), implemented and verified.** Is only
  the operated stretch bright? Does the one-second entry before the lesson
  feel worth its wait? Does every Expansion draw clearly outward, with a
  noticeable badge/chime for a new Line? Is ignoring typing during the
  800 ms Expansion reveal comfortable? Check shared track, growth counts,
  muted sound and reduced motion with no input wait.
- **Close camera (F27).** It is on by default now. On the dev server, switch
  Close camera off and on in the dev panel (bottom left) to compare. Does each close view draw your eye to the
  right thing, and does it still feel special by the tenth Incident, or does
  it get old? Tune Early and Late closeness with the sliders and note the
  values that feel right, and at how many Stations (the readout shows it).
  While you type a fix, does the close view help, or do you lose track of the
  Trains waiting elsewhere?
- **Closure gauge (F20).** Is the first closure noticed when it happens? Does a
  failed Shift now feel like it was coming? Is the gauge visible enough up in
  the Shift bar, given the eyes are on the chips and the Incidents panel?
  Should it be there from the start of the Shift instead of at the first
  closure? Also look at the thud, the pop and ring (and reduced motion), the
  1.2 s hold before the summary, and the gauge at phone width.
