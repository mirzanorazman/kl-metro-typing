# Dispatcher — the Service gap Incident

**Date:** 2026-10-26
**Status:** Agreed with the user in a brainstorming session and approved; not yet planned.
**Covers:** playtest 2 item F22 (tips point at the train they are about), reshaped. See `docs/superpowers/dispatcher-playtest-2-feedback.md`.
**Amends:** `2026-10-23-dispatcher-design.md` and the playtest 1 design. Vocabulary follows `CONTEXT.md`.
**Branch:** `feat/dispatcher`.

## Why

The user found the "Trains are bunching" tip confusing: nothing on screen shows what bunching is, and nothing explains why holding a train back helps. Measuring it settled the second part: in today's rules holding back does not pay. 48 scripted Careers (8 seeds, 60 and 90 WPM, clear at once vs hold the rear train 4 s or 8 s) showed on-time % unchanged (68 % and 67 %), delivered per minute +6 % at 60 WPM and −5 % at 90 WPM, and more failed Careers when holding at 60 WPM (2 → 4 of 8). The rear train of a bunched pair does board fewer people (about 11 against 16 at 60 WPM, 7 against 14 at 90 WPM), but nothing makes that cost felt.

The user also judged, rightly, that in a frantic typing game players will not read numbers or watch trains at the edge of the screen, and that asking them *not* to type is the hardest instruction to follow.

So bunching becomes an Incident the player causes. In the user's words, it creates "a new dimension of not everything needs to be fast": the player learns to slow down a little and choose which train to dispatch, and when.

## What is true today (for the builder)

- Every train stops at every Signal and waits until the player types the Station's name. Bunching is therefore entirely the player's doing: it happens when they clear a rear train right behind its leader, Station after Station.
- `bunchedTrains` (same Line and direction, within `BUNCH_BLOCKS = 1`) is used only to draw a dashed ring and to fire the `bunching` tip. The sim never reads it.
- Incidents (`dispatchIncidents.ts`) are random: about `INCIDENTS_PER_MINUTE = 2` scaled by phase, at most `INCIDENT_MAX = 3` at once, weighted to strained Stations. Unfixed for `INCIDENT_LIMIT_MS = 17_000` the Incident's `place` closes. Each kind has typed fix items (`fixItems`). `train-fault` already ties an Incident to one train (`train`).

## Goals

- Rushing creates a visible, nameable problem the player can trace back to their own dispatching, without ever learning the word "bunching".
- The fix is something typed, and it performs the right strategy: holding the rear train.
- A player who holds the rear train by themselves (simply not typing it for a while) also resolves it, so the strategy is rewarded directly.
- Speed still wins overall. The Incident only bites pairs that *stay* bunched.

## Non-goals

- An escalation chain (a Service gap growing into a crowd surge). Escalation stays as for every Incident: unfixed, the place closes. A later item.
- Green wave or express interactions as design levers (a Green wave may well cause Service gaps; that is accepted, not designed for).
- Changing how passengers board or train capacity.

## Anti-goals

- Players hesitating on every name for fear of causing a gap. The trigger must be gentle enough that normal fast play produces only an occasional Service gap.
- An Incident that appears with no visible cause, or names trains the player cannot find.
- Breaking replay: a Career must still replay exactly from its Keylog and action log.

## The Service gap Incident

### Trigger

- A **pair** is a leader and its rear train on the same Line and direction, within `BUNCH_BLOCKS`, as `bunchedTrains` decides today, with the rear train identified as the one behind in the direction of travel.
- When a pair has stayed a pair continuously for **`GAP_TRIGGER_MS`** of Shift time, a Service gap Incident starts for it. Claude's call: start at 6 s and tune with the survey (below).
- It is player-caused: it does not draw on the random Incident budget (`incidentDebt`), but it does count toward `INCIDENT_MAX`. If 3 Incidents are already up, it waits until a slot frees, as long as the pair still stands. Claude's call.
- One Service gap per rear train at a time. A pair already in a Service gap does not start another.
- If the pair changes (its leader is cleared and pulls well ahead, and a different train becomes the rear of a new pair), the pair timer restarts for the new pair. Claude's call.

