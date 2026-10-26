# Dispatcher — playtest 2 feedback tracker

The user's notes from playtest 2 (2026-10-24, branch `feat/dispatcher`), ranked
so that later sessions can take one item or one group at a time. Item numbers
(F1–F21) match the order of the original notes, so they stay stable when
priorities move.

**Where it stands (2026-10-26):** all P0s and the first-time-clarity group
are done (F1, F3, F6, F7, F18; F2, F5, F8, F9, F14, F17), and so are F20, F22 and F27 (the
close camera, behind a dev panel). F21 is set aside. F4, F15 and F19 are with another agent.
Next up: F23 (small bug), then F11. The branch is kept as is (not merged) until
the user has playtested the onboarding; see "Check in playtest 3" at the end.

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
| F4 | Line Track transition on first entry | P1 | S–M | open | |
| F20 | List of closed Stations during the Shift | P1 | M | done f6b446e..e5bed05 | |
| F17 | Show the network growing (Lines and Stations in service) | P1 | S–M | done fb732cc | |
| F15 | Paint a Line only as far as it is served | P1 | M | open | |
| F9 | A sound for the Green wave | P1 | S | done a28dbf4 | |
| F11 | A real moment when a crowd surge is cleared | P1 | M | open | |
| F19 | Celebrate a new Line joining the network | P1 | M | open | F4, F15 |
| F22 | Tips point at the train they are about (bunching, late) | P1 | L | done d470e0a..2042dbd | |
| F23 | Tip card is trapped in the typing panel; panel text shows through | P1 | S | open | |
| F27 | The camera pulls in close for the lesson, train tips and a cleared fix (dev panel) | P1 | M | done 1a9d6e5..1f79255 | |
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
Stations" above the offers. Not seen live after a real Expansion (unit
tested only).

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

**Camera part done in F27** (behind the dev camera panel): the close hold
after a fix lands. What is left here is the burst, the stamp and the sound.

### F19. Celebrate a new Line joining

**Reported (nice to have):** when a new Line joins (e.g. the Kajang Line for
the first time), animations and sounds that celebrate it.
**Direction:** the new stretch draws in (`MapCanvas` already animates dashes
in), its Line badge pops, a chime. Depends on F15 for drawing only the new
stretch.

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
more, linear between), Hold after a fix (0–3 s, default 1 s) and a readout of
the closeness now. Settings stay in browser storage. With it on, the lesson
and the Service gap and late tips frame close (`closeFrame`, through a new
`MapCanvas` prop `fitView`), and when a typed fix clears an Incident the
camera holds close on its place for the hold time. Typing a fix keeps
today's lean-in; locking onto another fix ends a hold. Reduced motion keeps
the camera still for tips and the hold; the lesson stays close. Off, the
camera is exactly as before.

Probe (`DISPATCH_PROBE=1 npx vitest run src/ui/dispatchCameraProbe.test.ts`,
60 WPM, seeds 1–5), zoom against the normal frame, median:

| Frame | Shifts 1–3 | Shifts 4–8 | Shift 9+ |
|---|---|---|---|
| Late tip, today → close | 1.00× → 2.79× | 1.02× → 2.17× | 1.44× → 1.20× |
| Service gap tip, today → close | 1.00× → 2.72× | 1.12× → 1.89× | 1.44× → 1.20× |
| Lean-in (unchanged) | 1.00× | 1.00× | 1.10× |
| Hold after a fix (new) | 2.79× | 2.24× | 1.20× |
| Lesson against Shift 1 | 1.00× → 3.00× | | |

**Worth knowing:** from Shift 9 the close camera at its 1.2× default frames
tips *wider* than today's (1.44×), because the close size comes from the
closeness, not the subject's own fit. Raise Late closeness if that feels
wrong. Seen live (1440 × 900): the lesson at 3× and 5×, a slider moving the
camera at once, a Station name typed right after clicking the panel, the
late tip on `?dispatch=full`. Not seen live: a Service gap tip and a cleared
fix's hold (unit tested only).

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
of the first plan, gated). On merging: the user chose to keep
`feat/dispatcher` as is until they have playtested the onboarding.

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
- **P0 fixes.** Back to map before starting (F1); "Yes, end it" in red (F6);
  calm music once the last Incident is fixed (F7); Backspace undoes instead
  of letting go (F18); ending between Shifts reaches the leaderboard (F3).
- **Quick wins.** The home subtitle (F2); the Green wave sound (F9); the
  Lines and Stations counts and "+N" after an Expansion (F17).
- **Close camera (F27).** On the dev server, switch Close camera on and off
  in the dev panel (bottom left). Does each close view draw your eye to the
  right thing, and does it still feel special by the tenth Incident, or does
  it get old? Tune Early and Late closeness with the sliders and note the
  values that feel right, and at how many Stations (the readout shows it).
  After a fix lands, is the close hold a reward or a distraction while other
  Trains wait? Try a few hold times.
- **Closure gauge (F20).** Is the first closure noticed when it happens? Does a
  failed Shift now feel like it was coming? Is the gauge visible enough up in
  the Shift bar, given the eyes are on the chips and the Incidents panel?
  Should it be there from the start of the Shift instead of at the first
  closure? Also look at the thud, the pop and ring (and reduced motion), the
  1.2 s hold before the summary, and the gauge at phone width.
