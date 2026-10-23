# Dispatcher — playtest 1 changes

**Date:** 2026-10-24
**Status:** Agreed with the user in a brainstorming session; not yet planned.
**Amends:** `2026-10-23-dispatcher-design.md`. Where this document and that one disagree, this one wins. Vocabulary follows `CONTEXT.md`.
**Branch:** `feat/dispatcher` (not yet merged). The user's uncommitted change to `SHIFT_PHASES` in `src/engine/dispatchBalance.ts` is part of this work.

## Why

The user's first playtest verdict: "a really good game mechanic, much better than Rush Hour." These are the eleven things the playtest raised, settled into a design. The user said not to agree with everything; where Claude disagreed or narrowed an idea, the reason is recorded.

What the user is after, in one line: keep the frantic typing, but make every moment *readable* (what is a Signal, what was that sound, why did I lose) and make good play *feel* rewarding (passengers rescued, a combo that pays back time).

## Goals

- Nothing destructive happens from one stray click or key.
- Every sound has something on screen that explains it.
- A new player understands "waiting for its Signal" from the map alone.
- Passengers are felt at the moments the player helps them, without cluttering the map.
- Clean typing streaks are rewarded with time, through a combo the player aims.
- The map stays readable as the network grows to its full size.
- Balance fits the user's shorter 90-second Shift.

## Non-goals

- Drawing passengers permanently on the map or on trains. The user rejected this because it complicates the map.
- Combo points in the score. The score already multiplies Delivered by accuracy; the combo's reward is time.
- Retiring Rush Hour (still gated on the user, as before).
- Phone layout.

## Anti-goals

- A combo that removes the dispatching decisions, such as clearing every Signal on the map or wrecking a train the player is deliberately holding.
- Map changes that hide waiting trains while the player is busy with something else.
- Any of these changes breaking replay: a Career must still replay exactly from its Keylog and action log.

## Part A — Fixes (ship first, on their own)

### A1. End Career needs confirming (playtest item 2, critical)

The user ended a Career five Shifts in by accident, with no way back.

- Both End Career buttons (during a Shift and on the Expansion screen) become two-step. The first click turns the button into **"End Career?"** with **Yes, end it** and **Keep playing**. It reverts by itself after 4 seconds, or on Keep playing.
- During a Shift, the Career keeps running while the question shows. Nothing pauses; it is just a button state.
- Enter and Space never answer the question. The existing shield against game keys activating focused buttons stays, and covers the new buttons.
- Only **Yes, end it** sends the `abandon` action.

### A2. A mistyped space disappears (item 11)

When the current character is a space and the key was wrong, the space collapses: "CROWD CONTROL AT DAMAI" renders as "CROWD CONTROLAT DAMAI". The cause is in the shared `Prompt` (`src/render/Prompt.tsx`): the mistyped character is wrapped in `.prompt-miskey-anchor`, which is `display: inline-block` (`src/index.css:80`), and a lone space inside an inline-block collapses. Fix it in `Prompt`/CSS so a mistyped space keeps its width and shows the wrong-key mark. Every mode uses `Prompt`, so check Line Run and Quick Run too.

### A3. Tense music sticks after a missed Incident (item 3)

*Claude's reading of the report, confirm in playtest.* The music picks the tense track while `dispatchOvercrowded` is true, which includes any Station being Out of service. A missed Incident leaves its Station Out of service for the rest of the Shift, so the music never returns to calm. Change: tense while an Incident is active or any platform is past half `PLATFORM_CAPACITY`; calm otherwise. Out of service alone does not keep it tense.

### A4. Sounds with nothing to explain them (item 8)

The unexplained sound is the Delivered chime. It plays whenever any passenger anywhere reaches their stop, which is constant and invisible. Change: the Delivered chime plays only together with a visible passenger moment (Part B2). Every other sound already has a visible cause: key, wrong key, Clear, and a new Incident. Keep those.

## Part B — Design changes

### B1. Signal marks (item 4)

The start of a Career ("Type a waiting Station's name") is a "huh, what do I do" moment, because nothing on the map *looks* like a signal.

- Every train waiting at a Signal shows a small **signal mark** at the Station it faces: a signal-post shape with a red lamp. It is not just a red dot, because colour is never the only signal.
- When the Signal is Cleared, the lamp turns green and the mark fades out over about half a second.
- The Signal's name chip stays where it is. The mark is the "this is a signal" cue, and the chip is the thing you type.
- The start tip may refer to the marks ("Each red signal is a train waiting for you…"). The tip text is the builder's call.

### B2. Passenger moments (item 6)

There is no feeling of passengers. The user's direction: don't draw them on the map; show them at the moments the player helps them.

