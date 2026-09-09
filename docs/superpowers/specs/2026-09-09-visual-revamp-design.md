# Visual Revamp — Design Spec

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning

## Overview

The app currently renders in an improvised dark slate palette with a single
amber accent, system fonts, and undecorated SVG map marks. A design pack now
exists — a design-system document, a token file, and four rendered mockups —
that describes a considerably more specific identity: a Rapid KL transit
diagram treated as the playable surface, rendered either as warm cartographic
paper or as midnight transit, with signage typography and illustrated rolling
stock.

This spec covers replacing the app's visual system with that identity. It
changes how the app looks, not what it does. No game rule, engine function, or
persisted score changes; the one data addition is a display preference.

### Source material

The design pack lives in `docs/design/` and is gitignored — it is visual
reference, not source. It is a Stitch export and contains internal
contradictions, resolved below.

| File | Role |
|---|---|
| `myrapid_typing_design_system_design.md` | System doc: tenets, palettes, type scale, component rules |
| `warm_paper_cartography/DESIGN.md` | Token file for the light atmosphere |
| `myrapid_typing_map_first_game_interface_light_mode/` | Light home/map mockup + rendered HTML |
| `myrapid_typing_map_first_game_interface/` | Midnight home/map mockup + rendered HTML |
| `myrapid_typing_in_game_active_typing_state/` | Midnight in-game typing mockup + rendered HTML |
| `myrapid_typing.png/`, `screenshot_*/` | Reference screenshots, no code |

### Contradictions in the pack, and how they are resolved

The pack disagrees with itself in three places. Each is resolved here so the
implementation has one answer.

**Which atmosphere is default.** The system doc calls Dark "Midnight Transit"
the default and in-game atmosphere; `warm_paper_cartography/DESIGN.md` is
entirely light paper. Mockups exist for both, with identical layouts.
*Resolution:* ship both, behind a binary toggle. Neither is privileged in the
code; the first-run default follows `prefers-color-scheme`.

**Typography.** The system doc specifies Inter / Plus Jakarta Sans; the
warm-paper doc specifies Space Grotesk + Geist; the rendered mockups load Plus
Jakarta Sans + JetBrains Mono and nothing else. *Resolution:* follow the
rendered mockups — they are what the screenshots actually show. Space Grotesk
and Geist are not used.

**Rail colours.** Four different palettes exist: one in the system doc, one in
the warm-paper doc, one in the mockups' Tailwind config, and the current
`src/data/lines.json`. *Resolution:* adopt the mockups' Tailwind config values,
which are the closest to official Rapid KL branding.

## Decisions taken

These were settled before this spec was written and are not open for
rediscovery during implementation.

1. **Both atmospheres, binary toggle.** Not a tri-state with an explicit
   "system" option — the toggle sits beside a binary sound toggle and a
   three-way control there would be noise for little gain. First run reads
   `prefers-color-scheme`; after that the choice is explicit and persisted.
2. **Re-skin plus map furniture.** Every existing screen is restyled, and the
   map gains its cartographic furniture. No new game data and no new chrome.
3. **Self-hosted fonts.** `@fontsource-variable/plus-jakarta-sans` and
   `@fontsource-variable/jetbrains-mono` (both 5.3.0, verified present on npm),
   imported in `main.tsx`. No third-party request at runtime; the app keeps
   working offline.

## Scope

**In scope**

- A token layer carrying both palettes, consumed by every stylesheet.
- Self-hosted typefaces and the type scale built on them.
- Map furniture: dot grid, restyled station nodes, illustrated train carriage,
  rail glow, completed-track highlight, active-station beacon, station labels,
  district watermarks, compass, scale bar.
- Chrome restyling on every screen: panels, buttons, line badges, typing
  prompt, HUD, line strip, summary, leaderboard, direction chooser, junction
  picker, station search.
- A persisted theme preference and its toggle.

**Out of scope** — present in the mockups, deliberately not built:

- The top mode strip (`LINE RUN` / `ADVENTURE` / `LEADERBOARD`).
- The line-pill filter bar.
- The bottom telemetry strip (`SPEED` / `ACCURACY` / `STREAK` / `NEXT`).
- Per-line `BEST RUN` times — this needs a new persisted field and is a
  feature, not a re-skin.
- The mockups' `ESC PAUSE / EXIT` and `TAB RESTART` affordances, which imply
  run controls the app does not have.

## 1. Theme system

### 1.1 Tokens

A new `src/styles/tokens.css`, imported first in `main.tsx`, ahead of
`index.css`. Every other stylesheet consumes variables and declares no literal
colour. Paper is defined on bare `:root`; midnight overrides under
`[data-theme='midnight']`.

| Token | Paper | Midnight | Used for |
|---|---|---|---|
| `--paper` | `#F7F5EE` | `#0B0F17` | Canvas and map ground |
| `--paper-sub` | `#F0EDE3` | `#101725` | Landmass, terrain fills |
| `--paper-edge` | `#DED8CB` | `#1A273C` | Landmass outlines |
| `--panel` | `#FFFFFF` | `rgba(17, 24, 39, 0.85)` | Floating surfaces |
| `--panel-edge` | `#DED8CB` | `#1F293D` | Hairline borders |
| `--panel-shadow` | `0 4px 16px -2px rgba(60,52,42,.10)` | `0 8px 24px rgba(0,0,0,.45)` | Panel elevation |
| `--panel-blur` | `none` | `blur(8px)` | Backdrop filter |
| `--ink` | `#14181F` | `#F8FAFC` | Primary text, typed characters |
| `--ink-muted` | `#5C6470` | `#94A3B8` | Secondary text, telemetry labels |
| `--ink-faint` | `#A29E94` | `#475569` | Untyped characters, inactive marks |
| `--grid-dot` | `#D9D4C7` | `#1A2438` | Drafting dot grid |
| `--track-done` | `#14181F` | `#FFFFFF` | The stretch of rail already typed |
| `--error` | `#E53935` | `#EF4444` | Mistyped character |
| `--focus-ring` | `#14181F` | `#F8FAFC` | Keyboard focus outline |

Two further tokens are **fixed across both atmospheres** — `--badge-ink`
(`#14181F`) and `--badge-paper` (`#FFFFFF`). See §1.3 for why they must not
follow the theme.

Midnight also sets `color-scheme: dark`; paper sets `color-scheme: light`.

Rail colours stay a single shared set — one palette works on both grounds, and
forking them per theme would require a theme-aware colour lookup on every
render for no demonstrated benefit. They live in `src/data/lines.json`, updated
to:

| Line | Current | New |
|---|---|---|
| KJ | `#ED114C` | `#ED254E` |
| AG | `#F48412` | `#F78F1E` |
| SP | `#881211` | `#98002E` |
| SA | `#1EA6E6` | `#0099FF` |
| MR | `#80CC28` | `#84BD00` |
| KG | `#0A8137` | `#00A859` |
| PY | `#FCD006` | `#FFC72C` |

`#98002E` is the darkest of the seven and the one at risk of disappearing into
the midnight ground. If QA finds it illegible there, the shared value is
lightened — the palette does not fork.

### 1.2 Typography

Two variable faces, exposed as tokens:

```
--font-sans: 'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace;
```

Sans carries UI copy and headings. Mono carries every telemetry and signage
surface: HUD figures, station counts, line codes, the line strip, leaderboard
tables, summary statistics, and the typing prompt itself.

The scale, from the system doc:

| Role | Size | Treatment |
|---|---|---|
| Typing target | `clamp(1.75rem, 4vw, 2.25rem)` | mono, 700, uppercase, `0.08em` |
| Brand wordmark | `0.9375rem` | sans, 700, uppercase, `0.1em` |
| Telemetry | `0.6875rem`–`0.75rem` | mono, 500, uppercase, tabular figures |
| Line badge | `0.6875rem` | mono, 700, in a 22px tablet |
| Station label (map) | `0.6875rem` | mono, 600, uppercase, `0.08em` |