### What it names

- `kind: 'service-gap'`, `line` the pair's Line, `train` the rear train.
- `place` (the Station that closes if it escalates) is the **Station the pair left behind**: the last Station the rear train called at. That is the Station going without service, which is the real cost of bunching. Claude's call. If the rear train has not called anywhere yet this Shift (it just entered at an outer end), use the Station it entered at. A `place` already used by another Incident, or out of service, means no Service gap starts for that pair until it changes.
- Fix item, one line, typed like the others: **"Hold at <Station>"**, where the Station is the one whose Signal the rear train will be held at (its next Signal).

### Fixing it

- **Typed fix:** typing "Hold at <Station>" holds the rear train at that Signal for **`GAP_HOLD_MS`** (Claude's call: 6 s, tune with the survey), counted from when it is at that Signal: at once if it is already waiting there, otherwise from its arrival. While held, its name is not offered as a Target (like a train held by a signal fault), and the Incident ends at once with the usual fix sound and pop.
- **Held by hand:** if the pair stops being a pair before the timer runs out (the player left the rear train waiting until its leader pulled away), the Incident ends by itself, with the same sound. Claude's call, so the strategy itself is rewarded.
- **Unfixed:** after `INCIDENT_LIMIT_MS`, `place` closes like any Incident, cause `'service-gap'`. Closure text: "… went out of service after a service gap was left unfixed."

### On screen

- An Incidents panel card like the others, titled **Service gap**, with its own glyph (shape, not only colour), the place, and the timer.
- The dashed ring on bunched trains stays, as the early warning before a pair becomes an Incident. Claude's call.
- While the fix is typed, the existing lean-in frames the place and the pair.

### The tip, pointing at the trains (F22)

- The `bunching` tip is replaced by a **`service-gap`** tip, shown the first time a Service gap starts. While it pauses the Career, the camera leans in on the pair and the place (the same framing the lean-in uses), and the two trains pulse. Copy, to polish: "You sent these two trains too close together, so <place> has no train coming. Type the fix to hold the second one, or leave it at its signal for a moment."
- The `late` tip gets the same treatment: while it shows, the camera leans in on the late train and it pulses. Copy, to polish: "This train is late: its next platform has waited too long. Type the farther Station on its name to run it express."
- How to play (resetting tips) brings both back, as for every tip.

## Balance and survey

- Rerun the probe survey (`DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts`) with the scripted typist taught one new habit: it types a Service gap fix like any other fix (urgent fixes first). Report Career length, Shifts cleared and Service gaps per Shift per typist, against the current table in `dispatcher-handover.md`.
- Target, Claude's call: at 60 WPM about one Service gap every Shift or two; at 90 WPM somewhat more (fast clearing is what causes them); Career lengths at 40 and 60 WPM within about 10 % of today's. Tune `GAP_TRIGGER_MS` and `GAP_HOLD_MS` to hit it; record the numbers in the handover.
- Also run the bunching experiment from the Why section again: with Service gaps in the rules, holding the rear train should now measurably pay (fewer closures or a better on-time %) for at least the 60 WPM typist. If it does not, say so; that is a finding for the user, not a reason to keep tuning in the dark.

## Constraints

- Replay: Service gaps start from sim state only, so they are deterministic. Bump `DISPATCH_EVIDENCE_VERSION` (Careers recorded under the old rules would replay differently); evidence is judged at once and never stored, so nothing old needs to replay.
- Existing Incident rules (spawn, escalation, `INCIDENT_MAX`) keep working for the three random kinds.
- The guided first Shift (onboarding) has no Service gaps: its one train cannot form a pair, and its quiet phase spawns nothing.
- Works at 1440×900 and 1024×768, both themes; reduced motion keeps the camera still (the existing lean-in rule) while the pulse becomes a steady highlight.

## Left to the builder

- Where the pair timers live in `SimState` and how a pair is keyed.
- The glyph and card styling for Service gap.
- The pulse styling, and how the tip passes its subject to the camera.
- Exact copy polish for the two tips and the card, in the existing voice.
- The survey's exact typist changes.
