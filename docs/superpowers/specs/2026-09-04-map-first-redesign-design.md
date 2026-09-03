# MyRapid Typing — Plan 2: Map-First Redesign

**Date:** 2026-09-04
**Status:** Approved, ready for implementation planning
**Follows:** `2026-09-03-myrapid-typing-design.md` (Plan 1, complete — 111 tests, Adventure mode playable)

## Why

Plan 1 shipped a correct game with no presentation. Playing it revealed two defects and one design failure.

**Defect 1 — the map showed the wrong region.** `MapCanvas` hardcodes a default viewBox of `0 0 1000 800`, but the schematic layout spans x −924…440 and y −440…660. Only **32% of stations fell inside the visible box**; the rest sat off-screen to the left. Zooming also felt wrong, because the focal-point maths was anchored to a box that did not match the content.

**Defect 2 — nothing laid out the screens.** There were zero CSS rules for `.adventure`, `.home`, `.summary`, or `.station-search`. `.map-canvas` carries `height: 100%` inside an auto-height parent, so it collapsed to its viewBox aspect ratio — 1120px tall in a 1400px-wide window — pushing the prompt, HUD, line strip, and end-run button below the fold. The player saw only a map.

**The design failure:** starting a run required clicking through a menu. In a typing game, reaching for a mouse to begin is the wrong first impression.

## Goal

The map *is* the game. Land on a geographic map of the Klang Valley with all seven lines drawn on it, pick a line, and start typing.

## References

Two existing games solve this well and are worth studying: densyatyping.com (a map of Japan with rail lines overlaid) and tw-metro-typing.yencheng.dev (Taiwan's administrative boundaries with metro lines, select a line to play). We take the *interaction pattern* — map as home, select a line, type its stations in order — and the general sense of motion. Layout, styling, and assets are our own work; no code, CSS, or artwork is copied from either.

## What changes

### 1. Home becomes the map

The landing screen is a geographic map of the Klang Valley: a muted land/boundary backdrop with all seven lines drawn over it in their real positions, station dots along each.

No menu stands in front of it. Per-line progress moves onto the map itself — a line's stroke shows how much of it you have visited.

Two things Plan 1 put on the home screen must survive the redesign, since both are requirements rather than decoration:

- **The unofficial-project disclaimer**, which keeps the interface from implying endorsement by Prasarana or Rapid KL. It sits in a persistent footer.
- **The corrupt-save notice** (`profile.recovered`), so a player whose progress could not be read is told plainly rather than silently finding it gone. It appears as a dismissible banner on first load.

### 2. Selecting a line

Click a line, or press its two-letter code. The chosen line brightens, the others dim, and the view eases to fit it. A direction chooser then offers the two termini; picking one starts a Line Run.

Keyboard is a first-class path throughout: codes select, arrows or `1`/`2` choose direction, `Enter` confirms, `Escape` returns to the whole-network view.

### 3. Line Run — a new mode

Type a line end to end from a chosen terminus. No junction decisions; the route is fixed. Ends at the terminus with a summary. This becomes the primary entry point, because it is immediately legible: pick the line you know, type it.

### 4. Adventure is retained

Free-roam with junction choices, exactly as built in Plan 1. Nothing about the engine changes.

It is entered from the same map in one of three ways: clicking any station dot, typing a station name into a search field that is focused on load, or resuming a saved journey. Selecting a *line* starts a Line Run; selecting a *station* starts an Adventure.

### 5. Play screen layout

The map fills the viewport as a live backdrop. A typing panel floats over the lower third carrying the prompt, line strip, and HUD. The map stays visible so the journey is felt; the text being read never moves.

## Map backdrop

A simplified outline of the Klang Valley — coastline and the boundaries of Selangor, Kuala Lumpur, and Putrajaya — rendered beneath the lines.

**Source and licence.** Boundary geometry comes from Natural Earth, which is public domain. It is clipped to the network's bounding box, simplified, and **committed as JSON** so the app still makes no network requests at runtime. If Natural Earth's resolution proves too coarse at this scale, any public-domain or permissively-licensed source is acceptable provided its licence is recorded in the README.

**One projection, shared.** The backdrop must be projected with the *same* Web Mercator function already used for stations (`src/geo/project.ts`). Two projections would put the tracks in the sea. This also means no new mapping dependency is needed — no d3-geo, no topojson.

## Motion

Timings are deliberate; motion that overstays makes a game feel sluggish.

| Moment | Behaviour | Duration |
|---|---|---|
| Select a line | View eases to fit that line; others dim | 500ms |
| Deselect / Escape | View eases back to whole network | 500ms |
| Train arrives at a station | Marker eases along the track *(built in Plan 1)* | 400ms |
| Station name completed | Brief pulse on the station dot | 250ms |
| Line strip advance | Slides forward one station | 300ms |
| Junction cards | Stagger in | 200ms, 40ms apart |
| Geographic ↔ schematic | Layout morph *(built in Plan 1)* | 600ms |

Every one of these is suppressed under `prefers-reduced-motion`, which Plan 1 already honours in the two existing animations.

## Design system

Defined once as CSS custom properties, then used everywhere.

- **Colour:** the existing dark ground (`#12141a`), foreground, dim, and accent tokens, plus land and boundary tones for the backdrop. Line colours stay as the data holds them.
- **Type scale:** a single ratio-based scale. The typing prompt is the largest element on screen by a wide margin — it is what the player reads.
- **Spacing:** one rhythm unit, used for all gaps and padding.
- **Surfaces:** the floating typing panel needs enough contrast against an arbitrary patch of map beneath it to stay readable — a translucent panel with a blur, or a solid one if blur proves unreliable.

Colour is never the sole carrier of meaning; line codes remain visible as text wherever a line colour appears. This rule carries over from Plan 1 unchanged.

## Non-goals

Timed sprint modes. Chinese/Japanese input handling. A stats or history screen. Mobile-specific layouts beyond not breaking. Rush Hour — that remains a later plan, and this redesign is what it will be built on.

## Testing

The existing 111 tests must continue to pass unedited; this plan changes presentation and adds a mode, and breaks no engine behaviour.

New tests concentrate where logic actually exists:
- **Fitting a viewBox to content bounds** — pure geometry, including padding and aspect-ratio handling.
- **Line-run route construction** — given a line and a terminus, the correct station sequence in the correct order.
- **Line selection state** — which line is active, what dims, what the view fits to.
- **Backdrop projection** — the outline projects with the same function as stations, and lands inside the same bounding box.

Visual appearance is verified by rendering the app headlessly and looking at it — the one thing the Plan 1 process never did, and the reason both defects shipped.

## Definition of done

- Every station is inside the initial view on load, at every common window size
- No screen has content below the fold that the player needs
- A line can be selected, its direction chosen, and run to its terminus by keyboard alone
- Adventure mode still works and still resumes
- The backdrop sits under the tracks with the two in register
- All motion honours `prefers-reduced-motion`
- `npm test`, `npx tsc --noEmit`, and `npm run build` all clean
- A screenshot of each screen has been looked at