The typing prompt is uppercased with `text-transform`, never by transforming
the target string. `applyKey` in `src/engine/typing.ts` already compares
case-insensitively (`key.toLowerCase() === expected.toLowerCase()`), so the
display change is purely visual: the target stays as authored, and tests
asserting on accessible names such as `Type Masjid Jamek` keep passing.

### 1.3 Line badges

Line codes become 22×22px tablets with a 4px radius, filled with the line
colour. Two of the seven — `PY` `#FFC72C` and `MR` `#84BD00` — are too light to
carry white text at an accessible contrast.

Foreground is therefore chosen at render time by a small helper in
`src/render/contrast.ts`:

```ts
/** Relative luminance per WCAG 2.1, on sRGB hex. */
export function luminance(hex: string): number;
/** Whichever of `--badge-paper` / `--badge-ink` contrasts better with `hex`. */
export function contrastText(hex: string): string;
```

The two badge tokens deliberately **do not** vary by theme. `--ink` and
`--paper` invert between atmospheres, so resolving a badge foreground through
them would give the `PY` yellow dark text on paper and white text on
midnight — illegible in the second. `--badge-ink` and `--badge-paper` are fixed
values that mean "the dark one" and "the light one" regardless of ground.

The helper picks whichever of the two yields the higher WCAG contrast ratio
rather than testing luminance against a fixed pivot, because no single pivot
gets all seven right. Against the adopted palette that resolves to white on
`KJ` and `SP`, and ink on `AG`, `SA`, `MR`, `KG` and `PY`. Two of those —
`KJ` at roughly 4.2:1 — sit just under AA for small text; the badge is
therefore never the only place a line is named, and the surrounding label
always carries the line's full name.

This is computed rather than stored as a `lines.json` field so it cannot drift
when a colour is retuned, and so no data migration is needed.

### 1.4 Persistence and application

`Profile` in `src/engine/progress.ts` gains one optional field:

```ts
/** Display preference. Absent means "never chosen"; first run reads the OS. */
theme?: 'paper' | 'midnight';
```

The field is additive and optional, so `migrate()` needs no change — the
existing `{ ...emptyProfile(), ...rec }` spread carries older saves forward
unchanged, exactly as `muted` was added.

`App` applies it in an effect, writing `document.documentElement.dataset.theme`.
When the field is absent, the effect resolves `prefers-color-scheme` once and
writes the result without persisting it, so a player who never touches the
toggle continues to follow their OS.

A new `src/ui/ThemeToggle.tsx` mirrors `SoundToggle` exactly — same button
shape, same `aria-pressed` pattern, sun and moon icons in place of the speaker
pair — and sits beside it in the `HomeMap` control cluster.

## 2. Map furniture

All of this lands in `src/render/MapCanvas.tsx`, `TrainMarker.tsx`, and
`map.css`. The existing `markScale` (`view.w / NOMINAL_VIEW_W`, clamped to
0.15–1.6) already exists to keep marks a constant on-screen size through zoom;
every new mark uses it the same way.

### 2.1 Drafting dot grid

An SVG `<pattern>` in `<defs>`, one dot of `--grid-dot` per tile, with tile
size `28 * markScale` and `patternUnits="userSpaceOnUse"`. User-space anchoring
means the grid pans with the map for free, while the scaled tile keeps apparent
density constant through zoom. Drawn as a full-extent `<rect>` beneath the
backdrop.

### 2.2 Station nodes

Replacing the current uniform slate circles:

| State | Treatment |
|---|---|
| Regular | Hollow ring: `--paper` fill, 2px stroke in the line colour |
| Interchange | `--paper` halo, inner core in `--ink`, outer ring 2.5px |
| Visited | Filled solid in the line colour |
| Active | As visited, plus the beacon in 2.4 |
| Next / highlighted | Retains the existing emphasis ring |

