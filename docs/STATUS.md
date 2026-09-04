# MyRapid Typing — status and handoff

**Last updated:** 2026-09-04

A typing game on the Kuala Lumpur Rapid KL rail network. Type station names to
drive a train across the Klang Valley.

> **Read this first if you are picking the project up.** The specs and plans in
> `docs/superpowers/` describe what was *intended*; this file describes what
> actually exists, what is deliberately the way it is, and what is still wrong.

## Getting started

Everything is on `main`.

```bash
npm install
npm run dev
npm test        # 167 tests
```

`npx tsc --noEmit` and `npm run build` are both clean. Build is ~122 kB gzipped.

## What exists

Two playable modes, both driven by the same engine.

**Line Run** — the main entry point. Pick a line off the map (click, or type its
two-letter code), choose which terminus to start from, and type the line end to
end. Interchanges never prompt; the route is fixed.

**Adventure** — free roam. Start anywhere, and choose a direction at every
junction. Stations unlock permanently as you visit them, and a journey can be
resumed after closing the tab.

The home screen *is* the map: the seven Rapid KL lines drawn over a real
Klang Valley coastline, with per-line and overall progress.

## Architecture

```
src/
  data/      network JSON + types + validation      (154 stations, 7 lines, 5 walk links)
  engine/    pure game logic: network, typing, metrics, run, lineRun, progress
  geo/       projection, schematic layout, fitting, shared networkLayout
  render/    SVG map, train marker, prompt, HUD, line strip, pan/zoom
  ui/        screens: HomeMap, LineRunScreen, AdventureScreen, SummaryScreen
  audio/     Tone.js-backed synthesised sound, menu ambience, UI cues
```

### Invariants that are easy to break

These are load-bearing. Each one was a real bug at some point.

1. **One projection, from `geo/networkLayout.ts`.** Never build another. Screens
   used to each make their own, which put them in different coordinate spaces —
   the same station had different x/y per screen, so moving between them could
   only ever jump, and the backdrop drifted off the tracks.

2. **`src/engine/*` is pure.** No React, no timers, no storage. Time enters as a
   `now` parameter, which is what makes runs reproducible under test. Keep it
   that way; it is where the tests concentrate.

3. **Colour is never the only signal.** Line codes appear as text wherever a line
   colour does. Roughly 8% of men have some colour vision deficiency, and this
   game encodes seven lines by hue.

4. **Motion is CSS wherever possible**, so the `prefers-reduced-motion` block in
   `index.css` suppresses it centrally. That block zeroes *delays* as well as
   durations — with `animation-fill-mode: backwards`, a delayed element would
   otherwise sit invisible and then pop.

5. **No network requests at runtime.** All data is bundled, including the map
   backdrop. Sound is synthesised in-process rather than sampled partly to
   preserve this.

6. **Never call `setState` inside another state updater.** That is a render-phase
   update; React warns and it can loop. Persistence and sound both run from
   effects for this reason.

7. **`fitViewBox` padding is per-side**, because panels overlay the map — the
   line picker on the right, the typing panel across the bottom. Symmetric
   padding hides content underneath them.

8. **SVG radii are user units and inflate as the view zooms.** Marks scale
   against view width and strokes use `vector-effect: non-scaling-stroke`.

9. **Sound must be unlocked by a real user gesture.** `installAudioUnlock()`
   handles this by calling `Tone.start()` from the first real keydown or
   pointerdown. Sounds fire from effects, which are too late for the browser's
   autoplay policy — without the unlock, everything is silently suspended.

## Known debt

Nothing here is blocking, but all of it is real.

- **Line colours** were sampled from the official map PDF, which stores CMYK, so
  these are a CMYK→sRGB conversion rather than Prasarana's published sRGB values.
  Sri Petaling and Kelana Jaya read similarly; Kajang and Monorail are both
  green. Wikipedia lists different values if you want to compare.
- **Schematic layout**: Shah Alam never crosses Kelana Jaya, so the walk-linked
  Glenmarie pair sits four grid cells apart and reads as two unrelated stations.
  Pure data in `lines.json` — fixable without touching code.
