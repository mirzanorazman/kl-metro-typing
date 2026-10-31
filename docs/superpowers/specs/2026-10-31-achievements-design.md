# Achievements — design

**Date:** 2026-10-31
**Scope:** an achievement system across all four Modes: what is earned, how it
is tracked and stored, where it is announced, the achievements screen, and the
badge art.

## Why

Nothing in the game reacts when a player does something worth noticing: the
first time they reach every Terminus, a clean Line Run, a Dispatcher Career
that reaches the Latest Era. Achievements give each Mode a set of goals beyond
its own score, reward slower typists for getting better rather than only for
being fast, and nudge players into Modes they haven't tried.

The look was inspired by a badminton app's achievement list: a row per
achievement with a trophy badge, a name, and a subtitle such as
"Silver · 6 comebacks", with locked badges drawn in grey.

## Goals

- 36 tiered achievements in five categories, at least 7 per category, plus 11
  secret achievements: 47 in all.
- Every tiered achievement has Bronze, Silver and Gold. The tier is always
  written out in text, never shown by colour alone (invariant 3 in
  `docs/STATUS.md`).
- A slower typist can earn achievements in every category. Speed is one axis
  among several, not the ladder.
- Unlocks never interrupt typing.
- Badge art in one consistent style, drawn as SVG in code, readable at 48px.

## Non-goals

- Online sync, accounts, or any server. Achievements live in the Profile in
  `localStorage`, like everything else.
- Achievement stamps on the share card or the leaderboard.
- Raster or AI-generated badge art. The user compared both routes and chose SVG.
- A full stats or history screen. (It is still a candidate in `STATUS.md`; the
  run log added here makes it easier later.)

## Anti-goals

These would make the feature a failure even if every achievement worked:

- **Streaks that punish a missed day.** Regular Commuter counts days played,
  not consecutive days.
- **Rewarding cheating.** Anything about speed or accuracy counts only Runs
  that pass replay and their Verdict.
- **A pop-up while the player is typing.** Announcements wait for a Summary.
- **Tier shown by colour alone,** or red and green telling things apart by hue
  alone. The user has deuteranomaly; see the art section.
- **Real logos** in badge art. The game is unofficial.

## Categories and achievements

Counts come from `src/data/` as of 2026-10-31: 154 Stations, 21 Interchanges,
11 distinct Terminus Stations (Sentul Timur, Putra Heights and Kwasa Damansara
each end two Lines), 5 Walk links, 9 Station names of 20 characters or more.
Thresholds should be derived from the data where they say "all", so a data
change can't strand a Gold.

"Eligible" below means the Glossary's Eligible: the Run's Keylog replays and
passes its Verdict. A Dispatcher Career counts once it has ended and verified
(see Dispatcher below). "Ever" means across all Runs.

### Explorer (7)

Driven by the Unlocked set and Adventure Runs. Unlocked Stations come from Line
Run, Quick Run and Adventure (`recordStation`); Dispatcher does not unlock
Stations today, and this design doesn't change that.

| Id | Name | Counts | Bronze · Silver · Gold |
|---|---|---|---|
| `explorer.unlocked` | Jalan-Jalan | Stations Unlocked | 25 · 75 · all 154 |
| `explorer.interchanges` | All Change | Interchanges Unlocked | 5 · 12 · all 21 |
| `explorer.termini` | End of the Line | Terminus Stations Unlocked | 3 · 7 · all 11 |
| `explorer.walk` | Walk It Off | distinct Walk links used in Adventure | 1 · 3 · all 5 |
| `explorer.junctions` | Crossroads | Directions chosen at a Junction in Adventure, ever | 25 · 100 · 500 |
| `explorer.longRide` | Long Ride | distinct Stations visited in one Adventure Run | 20 · 50 · 100 |
| `explorer.lines` | Every Line | distinct Lines ridden in Adventure, ever | 3 · 5 · all 7 |

### Line Run (7)