- **Crowd surge fixed:** as the final fix item completes, that Station's crowd visibly drains. A count drops to its new value and a short burst of small person glyphs streams away from the Station, about a second long. The crowd surge's Incident card shows the count too.
  - **This is a real sim change (decided by the user, 2026-10-24).** Completing a crowd-surge fix removes the surge's *extra* passengers from that platform: the ones who arrived because of the surge's ×4 rate, beyond what normal arrivals would have added. They **disperse** (they walk or take a bus).
  - Dispersed passengers count as neither Delivered nor Stranded. A fix relieves the Station without inflating the score.
  - The sim tracks how many surge-extra passengers are still waiting so it can remove exactly those. If some have already boarded, only those still waiting disperse.
  - Expose a `dispersed` count for the UI.
- **Signal Cleared:** when the cleared train finishes calling at that Station, a pop beside it shows who moved: "+18 boarded" and, when anyone alighted there, "−6 off". It fades after about a second. The Delivered chime plays with this pop when anyone alighted (A4).
- **Shift cleared:** before the Expansion choice, a short beat shows "4,210 passengers moved this Shift" (the Shift's Delivered), with the Shift's on-time %.
- Pops must not pile up unreadably at peak. If several land at once, the builder may merge or drop the smaller ones; the player's own Clear always gets its pop.
- The sim must expose what happened at a call (boarded and alighted counts per call, and the dispersed count when a surge is fixed) as deterministic state the UI can read. Apart from the surge dispersal above, exposing this must not change sim behaviour.

### B3. Combo: the Green wave (item 7)

The user's idea: a streak of perfectly typed Stations clears other waiting Signals. Claude added guardrails so it rewards accuracy without removing the dispatching.

- **Streak:** each Target completed with no counted wrong key adds 1. That covers a Signal Clear, a Skip-stop, or a whole Incident fix (all its items). A counted wrong key resets the streak to 0.
  - Enter-to-confirm is not a mistake.
  - Keys dropped during the wrong-key stall are not counted, so they don't reset it again.
  - Letting go with Backspace doesn't reset it.
  - The streak carries across Shifts within a Career.
- **Waves:** a wave fires each time the streak reaches a multiple of 3, and the streak keeps counting. Wave size = streak ÷ 3, capped at **4**. So the waves at streaks 3, 6, 9 and 12 clear 1, 2, 3 and 4 Signals, and every wave after that clears 4.
- **Where it clears:** waiting Signals on the **same Line** as the completion that triggered it, nearest first by track distance from the triggering train (for an Incident fix, from its place), in both directions. Only trains that currently show a Signal Target can be cleared, so Incident-held trains and Out-of-service approaches are never touched. If the Line has fewer waiting Signals than the wave size, it clears what there is; the rest is not carried over.
- **Never touched:** Incidents, Skip-stops, and trains on other Lines. A train the player is deliberately holding on another Line is safe; the player aims the wave by choosing which Line's name completes the streak.
- **Determinism:** the streak and waves live in the engine (Career state) and are replayed like everything else. A wave is a consequence of a keystroke, not a new action.
- **The ripple:** the user specifically wants the ripple visible.
  - A green pulse travels along the Line's track from the triggering train outward.
  - Each Signal it reaches flips red to green (the B1 mark) one after another, about 150 ms apart, in the order cleared.
  - The streak count sits beside the typing line, so the player sees it building, and flashes when a wave fires.
  - Under reduced motion, the flips happen together without the travelling pulse.
- **Score:** no combo points.

### B4. Typing an Incident's fix feels urgent (item 5)

The user wants a "panicking" sense when the player starts typing a fix.

- While the aim is locked onto a fix Target, the map eases partway towards the Incident's place. The zoom and framing must keep the other waiting trains in view; it is a lean-in, not a close-up. Exact framing is the builder's call, with that constraint.
- The Incident's Station glows, and a red pulse runs round the edge of the map.
- All of it relaxes when the fix completes or the player lets go.
- Under reduced motion: no camera move and no pulse; a static glow and a static red edge.

### B5. Morning trains start outside (item 10)

As the map grows, trains seem to start bunched in the middle. A Shift always opens with the inbound Morning peak, so trains should start from the outskirts.

- At Shift start, each served range's trains begin at its **outer** end(s) heading **inward**, entering at headway intervals over the opening part of the Shift, rather than spread evenly along the Line.
- **Which end is outer** (Claude's call after the builder check):
  - A range that contains a `CENTRAL_STATIONS` Station strictly inside it (passes through the centre, like the starting Kelana Jaya stretch Setiawangsa–Kerinchi) has **both** ends outer, and starts trains at both.
  - Otherwise, the outer end is the one further from Masjid Jamek in layout distance.
- **There is always something to type at ready** (Claude's call). When a Shift is `'ready'`, the first inbound train at each outer end is already waiting at its first Signal, one block in from that end. The rest enter at headway intervals once the clock runs. The ready-state copy ("Type a waiting Station's name to start the Shift") stays true, and the first key never has to be a wrong key.
- Block exclusivity still holds. Use the existing reinforcement mechanism for trains that enter later.

### B6. Readable map at full size (item 9 — the hard one)

As the network grows, station marks shrink to dots, and the centre (the Monorail, and the shared Ampang/Sri Petaling track from Sentul Timur to Chan Sow Lin) becomes a tangle of overlapping names and chips. The user agreed it is hard and asked to plan it out and see. Treat it as an experiment with a clear finish line.

**Acceptance (at the full network, 1440×900, and at tablet 1024×768):**
- Every waiting Signal's chip and every Incident marker is readable and doesn't overlap another chip.
- Station marks never render smaller than about 6 px across on screen.
- Lines sharing track are distinguishable, not drawn on top of each other.
- The view still shows the whole Served network, with no follow camera (the original spec's rule).

**Approaches to try, in this order, stopping when acceptance is met:**
1. **Minimum on-screen sizes.** Station marks, chips and labels have a floor in screen pixels; `markScale` in `MapCanvas` currently shrinks them as the view widens.
2. **Label only what matters.** Plain Station names show only for Stations with something happening (a waiting train, an Incident, the B1 mark), interchanges, and Line ends. Other names hide at full-network zoom.
3. **Parallel shared track.** Where two served Lines share consecutive Stations (Ampang/Sri Petaling; anywhere else the data has it), draw them side by side with a small offset instead of on top of each other.
4. **Chip placement around a crowded centre.** Place Signal chips with leader lines into free space, using the existing label-placement code (`render/labels.ts`).
5. **If all that is not enough**, the builder records what still fails, with screenshots, and stops for the user. A deeper fix, such as a distorted schematic centre or a centre inset, is a separate decision.

The first step of this work is a throwaway spike rendering the full network with approaches 1–3, checked in the browser, before committing to an implementation.

## Part C — Balance for the 90-second Shift (item 1)

The user shortened the Shift from 210 s to 90 s: Morning peak 35 s, Midday 20 s, Evening peak 35 s. They found 3.5 minutes too long. With only that change, the scripted typist stops losing, and 8 tests fail, because the failure clocks were sized for the long Shift: a full platform takes 45 s to close, and an Incident 35 s to escalate.

- **Keep the user's `SHIFT_PHASES` exactly** and retune the rest of `dispatchBalance.ts` around them. Candidates: `OOS_CROWD_MS`, `INCIDENT_LIMIT_MS`, `INCIDENT_FIRST_MS`, `INCIDENTS_PER_MINUTE`, `PASSENGER_RATE`, `SHIFTS_PER_ERA`. Combo and B5 change the balance too, so tune last, after Parts A and B land.
- **New targets** (Claude's call, since the old ones were in Shifts of the old length): measure in Career *minutes* and Shifts together.
  - A 40 WPM Career lasts about **5–8 minutes**.
  - A 90 WPM Career lasts about **15–25 minutes**.
  - Shift 1 is winnable by a new player on the first try.
  - Every failure has an identifiable cause, and some failures at peak are Incident-caused, not all crowding.
- **Eras** should still feel like a progression: an Era roughly every 3–5 minutes of play. That probably means `SHIFTS_PER_ERA` goes from 2 to about 3.
- **The survey typists must be realistic, or the combo and Incidents won't show up in the numbers** (Claude's call after the builder check). Today's scripted typist mistypes every 23rd key at every speed, so its streak rarely reaches 3.
  - Give each speed an accuracy: about **94% at 40 WPM, 96% at 60 WPM, 98% at 90 WPM**. Use seeded, deterministic error placement.
  - The typist aims waves simply: when its streak is one short of a multiple of 3, it prefers a Target on the Line with the most waiting Signals.
  - Add an **inattentive** variant that ignores an Incident until its timer is past three-quarters, so the survey shows Incident-caused failures.
  - Report the survey per typist.
- Fix the balance-coupled tests that the shorter Shift broke without weakening their intent: a genuinely failed, replayable Career; a confirm action that replays.
- Re-run the survey and record it in the handover.

## Things left to the builder

- Glyph shapes (signal post, person), pop styling, timings within the ranges above.
- How pops merge at peak, as long as the player's own Clear always gets one.
- How the camera lean-in is computed, within B4's constraint.
- The B6 approach details, within its acceptance and order.
- Exact tuned numbers in Part C.

## Calls Claude made (check these)

- A3's diagnosis of item 3 (tense music stuck because of Out of service) is a guess from the code; confirm in playtest.
- The Green wave clears on the same Line only, nearest first, capped at 4, with the streak carrying across Shifts.
- Combo grants no score.
- End Career confirmation reverts after 4 s and doesn't pause the Shift.
- New balance targets in Career minutes (5–8 min at 40 WPM, 15–25 min at 90 WPM), and an Era every 3–5 minutes.
- B6 starts with a throwaway spike, and stops for the user if approaches 1–4 fall short.
- B5: a range through the centre is outer at both ends; at ready, the first inbound train per outer end is already waiting at a Signal.
- Survey typists: 94/96/98% accuracy at 40/60/90 WPM, simple wave aiming, plus an inattentive variant.

Decided by the user: a fixed crowd surge's extra passengers **disperse** (counted as neither Delivered nor Stranded).
