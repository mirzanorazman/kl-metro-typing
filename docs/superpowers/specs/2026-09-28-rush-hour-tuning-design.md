# Rush Hour — tuning, Junction rows, and tips

**Date:** 2026-09-28
**Status:** Agreed with the user after a playtest; not yet implemented.
**Amends:** `2026-09-28-rush-hour-design.md`. Where the two disagree, this
document wins. Vocabulary follows `CONTEXT.md`.

## Why

A playtest found Rush Hour confusing and not challenging:

- **Confusing:** where to go and why a Passenger did or did not alight; the
  Junction chooser (too much per option); how to start.
- **Not challenging:** the first half-full Queue appeared after 90–150 s, and
  Runs lasted 5–11 minutes with length independent of typing speed on every
  Line set except MR.

Root cause, measured with a planner typist in a scratch copy of the engine: on
long Lines the Run ends at a far Station the train never visited, 10–20 hops
away. Spawn timing is fixed per seed and spawns are spread over the whole Line
set, so the same distant Station overflows at the same moment whatever the
player does. Longer Overflow times only delay it; no speed reaches it.

Goals the rebalance tunes toward:

| | ~40 WPM | ~60 WPM | ~90 WPM |
|---|---|---|---|
| First half-full Queue | < 30–60 s | same | same |
| Typical Run length | ~1.5 min | ~2.5 min | ~4 min |
| Delivered | rises clearly with speed on every Line set | | |

## 1. Rebalance

### Spawns centre on the train

Replaces "Spawns happen only at Stations on the Line set, chosen weighted by
`demand`" in the v1 spec's Passengers section.

- A spawn's Station is chosen weighted by
  `demand × e^(−hops / SPAWN_FALLOFF_HOPS)`, `SPAWN_FALLOFF_HOPS = 3`
  (weight roughly halves every two hops).
- `hops` is the rail distance over the Line set (Walk links excluded) from the
  train's current Station `at` — the Station being typed toward, or the Junction
  the train stands at. Stations unreachable by rail from `at` get weight 0; if
  every weight is 0 the spawn falls back to plain `demand` weighting.
- Rail distances are computed once per Line set and cached alongside
  `rushGeometry`, keyed by source Station.
- The PRNG draws are unchanged (one for the Station, one for the target), so
  spawns stay deterministic and Replay stays exact: `at` is itself a function
  of the Keylog and action log.
- The base spawn rate is still normalised by the Line set's total `demand`.

### Arriving resets the Overflow ring

Adds to "On arrival" in the v1 spec's train section: **3.** the Station's
Overflow ring resets to 0, whether or not anyone could board.

### Constants (`src/engine/rushBalance.ts`)

| Constant | Was | Now |
|---|---|---|
| `CARRIAGE_CAPACITY` | 4 | 8 |
| `BASE_SPAWN_PER_SECOND` | 0.3 | 0.6 |
| `DAY_ESCALATION` | 0.3 | 0.5 |
| `SPAWN_FALLOFF_HOPS` | — | 3 |

| Day phase | Duration | Multiplier |
|---|---|---|
| Off-Peak | 10 s | ×0.8 |
| Morning Peak | 40 s | ×1.8 |
| Midday | 20 s | ×1.0 |
| Evening Peak | 40 s | ×2.0 |
| Late Night | 15 s | ×0.6 |

A Day is now 125 s. Queue capacities, `OVERFLOW_MS`, the drain factor and
`WALK_PENALTY_MS` are unchanged. These are the starting values; a final tuning
pass against the goal table may move them (known leans: MR slightly harsh at
40 WPM, all seven Lines slightly lenient).

Measured with these values (planner typist, median of five seeds):

| Line set | 40 WPM | 60 WPM | 90 WPM |
|---|---|---|---|
| KJ | 87 s · 28 delivered | 161 s · 81 | 192 s · 140 |
| MR | 64 s · 12 | 93 s · 33 | 129 s · 75 |
| KJ+AG+SP | 146 s · 47 | 190 s · 96 | 240 s · 151 |
| All seven | 181 s · 31 | 185 s · 53 | 246 s · 96 |