| Id | Name | Counts | Bronze · Silver · Gold |
|---|---|---|---|
| `line.completed` | End to End | distinct Lines completed end to end | 1 · 4 · all 7 |
| `line.accuracy` | Spotless | best Accuracy on an Eligible completed Line Run | 97% · 99% · 100% |
| `line.score` | Line Speed | best Score on an Eligible completed Line Run | 30 · 45 · 60 |
| `line.bothWays` | Both Ways | Lines completed from each Terminus | 1 · 4 · all 7 |
| `line.stations` | Long Line | Stations typed in Line Runs, ever | 200 · 1,000 · 5,000 |
| `line.personalBest` | Personal Best | Eligible completed Line Runs that beat the player's previous best Score on that Line (either direction) | 3 · 10 · 30 |
| `line.dayPass` | Day Pass | distinct Lines completed on one local calendar day | 2 · 4 · all 7 |

Personal Best needs a best Score per Line, which nothing stores today (the
leaderboard holds named top-20 entries, not the player's own best). The first
completion of a Line sets the baseline and does not count.

### Quick Run (7)

All of these count only Eligible, normally completed Quick Runs, except Tapau
Run and Every Start, which count any completed Quick Run.

| Id | Name | Counts | Bronze · Silver · Gold |
|---|---|---|---|
| `quick.score` | Express Service | best Score | 40 · 60 · 80 |
| `quick.jumps` | Line Hopper | Jumps in one Quick Run | 1 · 2 · 3 |
| `quick.completed` | Tapau Run | Quick Runs completed, ever | 10 · 50 · 250 |
| `quick.clean` | Clean Thirty | Quick Runs at 100% Accuracy | 1 · 5 · 20 |
| `quick.improved` | Up the Line | best Score minus the Score of the player's first Eligible Quick Run | +10 · +25 · +50 |
| `quick.starts` | Every Start | distinct starting Lines | 3 · 5 · all 7 |
| `quick.backToBack` | One More Go | Quick Runs in a chain where each starts within 60 s of the previous one's Summary appearing | 3 · 5 · 10 |

Up the Line's baseline for an existing player is their first Eligible Quick Run
after this ships; their old runs aren't recorded anywhere.

### Dispatcher (8)

Dispatcher is desktop and tablet only. Its achievements are evaluated when a
Career ends (failed, or ended between Shifts) and its replay verifies. A Career
abandoned mid-Shift, or one that fails verification, counts nothing.

| Id | Name | Counts | Bronze · Silver · Gold |
|---|---|---|---|
| `dispatch.era` | Through the Eras | Era reached in one Career | 2003 · 2015–17 · Latest |
| `dispatch.delivered` | Packed In | Passengers Delivered in one Career | 500 · 1,500 · 4,000 |
| `dispatch.clears` | All Clear | Signals Cleared, ever | 100 · 1,000 · 10,000 |
| `dispatch.incidents` | On It | breakdown Incidents fixed, ever (signal fault, train fault, crowd surge; not Service gaps) | 10 · 50 · 200 |
| `dispatch.gaps` | Mind the Gap | Service gaps fixed by holding the rear Train, ever (not ones that end by themselves) | 5 · 25 · 100 |
| `dispatch.perfect` | Perfect Service | consecutive cleared Shifts in one Career with no Station Out of service | 1 · 3 · 5 |
| `dispatch.onTime` | Right on Time | on-time share of calls in one cleared Shift (`onTimeCalls / calls` in its `ShiftRecord`) | 70% · 80% · 90% |
| `dispatch.express` | Express Stopper | express offers taken (skip chip typed), ever | 10 · 50 · 200 |

Era tiers follow `eraFor` and `SHIFTS_PER_ERA = 3` in
`src/engine/dispatchNetwork.ts`: 2003 is reached at 3 cleared Shifts,
2015–17 at 6, Latest at 12. For reference, simulated 40 / 60 / 90 WPM typists
clear a median of 2 / 4 / 6 Shifts, and the user's own playtest cleared 12.
A Career delivers about 250–450 Passengers per Shift, and the user's playtest
was 65% on time.

### Typing craft (7)

Counts Eligible Line Runs and Quick Runs and verified Dispatcher Careers,
except Picking Up Speed (below). Adventure has no Keylog, so it does not count
here.

Picking Up Speed counts **Line Runs and Quick Runs only** (a decision made
during review). A Career's WPM (`careerMetrics` in `src/engine/dispatch.ts`) is
measured over all game time, including time spent waiting for Signals, so it
isn't comparable with a typing Run's. Mixed in, a player moving from Line Runs
to Dispatcher would see their speed "drop".

| Id | Name | Counts | Bronze · Silver · Gold |
|---|---|---|---|
| `craft.streak` | Steady Hands | correct keystrokes in a row within one Run | 100 · 250 · 500 |
| `craft.longNames` | Mouthful | distinct 20+ character Station names typed with no wrong key | 3 · 6 · all 9 |
| `craft.comeback` | Back on Track | Runs at 97%+ Accuracy straight after a Run under 90% | 1 · 5 · 20 |
| `craft.days` | Regular Commuter | distinct local calendar days with at least one finished Run in any Mode | 7 · 30 · 100 |
| `craft.characters` | Mileage | correct characters typed, ever | 10,000 · 100,000 · 1,000,000 |
| `craft.speedUp` | Picking Up Speed | mean WPM of the last 10 counted Runs minus mean WPM of the first 10 | +5 · +10 · +20 |
| `craft.allRounder` | All-Rounder | at least one achievement at this tier in each of Explorer, Line Run, Quick Run and Dispatcher | all Bronze · all Silver · all Gold |

Regular Commuter counts Adventure too: it is about showing up, not typing well.

**All-Rounder on phones** (the user's decision): Dispatcher can't be played on
a phone, so on the phone layout All-Rounder needs the tier in Explorer, Line
Run and Quick Run only. The Profile is per device, so a phone's Profile is
judged by the phone rule and a desktop's by the full one. Dispatcher
achievements, including the four Dispatcher secrets, stay desktop and tablet
only.

**`wpmHistory` is never written.** `recordRun` in `src/engine/progress.ts` has
no callers, so the WPM history the Glossary's Profile entry mentions is empty
for every player. Picking Up Speed and Regular Commuter therefore need their
own run log (see Storage), and neither can be backfilled.

### Secrets (11)

Single tier. Hidden until earned (see the achievements screen).

| Id | Name | Earned when |
|---|---|---|
| `secret.ampang` | Not That Ampang | Enter confirms Ampang in Dispatcher while Ampang Park still matches |
| `secret.roundTrip` | Round Trip | an Adventure Run returns to its starting Station after visiting at least 20 other distinct Stations |
| `secret.rushHour` | Rush Hour Survivor | 3 Incidents are active at once in Dispatcher, and all three are fixed without their place going Out of service |
| `secret.sevenColours` | Seven Colours | one Adventure Run rides all 7 Lines |
| `secret.lastTrain` | Last Train Home | an Eligible Quick Run completes a Station in its final second |
| `secret.sixteen` | Sweet Sixteen | 16 Sierra is typed with no wrong key in an Eligible Run |
| `secret.puchong` | Puchong in One Breath | Taman Perindustrian Puchong is typed with no wrong key at 60+ WPM for that Station in an Eligible Run |
| `secret.closeCall` | Close Call | a Dispatcher Incident is fixed with 3 s or less before its place would go Out of service |
| `secret.againstOdds` | Against the Odds | a Dispatcher Shift is cleared after 3 or more Stations went Out of service during it |
| `secret.nightOwl` | Night Owl | any Run finishes between 00:00 and 03:59 local time |
| `secret.merdeka` | Merdeka! | any Run finishes on 31 August or 16 September, local date |

Night Owl and Merdeka! are the first things in the game to read the device's
clock for time of day. Dispatcher secrets follow the same rule as other
Dispatcher achievements: they are awarded when the Career ends and verifies.

## How it works

### Evaluation is pure

Achievement logic lives in `src/engine/` and follows invariant 2: no React,
timers or storage. One pure function takes the current achievement state and
the facts of one finished Run (or one ended Career), and returns the new state
plus the list of newly earned tiers. Time enters as a parameter, local date
and hour included, so Night Owl, Merdeka!, Day Pass and Regular Commuter are
testable.

The definitions (ids, names, categories, thresholds, what each counts) sit in
one table so tuning a threshold is a one-line change. Thresholds marked "all"
are computed from the network data.

What counts as "the facts of a Run" is per Mode and is the builder's call, as
long as everything in the tables above can be derived from it. Most of it
already exists: Metrics, the Keylog, the Quick Run leg trace, `ShiftRecord`s,
and the Dispatcher action log.

### When it is evaluated

- **Line Run, Quick Run:** when the Run ends and its Summary is shown, after
  replay and the Verdict (so Eligible is known). An interrupted Quick Run
  counts toward nothing.
- **Adventure:** as each Station is reached, not when the Run ends, because an
  Adventure Run can be closed without ending, resumed later, or never ended.
  Long Ride, Round Trip and Seven Colours are awarded the moment they're met.
  To make that work across a reload, store a small record of the current
  Adventure Run next to `AdventurePosition` (today it holds only `at`,
  `arrivedFrom` and `line`): its starting Station, the distinct Stations
  visited and the Lines ridden. Resuming continues that record; starting a new
  Adventure replaces it. Anything already earned stays earned.
- **Dispatcher:** when the Career ends and verifies.
- **Explorer achievements based on the Unlocked set** are re-checked whenever
  a Station is Unlocked, in any Mode.

### Existing players

On first load after this ships, award what the existing Profile proves, without
fanfare for each one:

- Jalan-Jalan, All Change and End of the Line from `visited`.
- Express Service from `quickBestOverall` (it was only ever saved from an
  Eligible Run).

Everything else starts from zero. The achievements screen shows a single note
the first time it's opened ("We found 3 achievements from your earlier
travels"); the Summary doesn't announce backfilled ones.

### Storage

A new optional `achievements` field on `Profile`, added the way `theme` and
`dispatchTipsSeen` were: optional, additive, carried through `migrate`'s
spread. **`SCHEMA_VERSION` does not move**, which keeps the rollback guarantee
in `STATUS.md` true.

It holds:

- **Earned:** per id, the highest tier and when it was earned. Secrets have one
  tier.
- **Counters** for the lifetime counts (Signals Cleared, Junction choices,
  characters typed, and so on) and the sets (Walk links used, Lines ridden,
  starting Lines, long names typed, days played).
- **Bests** the tiers need that the Profile doesn't keep today: best Score and
  Accuracy per Line for Line Run, the first Eligible Quick Run's Score, and
  completions per Line and direction.
- **A short run log** for Picking Up Speed and Back on Track: WPM, Accuracy and
  time for each counted Run, enough to keep the first 10 and the last 10. Its
  size must stay bounded.

The builder can shape this as they see fit, and should add a pure `clean`
function in `migrate` so a malformed record degrades to empty, as
`cleanQuickBest` does.

## Where the player sees it

### On the Summary

When a Run or Career earns something, its Summary shows a "New achievements"
row: the badge at about 56px, the name, and the tier ("Silver · 75 stations").
Up to three are shown, then "+2 more", which opens the achievements screen.
A tier upgrade shows the new tier, not a second row. One synthesised cue plays
(respecting mute), and the badge appears with a short CSS animation that the
`prefers-reduced-motion` block suppresses (invariant 4).

Nothing is shown during a Run. Dispatcher announces nothing between Shifts;
everything waits for the Career Summary.

**Earned with no Summary to show it.** Achievements earned mid-Adventure, or
by unlocking a Station in a Run that never reaches a Summary, go into an
"unannounced" list in stored state. The next Summary in any Mode announces
them along with its own, then clears the list. The achievements screen also
marks unannounced ones as new until they've been seen there or on a Summary.

### The achievements screen

A new screen, reached from the home panel next to Leaderboard (key 5 on
desktop and tablet) and from the phone menu. On phones the Dispatcher category
still appears, with a note that Dispatcher is played on a larger screen.

- A header with the overall count ("12 of 47").
- One section per category, in the order Explorer, Line Run, Quick Run,
  Dispatcher, Typing craft, Secrets.
- Rows as in the reference: badge, name, then a subtitle with the tier and
  what earned it ("Silver · 75 stations"), and progress to the next tier
  ("48 more to Gold"). Gold rows say "Gold · all 154 stations" with no
  progress line.
- Locked rows show the badge in grey and "Locked · 25 stations for Bronze".
- Secret rows that aren't earned show a "?" badge in the locked style, the name
  "Secret", and no condition. The section header says "3 of 11 found".
- Tapping or pressing Enter on a row opens a detail view: a one-sentence
  description of the achievement, then all three thresholds and when each tier
  was earned. A Secret's description says what the player did, so it appears
  only once the Secret is earned. (Added 2026-11-01.)

Layout, keyboard navigation and the exact phone entry point are the builder's
call; they should follow the existing home and leaderboard screens and both
themes (`paper` and `midnight`).

## Badge art

The user chose the **mid-century transit poster** style after a side-by-side
SVG spike against glossy enamel and an embroidered patch. The spike is in
`docs/superpowers/achievement-badges-spike.html`; open it in a browser for the
reference drawings, palette and tier treatment. Its badge subtitles are
examples; the tables above are the source of truth for thresholds.

- **Style:** flat inks, deep teal `#1F6F6B` / `#2C8C86`, burnt orange
  `#D2693A`, brick `#B23A2A`, cream `#F7EEDB`, charcoal `#2A2A2E`. A sun disc
  with a halftone dot pattern behind the subject, a faint grain, and a
  charcoal key line printed slightly off-register.
- **Frame and tier:** a rounded-square frame whose stroke is the tier metal
  (bronze, silver, gold). Gold adds a small sparkle in the corner. The art
  itself is the same at every tier.
- **Locked:** the same badge with a greyscale filter at about half opacity.
- **Secrets:** once earned, one frame colour of their own (the builder picks
  it), so they read as a set apart from the tiered achievements.
- **Red against green:** the user has deuteranomaly. Wherever red and green
  carry meaning in a badge (All Clear's signal is the obvious one), separate
  them by brightness and shape too: a vivid red `#D8452C` and a light mint
  `#7FDCC6` rather than two mid-tones. Muted reds read as grey.
- **No text in the art,** and no real logos or operator marks.
- **Size:** must read at 48px. Check every badge at 48px in both themes and in
  greyscale.
- **Subjects:** the user approved these four in the spike: a folded map with a
  pin (Jalan-Jalan), a signal lamp (All Clear), a buffer stop with a lamp (End
  of the Line), and a train leaping between tracks (Line Hopper; its leap
  doesn't read clearly yet and needs another pass). The other 43 subjects are
  the builder's call, one simple object per badge that a player would connect
  with the achievement's name.

The art is a set of SVG components sharing one frame component, which takes
the tier. Where it lives in `src/` is the builder's call.

## Testing

- Unit tests in `src/engine/` for every definition: each tier boundary, the
  "doesn't count" cases (ineligible Runs, interrupted Quick Runs, abandoned
  Careers, Service gaps that end themselves), and the time-of-day secrets with
  injected dates.
- A `migrate` test: an old Profile without `achievements` loads unchanged; a
  malformed `achievements` value loads as empty.
- A backfill test from a Profile with `visited` and `quickBestOverall`.
- Screenshots of the achievements screen and a Summary with new achievements,
  in both themes, at phone and desktop widths (see "Screenshots caught what
  tests could not" in `STATUS.md`).

## Calls made without the user

The user approved the achievement list, the thresholds, the poster style and
the phone rule for All-Rounder. These were decided by Claude while writing
this document; check them before building:

- Speed and accuracy achievements count only Eligible Runs; counts and
  exploration count every Run.
- Dispatcher achievements are awarded only when a Career ends and verifies; an
  abandoned mid-Shift Career counts nothing.
- On It excludes Service gaps, and Mind the Gap counts only gaps fixed by
  holding the rear Train.
- Picking Up Speed leaves out Dispatcher.
- Announcements wait for a Summary; anything earned without one waits for the
  next Summary in any Mode.
- Existing players are backfilled only from `visited` and `quickBestOverall`,
  without Summary announcements.
- Personal Best and Up the Line start their baselines from the first Run after
  this ships.
- Unearned secrets are fully hidden: a "?" badge, the name "Secret", no hint.
- The achievements screen is key 5 on the home panel, next to Leaderboard.

## Left to the builder

- The shape of the per-Mode Run facts and of the stored state.
- The animation and sound for an unlock.
- The achievements screen layout and keyboard navigation, within the rules
  above.
- The 50 remaining badge subjects and the secrets' frame colour.
- Where the new code lives.
