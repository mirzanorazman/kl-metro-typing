# Dispatcher — playtest 2 feedback tracker

The user's notes from playtest 2 (2026-10-24, branch `feat/dispatcher`), ranked
so that later sessions can take one item or one group at a time. The P0 items are
done, in the same commit that added this file; the rest are open. Item numbers (F1–F21) match the order of the original notes, so
they stay stable when priorities move.

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
| F1 | No way back before the first Shift starts | P0 | S | done | |
| F7 | Tense music keeps playing after an Incident is fixed | P0 | S–M | done | |
| F18 | Backspace drops the whole name, typists expect one character | P0 | M | done | |
| F3 | Ending a Career between Shifts never reaches the leaderboard | P0 | M | done | |
| F6 | Colour the "Yes, end it" button | P0 | S | done | |
| F8 | Guided first Shift: zoom to one Station, type, watch the train go | P1 | L | open | F5 |
| F5 | How to play toggle and walkthrough, as in Rush Hour | P1 | M | open | |
| F2 | Home screen subtitle for Dispatcher (rename to Career?) | P1 | S | open | |
| F14 | How to play explains why new trains appear | P1 | S | open | F5 |
| F21 | Explain the thin line from a name to its train | P1 | S | open | F5 |
| F4 | Line Track transition on first entry | P1 | S–M | open | |
| F20 | List of closed Stations during the Shift | P1 | M | open | |
| F17 | Show the network growing (Lines and Stations in service) | P1 | S–M | open | |
| F15 | Paint a Line only as far as it is served | P1 | M | open | |
| F9 | A sound for the Green wave | P1 | S | open | |
| F11 | A real moment when a crowd surge is cleared | P1 | M | open | |
| F19 | Celebrate a new Line joining the network | P1 | M | open | F4, F15 |
| F12 | Difficulty weighted by the player's WPM | P2 | L | open | checklist §5 ceiling decision |
| F16 | Repetition, unattended trains, what to prioritise | P2 | L | open | F12 |
| F10 | Combo spacing: every 3, or growing gaps (3, 7, 13)? | P2 | S | open | F12 |
| F13 | The full-size map (`?dispatch=full`) | Parked | L | parked | |

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

### F5. How to play toggle and walkthrough

**Reported:** give Dispatcher the same How to play toggle and walkthrough as
Rush Hour.

**Now:** Dispatcher has one-off tips (`src/ui/dispatchTips.ts`); "How to
play" cannot reset them (handover, deferred minors of Task 10).

**Direction:** reuse Rush Hour's pattern. Pages: dispatch a train, Incidents
and fixes, the Green wave (no tip today, F9), new trains (F14), what the marks
and lines mean (F21), Shifts and Expansions, how a Shift fails. Include a
"replay the guided Shift" entry (F8).

### F2. Home screen subtitle (rename to Career?)

**Reported:** the home screen needs a line saying what Dispatcher is; should
the mode be called Career?

**Direction:** keep the mode name **Dispatcher** and add a subtitle, e.g.
"Run the network Shift by Shift: type Station names to send trains, fix
Incidents before they spread." In the domain language a Career is one
playthrough (End Career, Career over), so naming the mode Career makes
"start a new Career in Career" awkward. **Decide** with the user.

### F14. Why new trains appear

**Reported:** explain in How to play why trains spawn.
**Direction:** one How to play page: morning trains enter from the outer ends
heading into the city (Task 4), and more join as demand rises. Needs F5.

### F21. What is the thin line on the train?

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

### F17. Show the network growing

**Reported:** an indicator, during and after each Shift, of how many Lines
and Stations are in service, to show growth.
**Direction:** "4 Lines · 51 Stations" in the Shift bar, and on Shift
cleared, the change ("+1 Line, +6 Stations"). The summary already shows the
Station count.

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
**Direction:** a short rising sting on `waves` increasing, maybe one tick per
cleared signal in step with the ripple. Add to `src/audio/sound.ts`.

### F11. A real moment when a crowd surge is cleared

**Reported:** clearing a crowd surge still needs more: zoom into the Station
while the player types, and something that shows the crowd is gone.

**Now:** the camera leans in while a fix is typed (Task 9), but on a small
network the lean is barely visible (checklist §2). The dispersal pop shows
"N → M waiting, −K dispersed" with walking people.

**Direction:** a stronger lean for fixes, holding about a second after the
clear, a crowd-burst animation, a "Crowd cleared" stamp and a sound. Keep
reduced motion still.

### F19. Celebrate a new Line joining

**Reported (nice to have):** when a new Line joins (e.g. the Kajang Line for
the first time), animations and sounds that celebrate it.
**Direction:** the new stretch draws in (`MapCanvas` already animates dashes
in), its Line badge pops, a chime. Depends on F15 for drawing only the new
stretch.

---

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
clear the Dispatcher leaderboard (pair with F3), retire Rush Hour (Task 12 of
the first plan, gated), and merge `feat/dispatcher` into `main` or keep
iterating.