- **Three same-name station pairs** (Ampang Park, Bukit Bintang, Bandar Utama)
  are physically two stations joined by a walkway but collapse into one record,
  so they draw as a single dot and transfer is free.
- **One unexplained behaviour**: the map's framing effect did not apply its focus
  target on mount (StrictMode double-invoke is the likely cause). Worked around
  by seeding `usePanZoom`'s initial state from the same computed target, which is
  sturdier anyway — but the root cause was never confirmed.

## What is next

**Rush Hour** — the survival mode from the original spec, and the only major
piece never built. Passengers accumulate at stations; your typing speed is the
train's throughput; one overcrowded station ends the run. It is fully specified
in `docs/superpowers/specs/2026-09-03-myrapid-typing-design.md` and was always
intended as its own plan. The redesign it needs to sit on is now done.

**The domain model.** `CONTEXT.md` and ADR 0001 are written; the code that
matches them is not. Nothing in `src/` has been renamed or moved yet, so the
glossary currently reads as intent rather than description. The gaps it names
are real and were found by reading the code:

- Line Run's route and end rules live in `LineRunScreen.tsx:85-99`, not in
  `engine/lineRun.ts`. They have no direct test because they sit in a React
  callback.
- `RunState` carries `options`, which Line Run never reads, and no `route`,
  which is why the rule ended up in the screen.
- `src/engine/progress.ts` calls `localStorage`, which contradicts invariant 2
  above. The original design spec marked it impure by design, so the two
  documents have disagreed from the start.
- The same action is labelled "End run" in one screen and "End journey" in the
  other, and both lead to a summary headed "Journey complete".
- `DirectionChooser` and `JunctionPicker` share the `aria-label` "Choose a
  direction" for two different concepts.

The spec has the full plan. It is a refactor, not a feature, and nothing is
blocked on it.

Smaller candidates: a stats/history screen (`wpmHistory` is already recorded in
the profile but never displayed), and the aesthetic debt above.

## Working notes

Two process things that mattered more than expected:

**Screenshots caught what tests could not.** Six real defects were found only by
rendering the app and looking at it — a map squashed 57× by a unit mismatch,
invisible land, station dots that failed to dim, real coastline drawn under an
abstract diagram, panels covering the network, and oversized marks at high zoom.
Every one passed the test suite. The method:

```bash
npm run dev &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/shot.png --window-size=1400,900 --virtual-time-budget=6000 \
  http://localhost:5173/
```

`--dump-dom` is useful for reading computed attributes such as the live viewBox
when a visual check is ambiguous.

**A red test is never accepted on the strength of an explanation.** One was
reported as an unavoidable jsdom limitation; jsdom was fine and the test was
simply synchronous while the behaviour was animated.

## Document map

| Document | What it is |
|---|---|
| `CONTEXT.md` | The glossary. Canonical names for domain concepts — read it before naming anything. |
| `docs/superpowers/specs/2026-09-03-myrapid-typing-design.md` | Original design. Includes the full Rush Hour specification. |
| `docs/superpowers/plans/2026-09-03-foundation-and-adventure.md` | Plan 1 — 27 tasks, complete. |
| `docs/superpowers/specs/2026-09-04-map-first-redesign-design.md` | Redesign spec: map as home, Line Run. |
| `docs/superpowers/plans/2026-09-04-map-first-redesign.md` | Plan 2 — 13 tasks, complete. |
| `docs/superpowers/specs/2026-09-04-domain-model-design.md` | Lightweight domain model. **Designed, not implemented.** |
| `docs/adr/0001-run-state-per-mode.md` | Why a Run's state is a per-mode union. |

Work done after Plan 2 was driven by direct feedback rather than a plan: the
train being positioned by typing progress, error feedback, synthesised sound,
the micro-animations, the line-completion sweep, and the journey shape on the
summary screen. This file is the record of it.

## Unofficial

Not affiliated with Prasarana Malaysia or Rapid KL. Station names, codes, and
line colours are public information. Map boundaries derive from Natural Earth
(public domain).
