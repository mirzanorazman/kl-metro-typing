# Home screen by kind of play — design

**Date:** 2026-10-28
**Scope:** desktop and tablet home screen (`HomeMap`), plus three pieces that
land alongside it. Phones (`MobileShell`) are untouched.

## Why

First-timers don't realise the game has modes. Today's home panel is one flat
column of look-alike rows: "Resume from Wangsa Maju", seven Line rows with
"37 / 37" counts, "Start anywhere", "Rush Hour", "Dispatcher", "Leaderboard".
It reads as a level select. Of the four modes only Dispatcher is named as one;
Line Run hides behind the Line rows, Quick Run hides one step further inside
the direction chooser, and Adventure is reached through "Start anywhere" and
"Resume" without ever being named.

The game offers three kinds of play, and the home screen should say so:

- **Career** — Dispatcher. Strategy typing; the long game.
- **Challenge** — Quick Run. 30 seconds, score-chasing, "how fast am I today".
- **Explore** — Line Run and Adventure. No clock; learn the network and fill
  in the map.

The user wants them in that order: Dispatcher first, Explore last.

## Goals

- A first-timer sees three named kinds of play, each with a one-line pitch,
  before they see any list of Lines.
- Quick Run starts in one keypress.
- Retire Rush Hour.
- Fix Quick Run's missing exit, and the direction chooser's side stripe.

## Non-goals

- Removing or merging Line Run and Adventure. The user finds them less
  appealing now, but suspects builder's bias; the decision waits until
  first-timers have been watched using the new screen.
- Phone layout, first-run tutorials, or changes to how any mode plays.

## Anti-goals

- A first-timer still lands on seven Line rows as the first thing they read.
- A returning player loses a fast path they rely on: typing a Line code, and
  resuming an Adventure.

## The pieces, in build order

Each is its own commit.

### 1. Retire Rush Hour

Exactly Task 12 of `docs/superpowers/plans/2026-10-23-dispatcher.md`, whose gate
("the user says to retire Rush Hour") is now met. Its file list, migration test,
music renames and `CONTEXT.md` / `STATUS.md` edits all apply as written.

### 2. Quick Run can be left with Escape

**Bug:** once a Quick Run screen opens there is no way out until the 30 seconds
run down. `QuickRunScreen` passes Escape to the engine like any other key and
has no leave button (Line Run has "End run").

**Fix:**
- Escape while `ready` (clock not yet started) returns home, exactly as the
  existing visibility-hidden path does for `ready` (`setDismissed`, `onBack`).
- Escape while `running` interrupts the Run (`interruptQuickRun`), which shows
  the Summary; an interrupted Run never records a best, as today.
- Escape must not reach `enterQuickCharacter` or the recorder, so it never
  enters the Keylog.
- The Quick Run panel shows a hint: `Esc to leave`, except on the phone layout
  (`usePhoneLayout`), which has no Escape key.

### 3. Direction buttons ring in the Line's colour

The `.junction button` style (`src/index.css`, ~line 314) draws a 6 px left
stripe in `--line-colour`. Replace it with the treatment the play panel already
uses (`.play-panel`, ~line 49): the whole 1 px border in `--line-colour`, and
under `[data-theme='midnight']` the same soft bloom,
`0 0 24px -6px var(--line-colour)`. Hover and focus-visible still switch the
border to `--focus-ring`.

This style is shared by the home direction chooser and the in-run
`JunctionPicker`, so both change — on phones too, since phone Adventure renders
the same `JunctionPicker`; one look everywhere. In the junction picker the
colour still tells each Direction's Line apart; it just rings the whole button
instead of one edge.

### 4. Home panel by kind of play

Layout "A" from the brainstorm: three labelled sections stacked in the
right-hand panel over the map. The map, header, footer, sound and theme
controls keep their place.

```
CAREER
┌─ 1  Dispatcher                       [BEST · 7 SHIFTS] ┐   ← highlighted card
│  Your first day in the control room. Keep the trains   │
│  moving, fix faults before stations shut, and earn     │
│  new lines one Shift at a time.                        │
└────────────────────────────────────────────────────────┘
CHALLENGE
┌─ 2  Quick Run                              [BEST · 68] ┐
│  30 seconds against the clock. How fast are you today? │
└────────────────────────────────────────────────────────┘
EXPLORE
┌─ 3  Line Run & Adventure                   [164 / 180] ┐
│  No clock. Ride a whole line, or roam freely and       │
│  unlock stations.                                      │
│  0  Resume Adventure from Wangsa Maju                  │
└────────────────────────────────────────────────────────┘
   4  Leaderboard                                🔊  ☾
   Press a number, or type a line code.
```

