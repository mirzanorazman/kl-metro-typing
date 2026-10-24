# Dispatcher — feeling closures build up: the closure gauge and stamps

**Date:** 2026-10-25
**Status:** Brainstormed with the user and agreed in chat. Not yet planned.
**Covers:** playtest 2 item F20 ("list of closed Stations during the Shift"). See `docs/superpowers/dispatcher-playtest-2-feedback.md`.
**Amends:** `2026-10-23-dispatcher-design.md`. Vocabulary follows `CONTEXT.md`.
**Branch:** `feat/dispatcher`.
**Mockups:** https://claude.ai/artifact/4BfEfBopBTRhLjKh2bWzN1 (options B and C are the chosen ones; A was not picked, and B's red screen edge was dropped).

## Why

In playtest 2 the user did not notice any Station closing until the Shift had already failed. The failure came as a surprise. The user doesn't expect to be able to undo a closure ("it is the consequences of the game"); they want to see the end coming.

How it should feel, in the user's words: the first few closures are just "oh, that closed"; as they build up and cascade, the player should feel an impending "uh-oh".

Two facts from the code explain the surprise:

- When an Incident's Station goes Out of service, its card is filtered out of the Incidents panel (`src/ui/DispatchIncidents.tsx`, `sim.incidents.filter(... !sim.outOfService[inc.place])`). The panel the player watches makes it look as if the problem went away.
- A closure has no sound and no moment. The only mark is a small X on the map (`src/render/DispatchOverlay.tsx`, `.dispatch-oos`), and nothing says how close the Shift is to failing.

Success: in playtest 3, the user notices the first closure as it happens, and when a Shift fails they saw it coming.

## What the player looks at

The user's attention while playing is on the name chips and the Incidents panel, and on the typing. Sounds catch their attention, but some players play with sound off, so **sound is only ever additive**: everything must work silently.

The original note asked for "a list on screen that builds up". The user clarified that nothing can be read mid-Shift; what they want is the building up. So nothing in this design needs to be read while playing. The readable list of closures stays on the failed-Shift summary, where it already is.

## Goals

- Every closure is noticed as it happens, without the player having to look away from typing for long.
- How close the Shift is to failing can be judged at a glance, by length and colour, not by reading.
- Early closures are small moments; the cue escalates as the count nears the failure line.
- Works with sound off and under reduced motion.

## Non-goals

- A readable list of closed Stations during the Shift (the summary keeps its list).
- Reopening Stations, or any change to the closure rule or balance (`OOS_FAIL_SHARE`, crowding, Incident timers). The fast-player ceiling is F12's.
- A music cue for closures. Music stays tense only while an Incident is active (F7).
- Phone layout beyond keeping what works today (phone landscape is blocked already).

## Anti-goals

