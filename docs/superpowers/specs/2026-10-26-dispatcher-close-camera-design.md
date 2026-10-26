# Dispatcher — the close camera (behind a dev panel)

**Date:** 2026-10-26
**Status:** Agreed with the user in a brainstorming session; built (plan `plans/2026-10-26-dispatcher-close-camera.md`). **Amended 2026-10-27:** for Incidents the close view is while the fix is typed, not a hold after it lands (the user's intent, misread in the first version). The hold and its slider are gone.
**Covers:** a new playtest 2 tracker item, F27 (the camera pulls in close when something matters). It also takes the camera half of F11. See `docs/superpowers/dispatcher-playtest-2-feedback.md`.
**Amends:** the onboarding design (`2026-10-24-dispatcher-onboarding-design.md`, the lesson's frame) and the Service gap design (`2026-10-26-dispatcher-service-gap-design.md`, the pointing tips). Vocabulary follows `CONTEXT.md`.
**Branch:** `feat/dispatcher`.

## Why

The camera is meant to point at what matters: the guided lesson frames its first Stations, a tip about Trains frames them, and typing an Incident's fix leans towards it. In practice the camera never gets closer in Shifts 1–8; it only pans. Measured with the scripted 60 WPM typist (5 seeds, 30 minutes each, a 1440 × 900 screen), compared with the normal view of the Served network:

| Frame | Shifts 1–3 | Shifts 4–8 | Shift 9+ |
|---|---|---|---|
| Typing a fix (the lean-in) | 1.00× | 1.00× | 1.10× (p90 1.27×) |
| Late Train tip | 1.00× | 1.02× | 1.44× (p90 2.14×) |
| Service gap tip | 1.00× | 1.12× | 1.44× (p90 2.14×) |
| Lesson, against Shift 1 | 1.00× | | |

Two causes:

- `fitViewBox` (`src/geo/fit.ts`) makes every frame at least `MIN_SPAN = 200` layout units across. Shift 1's 14 Stations span 154 × 137 units, so the normal view already sits at that floor, and a frame of three Stations (about 23 × 26 units) cannot be tighter. The onboarding notes said the lesson's frame is "about 2× tighter than the Shift's"; by the code it is the same zoom, only recentred.
- The fix lean-in (`leanIn` in `DispatcherScreen.tsx`) also frames every Station where a Train is waiting, so on any network its frame is close to the whole Served network.

The user wants the camera to pull in close in three situations, the lesson, the train tips and Incidents, and to playtest whether that feels like a special moment that draws the eye, or whether it gets old. Their idea: closest in the first Shifts, where the player is still learning what an Incident or a Service gap looks like, and less close as the Served network grows, down to a lean.

## What is true today (for the builder)

- The map's camera is driven by `MapCanvas`'s `fitTo` (points to frame) and `fitKey` (a refit happens only when the key changes), with `fitPadding = DISPATCH_FIT_PADDING`. `DispatcherScreen.tsx:667` picks the frame: the lesson's frame, else a tip's frame, else the fix lean-in, else the normal frame (all served Stations, plus the offered Expansions between Shifts).
- A refit eases over `FIT_MS = 500` (`usePanZoom.ts`); under reduced motion it cuts.
- Under reduced motion the tip frame and the fix lean-in are not applied at all (the camera keeps the normal frame); the lesson still frames its Stations, and its zoom-out cuts.
- The lesson frames Dato' Keramat, Jelatek and Setiawangsa (`lessonStations`). Each tip shows once per Career (`dispatchTipsSeen`), and the lesson plays once (again from How to play), so those close views are rare by themselves. Incidents repeat: about 3 random ones a Shift, plus Service gaps rising to about 4 a Shift from Shift 13.
- Chips are kept on the visible map (`overlayLayout` with a `frame`). A Train outside the frame gets its chip pulled to the edge, with a leader line back to it.
- The camera is view only. Replay and the judge never see it.
- Another agent is working on F4, F15 and F19 on this branch at the same time. F15 changes what `MapCanvas` emphasises and F19 animates new track in, so both touch `MapCanvas`. Keep this work's changes to `MapCanvas` small (at most one new prop) and say so in the plan.

## Goals

- With the close camera on, the lesson, the two train tips and a fix being typed each show a close view that is obviously closer than the normal view in early Shifts.
- The close view gets less close as the Served network grows, so late in a Career it is only a lean.
- With the close camera off, the game behaves exactly as today.
- In playtest 3 the user can switch it on and off and tune how close it gets while playing, then judge the feel and pick the numbers.

## Non-goals

- F11's "Crowd cleared" stamp, crowd burst and sound. They pair with the close view on a fix but stay in F11.
- Any other camera change: the normal frame, the frame between Shifts, the player's own pan and wheel zoom.
- Making the close camera the default, or shipping the dev panel to players. Both are decided after playtest 3; the numbers the user settles on then become the defaults in the code.
- The camera on the full-size map (F13, parked), beyond not breaking it.

## Anti-goals

- Camera moves the player did not cause. The close view on a fix starts with the player's own typing and ends with it. (The first version of this spec ruled out a close view while the clock runs, because it hides Held Trains elsewhere and pulls their chips to the edges. The user accepts that for the moment a fix is typed; whether it costs them is a playtest 3 question.)
- Camera moves that cost keys: names jumping while the player reads them, or the camera swinging back and forth several times a second.
- Any change to the engine, replay, the judge or evidence.

## The design

### The dev panel

A small camera panel in a corner of the Dispatcher screen, shown only in development (`import.meta.env.DEV`, as `?dispatch=full` does), so a production build strips it. Playtest 3 therefore runs on the dev server (the user's choice). It holds:

| Control | Range | Starts at |
|---|---|---|
| Close camera on / off | | off |
| Early closeness: at 14 Stations or fewer | 1× to 5× | 3× |
| Late closeness: at 40 Stations or more | 1× to 3× | 1.2× |

and a readout of the closeness the camera uses now, for the current number of served Stations, so the user can note "this felt right at 31 Stations".

- Off gives today's camera exactly.
- A change to any control takes effect at once: the camera refits to the current frame (our call). During a tip the Career is paused, so the user can drag a slider and watch the frame change.
- The values are kept in browser storage, so they survive a reload and a new Career (our call). They are not saved to the profile. Wrap the storage reads and writes so the panel still works when storage is unavailable.
- The panel never takes the game's keys: after a slider or toggle is used, typing goes to the game, and the game's key handling does not act on keys meant for the panel (our call).
- The panel stays clear of the Shift bar, the Incidents panel and the typing panel, and the chips need not avoid it.

### How close: one rule for all three

The close view is set by a **closeness**: how much closer than the normal view of the current Served network it is.

- The early closeness (default 3×) at 14 Stations or fewer (Shift 1's network).
- The late closeness (default 1.2×) at 40 Stations or more.
- Linear between them, on the count of served Stations.

The defaults are our guess; the dev panel tunes them. Keep the defaults as named constants in one place, so the numbers from playtest 3 go in with a one-line change.

A close frame is centred on what it is about (its subject Stations and Trains), and its size is the normal frame's size divided by the closeness. If the subject does not fit in that size, the frame grows to fit it, and is never larger than the normal frame. The frame keeps `DISPATCH_FIT_PADDING`, so it stays clear of the panels.

For the lesson, the closeness is the early closeness: the lesson's own network is a stretch of the KJ Line.

### The lesson

Frames the same three Stations as today, at the lesson's closeness. The zoom-out at the end of the lesson then goes to the normal frame, which now shows a real pull-back. Nothing else in the lesson changes.

### The train tips (Service gap, late)

Frame the tip's subject (as `subjectStations` does today) at the closeness for the current Served network. The tip pauses the Career, so the close view holds until the tip is dismissed, then the camera returns as it does today. A tip still wins over a fix's lean-in.

### Incidents

The user's picture: an Incident arrives ("Hold at Dang Wangi"), the player starts typing its fix, the camera pans and zooms in on Dang Wangi, the Incident clears, and the camera zooms out.

- **When the aim locks onto a fix** (the letters typed can only mean that fix; every fix text starts with its action, so this is usually the first letter or two): the camera pulls in on the Incident's place and its Served neighbours on its Line, at the current closeness. The waiting Trains elsewhere are not kept in the frame; their chips go to the edges while the fix is typed.
- **When the fix clears, or the player Backspaces it away:** the camera returns to the normal frame at once.
- A signal fault is fixed one Station name at a time. The aim stays locked on the fault between names, so the close view stays on its place until the last name clears it.
- Locking onto another fix moves the close view to that one. A tip wins over it. The order is: lesson, tip, fix, normal frame.
- With the close camera off, today's lean-in (the place, its neighbours and every waiting Train's Station) is unchanged.

### Reduced motion

As today: the camera does not move for the tips or for a fix being typed (the pulse, the glow and the other cues still show). The lesson keeps its frame, now at its closeness, and its zoom-out still cuts.

## How it is checked

- Unit tests for the closeness rule and the close frame (it centres on the subject, grows to fit a large subject, never exceeds the normal frame).
- With the close camera off, the existing tests pass unchanged.
- The dev panel is absent from a production build (`npm run build`, then search the output for the panel's label).
- In the browser on the dev server, close camera on: the lesson, a Service gap tip and a fix being typed in an early Shift, and a tip on the full-size map (`?dispatch=full`). A screenshot of each for the user. Drag the early closeness slider during a tip and confirm the frame follows; type a Station name after using a slider and confirm it reaches the game.
- Repeat the probe above with the close camera at its defaults, and record the new zooms next to the old ones in the tracker. The probe was a throwaway test and is not in the repo, so the plan rebuilds it as a kept probe test (like `dispatchProbe.test.ts`), with the frame helpers moved out of `DispatcherScreen.tsx` so a test can call them. Its method, so old and new numbers compare: drive `drive()` (`dispatchDrive.testutil.ts`) at `msPerKey: 200`, seeds 1–5, `limitMs` 30 minutes. In `watch`, take each frame's Stations, fit them with `fitViewBox(points, DISPATCH_FIT_PADDING)`, and score it as `min(1440 / w, 900 / h)`. Zoom is that score divided by the same score for the normal frame (all served Stations). Count each Incident's lean-in once, when the aim first locks onto its fix, and each tip subject once per Shift. Report the median, p10 and p90 per band of Shifts (1–3, 4–8, 9+).

## Playtest 3: what to look at

Added to the tracker's "Check in playtest 3":

- Play on the dev server and switch the close camera on and off in the dev panel. Does each close view draw your eye to the right thing, and does it still feel special by the tenth Incident, or does it get old?
- Tune the early and late closeness with the sliders. Note the values that feel right, and at how many Stations (the readout shows it).
- While you type a fix, does the close view help, or do you lose track of the Trains waiting elsewhere?

## Left to the builder

- How the close frame reaches `MapCanvas` (for example a minimum span or an explicit frame), within the one-new-prop limit.
- `fitKey` values for the new frames, so each refits exactly once when it starts and once when it ends, and once more when a dev panel value changes.
- The dev panel's corner, look and slider steps, within the rules above.
