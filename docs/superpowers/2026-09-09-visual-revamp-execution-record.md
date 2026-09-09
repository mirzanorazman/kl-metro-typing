# Visual Revamp — Execution Record

**Date:** 2026-09-09
**Status:** Complete. Merged to `main` as `68a561c`.
**Spec:** `docs/superpowers/specs/2026-09-09-visual-revamp-design.md`
**Plan:** `docs/superpowers/plans/2026-09-09-visual-revamp.md`

Twenty tasks, 31 commits, executed by subagent-driven development: a fresh
implementer per task, a spec-and-quality review after each, and a whole-branch
review at the end. Final state: 38 test files, 258 tests, clean build.

This document exists because the decisions below were made *on the user's
behalf, during execution*, and would otherwise have been lost. They lived in a
gitignored progress ledger that the workflow deletes on completion — on the
assumption that git history is a sufficient record. For this run it was not:
commit messages carry the *what*, not the *why*, and several rulings reversed
or corrected the spec and plan that are themselves committed here.

---

## 1. Task completion

Every task was reviewed for spec compliance *and* code quality before being
marked complete. "Fix rounds" are the review loop; a task closed only when its
findings were addressed.

| Task | Commits | Fix rounds | Notes |
|---|---|---|---|
| 1 — Token layer, self-hosted fonts | `9f73a84` | 0 | |
| 2 — `index.css` to tokens | `a744fc9` | 0 | |
| 3 — Remaining stylesheets to tokens | `d3b0577`, `b83221e` | 1 | Also fixed a live defect the branch introduced (§3.5) |
| 4 — `Profile.theme` | `85a7dcd` | 0 | |
| 5 — `ThemeToggle` | `6f91eb7` | 0 | |
| 6 — Apply and mount the theme | `1f58a29` | 0 | Fixed a pre-existing test-isolation bug |
| 7 — District anchors, map scale | `931d92e`, `e2e944c` | 1 | `pxPerKm = 20.3825` |
| 8 — Drafting grid, station nodes | `979fca1` | 0 | |
| 9 — Rail glow, travelled stretch | `a5a915d`, `1108b59` | 1 | |
| 10 — Active-station beacon | `e77f00d` | 0 | Shipped broken; fixed at final review (§3.13) |
| 11 — Train carriage | `d76a878` | 0 | |
| 12 — Labels, watermarks | `fd41685`, `6822367`, `c482b0a`, `7acc880` | 3 | Heaviest task; see §3.9–§3.11 |
| 13 — Compass, scale bar | `ee6a884` | 0 | |
| 14 — Contrast helper, `LineBadge` | `2332c3e` | 0 | |
| 15 — Calibrated rail palette | `c2ca073` | 0 | |
| 16 — Play panel wears its line | `3f5407a` | 0 | |
| 17 — Telemetry typography | `77a6671` | 0 | |
| 18 — Badges across screens | `8d518ca`, `5531139`, `b8e2a3c` | 2 | See §3.12 |
| 19 — Panels, tables, surfaces | `f663dd4` | 0 | |
| 20 — Responsive, focus ring | `24e2f09` | 0 | Interrupted by an API spend limit, resumed |
| Final review fix wave | `ef23a5d` | — | 2 Critical, 3 Important |

