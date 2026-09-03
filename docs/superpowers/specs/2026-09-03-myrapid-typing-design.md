# MyRapid Typing — Design Spec

**Date:** 2026-09-03
**Status:** Approved, ready for implementation planning

## Overview

A browser typing game built on the Kuala Lumpur Rapid KL rail network. The player drives a train across the real network by typing station names; the train advances one station per name completed.

Two modes share one engine:

- **Adventure** — free-roam exploration with no clock and no fail state. Visiting stations unlocks them permanently.
- **Rush Hour** — a survival mode where passengers accumulate at stations and the player's typing speed *is* the train's throughput. One overcrowded station ends the run.

The project is an unofficial fan work. It uses factual data (station names, line codes, geographic coordinates, official line colours) and an original schematic map layout, UI, and copy. It is not affiliated with Prasarana Malaysia or Rapid KL, and the interface must say so.

### Design rationale

The concept is inspired by densyatyping.com (type Japanese station names to travel a rail line) and Mini Metro (accumulating passengers, escalating waves, minimal flat aesthetic). Neither game's code, assets, copy, or visual identity is reproduced.

Adapting the concept to KL surfaces one problem the Japanese original does not have: KL station names are already in Latin script, so transcribing `Taman Paramount` is trivial. The Japanese original's difficulty comes from converting kanji to romaji in the player's head; nothing equivalent exists here.

Rush Hour is the answer. Rather than bolting on artificial timers or hiding the prompt, difficulty becomes systemic: passengers pile up while you type, so typing speed equals capacity, and the pressure scales itself. This also gives the two modes distinct purposes — Adventure teaches the network, Rush Hour tests you on it.

## Scope

**In scope:** the seven Prasarana-operated rail lines of the Klang Valley, roughly 180 unique stations.

| Line | Code | Route |
|---|---|---|
| Kelana Jaya Line (LRT) | KJ | Gombak ↔ Putra Heights |
| Ampang Line (LRT) | AG | Sentul Timur ↔ Ampang |
| Sri Petaling Line (LRT) | SP | Sentul Timur ↔ Putra Heights |
| Shah Alam Line (LRT3) | SA | Bandar Utama ↔ Johan Setia |
| KL Monorail | MR | KL Sentral ↔ Titiwangsa |
| Kajang Line (MRT) | KG | Kwasa Damansara ↔ Kajang |
| Putrajaya Line (MRT) | PY | Kwasa Damansara ↔ Putrajaya Sentral |

Exact per-line station counts are established during the data pass. They are derived from the data files wherever displayed and are not hardcoded anywhere in the application.

**Out of scope for v1:** KTM Komuter, KLIA Ekspres/Transit, BRT Sunway, buses. Any backend, user accounts, global leaderboards, or score submission. Browser E2E test suite. Localisation beyond English.

## Architecture

Static single-page application. Vite + React + TypeScript. All network data bundled as JSON. All player progress in `localStorage`. No server, no accounts, no network requests at runtime, no privacy surface. Deploys to any static host.

```
src/
  data/       lines.json, stations.json, links.json
  engine/     typing, network, run, progress
  sim/        rushhour, balance
  render/     MapCanvas, LineStrip, HUD
  ui/         screens
```

### Module boundaries

| Module | Responsibility | Depends on | Pure |
|---|---|---|---|
| `engine/typing` | target string + keystroke → next typing state | nothing | yes |
| `engine/network` | graph queries: neighbours, onward options from *(station, arrived-from)*, line completion | data | yes |
| `engine/run` | run lifecycle, position, history, metric accumulation | typing, network | yes |
| `sim/rushhour` | `(state, dt, seed) → state` passenger simulation | network, balance | yes |
| `sim/balance` | all tuning constants | nothing | data only |
| `engine/progress` | localStorage read/write, schema version, migrations | run | no (I/O) |
| `render/*` | SVG map, line strip, HUD | reads state | no (view) |
| `ui/*` | screens, routing, input wiring | all | no (view) |

`engine/typing`, `engine/network`, and `sim/rushhour` know nothing about React, timers, or storage. They are the correctness-critical modules and the test suite concentrates there.

## Data model

### `lines.json`

Per line: `id`, official `code` prefix, display `name`, brand `colour`, terminus names, and an ordered array of station ids.

### `stations.json`

Per unique station: a slug `id`, display `name`, the official per-line `codes` it carries, `demand` weight, and its real coordinates:

```json
{
  "id": "taman-paramount",
  "name": "Taman Paramount",
  "codes": { "KJ": "KJ22" },
  "demand": 1,
  "geo": { "lat": 3.1049, "lng": 101.6234 }
}
```

The lines a station serves are the keys of `codes`, so that fact is stored once rather than duplicated into a separate array.

