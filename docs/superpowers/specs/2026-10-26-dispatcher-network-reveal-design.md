# Dispatcher — served track, Career entry and Expansion reveals

**Date:** 2026-10-26
**Status:** Implemented and verified 2026-10-27 (Kuala Lumpur); Tasks 1–7 passed separate spec/quality reviews and full automated gates passed. See [browser evidence and limits](../dispatcher-network-reveal-verification.md). Task 8 review and whole-branch review follow; not merged or deployed.
**Covers:** playtest 2 F15, F4 and F19, with related F17/F8/F5 integration.
**Tracker:** [dispatcher-playtest-2-feedback.md](../dispatcher-playtest-2-feedback.md#planning-group-served-track-and-network-reveals-f15-f19-f4).
**Plan:** [implementation tasks](../plans/2026-10-26-dispatcher-network-reveal.md).
**Planning branch:** `codex/dispatcher-network-reveal`, based on `feat/dispatcher` at `64e0d4d`.

## Intent and decisions

The map should show the network the player operates and make its growth felt.
Today `DispatcherScreen` gives `MapCanvas` whole Line codes even though the
Career operates only inclusive ranges of Stations. A short Expansion therefore
appears to open an entire Line.

The user approved one shared design:

- F15 paints only served stretches and Stations; the complete network stays
  visible underneath at the existing faded opacity.
- F4 draws the starting network on every new Career, **before** the guided
  lesson when one is due. This is not a once-per-profile entrance.
- Every Expansion draws its added track from its connection toward its far
  end. F19 adds a Line badge and chime only when a Line first joins.
- **Ignore typing until a reveal finishes.** Those keys are discarded, never
  buffered, forwarded, recorded, or used to start the Shift. The user explicitly
  rejected cutting the animation short and using the same key.
- Entry takes 1,000 ms; Expansion takes 800 ms. These are total reveal windows,
  including Station pops, not durations followed by another hold.
- A new-Line notice sits above the typing prompt until the first accepted key
  that starts the next Shift. It shows the Line code and name as well as colour.
- Reduced motion shows the resulting network immediately, with no reveal input
  lock; the notice and additive sound remain.

Alternatives considered: static served track with badge-only growth feedback
(less work but a weaker sense of growth), and a separate camera move and
celebration screen (more interruption). The shared reveal was chosen.

## F15: what is painted

`career.served` is the source of truth: one `{ line, from, to }` inclusive range
per served Line. Bright track runs from the first served Station's centre to
the last served Station's centre, including only the edges between them.
Stations and their labels are bright if any served range contains them.
An Interchange does not brighten any unserved arm of another Line.

Draw the full faded Line underneath and its bright served range above it.
During a reveal, keep the previously served track bright and animate only the
new edges; do not place an already bright copy beneath the animated addition.
When it ends, replace the temporary pieces with the complete bright served
range, without a flash or seam. Faded track never draws on entry.

Shared-track lanes come from the existing `trackLines` geometry. Subsets must
select the corresponding Station indices from those full-Line points, rather
than recomputing offsets on the subset. Extract the Station-aware `linePoints`
logic already in `DispatchOverlay` and share it with `MapCanvas` and dashed
Expansion previews. `MapCanvas`'s current local helper ignores the subset when
lanes are enabled; replacing it is part of this work.

Out-of-service Stations keep their X and other closure feedback. They still
belong to the Career's served range; F15 does not reinterpret closures as
network shrinkage. Existing emphasis/entrance callers keep their current
whole-Line behavior unless the new optional range props are supplied.

## Revealing the right addition

Compute track changes from previous and next served ranges. Do not use
`Expansion.added` to decide whether there is a reveal: it contains globally new
Stations, so a new Line on shared track can have an empty `added` array.

- An upper-end extension includes the previous last Station as its first
  point, then travels to the new upper endpoint.
- A lower-end extension includes the previous first Station, then travels in
  reverse index order to the new lower endpoint.
- A new Line starts at its endpoint already in the previous served Station
  set, and draws toward its other endpoint. If both endpoints are already
  served, use ascending Station order for a deterministic shared-track reveal.
  Valid engine offers always attach at an endpoint.
- If ranges are identical, no reveal, lock, badge or chime is created. This
  covers Continue after the network is complete.
- Existing Stations, including shared Interchanges, do not pop again. Only
  globally new Stations pop, once each. Entry starts from an empty displayed
  network, so all its served Stations pop.

Reuse `track-draw`, `station-pop` and `DRAW_EASE`; do not pass a partial network
to the existing whole-network `entranceTiming`. Time the new Station pops by
distance along the drawn lane and the inverse easing curve. Reserve the final
320 ms of the reveal window for the last Station's pop to settle. For several
segments, draw concurrently within the same window. Existing labels stay
readable; do not apply the home entrance's global label/furniture delay.

## Entry and lesson sequence

On a normal new Career: show its starting served network at the ordinary
Career frame and play the 1,000 ms reveal. While it plays, show a short
noninteractive "Opening the network…" status instead of inviting typing;
hide How to play and lesson controls. Keep Back to map available, including
Escape before the first Career key.

After entry, start the lesson if the profile has not seen it; otherwise show
the normal ready Shift. Create the lesson's throwaway clock only when the
lesson actually starts, so the entrance cannot advance its train. Finishing
or skipping the lesson returns to the ready Career without another entrance.
How to play replays the lesson and tips without replaying the Career entrance.

An explicitly supplied `initial` Career (developer full-network entry and test
fixtures) gets static range rendering without an entry reveal. `lessonFor`
still represents a normal fresh Career and therefore includes the reveal.
App already keys Dispatcher by Career, so Again gets a fresh entry.

## Expansion and new-Line celebration

An accepted expand action installs the new served network and starts an
800 ms UI reveal in the same React update batch. It remains the engine's
ordinary ready Shift: there is no additional engine action or pause/resume.
Show "Opening the network…" during the reveal and restore the idle typing
prompt when it finishes. End Career remains available and retains its existing
between-Shift ranking behavior. Navigation and confirmation buttons remain
usable by pointer; the existing click/tap-only confirmation rule and
Enter/Space button shields stay in place.

Keep the current camera transition to the expanded served network. There is
no extra zoom, camera tour or new screen. Remove dashed offers when the choice
is accepted, as today, and align previews to the same lanes as served track.

For a newly joined Line, pop its existing `LineBadge` beside
"<Line name> joins the network" in an opaque notice inside the typing panel,
above the prompt. This participates in existing panel measurement rather than
floating over the map or using the broken F23 overlay. Announce it once with
`role="status"`. Its pop settles within the reveal window; text remains until
the next Shift starts. Extensions have no new-Line notice or chime.

Play one short rising `sound.lineOpen()` cue at the start of a new-Line
Expansion. It uses the existing synthesised sound pipeline, mute preference
and gesture unlock, and is distinct from the Green wave and closure sounds.
There is no special entry chime for the initial KJ Line. Sound is additive:
everything remains understandable when muted or audio is unavailable.

F17's Line/Station totals and +N deltas update on acceptance, as today, and stay
until the next Shift's first accepted printable key. A shared-track Line can
therefore show +1 Line without a +Stations delta.

## Input, timing and lifecycle

Use a UI controller with a monotonic wall-clock deadline, separate from the
Career clock. Gate characters, Enter and Backspace before lesson dispatch,
start-tip bookkeeping, `runTick`/recorder calls, or engine actions. Input never
skips or extends the reveal. After the deadline, the next key is accepted even
if a throttled browser has not delivered the completion timer yet.

Before the first Career key, Escape exits through the existing Back to map
path. It does not skip into the lesson or mark the lesson seen. During an
Expansion reveal, preserve existing later-Shift Escape behavior and let End
Career handle retirement. Escape still provides the keyboard exit before the
first Career key; do not broaden keyboard confirmation behavior in this work.

UI reveal state includes a stable event id, before/after ranges, the deadline,
and the joining Line if any. Its lifetime is independent of simulation ticks,
camera renders and panel resizing. Effects may schedule completion and play
sound; do not trigger effects from a state updater or dispatch engine actions
from inside one. Deduplicate chimes by event id under StrictMode. Clean up
timers on exit, retirement or replacement. Returning from a hidden tab after
the deadline shows a settled map; do not replay an old cue.

Switching reduced motion on completes any active reveal immediately. It removes
draw, pop and badge motion and the wait, while retaining static notice text and
the one new-Line cue. Reduced motion must not depend only on CSS zeroing the
animation duration while a JavaScript lock keeps counting down.

## Architecture and scope

- A generic rendering module owns inclusive ranges, directed range differences
  and Station membership; it depends on network data, not `CareerState`.
- A rendering timing helper converts directed segments into draw/pop timings
  within the configured reveal window, using the existing easing curve.
- `MapCanvas` accepts optional range emphasis and temporary track-reveal data.
  With these absent its public behavior stays as it is today.
- `useDispatchReveal` owns UI deadlines and notice lifetime. A small
  `DispatchNetworkNotice` component owns the badge, copy and accessibility.
- `DispatcherScreen` coordinates accepted Expansions, entry/lesson handoff and
  input routing. `useDispatchLesson` supports deferred automatic start.

The engine, evidence version, replay, judge, balance and persisted profile
schema are unchanged. No new dependencies or runtime network requests are
needed. F11, F12, F16, F21, F23, F24, F25 and F26 remain separate work.

## Acceptance and verification

1. Shift 1 paints only KJ indices 4–17, including Kerinchi, with both outer
   tails and other Lines faded. Unserved KJ Station marks/labels stay faded.
2. New-Line and extension offers attach and draw without gaps in either
   direction, using the same shared-track offsets as existing overlays.
3. A new shared-track Line still draws and celebrates when it adds zero
   globally new Stations; those already served Stations do not pop again.
4. A first-time Career runs entry → lesson → ready; a returning Career runs
   entry → ready. Skip, How to play and Again follow the rules above.
5. Typing during either reveal changes no aim, tip-seen flag, Keylog, action
   log or Career clock. At the deadline the first accepted key works normally.
6. No-op Continue, ticks, resize, pan/zoom, pause/resume and StrictMode do not
   create or repeat reveals/chimes. Exit/retirement clean up pending work.
7. New-Line notice and F17 counts remain legible at desktop, tablet and narrow
   portrait widths in both themes. Reduced motion has no invisible input wait.
8. Focused unit/integration tests pass, followed by the full suite and build.
   Browser verification checks the actual draw/pop sequence, timing, geometry,
   panel overlap, muted/unmuted sound and reduced-motion behavior. Record what
   was observed and any remaining device/audio limitations in the tracker.