Multi-line stations take the first serving line's colour for the ring; their
core is `--ink` regardless, which is what distinguishes them.

### 2.3 Rail glow and completed track

Two additions beneath and above the existing rail polyline, both scoped to the
emphasised line only.

**Glow underlay.** The mockup draws its hero track twice — a 14px pass at 0.4
opacity through `feGaussianBlur(4)`, then the crisp rail on top. Same approach:
one extra `<polyline>` before the main one, class `track-glow`, with the filter
declared once in `<defs>`.

The treatment forks by theme, because the pack requires it to. The system doc
specifies "faint glow or subtle track bed in dark mode; clean offset ink in
light mode", and the paper spec explicitly rejects "heavy blurs, dramatic drop
shadows, and artificial plastic depth". A blurred halo on warm linen reads as a
smudge.

- midnight — `filter: url(#track-glow); opacity: .4; stroke-width: 14`
- paper — `filter: none; opacity: .16; stroke-width: 12`, an unblurred bed that
  reads as ink bleeding into paper

CSS `filter` applies to SVG elements, so both come from one element and the
theme switch needs no JavaScript branch.

*Performance risk.* An SVG blur filter repaints on every pan, zoom, and
view-recentre — and the view recentres on each station arrival. Scoping it to
the single emphasised line rather than all seven is the first mitigation. If it
still costs frames in QA, the fallback is a plain wide low-opacity stroke with
no filter, which still reads as a glow on a dark ground.

**Completed-track highlight.** A polyline over the route points already
traversed (`run.stationTimes.length`), 2.5px, drawn above the rail: white in
midnight, `--ink` in paper. This is the most load-bearing item in the in-game
mockup and is not decoration — it is the literal expression of the design's
"typing feels like drawing ink along clean surveyor lines", and it makes run
progress readable from the map alone.

It needs the traversed prefix of the route, which `LineRunScreen` already
computes and `AdventureScreen` can derive from its own visited order, so it
arrives through a new optional `MapCanvas` prop rather than by recomputation.

### 2.4 Active-station beacon

Two concentric circles on the active station: a pulsing 2px ring in the line
colour, and a radial-gradient bloom fading the line colour to transparent. The
gradient is declared per-render for the active line only. No filter is
involved, so this costs one element and no repaint pressure.

The existing `arrive` keyframe on arrival is kept; the beacon is a steady-state
pulse, not an arrival flourish, and the two do not collide.

### 2.5 Train carriage

`TrainMarker` stops being a circle. It becomes a `<g>` translated to the tween
position and rotated by `atan2` of the travel vector, containing:

- a 28×12 capsule body (`rx` 3), `--panel` fill, 1px `--ink` stroke
- a nose cap in the current line colour
- two window dots
- a headlight beam: one polygon filled with a white-to-transparent
  `linearGradient`, rendered in midnight only

It takes one new prop, `colour: string | null`, passed by both play screens
from the active line. The remount-on-`errorTick` shake is preserved exactly —
the `key` moves to the group.

### 2.6 Station labels

Labelling 154 stations at once is noise, so labels are tiered:

- **Always** — the active station, all termini, and interchanges serving three
  or more lines.
- **When zoomed past `view.w < 450`** — every station.

Labels render inside the SVG in the map's coordinate space, mono at
`11 * markScale`, uppercase, `0.08em`, in `--ink` for the always-tier and
`--ink-muted` for the rest. Placement is right of the node, flipping left when
the node sits in the right-hand quarter of the current `view` rectangle — the
live viewport, not the framed extent, so a label near the screen edge flips
whichever way the player has panned. No collision
solver — the tiering is what keeps the map readable, and a solver would be
recomputed on every pan for a map whose geometry never changes.

### 2.7 District watermarks