**Screen coordinates are derived, not stored.** Geographic x/y is projected from `lat`/`lng` at load. Schematic x/y is expanded from a per-*line* path description — a start point plus a list of `[compass direction, station gaps]` segments — which makes the diagram octolinear by construction and gives every interchange a single agreed position. The renderer only ever reads a resolved `{x, y}`, so the view toggle stays a pure render concern.

`demand` is the passenger spawn weight: 1 for ordinary stops, higher for major hubs (KL Sentral, KLCC, Masjid Jamek). It is hand-set in the data file.

### `links.json`

Walk-transfer pairs between *differently named* stations joined by a walkway. There are five: Sultan Ismail ↔ Medan Tuanku, Dang Wangi ↔ Bukit Nanas, Plaza Rakyat ↔ Merdeka, KL Sentral ↔ Muzium Negara, and Glenmarie ↔ Glenmarie 2. These are explicit because nothing in the line sequences implies them. Free in Adventure; costs time in Rush Hour.

### Derived adjacency

Adjacency is computed at load from the line sequences and links, never hand-maintained. A station's neighbours are whatever sits either side of it on each line it serves, plus its walk links.

### Three network facts the model must handle

1. **Shared trunk.** Ampang and Sri Petaling run the same track from Sentul Timur to Chan Sow Lin. Those stations belong to two lines, and Chan Sow Lin is a branching decision, not an interchange.
2. **Same-station interchanges.** One station serving several lines (Titiwangsa, KL Sentral, Putra Heights, Kwasa Damansara, Bandar Tasik Selatan, Maluri, and others). Changing lines is free.
3. **Walk-linked pairs.** Covered by `links.json` above.

### Data validation

A validation script runs as part of the test suite and fails the build on: a non-contiguous line sequence, an asymmetric interchange, a station id referenced by no line, a duplicate station code, or a station missing either coordinate pair. Bad data fails loudly at test time rather than rendering a broken map at runtime.

## Map rendering

SVG, not canvas. Roughly 180 nodes and 7 polylines is trivial for SVG, and it buys crisp label text, straightforward hit-testing for junction clicks, and accessibility for free.

- Pan and zoom via a `viewBox` transform.
- The geographic ↔ schematic toggle interpolates every node position and every polyline vertex between the two coordinate sets over ~600ms. The map visibly reshapes itself, which doubles as a way to learn the network's real geography.
- Geographic coordinates come from public sources. The schematic layout is original work: octolinear (horizontal, vertical, and 45° runs only) with even station spacing.

### Visual style

Flat and minimal, in the manner of a transit diagram: thick flat line colours drawn from the real Rapid KL palette, simple geometric station marks, generous whitespace, no gradients, restrained type.

## Typing engine

### Input rules

- Comparison is **case-insensitive**. Everything else must match exactly, spaces included — they are part of the rhythm, and names like `Taman Perindustrian Puchong` and `USJ 21` need them.
- A wrong key counts as a mistake and **does not advance** the cursor. There is therefore no backspace, and no way to desync from the target.
- Digits appear in real names (`16 Sierra`, `Seksyen 7`, `SS 15`). Initialisms are typed as written (`KLCC`, `UPM`, `PWTC`); case-insensitivity handles them.

### Metrics

Computed per station and per run:

- **WPM** = correct characters ÷ 5 ÷ minutes elapsed (standard definition, so numbers compare to other typing sites)
- **Accuracy** = correct keystrokes ÷ total keystrokes
- **Score** = WPM × accuracy²

Squaring accuracy makes 90% cost nearly a fifth of the score, pricing sloppiness above raw speed.

### Movement

Completing a name advances the train one station: the marker eases along the polyline over ~400ms while the next prompt fades in, so typing and motion feel causally linked rather than turn-based.

### Junctions

Keyboard-first. On arriving at a station with more than one onward direction, movement pauses and the map highlights the candidates, each tagged with a number and its line code. No station prompt is active during junction selection, so keystrokes are unambiguously direction input: press `1`/`2`/`3` or type the line code to commit. Clicking also works. Reaching a terminus auto-reverses. A dedicated key turns the train around mid-line, so the player can never be stranded down an unintended branch.

## Adventure mode

No clock, no fail state.

- Start by searching any station by name, type it, choose a direction, and travel until you choose to stop.
- Visiting a station marks it visited permanently. A line is complete when all its stations are visited.
- Per-line progress bars on the home screen.
- Run summary: stations visited, newly unlocked stations and lines, run WPM / accuracy / score, fastest and slowest stations of the run.
- Position saves after every station, so a journey resumes days later.

## Rush Hour mode

Available from the main menu immediately. Neither mode gates the other.

The player selects which lines to include in a run — one line is a tight, legible puzzle; all seven at once is chaos. This picker is the difficulty dial, not a progression lock, and every line is selectable from the first launch.