- **A red screen edge for closures.** The red edge (`data-urgent`) means "you are typing a fix", and only that (user's call).
- Anything that pauses the Shift, takes keyboard focus, or moves the camera when a Station closes. (The 1.2 s hold in §6 comes after a failed Shift has ended, so it pauses nothing.)
- Anything that touches the recorded Career. All of this is display, derived from state the engine already has (`sim.oosOrder`, `sim.outOfService`). Replay and the judge must be unaffected; no new actions, no evidence version change.

## The design

### 1. The closure gauge, in the Shift bar (user's choice, from mockup B)

- One slot per closure the Shift can take: the slot count equals the number of closures that fail the Shift, `ceil(OOS_FAIL_SHARE × served Stations)` (4 on a 14-Station network, 13 on 51). The last slot is marked as the failure line (in the mockup, a dashed red outline).
- **Hidden until the first closure of the Shift** (user's call, "for now"). Closures reset at each Shift (`startShiftSim`), so the gauge hides again at the next Shift.
- Each closure fills the next slot with a short pop.
- Colour by share of the slots filled: neutral (ink-muted) below 40 %, amber from 40 %, red from 75 %. On 4 slots that is: 1 neutral, 2 amber, 3 red.
- A count beside it, "5 / 13", for anyone who does want the number. It is secondary; the length is the cue.
- It sits in the Shift bar (`ShiftBar` in `src/ui/DispatcherScreen.tsx`) with a short label, "Closed".

### 2. The closure stamp, on the map (user's choice, from mockup C)

- The moment a Station closes, its Out of service mark is stamped in: the X arrives bigger than its resting size and settles, with one red ring spreading out from the Station and fading (about 1 s).
- After the stamp, the X rests as today's mark. Whether the resting X is also made a little bigger or bolder than today is left to the builder, as long as it stays readable on the full network.
- The camera does not move for a closure. If the Station is off screen (say, during a fix's lean), the gauge still fills; the stamp is simply not seen.
- Mockup C's darkening map edges are **not** part of this design (the user didn't pick them).

### 3. The Incident card closes instead of vanishing (my call, user agreed)

When an Incident's Station goes Out of service, its card stays in the Incidents panel for about 1.5 s marked as closed (for example the Station name struck through and "Out of service" in place of the fix line), then leaves. It can no longer be typed (closed places are already not targets). This removes the "the problem went away" reading.

### 4. Sound (additive)

A low thud for each closure, heavier as the gauge nears the failure line (for example the same note, louder or doubled, in the red band). It must be distinct from `sound.warning` (a new Incident) and `sound.error` (a wrong key). It plays from the existing sound effect in `DispatcherScreen`, which already compares the previous and current Career.

### 5. Reduced motion (my call, user agreed)

Under `prefers-reduced-motion`: the gauge fills and changes colour without the pop; the X appears without the ring or scale-in; the closing card appears and leaves without animation. Nothing pulses.

### 6. The failing closure gets a 1.2 s hold (user's call)

Today the tick that reaches the failure line also ends the Career (`advanceCareer` sets `status = 'ended'`), and `DispatcherScreen` swaps straight to `DispatchSummary`. So the gauge's last slot would never be seen full, the failing closure would get no stamp, and its thud would play over the summary.

Instead, when a Shift fails, the play view holds for about **1.2 s** before the summary shows (the same length as the lesson's `LESSON_FINISH_HOLD_MS`): the last slot fills (red), the failing Station's X stamps in, its card closes, and the heaviest thud plays. Then the summary appears as today.

- The Career has already ended; the hold is display only. The engine, the recorded evidence and the judge are unchanged. Whether the judge starts during the hold or after is the builder's call, as long as the summary behaves as today once it shows.
- During the hold nothing is typeable and Esc does not pause (there is nothing left to pause). The clock does not run.
- Under reduced motion the hold stays (it is what shows the full gauge), with the still versions of the stamp and card.

This applies only to a failed Shift. Ending a Career with End Career (abandoned or retired) goes to the summary as today.

### 7. The first closure and its tip (my call)

The first closure a player ever sees also fires the one-time `out-of-service` tip, which pauses the Career and covers the screen. The closure's moment (gauge pop, stamp, closing card, thud) must not play hidden behind it: it plays when the tip is dismissed. The simplest way is to run the moment's timing on the Shift's clock, which the tip stops, but how is the builder's call.

### 8. Unchanged

- The failed-Shift summary keeps its ordered list of closures and its cause sentences (`closureText`, `failureText`).
- The red screen edge, the music rule, the camera.

## Calls the builder may want to check

These were my calls, not discussed with the user in detail:

- **The `out-of-service` tip.** It reads "A station is out of service. Lose a quarter of your network and the shift fails." (`src/ui/dispatchTips.ts`). It fires at the first closure, which is also when the gauge first appears, so it should point at the gauge, e.g. "A station is out of service. Each closure fills the gauge at the top; when it is full, the Shift fails." Keep it one sentence or two, and keep the "quarter" idea out of it if the gauge says it better.
- **One source for the slot count.** `advanceCareer` computes the failure count inline (`src/engine/dispatch.ts`). Export one function (e.g. `shiftFailCount(net, served)`) and use it in both the engine and the gauge, so the gauge's last slot is always exactly where the Shift fails.
- **The colour bands** (40 % and 75 %) are from the mockup, not tuned. Fine to adjust after a look.

## Left to the builder

- Exact slot sizing, gap and how the gauge fits in the bar when slots get many (a late network can need 20+ slots); it must not push the bar onto more lines than today at desktop widths, and it may shrink slots rather than grow the bar.
- How "a closure just happened" is detected for the pop, stamp, card and sound (a diff of `oosOrder` between renders is the obvious one, as the passenger moments and sounds already do). It must not fire for closures that already existed when the screen mounted, on resume from pause, or when the lesson's throwaway Career is shown.
- Exact timings, easing, the sound's notes and level.
- Tests: follow the existing Dispatcher test style (`src/ui/Dispatcher.test.tsx`): the gauge is absent at Shift start and before any closure, appears with the first, has the right slot count and filled count, reaches the band colours at the right shares, hides at the next Shift; the stamp and closing card appear once per closure; a failed Shift shows the full gauge for the hold before the summary, and an ended Career does not; the first closure's moment plays after its tip is dismissed; nothing changes the recorded evidence. Existing tests that expect the summary the instant a Shift fails will need the hold advanced.

## Check in playtest 3

- Is the first closure noticed when it happens?
- Does a failed Shift now feel like it was coming?
- Is the gauge visible enough up in the Shift bar, given the eyes are on the chips and the Incidents panel? (The user picked it knowing that; the stamps and the closing card are what pull the eye.)
- Should the gauge be there from the Shift's start instead (the user chose "only with the first closure, for now")?
