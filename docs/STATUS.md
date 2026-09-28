# KL-Metro Typing — status and handoff

**Last updated:** 2026-09-28

A typing game on the Kuala Lumpur Rapid KL rail network. Type station names to
drive a train across the Klang Valley.

> **Read this first if you are picking the project up.** The specs and plans in
> `docs/superpowers/` describe what was *intended*; this file describes what
> actually exists, what is deliberately the way it is, and what is still wrong.

## Getting started

```bash
npm install
npm run dev
npm test
```

`npm run build` includes a TypeScript check and a Vite production build.

## What exists

Four playable modes share the network and typing foundations.

**Line Run** — the main entry point. Pick a line off the map (click, or type its
two-letter code), choose which terminus to start from, and type the line end to
end. Interchanges never prompt; the route is fixed.

**Quick Run** — a 30-second challenge starting on a selected Line and Direction.
The first Station is random and at least four Station advances from the selected
Terminus. Finishing that Terminus before the deadline jumps immediately to an
eligible Station on a different Line, also at least four advances from its
Terminus. Selection prefers unused Lines and untyped landing Stations. The clock
starts on the first printable character, even if it is wrong, and never pauses
for a jump. The active panel shows WPM and Accuracy, refreshed once per second
after typing starts. Wrong-key colour, double underline, and a visible status
persist until the correct key is entered, including with reduced motion. The
follow camera frames roughly one Station behind and two ahead.

Quick Run has one mode-wide personal best in `quickBestOverall`, updated only
after a normally completed Run passes replay and integrity checks. The older
line-keyed `quickBest` values remain readable for compatibility but are not
shown or updated. Each Run records a leg trace beside its Keylog; replay checks
the initial leg and every jump against the eligibility and preference rules,
and rejects missing, extra, or inconsistent entries.

**Adventure** — free roam. Start anywhere, and choose a direction at every
junction. Stations unlock permanently as you visit them, and a journey can be
resumed after closing the tab.

The home screen *is* the map: the seven Rapid KL lines drawn over a real
Klang Valley coastline, with per-line and overall progress.

On phone-sized landscape screens, Run starts are disabled with the instruction
`Rotate to portrait to play`. Rotating an active Quick Run interrupts it; its Summary is
shown on return to portrait. The same phone-only guard applies to Line Run and
Adventure. Tablet and desktop landscape are not blocked solely by orientation.
iPad Mini-sized landscape renders the desktop/tablet play layout without being
blocked, including at a reduced-height browser viewport. A real iPad Mini check
with its software keyboard open remains a separate compatibility follow-up.

**Rush Hour** — survival, desktop and tablet (v1, on branch `feat/rush-hour`).
Choose a Line set and a starting Station from the Rush Hour button on the home
map. Passengers spawn in Queues and want a Line, not a Station; the one-carriage
train (Capacity 4) delivers them at any Station serving it. A full Queue fills
an Overflow ring; one full ring ends the Run. A Day cycles through five Day
phases, each Day busier. The sim is a pure fixed-tick engine
(`engine/rushHour.ts`, tuning in `engine/rushBalance.ts`) with a seeded RNG, so
a Run replays exactly from its Keylog plus action log; only an Overflow-ended,
Eligible Run updates `rushHigh`. Upgrades are deferred to a second plan. Spec:
`docs/superpowers/specs/2026-09-28-rush-hour-design.md`. **Open:** the balance
finding in `docs/superpowers/rush-hour-handover.md` — on long Lines, survival
barely depends on typing speed.

**Local leaderboard** — Line Run only. Completing a line end to end offers a
name entry if the run's score would place in the top 20 overall or the top 20
for that line. Longer lines are weighted more heavily on the overall board, so
a given score on a long line ranks above the same score on a short one.
Everything is kept in `localStorage`; there is no server.