Large tracked ghost text naming the conurbation's districts, as in both map
mockups. `boundaries.json` cannot supply the anchors — it holds
`Selangor`-level regions, not districts — so a new `src/data/districts.json`
carries eight entries of `{ name, geo: { lat, lng } }`:

| District | lat | lng |
|---|---|---|
| Kuala Lumpur | 3.1390 | 101.6869 |
| Batu Caves | 3.2379 | 101.6840 |
| Petaling Jaya | 3.1073 | 101.6067 |
| Subang Jaya | 3.0567 | 101.5851 |
| Shah Alam | 3.0733 | 101.5185 |
| Klang | 3.0449 | 101.4455 |
| Kajang | 2.9931 | 101.7898 |
| Putrajaya | 2.9264 | 101.6964 |

These are approximate district centroids, tuned visually during
implementation — they are label anchors, not geographic assertions, and nothing
is measured from them.

`networkLayout()` projects them through the same projection as the stations and
returns them on `NetworkLayout` as `districts: { name: string; at: Point }[]`.
Rendered in `--ink-faint` at `0.35em` tracking, and faded out once zoomed past
the same threshold that reveals all station labels — they are regional context,
useless at street zoom.

### 2.8 Compass and scale bar

Both drawn inside the SVG but positioned from the live `view` rectangle
(`view.x + margin`, `view.y + view.h - margin`), so they stay pinned to the
corner while the map pans, with sizes scaled by `markScale`.

The scale bar needs real-world distance. `networkLayout()` computes `pxPerKm`
once by projecting two points 1 km apart at KL's latitude, and returns it on
`NetworkLayout`. The bar then picks the largest round value from
`[1, 2, 5, 10, 20, 50]` km whose drawn length stays under 18% of the view
width.

The scale bar is the lowest-value item in this section and is the first thing
cut if it fights the pan/zoom code.

## 3. Screen chrome

### 3.1 Shared components

**Panels** — 10px radius, `--panel` fill, 1px `--panel-edge`, `--panel-shadow`,
`backdrop-filter: var(--panel-blur)`. Replaces the current 14px radius and
hardcoded blur.

**Buttons** — 8px radius. Primary is `--ink` filled with `--paper` text,
shifting to the KJ red on hover. Secondary is transparent with a 1px
`--panel-edge`. Both drop the current amber focus border in favour of a
`--focus-ring` token so focus stays visible in both themes.

**Typing prompt** — structure unchanged, so `Prompt.tsx`'s keying comment and
error-remount behaviour survive. Only the colours move: `done` to `--ink`,
`pending` to `--ink-faint`, and `current` to a 2px underline in **the active
line's colour**, passed down as `--line-colour`. The mockup hardcodes KJ red
because it depicts a KJ run; taking the colour from the line generalises it
across all seven. The existing `miskey` shake and the reduced-motion block are
untouched.

### 3.2 Per screen

| Screen | Changes |
|---|---|
| `HomeMap` | Wordmark to the brand scale; line rows gain badges; the control cluster gains `ThemeToggle` beside `SoundToggle` |
| `PlayLayout` / play panel | Panel treatment; line-coloured border with a soft outer glow in midnight, mirroring the in-game mockup's ruby balloon |
| `LineStrip` | Mono, uppercase, tracked; current station in `--ink`, rest in `--ink-muted` |
| `HUD` | Mono uppercase labels with tabular figures; the rolling-number behaviour is untouched |
| `SummaryScreen` | Panel and stat treatment; journey map picks up the new node styling |
| `LeaderboardScreen` / `Panel` | Table to mono; badges in the line column; the existing conic glow re-expressed in tokens |
| `DirectionChooser`, `JunctionPicker` | Badges and the new button treatment; the `rise` stagger is kept |
| `StationSearch` | Field and result rows to the new surface treatment |

## 4. File-by-file change map

**New**

- `src/styles/tokens.css`
- `src/render/contrast.ts` (+ `contrast.test.ts`)
- `src/ui/ThemeToggle.tsx` (+ `ThemeToggle.test.tsx`)
- `src/data/districts.json`