**Cards**

- **Dispatcher** (key 1) opens a Career, as the current Dispatcher row does.
  Copy is exactly the block above. It is the visually emphasised card.
- **Quick Run** (key 2) starts a Quick Run immediately on a random Line and
  Direction, chosen uniformly from pairs where `eligibleQuickLegs(net, line,
  toward)` is non-empty, then handed to the existing `startQuick(code, toward)`.
  Everything after that — random first Station, Jumps, the clock, replay — is
  unchanged. The Summary's "Run again" also draws a fresh random Line and
  Direction, but only for a Run started from this card. A phone Run started
  from `MobileTransit` keeps the Line and Direction its player chose, as today
  (pinned by `QuickRunScreen.test.tsx`, "runs again after focusing, preserving
  route choices…"). App decides which applies, e.g. by passing
  `QuickRunScreen` an `onAgain` callback; the screen does not guess.
- **Explore** (key 3) swaps the panel to the Explore view below.
- **Resume** (key 0) appears inside the Explore card only when an Adventure is
  saved, and resumes it straight from home, as today.
- **Leaderboard** (key 4).

**Chips** are small pills at the right of a card title, and each is absent until
there is something to show:

- Dispatcher: the most Shifts completed by any Career on the Dispatcher board
  (`loadDispatchBoard().entries`, max of `shifts`), as `BEST · N SHIFTS`.
- Quick Run: `profile.quickBestOverall`, rounded, as `BEST · N`. This is a Score
  (WPM × accuracy²), not WPM, so it carries no unit, matching the Quick Run
  Summary's "Personal best: N".
- Explore: Stations visited over total Stations, e.g. `164 / 180`. Always shown.

**Explore view** is today's Line list, moved one level down:

- Heading "Explore", the one-line pitch, and `Esc to go back`.
- `0` Resume (when saved), `1–7` the Lines with their visited counts, `8` Start
  anywhere — the same rows, keys, map fitting and station search as today.
- Picking a Line opens the direction chooser. Escape there returns to the
  Explore view; Escape in the Explore view returns to the three cards.

**Direction chooser** loses its per-direction "30s Quick Run" buttons and the
"Quick Run needs at least five Stations" note; Quick Run now has its own card.
`DirectionChooser`'s `onQuick` prop goes. Picking a direction starts a Line
Run, as today.

**Typing a Line code** (e.g. `KJ`) on the home cards still jumps straight to
that Line's direction chooser. Escape from there returns to the Explore view.

**Hint line**: "Press a number, or type a line code."

## Builder's calls already made (check these)

These are the designer's calls, not decisions the user stated:

- Leaderboard moves to key 4 (was 9) so the home keys run 1–4.
- Quick Run's chip shows Score without a unit, because the stored best is
  Score, not WPM.
- Dispatcher's chip counts Shifts completed, from board entries only.
- Escape mid-Run interrupts to the Summary rather than going straight home.
- The ring style change applies to the in-run junction picker too, on phones
  as well as desktop.
- "Run again" draws a new random Line and Direction only for Runs started from
  the Quick Run card; phone Runs keep their chosen route.
- The `Esc to leave` hint is hidden on the phone layout.
- The header's "N / M stations visited" line stays, even though the Explore
  chip repeats it.

## Left to the builder

- Exact styling of section labels, the emphasised Dispatcher card, and chips,
  using existing tokens in `src/styles/tokens.css`; both themes must work.
- Component structure (e.g. whether the Explore view is a new component).
- Test updates: `HomeMap.test.tsx`, `DirectionChooser.test.tsx`,
  `QuickRunScreen.test.tsx`, `App.test.tsx`.
- `CONTEXT.md`: "Mode" should list Dispatcher alongside Line Run, Quick Run,
  Adventure. `docs/STATUS.md`: describe the new home screen.