Adventure is not a prerequisite. Completing a line is Adventure's own payoff — the satisfaction of having typed a whole line end to end is what makes the typing concept work, and turning it into a lock on the other mode would make it feel like homework while hiding the more novel half of the game behind 37 stations of typing.

### Passengers target a line, not a station

Each waiting passenger carries a destination **line**, and is delivered the moment the train reaches any station served by that line.

This is the central mechanical choice:

- Interchanges become valuable — arriving at Titiwangsa can deliver Monorail, Ampang, and Sri Petaling riders at once.
- The junction choice becomes strategic: head toward whichever line most current riders want.
- It cannot soft-lock, because every line is always reachable. Per-station destinations would allow a carriage full of Putrajaya riders while the train is stuck in Klang.
- It is cheap to evaluate: intersect the station's line list with the passenger's target.

### Simulation loop

- Stations have a queue capacity (base 6, interchanges 8).
- Passengers spawn at a rate of *phase multiplier × station `demand`*.
- The train has a capacity starting at one carriage.
- Arriving at a station alights everyone whose target line it serves, then boards from the queue up to remaining capacity.
- When a queue reaches capacity an overflow timer starts and the station's ring begins filling. If it empties, **the run ends**. One overflowing station is enough.

The simulation is a pure function `(state, dt, seed) → state` with a seeded RNG, so runs are fully reproducible in tests. No timers or DOM inside it; the React layer calls it once per animation frame.

### Day cycle

A run is a commuting day: Off-Peak → Morning Peak → Midday → Evening Peak → Late Night, then Day 2 at higher multipliers, and onward.

### Upgrades

Surviving each peak offers a choice of three, drawn from a pool of six:

| Upgrade | Effect |
|---|---|
| +1 Carriage | +4 train capacity |
| Express | a streak of perfect stations skips the next stop free |
| Station upgrade | +50% queue capacity at one station the player picks |
| Overtime | +10s overflow tolerance network-wide |
| Announcement | shows the next three station names ahead, so the player can read ahead |
| Depot | one-time full clear of the worst-crowded station |

### Scoring

Headline score is passengers delivered. The summary also shows day and phase reached, WPM, and accuracy.

### Balance

All tuning constants — spawn rates, queue capacities, phase durations and multipliers, overflow tolerance, walk-transfer time cost, and upgrade magnitudes (including the Express streak length) — live in `sim/balance.ts`. Balancing never means touching logic.

## Persistence

A single versioned `myrapid.v1` localStorage record holding:

- visited stations
- completed lines
- per-station best WPM
- Adventure resume position
- Rush Hour high scores per line-set
- WPM history for the stats screen

The record carries a schema version with a migration path. A corrupt or unreadable save falls back to a fresh profile with a visible notice rather than a white screen.

## Error handling and accessibility

- **Window blur during Rush Hour auto-pauses.** Losing a run to an incoming call is infuriating and entirely avoidable.
- **`prefers-reduced-motion`** disables the map morph and train easing.
- **Colour is never the sole signal.** Line codes are always shown as text. Passenger destinations are colour-coded by definition, so without this, colour-blind players cannot read the core game state.
- **Corrupt or absent save** → fresh profile with a non-blocking notice.
- **Invalid data** → caught by the validation script at test time, never at runtime.
- **Unofficial-project disclaimer** visible in the UI.

## Testing

Concentrated on the pure modules:

- `engine/typing` — state machine: correct keys, wrong keys, case-insensitivity, spaces, digits, completion.
- `engine/network` — graph queries: neighbours, onward options including the Ampang/Sri Petaling trunk split, terminus reversal, walk links, line completion.
- `sim/rushhour` — seeded, deterministic: spawning, boarding, alighting, capacity limits, overflow and run-end conditions, phase transitions, upgrade effects.
- Scoring — WPM, accuracy, and score formulas.
- `engine/progress` — save round-trips, schema migration, corrupt-save recovery.
- Data validation — the script itself, plus the real data files.
- One scripted integration run over a known route asserting end-to-end metrics.

No browser E2E suite in v1.

## Build order

1. Data layer — `lines.json`, `stations.json`, `links.json`, derived adjacency, validation script.
2. Map renderer — SVG, both coordinate sets, pan/zoom, layout morph.
3. Typing engine and movement — `engine/typing`, `engine/network`, `engine/run`.
4. Adventure mode — start search, junctions, unlocking, run summary, persistence.
5. Rush Hour — `sim/rushhour`, `sim/balance`, HUD, day cycle, upgrades, scoring.

Adventure exercises every subsystem except the simulation, so by the time Rush Hour begins, coordinates, routing, junction UI, and typing correctness are already proven. Rush Hour then reduces to a simulation module plus a HUD.

This is a build order, not a dependency between the modes — both ship in v1 and both are available from the menu.