**Run integrity** — Line Run and Quick Run record a Keylog: every keystroke with
its timing and how it arrived. Finishing a Line Run replays that log to derive
the score, and a pure validator judges it before the leaderboard will take it.
Quick Run replays its Keylog and explicit leg trace before a personal-best save.
The input layer annotates keystrokes but never rejects them, so a false positive
can cost a leaderboard entry or Quick Run personal best rather than the ability
to play. Design and reasoning
in `docs/superpowers/specs/2026-09-10-run-integrity-design.md`; what was
actually built, and the handful of places it diverges, in
`docs/superpowers/2026-09-11-run-integrity-execution-record.md`.

Two numbers are worth knowing before you touch the validator. The thresholds are
deliberately generous — 300 WPM, a 40 ms median floor, a coefficient of
variation of 0.12 — because a false positive here costs an honest player their
place on the board and they have no way to tell you why. And the anti-paste
budget counts *bursts*, not characters: getting that backwards once already made
it four times stricter than intended, silently refusing Android predictive
keyboards.

## Architecture

```
src/
  data/      network JSON + types + validation + leaderboardStore   (154 stations, 7 lines, 5 walk links)
  engine/    game logic: network, typing, metrics, run, lineRun, quickRun, replay,
             progress, leaderboard
  geo/       projection, schematic layout, fitting, shared networkLayout
  render/    SVG map, train marker, prompt, HUD, line strip, pan/zoom
  ui/        screens: HomeMap, QuickRunScreen, LineRunScreen, AdventureScreen,
             SummaryScreen, LeaderboardScreen, LeaderboardPanel
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

10. **The recorder owns the Run clock.** Every keystroke a scored Run is stamped
    with comes from `runTick()` — the tick the recorder returns — never a separate
    `performance.now()` read. One clock is what makes a replayed Keylog reproduce
    the live Run's Metrics exactly rather than approximately, and that exactness is
    the property the whole integrity layer rests on; `src/engine/replay.test.ts`
    guards it. The one exception is Quick Run's visibility-change handler, which
    stamps `endedAt` from a raw `performance.now()` — an interrupted Run is never
    replayed or scored, so it never reaches the comparison.

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
- **Station `arrive` animation scales in user units.** The keyframes animate
  `r` from 8 to 14 absolute units, so at follow-camera zoom the new Station
  balloons into a large disc for 250 ms. Seen in Rush Hour screenshots; the
  same CSS drives every mode.
- **One unexplained behaviour**: the map's framing effect did not apply its focus
  target on mount (StrictMode double-invoke is the likely cause). Worked around
  by seeding `usePanZoom`'s initial state from the same computed target, which is
  sturdier anyway — but the root cause was never confirmed.
- **`untrusted-input` is a hard fail with an unquantified false-positive rate.**
  Assistive input tools that dispatch synthetic DOM events would be refused the
  leaderboard. `profile.integrityFails` records every refusal — but see the next
  entry: in production nobody can read those records, so the rate stays
  unquantified in practice as well as in principle.
- **The integrity layer is unobservable in production.** `integrityFails` is
  written and never read: `src/engine/progress.ts:52` declares it and `:166`
  appends to it, and those are the only two references in `src/`. It lives in
  each player's `localStorage`, and invariant 5 forbids runtime network
  requests, so it never leaves their device. A wrongly-refused honest player
  sees one reasonless sentence, has no reason to think it is a bug, and their
  evidence is unreachable. See the operational-readiness entry under
  **What is next** — this is the gap that matters most before this feature is
  trusted.
- **No shared guard against a malformed Keylog crossing a server boundary.**
  Before any server parses a submitted Keylog from JSON, `replayLineRun`,
  `replayQuickRun` and `verifyKeyLog` all need one shared `isWellFormedKeyLog`
  predicate in front of them, element shape included. Guarding `verifyKeyLog`
  alone would be theatre, because replay runs first at both call sites and
  throws just as readily on a malformed element.

## What is next

**Operational readiness for run integrity.** The integrity layer shipped with
no deployment gate, no kill switch, and no way to see it misbehaving. That is
deliberate scope, not an oversight, but it should be closed before the feature
is relied on — and certainly before an online leaderboard sits on top of it.

The order matters, because items 1–3 are what make the question "should we roll
this back?" answerable at all:

1. **A kill switch.** One flag that keeps recording Verdicts but stops *gating*
   on them, so a misbehaving validator can be neutralised without a rebuild and
   redeploy. Highest value of anything in this list.
2. **Make the failure log reachable** — a hidden debug view, or an export, so a
   player who reports "it won't take my score" can send something concrete.
   Without this, item 1 has no trigger.
3. **Acceptance criteria.** Measurable definitions of healthy: what
   false-positive rate is tolerable, what to check after deploying, what trips
   the kill switch.
4. **CI.** There is none — no `.github/workflows`, no host config in the repo.
   The tests, TypeScript check and production build are all manual gates today.
5. **A rollback runbook**, including the one piece of good news below.

**Rollback is data-safe**, and that is a consequence of a deliberate decision
rather than luck. Neither `SCHEMA_VERSION` moved; every field the integrity work
added (`Profile.integrityFails`, `LeaderboardEntry.verified`, `KeyLog.truncated`)
is optional; and both stores load and save by spreading, so older code reading a
newer record preserves the unknown fields instead of rejecting or dropping them.
Redeploying a previous build needs no migration and will not wipe anyone's
leaderboard or profile. Keep it that way: the moment a schema version moves,
this paragraph stops being true.

**Rush Hour v2** — upgrades, phone support, and the balance decision above.
v1 is built; the text below is the original framing.

**Rush Hour (original framing)** — the survival mode from the original spec. Passengers accumulate at stations; your typing speed is the
train's throughput; one overcrowded station ends the run. It is fully specified
in `docs/superpowers/specs/2026-09-03-myrapid-typing-design.md` and was always
intended as its own plan. The redesign it needs to sit on is now done.

**The domain model.** `CONTEXT.md` and ADR 0001 are written; the code that
matches them is not. Nothing in `src/` has been renamed or moved yet, so the
glossary currently reads as intent rather than description. The gaps it names
are real and were found by reading the code:

- `RunState` carries `options`, which Line Run never reads, and no `route` — which
  is why the rule lived in the screen until `keyLineRun` moved it into
  `engine/lineRun.ts`.
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
| `docs/superpowers/specs/2026-09-10-run-integrity-design.md` | Run integrity: the Keylog, replay, and the validator. Implemented; divergences marked inline. |
| `docs/superpowers/plans/2026-09-11-run-integrity.md` | Plan 3 — 8 tasks, complete. Checkboxes left unticked on purpose; see the execution record. |
| `docs/superpowers/2026-09-11-run-integrity-execution-record.md` | **What actually happened** building run integrity: rulings made on the user's behalf, where the code diverges from the spec, and the four defects a green test suite could not catch. |
| `docs/superpowers/specs/2026-09-23-quick-run-poc-adjustments-design.md` | Revised 30-second, multi-Line Quick Run design and phone-landscape policy. |
| `docs/superpowers/plans/2026-09-23-quick-run-poc-adjustments.md` | Implementation plan and remaining browser/device verification gate. |
| `docs/superpowers/specs/2026-09-28-rush-hour-design.md` | Rush Hour v1 design, agreed in a grilling session. |
| `docs/superpowers/plans/2026-09-28-rush-hour.md` | Rush Hour v1 plan, 12 tasks. |
| `docs/superpowers/rush-hour-handover.md` | Rush Hour rulings, gotchas, and the open balance finding. |

Early work after Plan 2 was driven by direct feedback rather than a plan: the
train being positioned by typing progress, error feedback, synthesised sound,
the micro-animations, the line-completion sweep, and the journey shape on the
summary screen. This file is the record of it.

## Unofficial

Not affiliated with Prasarana Malaysia or Rapid KL. Station names, codes, and
line colours are public information. Map boundaries derive from Natural Earth
(public domain).
