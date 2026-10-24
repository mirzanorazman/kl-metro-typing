# Dispatcher — playtest 2 checklist

What to try, what to look for, and the question each item answers. Branch
`feat/dispatcher`. Background is in `dispatcher-handover.md` ("Playtest 1");
this list replaces the playtest notes that lived in the plan's ledger, which
was deleted when the run finished.

Jot a word or two per item (fine / off / broken + why). Anything marked
**Decide** needs your call before the next round of work.

## Before you start

- [ ] `npm run dev`, then open Dispatcher from the home map.
- [ ] **Decide:** clear the Dispatcher leaderboard? It still holds Careers
      from the old 210 s Shift rules, so new scores sit beside old-rule ones.
      (Clearing is a one-liner; nothing has been reset.)
- [ ] For the full-size map: the dev-only URL `?dispatch=full` opens a Career
      with every Line served, at a busy moment.
- [ ] Try at least one session at tablet size (about 1024×768) as well as
      your normal window.

## 1. Playtest 1 fixes: did they land?

- [ ] **End Career asks first.** One click shows "End Career? Yes, end it /
      Keep playing", and reverts after 4 s. Also on the between-Shifts screen.
      *Known:* Enter and Space never answer it (on purpose), so keyboard-only
      players must click or wait it out. Acceptable?
- [ ] **Mistyped space.** Mistype the space in a fix like "Crowd control at
      Damai". The space should stay visible with the wrong-key mark. Also
      check once in Line Run.
- [ ] **Music after a missed Incident.** Let an Incident escalate. Once no
      Incident is active and no platform is over half full, the music should
      return to calm. *This fix was a guess at what you heard in playtest 1;
      tell us if the thing you noticed is still there.*
- [ ] **No unexplained sounds.** The Delivered chime now only plays with a
      visible "+N boarded / −M off" pop. Any sound you still can't place?

## 2. New things to judge

### Signal marks
- [ ] At the very start, is it now obvious what to do? (Red-lamp signal posts
      at each waiting train; the start tip mentions them.)
- [ ] Marks are small at the default zoom (lamp about 4.5 px). Big enough?

### Green wave
- [ ] Could you tell how it works without being told? There is no tip for
      it. (3, 6, 9, 12 clean names in a row clear 1, 2, 3, 4 waiting Signals
      on the Line you just cleared, nearest first.)
- [ ] Did you aim it on purpose (finishing the streak on a busy Line)?
- [ ] **Ripple timing.** About 0.4 s before the first mark flips, then 0.15 s
      between flips, then a 0.7 s fade. Too slow, too fast, satisfying?
- [ ] The pulse lines up with the farthest mark; nearer marks flip a little
      after it passes. Noticeable?
- [ ] Cleared marks stay red for up to ~0.8 s while their trains pull away.
      Confusing?
- [ ] Rewarding enough at your speed? (Survey: about 12 waves a Shift at
      90 WPM, 4 at 60, 2 at 40.)

### Passenger moments
- [ ] **Pops.** Do "+N boarded / −M off" pops make passengers feel present?
- [ ] A pop appears when the train *calls*, which lags the Clear if its
      platform is busy. Does that feel disconnected?
- [ ] At peak, more than 4 pops at once are dropped (your own Clears kept
      first), and pops can shift position as new ones arrive. Distracting?
- [ ] **Crowd surge fix.** The crowd drains ("N → M waiting, −K dispersed")
      with people walking off. Satisfying? Small fixes still show 4 people.
- [ ] **Shift cleared.** "N passengers moved this Shift · X% on time" shows as
      a line above the Expansion offers, not as a pause. Enough of a moment?

### Leaning in on an Incident
- [ ] While typing a fix: the map leans toward it, the Station glows, the
      screen edge pulses red. Does it feel urgent?
- [ ] On the small starting network the lean is barely visible (it has to
      keep every waiting train in view). It grows with the network. OK?

### Morning trains
- [ ] Trains now enter from the outer ends heading in. Does the morning feel
      like a flow into the city?
- [ ] Long Lines never get their full set of trains within a 90 s Shift.
      Does a long Line feel under-served?

## 3. The map at full size

Use `?dispatch=full`, or play until the network is large.

- [ ] Every waiting Signal's name readable, none hidden under the Incidents
      or typing panels (tested at 0 hidden, but check with 3–4 Incidents up).
- [ ] **Leader lines.** In the centre, some labels sit far from their train
      on long lines that cross each other. Can you still match a label to its
      train?
- [ ] **Dropped centre names.** Plain Station names in the crowded centre are
      hidden when nothing is happening there. Do you lose your bearings?
- [ ] **Shared track.** Ampang and Sri Petaling now run side by side through
      Sentul Timur–Chan Sow Lin, with a 1 px gap. Distinguishable?
- [ ] Monorail and the rest of the centre: still a tangle anywhere?
- [ ] At tablet size with the first-Career tip showing, the southern end of
      the Putrajaya Line can sit under the typing panel. Noticeable?

## 4. Balance and feel

Survey numbers (scripted typist, medians): 40 WPM lasts about 6 min,
60 WPM about 18–20 min, an inattentive 60 WPM typist about 7.5 min.

- [ ] **Shift length.** Is 90 s right now that everything else changed?
- [ ] **Your Career length** at your usual speed. Note your WPM and how long
      you lasted.
- [ ] **Incidents.** An Incident escalates after 17 s. Fair, or too harsh
      while you're still learning? Slow typists mostly lose to Incidents
      (15 of 20 at 40 WPM). Does that feel fair?
- [ ] **Where you lose.** Earlier rules lost players in the last seconds of
      the evening peak. Still happening?
- [ ] **Eras.** A new Era every 3 Shifts (about 4.5 min). Does the network
      growth feel paced well?
- [ ] **60 WPM split.** Careers either end between 9 and 20 min or seem to go
      on forever. Did a Career start to feel endless?
- [ ] **Gentler peaks.** Morning and evening flows were softened. Do peaks
      still feel like peaks?

## 5. Decisions waiting on you

- [ ] **Decide: the fast-player ceiling.** Above about 70 WPM a Career never
      ends: a Shift fails when 25% of the network is out of service, so each
      Expansion raises the bar, and the quiet suburbs it adds can't fill in
      90 s. Fixing it needs a rule change, for example:
      - a fixed (or demand-weighted) number of Stations out of service fails
        the Shift, instead of a share;
      - demand that keeps climbing every Shift, not only once the network is
        complete.
      Which direction, or something else?
- [ ] **Decide: the leaderboard reset** (above).
- [ ] **Decide: retire Rush Hour?** It's still playable. Retiring it is
      Task 12 of the first plan and waits on your go-ahead.
- [ ] **Decide: merge `feat/dispatcher`** into `main` after this playtest, or
      keep iterating on the branch?