**Modified**

- `package.json` — two `@fontsource-variable` dependencies
- `src/main.tsx` — font imports, `tokens.css` ahead of `index.css`
- `src/index.css`, `src/render/map.css`, `src/ui/summary.css`,
  `src/ui/leaderboard.css` — literals to tokens, new component rules
- `src/data/lines.json` — rail colours
- `src/geo/networkLayout.ts` — `districts`, `pxPerKm` on `NetworkLayout`
- `src/render/MapCanvas.tsx` — grid, nodes, glow, completed track, beacon,
  labels, watermarks, compass, scale bar
- `src/render/TrainMarker.tsx` — carriage
- `src/render/MapBackdrop.tsx` — token fills
- `src/render/HUD.tsx`, `src/render/LineStrip.tsx` — mono treatment, badges
- `src/engine/progress.ts` — `theme` field
- `src/ui/App.tsx` — theme application effect
- `src/ui/HomeMap.tsx` — badges, toggle cluster
- `src/ui/SummaryScreen.tsx`, `LeaderboardScreen.tsx`, `LeaderboardPanel.tsx`,
  `DirectionChooser.tsx`, `JunctionPicker.tsx`, `StationSearch.tsx` — badges
  and surface classes

Roughly twenty files, of which four are new.

## 5. Phasing

Three phases, each independently shippable and reviewable.

**Phase 1 — Token layer.** Fonts, `tokens.css`, both palettes, the `theme`
field, the application effect, `ThemeToggle`, and the conversion of all four
stylesheets to tokens. The app comes out of this in the right palette and
typeface throughout, with the toggle working, before any map work begins.

**Phase 2 — Map furniture.** Everything in section 2. The riskiest work, done
once tokens exist to express it and while nothing else is in flight.

**Phase 3 — Screen chrome.** Everything in section 3: badges, panels, buttons,
prompt, and the per-screen pass.

Sequencing matters here. Doing it screen-by-screen instead would mean inventing
tokens ad hoc and re-touching the same shared stylesheets from every screen.

## 6. Verification

`npm test` (vitest + jsdom) must pass at the end of every phase. No existing
test asserts on a colour, so the palette work carries little test risk, but
several assert on accessible names and visible text — the line-badge conversion
in particular must keep the code readable as text, which is also what
`CONTEXT.md` requires ("always shown as text wherever a line colour appears,
because colour is never the only signal").

New unit tests: `contrastText` (both branches, per line colour) and
`ThemeToggle` (renders both states, fires the callback, exposes
`aria-pressed`).

`npm run build` must pass — it runs `tsc --noEmit` first, so the `NetworkLayout`
and `MapCanvas` prop additions are type-checked.

Manual QA, per phase:

- Both themes, on every screen, including a mid-run theme switch.
- Desktop, tablet, and mobile widths — the map keeps 60–70% of vertical space
  on mobile per the design's responsive rules.
- `prefers-reduced-motion: reduce` — the beacon pulse and the carriage tween
  must both stop. The existing global reduced-motion block already zeroes
  animation and transition durations; new marks must be built so that block
  catches them rather than needing their own.
- Frame cost of the rail glow during an active run, which decides whether the
  filter survives.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Blur filter repaints cost frames | Scoped to one line; fallback is an unfiltered wide stroke |
| `#98002E` disappears on midnight | Lighten the shared value; do not fork the palette |
| Station labels collide at some zooms | Tiering, not a solver; drop the always-tier to termini only if crowded |
| Variable fonts inflate the bundle | Two variable faces, subset to Latin; measured at Phase 1 |
| Scale bar fights pan/zoom | First item cut; nothing else depends on it |

Drop-first order, if any of this proves not to be worth its cost: scale bar,
then headlight beam, then district watermarks.

## 8. Open questions

None. The three decisions in "Decisions taken" resolve what the pack left
ambiguous, and the drop-first order resolves what to sacrifice under pressure.