Tried and dropped: weighting target Lines toward nearby Interchanges and
longer Overflow times (little effect once spawns are local).

### Tests

- The probe gains the **planner typist**: it scores each reachable Station by
  what it would deliver plus how full its Queue and ring are, divided by
  distance, heads for the best one, and turns around when the previous Station
  is closer to it. It lives beside the greedy typist in the probe.
- The balance sanity test becomes: with the planner typist, a 90 WPM typist
  outlasts a 40 WPM typist on KJ and on all seven Lines (median of three
  seeds), and some Queue reaches half Capacity within 60 s.
- Engine unit tests: spawn weighting follows rail distance from `at`; arrival
  resets the ring; Replay of a Run under the new rules is exact.
- The branch is unmerged, so no stored Rush Hour evidence needs a version bump.

## 2. Junction rows (Rush Hour only)

Replaces the v1 spec's line "the Direction chooser annotates each Direction
with how many of the Load its Line alone would deliver at the next Station".

Each option is one compact row:

```
1  [KJ] Bangsar        ↓2  ●●●○○○
2  [KJ] Pasar Seni         ●○○○○○○○
3  🚶 Walk to Muzium Negara
```

- Key, Line badge, next Station name.
- `↓N`: how many of the Load alight at that next Station (`deliverableAt`);
  omitted when 0.
- That Station's Queue as pips out of its Capacity; the pips turn to the
  warning colour while its Overflow ring is filling.
- Walk options are numbered after the rail options and selectable by key (today
  they are click-only).
- The Line name and "toward …" are dropped here. Adventure's chooser is
  unchanged: `JunctionPicker` gains a compact variant or Rush Hour renders its
  own rows, whichever keeps `JunctionPicker` simpler.

## 3. Tips and setup

### Just-in-time tips

Each tip shows once per profile, the first time its moment happens:

| Id | Moment | Text |
|---|---|---|
| `start` | Run ready, before the first key | Type the station name to start. Passengers appear near your train. |
| `board` | First arrival where anyone boards | Riders board automatically. The badge shows the line they want. |
| `deliver` | First Delivered | Riders get off at any station on their line. |
| `junction` | First Junction | Pick a way by its number. ↓ = riders getting off there, dots = people waiting. |
| `walk` | First Junction offering a Walk | Walk to switch lines. Typing locks for 5 s. |
| `overflow` | First Overflow ring starts filling | A full station starts to overflow. Visit it to reset the ring — if it fills, the Run ends. |

- **Freezing.** A tip that fires while the Run is running logs a `pause`
  action and shows the tip card in place of the Paused overlay. Any key or
  click dismisses it and logs `resume`; that key is not typed. Pauses are
  already legal in an Eligible Run, so Replay and bests are unaffected. The
  `start` tip fires before the clock starts and needs no pause; the first
  printable key both dismisses it and starts the Run as usual.
- If two moments coincide (e.g. `board` and `deliver` on one arrival), the tips
  queue and show one after another within the same pause.
- Detection lives in the screen, by comparing the state before and after each
  update; the engine stays unaware of tips.
- **Persistence:** `Profile.rushTipsSeen?: string[]` — optional and additive,
  carried forward by `migrate`'s spread like `theme`. No version bump.
- A **How to play** button on the Rush Hour setup screen clears
  `rushTipsSeen`, so the next Run shows the tips again.

### Setup

- Label the two steps "1 · Lines" and "2 · Start station".
- The start step's empty search lists the busiest Station (highest `demand`,
  Interchanges first) on the Line set at the top, highlighted, so Enter starts
  there immediately.
- The run screen's ready hint reads "Type the station name to start" (the
  `start` tip says the same the first time).

## Out of scope

The deferred items in the v1 spec stay deferred. No change to Quick Run,
Adventure, or the Adventure Junction chooser.
