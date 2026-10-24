# Dispatcher — onboarding: the guided first Shift

**Date:** 2026-10-24
**Status:** Drafted by Claude after the user said "something like the guided first shift. go" (they skipped the brainstorming questions); approved by the user. Not yet planned.
**Covers:** playtest 2 items F8 (guided first Shift), F5 (How to play), F14 (why new trains appear). F21 (the thin line from a name to its train) was set aside by the user and is not part of this work. See `docs/superpowers/dispatcher-playtest-2-feedback.md`.
**Amends:** `2026-10-23-dispatcher-design.md` and `2026-10-24-dispatcher-playtest-1-design.md`. Vocabulary follows `CONTEXT.md`.
**Branch:** `feat/dispatcher`.

## Why

In playtest 2 the user found the start still unclear: "Type a waiting Station's name" did not explain itself, even with red signal marks on the map and the start tip. Their idea (F8): zoom in on one Station on the KJ Line, such as Jelatek, so the player sees one train and its red signal; the player types the name; the train visibly moves on to the next Station and its signal; the player types again; then the camera zooms out to the whole Line and the Shift begins.

They also asked for a How to play like Rush Hour's (F5). Rush Hour's "How to play" turned out to be only a button on its setup screen that makes its one-time tips show again. When asked what a new player should see, the user answered "something like the guided first shift", so the guided Shift is the walkthrough, and How to play replays it.

One smaller question from the playtest fits here: why new trains appear mid-Shift (F14).

Success: a first-time player, without being told anything, understands from the lesson that a red signal is a train waiting for them, that typing the Station's name sends it, and that the train will wait again at the next Station.

## Goals

- The first time someone opens Dispatcher, they learn the core loop (see a waiting train, type its Station, watch it go) on one train, up close, before any clock runs.
- The lesson uses the real map, real train marks, real signal marks and the real typing line, so what they learn looks exactly like the game.
- A player can replay the lesson whenever they want.
- New trains appearing get a one-line explanation the first time it happens.

## Non-goals

- Teaching Incidents, bunching, express runs, the Green wave or Expansions inside the lesson. The existing one-time tips cover those, at the moment each first happens. (The Green wave has no tip today; adding one is a separate item.)
- A multi-page How to play document or rules screen.
- Phone layout (Dispatcher already blocks phone landscape; nothing here changes that).
- Changing any balance.

## Anti-goals

- The lesson touching the recorded Career. No lesson key may enter the Keylog or action log, the Career's seed must not change, and replay and the judge must be unaffected.
- A lesson that can trap the player: they must be able to skip it and leave at every step.
- A lesson that is slow for someone who already gets it. It should take about 20 seconds for a reader who types normally.

## The lesson (F8)

### When it shows

- Automatically on opening Dispatcher, until the player has finished or skipped it once. Remember that in the profile, the way tips are remembered (`dispatchTipsSeen` style: a new optional field or a new tip id; builder's call).
- On demand from a **How to play** button (below).
- Not in the dev-only `?dispatch=full` Career.
- Claude's call: a player who already has Dispatcher Careers on their profile (the user, for one) still sees the lesson once; there is no reliable way to tell a returning player from a new one, and skipping costs one key.

### What happens, step by step

The camera and captions below are the design. The exact wording is the builder's to polish, kept short and in the same voice as the existing tips.

1. **One train, up close.** The map opens zoomed in on two neighbouring KJ Stations: **Jelatek** and the Station the train is coming from. One KJ train waits at its signal, facing Jelatek, with the red signal mark and a name chip, exactly as in a Shift. Nothing else on the map is active. Caption: "This train is waiting at a red signal. Type **Jelatek** to send it on."
2. **The player types Jelatek.** The typing line works as in a Shift: letters fill in, a wrong key shows and is undone with Backspace. On the last letter the mark turns green and the train pulls away.
3. **It moves, and waits again.** The camera follows (or is already framed) so the train is seen travelling, calling at Jelatek, and stopping at its next signal. Its new chip names the next Station. Caption: "It stopped at Jelatek and is waiting again. Every Station needs you. Type **Setiawangsa**."
   - Claude's call: run the train outbound (towards Setiawangsa), so both names are plain words with no apostrophe. Inbound would make the second name "Dato' Keramat".
   - Checked against the data: KJ runs Dato' Keramat (index 6) → Jelatek (5) → Setiawangsa (4), and Setiawangsa is the outer end of `STARTING_NETWORK` (KJ 4–17). The lesson's train starts at its signal before Jelatek, coming from Dato' Keramat. After the second clear it would turn around at Setiawangsa; the lesson moves on to step 5 once the train has left the second signal, so the turnaround need not be shown.
4. **The player types the second name.** Same as step 2.
5. **Zoom out.** The camera eases out to the full starting network, the frame a Shift normally uses. Caption: "Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift." The Career is now in its normal `ready` state; the next key the player types starts Shift 1 exactly as today, and is the first key in the Keylog.

### Rules for the lesson

- **Seen.** Finishing or skipping both mark the lesson as seen; leaving the screen mid-lesson (Back to map) does not, so it shows again next time.
- **Skip and leave.** At every step: Esc leaves the lesson and goes to step 5's state (the normal ready screen), marking the lesson as seen. A visible "Skip" button does the same. "Back to map" stays available as on the ready screen today.
- **No clock, no score.** No Shift clock, no Incidents, no passengers counted, no Delivered or on-time changes, no Green wave streak. The Shift bar can show Shift 1 waiting, with its clock not running.
- **Real visuals, separate state.** The lesson runs its own small sim state, built with the existing sim functions (one served stretch around Jelatek, one train, no demand, no Incidents), driven by real time while the lesson shows. It is thrown away when the lesson ends. The Career's state is created as today and is untouched by the lesson. Builder's call: whether the lesson is a mode of `DispatcherScreen` or its own component sharing `MapCanvas` and the overlay.
- **Camera.** Uses the map's existing fitting (`fitTo` / `fitKey`). Frames tight enough that the train, its signal mark and its chip are clearly readable at 1024×768. Reduced motion: cuts instead of eased moves, and the train still moves (it is information, not decoration).
- **Sound.** The usual key, error and clear sounds. No music until the Shift starts.
- **Tips.** The start tip that shows inline today is replaced by step 5's caption for players who saw the lesson. Players who skip still see step 5's caption.

## How to play (F5)

- A **How to play** button on the ready screen, next to "Back to map", shown only before the first Shift's first key (the same condition that shows "Back to map" today).
- Pressing it replays the lesson from step 1, and resets the Dispatcher one-time tips so each shows again at its moment, as Rush Hour's button does.
- Claude's call: not offered between Shifts or mid-Career; a Career in progress keeps its flow.

## New trains (F14)

A new one-time tip, shown the first time a train enters the network mid-Shift (a train that was not there when the Shift started). Draft wording, to check against the sim before shipping: "A new train has joined at the end of the line. Trains join during the peaks, until each line has its full fleet; longer lines get more trains." The tip pauses the Career like the other tips.

## Constraints

- Replay and the judge are unchanged: lesson input never reaches the Keylog, the action log or the Career state. Existing replay tests must still pass untouched.
- The lesson must not delay a returning player: once seen, opening Dispatcher goes straight to the ready screen as today.
- Works at 1440×900 and 1024×768, in both themes.

## Left to the builder

- Exact caption wording and where captions sit (the typing panel is the natural place).
- How the lesson's sim is set up and stepped, and whether to reuse `stepSim` or move the train more simply.
- Animation timings for the camera.
- Test approach (the existing `Dispatcher.test.tsx` patterns: fake clock, `press` and `type` helpers).