The plan's step checkboxes were never ticked during execution and are left
unticked deliberately: several steps were superseded mid-flight (most of Task
12's), so ticking them all would assert something untrue. This table is the
authoritative status.

---

## 2. Where the shipped code diverges from the spec

| Spec section | Divergence | Where recorded |
|---|---|---|
| §1.3 badge contrast | Returns `--badge-ink`/`--badge-paper`, not `--ink`/`--paper` | Spec amended before implementation |
| §2.6 station labels | Two `view.w` tiers → three `inView` tiers | Spec amended, marked superseded |
| §2.7 watermarks | Threshold definition moved; gated on `mode === 'geo'` in Adventure | Spec amended |
| §2.8 furniture | Bottom margin `24 * markScale` → `64 * markScale` | Here (§3.11) |
| §7 font subsetting | Not done, and not needed | Here (§3.4) |
| §3.2 summary journey | Did not pick up the new node styling | Open, §4 |

---

## 3. Rulings

Each was a decision the plan or spec did not settle, made during execution
rather than referred back. Recorded with what it would cost if wrong.

### 3.1 Keep a tokenised `.train` rule through the stylesheet conversion
The plan's Task 3 replacement block silently dropped the existing `.train`
rule, while Task 11 later instructed the implementer to "replace the two
`.train` rules" — which by then would not have existed. Kept a tokenised
placeholder so the train stayed visible in the interim.
*Cost if wrong: one redundant rule, superseded eight tasks later.*

### 3.2 Nest the carriage in two groups
The plan put the position transform and the shake animation on one `<g>`. A
CSS `transform` in keyframes **overrides** an SVG `transform` presentation
attribute rather than composing with it, so every mistyped key would have
teleported the carriage to the SVG origin for 170ms. Shipped an outer group
carrying position and an inner `.train-shake` carrying the shake.
*Cost if wrong: one extra `<g>` element.*

### 3.3 Exclude `mask-image` from the literal-colour gates
The plan's grep gate would have failed on `#000` alpha stops inside mask
gradients, which the plan itself mandates preserving. There are now **three**
sanctioned literal-colour sites: `.line-strip`'s mask in `index.css`, the same
pattern in `leaderboard.css`, and the two hex constants in `contrast.ts` that
mirror the badge tokens (JS cannot read a CSS custom property).
*Cost if wrong: the gate could miss a real colour hidden on a mask line.*

### 3.4 Do not subset the fonts to Latin — superseding an earlier ruling
Spec §7 prescribed Latin subsetting. I first ruled to adopt it, then verified
before dispatching and found the premise false: `@fontsource-variable` 5.3.0
ships no `latin.css` (the change would have broken the build), and every
`@font-face` carries a `unicode-range`, so browsers already fetch only the
Latin subset. The spec's mitigation was already satisfied where it counts.
*Cost if wrong: ~40KB of unfetched woff2 sitting in `dist/`.*

### 3.5 Fix `SummaryScreen`'s dangling `var(--accent)` inside Task 3
Deleting `--accent` in Tasks 2–3 orphaned `SummaryScreen.tsx:47`, where the
journey path's fallback resolved to nothing. A reviewer found it outside its
own diff. Fixed there rather than deferred: it was a regression this branch
introduced, and no task in the plan owned that file.
*Cost if wrong: a one-line change inside a commit labelled "stylesheets".*

### 3.6 Send an "Important but non-blocking" finding into the fix loop
A reviewer classified a finding Important while calling it non-blocking. The
loop's trigger is severity, not a reviewer's sense of urgency.
*Cost if wrong: one extra fix round on a behaviourally inert line.*

### 3.7 Accept `tsc --noEmit` as proof of a red test
The plan told implementers to prove type-only failures with `vitest`. Vitest
transpiles through esbuild and never type-checks, so such a test passes at
runtime. `tsc --noEmit` — which `npm run build` runs — is the real gate.
*Cost if wrong: none; the red state was still evidenced.*

### 3.8 Replace a vacuous `pxPerKm` test
The plan's "scales linearly" test compared a memoised value against itself and
would have passed with `pxPerKm` hardcoded or wrong by 100×. Replaced with a
span-based assertion, proven able to fail by sabotage.
*Cost if wrong: a loose 30–60km bound a subtle error could slip through.*

### 3.9 Raise the rail glow's missing `non-scaling-stroke` to Important
Reviewed as Minor. The rail and the inked track both pin their strokes to
screen space; the glow did not, so during a line run — which frames one line
and magnifies 3× or more — a 14-unit halo became a 40+ pixel blurred slab
under a 6px rail.
*Cost if wrong: one attribute; the stroke-width values remain the knob.*

### 3.10 Gate district watermarks on geographic mode
Adventure defaults to the schematic layout. Geo-projected labels floating over
an octolinear diagram is exactly why the coastline backdrop was already gated.
*Cost if wrong: watermarks absent from Adventure's schematic view — intended.*

### 3.11 Fix four browser-only label defects as one round
Found by opening the app, not by any test: the `view.w < 450` threshold firing
during ordinary play (all 154 labels at once), a four-deep pile-up in central
KL, labels painted under unrelated stations' dots, and the scale bar drawn
through the footer disclaimer. Fixed together, with the tiering reworked onto
an in-view station count and the furniture margin raised to `64 * markScale`.
*Cost if wrong: tiers reveal at different zooms; two integer thresholds tune it.*

### 3.12 Fix badge stretching at the component, not the container
Replacing a `<span class="code">` with `<LineBadge>` orphaned the line-picker's
grid selector, and the badge — `inline-flex`, which blockifies as a grid item —
stretched to fill its track. I first patched that one container; review found a
second instance where junction badges rendered as ~500px colour bars. Moved the
fix onto `.line-badge` itself (`justify-self: start`, inert outside grids) and
removed the container patch, so exactly one mechanism covers every site.
*Cost if wrong: if `justify-self` under-constrains a future site, the container
rule returns. Verified: 22.21px at both sites.*

### 3.13 Keep Sri Petaling at `#98002E` — with corrected reasoning
`#98002E` measures **2.17:1** against the midnight ground, below the 3:1 WCAG
1.4.11 bar for non-text graphics.

My original justification was **wrong on two counts**, and the final review
caught it. I claimed every other line pair sits 270+ apart in RGB space, so
lightening SP would make it confusable with the adjacent Kelana Jaya line.
Measured across all 21 pairs, Ampang–Putrajaya is **58.3** apart; lightening SP
to `#B01238` would leave it **67.6** from KJ — farther apart than a pair the
palette already ships. I also called SP an outlier; against the *paper* ground
five of seven lines fall under 3:1 (PY 1.43, MR 2.08, AG 2.16, SA 2.75,
KG 2.85).

The decision stands on different ground: rails are 6px strokes, not text, and
`CONTEXT.md` guarantees a line's code is always rendered as text wherever its
colour appears, so colour is never the sole signal. The palette is brand-
accurate to the approved design pack.
*Cost if wrong: one hex value in `lines.json`.*

---

## 4. Open items

Neither blocks anything. Both are judgment calls left to the project owner.

**Untyped prompt characters fail contrast.** `.prompt [data-state='pending']`
uses `--ink-faint`, measuring **2.67:1** on paper and **2.34:1** on midnight.
That token is otherwise used only for decorative, `aria-hidden` watermarks, and
it is now carrying the word the player is about to type. It is what the design
pack assigns, so this is a design decision rather than an implementation slip.
Moving it to `--ink-muted` would give 5.48:1 / 7.48:1.

**Mobile gives the map roughly 22% of vertical height**, against the design
pack's 60–70%. Task 20 had to move `.home-map header` into the document flow to
make it visible at all (the brief's `position: static` rendered it behind the
absolutely-positioned map), and the wordmark, tagline and progress line now
consume ~250px before the map starts, with the picker's 45vh dock below. The
knobs are the mobile header's type scale and that dock's `max-height`.

Lower priority, from the whole-branch review: the summary journey map did not
pick up the new node styling (spec §3.2); focusing a line row drops its
line-colour accent stripe, because the older `:hover, :focus-visible` rules use
the `border-color` shorthand; and some pre-existing dead CSS (`.app`, `.home*`,
`.line-progress`, `.summary dl/dt/dd`) was carried forward and re-tokenised
rather than deleted.

---

## 5. Defects that no test could catch

Seven, six of them defects in the plan rather than the implementation, and all
found only by opening the app in a browser. Recorded because the pattern is the
lesson: a green suite said nothing about any of them.

1. The label threshold firing during ordinary play (§3.11).
2. Labels piled four-deep in central KL (§3.11).
3. Labels painted beneath unrelated stations' dots (§3.11).
4. The scale bar drawn through the footer disclaimer (§3.11).
5. The orphaned line-picker grid selector (§3.12).
6. Badges stretching to ~500px bars in junction lists (§3.12).
7. **The active-station beacon rendering inverted.** A blanket
   `.map-canvas circle { fill; stroke }` rule — written when stations were the
   only circles in the canvas — outranked the beacon's presentation attributes,
   so `.beacon-bloom` painted an opaque background-coloured disc *over* the
   station it exists to mark, and the ring stroked grey instead of the line
   colour. Confirmed by computed style during a live run. Fixed by narrowing
   the rule to `circle[data-station]`. Items 5 and 6 were selectors that stopped
   matching their markup; this was the inverse — new markup captured by an old
   selector.
