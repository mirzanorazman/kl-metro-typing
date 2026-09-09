# Mobile Quick Run — Design Spec

**Date:** 2026-09-09<br>
**Status:** Approved design; implementation not started

## Overview

KL-Metro Typing currently assumes a desktop viewport and a physical keyboard.
Opening it on a phone exposes the full game, but the page layout, line picker,
and keyboard handling do not form a reliable mobile experience. Blocking phone
users with a desktop-only notice would hide a useful product experiment: a
short, active alternative to idle scrolling while travelling.

This design adds a phone presentation and a new **Quick Run** Mode. Quick Run
lasts 45 seconds, uses the selected Line and Direction, and ends with a compact
Summary. The first implementation is deliberately a proof of concept (POC): it
tests whether typing Station names on an iPhone is satisfying before the team
optimizes Android or performs the larger accepted Run-state refactor.

The desktop presentation remains intact. Desktop also gains Quick Run, using a
physical keyboard and the existing desktop layout.

## Product decisions

These decisions were settled during design and are not open for rediscovery
during implementation.

1. Quick Run lasts 45 seconds. The clock begins on the first entered character,
   not when Start is pressed.
2. Quick Run is a distinct Mode. It is not a shortened Line Run.
3. The mobile app occupies one non-scrolling visual viewport. The map remains
   visible while the native keyboard is open.
4. The mobile Transit destination uses seven horizontally scrolling Line pills
   and a two-state setup drawer. Quick Run is primary; full Line Run is
   secondary.
5. Mobile bottom navigation contains `Transit`, `Adventure`, and `Ranking`.
6. Active Runs hide the setup drawer and bottom navigation.
7. The same selected Direction applies to Quick Run and Line Run.
8. Quick Run starts at a random eligible Station and follows the real Line order
   toward the selected Terminus. It reverses upon reaching a Terminus.
9. Quick Run personal bests are stored per Line and never enter the Line Run
   leaderboard.
10. A hidden native input supports Quick Run, Line Run, and Adventure on mobile.
11. The first POC gate is five Runs in real iPhone Safari. Android Chrome
    optimization follows only if the mechanic is worth continuing.

## Scope

### In scope

- A responsive phone presentation for portrait and landscape phones.
- A fixed-height Transit destination with Line pills, map, setup drawer, and
  bottom navigation.
- The 45-second Quick Run engine, screen, and compact Summary.
- A shared input bridge for desktop key events and mobile native input.
- Mobile-compatible Line Run and Adventure typing.
- A touch `Turn around` action and touch-sized Junction actions in Adventure.
- Per-Line Quick Run personal bests and last selected Line persistence.
- Automated coverage and the post-ship iPhone Safari POC gate in this document.

### Out of scope

- Replacing the current Run engine with the full `RunCore` architecture from
  ADR 0001. Quick Run must leave a clean seam for that later work.
- Redesigning the existing desktop presentation.
- Mixing Quick Run results into the Line Run leaderboard.
- Android Chrome optimization before the iPhone POC passes.
- New accounts, cloud synchronization, social features, or global Quick Run
  rankings.
- Additional durations, difficulty levels, daily challenges, or infinite
  variations.

## 1. Architecture

Quick Run is a thin vertical slice. It receives an independent pure engine
module rather than adding more optional fields and Mode-specific rules to the
existing generic `RunState`.

```text
App
├── shared Profile, Line, and Station data
├── shared typing-input bridge
│   ├── desktop: window key events
│   └── mobile: hidden native input
│
├── desktop presentation
│   └── existing layout plus Quick Run action
│
└── phone presentation
    ├── Transit
    ├── Adventure
    ├── Ranking
    ├── active Run
    └── Quick Run Summary
```

Desktop and phone presentations arrange controls differently but call the same
domain functions and update the same Profile. Scoring, progress, and route
rules must not be copied into presentation components.

### 1.1 Component responsibilities

`App` chooses the desktop or phone presentation, owns the current destination,
and retains the previous Quick Run starting Station for the current browser
lifetime.

`MobileShell` owns bottom navigation and visual-viewport sizing. It renders one
destination at a time and does not contain game rules.

`MobileTransit` owns Line and Direction selection plus the compact/expanded
drawer state. It prepares either a Quick Run or a full Line Run.

`QuickRunScreen` renders the map, timer, prompt, and keyboard-recovery hint. It
forwards commands and timestamps to the Quick Run engine. Persistence and sound
are triggered from idempotent effects, not state updaters.

`quickRun` is a pure engine module. It owns every Quick Run transition and has
no React, DOM, audio, or storage dependency.

`TypingInputBridge` converts either desktop key events or mobile input events
into one character stream. It owns browser behavior only.

`QuickRunSummary` renders Quick-specific results in one phone viewport. The
existing full Summary remains responsible for Line Run and Adventure.

The existing Line Run and Adventure engines remain intact. Their screens adopt
the shared input bridge and the minimum responsive presentation needed for
phone use.

## 2. Responsive presentation

### 2.1 Phone boundary

The phone presentation activates when either:

- the viewport width is at most `700px`; or
- the primary pointer is coarse and the viewport height is at most `700px`,
  which covers landscape phones whose width exceeds `700px`.

Tablets keep the desktop presentation unless their usable viewport is genuinely
phone-sized. Only one presentation is mounted at a time; duplicate interactive
trees must not remain hidden in the DOM.

### 2.2 Viewport contract

The application root follows `window.visualViewport.height` when available and
falls back to `100dvh`. The document body is fixed against page scroll,
overscroll, and Space-key scrolling. Safe-area insets protect controls on
notched devices.

The shell is a vertical layout. The map consumes the remaining space above the
drawer and bottom navigation. The map continues to pan and zoom; tapping it
does not close the drawer. Only drawer or destination content may scroll
internally when a short landscape viewport cannot contain it.

### 2.3 Transit destination

```text
┌──────────────────────────────┐
│ Compact header               │
├──────────────────────────────┤
│                              │
│         Transit map          │
│      pan and zoom only       │
│                              │
├──────────────────────────────┤
│ KJ  AG  SP  SA  MR  KG  PY →│
├──────────────────────────────┤
│ Kelana Jaya Line          ˅  │
│ 37 Stations · 11 unlocked   │
│                              │
│ Toward: Gombak / Putra Hts. │
│                              │
│ [ Start 45s Quick Run ]     │
│ [ Full Line Run       ]     │
├──────────────────────────────┤
│ Transit   Adventure  Ranking │
└──────────────────────────────┘
```

The seven Line pills retain the established order: `KJ`, `AG`, `SP`, `SA`,
`MR`, `KG`, `PY`. They live in one horizontally scrolling row and never reorder
based on progress or selection. Selecting a Line updates the map and drawer and
scrolls the pill into view.

A new Profile selects the Kelana Jaya Line. A returning player gets their last
selected Line. Transit initially opens with the drawer expanded.

The drawer has exactly two states: compact and expanded. An explicit chevron
switches them; there is no free dragging. Expanded content contains:

- Line code and name;
- Station count and unlocked progress;
- the two termini as a Direction selector;
- primary `Start 45s Quick Run` action; and
- secondary `Full Line Run` action.

It excludes distance, WPM, Accuracy, and other telemetry that does not help the
player begin a Run.

For Quick Run, the selected Direction is the destination Terminus from the
random starting Station. For Line Run, the selected Direction makes the Run
start at the opposite Terminus.

### 2.4 Active Run layout

The drawer and bottom navigation disappear during every active Run.

```text
┌──────────────────────────────┐
│ KJ · toward Gombak     00:32 │
│                              │
│       reduced map view       │
│      current route area      │
│                              │
├──────────────────────────────┤
│        PASAR_SENI            │
│     Tap to continue typing   │  shown only when needed
├──────────────────────────────┤
│                              │
│    native phone keyboard     │
└──────────────────────────────┘
```

When the keyboard opens, the visual viewport contracts rather than making the
page scroll. The map remains meaningfully visible, while the Run information
and prompt compress vertically. The countdown uses tabular figures, occupies a
stable width, and gains a stronger color for the final ten seconds without
pulsing.

Desktop keeps its existing map, header, side picker, and physical-keyboard
layout. Quick Run is available there without adding the mobile drawer or bottom
navigation.

## 3. Quick Run engine

### 3.1 State and commands

The pure state contains:

- selected Line and current Direction;
- current Station and typing cursor;
- start timestamp and deadline;
- correct characters, keystrokes, and errors;
- completed Stations and per-Station timing needed for existing progress;
- route traversal position;
- status: `ready`, `running`, `completed`, or `interrupted`; and
- an explicit personal-best eligibility flag derived from status.

The engine exposes transitions equivalent to:

```text
prepare
enter character
advance time
interrupt
```

Random selection receives an injected random source so engine tests are
deterministic. Time enters every transition as a monotonic timestamp; the
engine never reads the browser clock itself.

### 3.2 Start and route rules

Pressing Start prepares the first Station and focuses the input but leaves the
status `ready`. The first entered character, whether correct or incorrect,
records the start timestamp, establishes the deadline, and changes the status
to `running`.

The starting Station is randomly selected from the chosen Line, excluding the
selected destination Terminus. When more than one eligible Station exists, it
also excludes the immediately previous Quick Run starting Station. That latter
value is browser-lifetime state, not permanent Profile data.

Play follows the authored Station order toward the selected Terminus. After
the player completes that Terminus, Direction reverses and play continues. The
same rule applies at the opposite Terminus if it is reached within the Run.

### 3.3 Typing rules

Typing remains consistent with the existing game:

- comparison is case-insensitive;
- spaces must be entered;
- a correct character advances the cursor;
- an incorrect character increments the error count and does not advance; and
- completing the last character completes and unlocks the Station before the
  next Station begins.

Correct characters in an unfinished Station contribute to WPM and Accuracy.
The unfinished Station is not counted as completed and is not unlocked.

### 3.4 Time and completion

The UI schedules repaints, but remaining time is always derived from the
recorded start timestamp. It never decrements a counter and therefore cannot
accumulate interval drift.

At the 45-second deadline, the engine completes the Run before applying any
input stamped at or after the deadline. A partly typed Station remains
unfinished. A normally completed Run is eligible for a personal best.

If the document becomes hidden after typing begins, the Run ends as
`interrupted`. Completed Stations remain unlocked, but the result cannot
replace the personal best. Hiding the page while the prepared Run is still
`ready` cancels that prepared attempt without producing a scored result.

If the native keyboard closes while the document remains visible, time
continues. The prompt shows `Tap to continue typing`; tapping it refocuses the
input. Repeated deadline, visibility, and persistence effects must be
idempotent.

### 3.5 Metrics and Summary

Quick Run reuses the established definitions:

- WPM is correct characters divided by five, divided by elapsed minutes;
- Accuracy is correct characters divided by total keystrokes; and
- Score uses the existing WPM-and-Accuracy formula.

Quick Run results never enter the Line Run leaderboard. The phone Summary fits
one viewport and contains only:

- completed Station count;
- WPM;
- Accuracy;
- Score;
- the per-Line personal best or `New personal best`;
- `Run again`; and
- `Back to Transit`.

An interrupted Summary replaces the best message with `Run interrupted` and
states that the result was not saved as a best. `Run again` uses the same Line
and Direction while choosing a different starting Station when possible.

## 4. Typing input bridge

Mobile browsers open the native keyboard only for a real editable element
focused synchronously from a user gesture. The Run screen therefore includes a
genuine text input. It is visually reduced within the fixed Run panel, not
removed with `display: none`, `visibility: hidden`, or an off-screen position.

The input:

- uses a minimum `16px` font to prevent iPhone Safari input zoom;
- disables autocomplete, autocorrect, autocapitalization, and spellcheck;
- uses text input mode;
- has an accessible label;
- is focused directly inside Start, prompt-tap, and Junction-action handlers;
  and
- clears its browser value after forwarding inserted characters, allowing the
  same letter to be entered repeatedly.

The bridge waits for IME composition to finish before emitting its composed
text. It forwards each Unicode character in order and never decides whether a
character is correct.

Desktop continues to listen for `keydown`. Modifier shortcuts and named keys
are ignored by typing. Printable characters and Space are captured so browser
defaults cannot move the page. Adventure retains Backspace as its desktop
`Turn around` shortcut.

Focus failure does not begin Quick Run. The player can tap the prompt to try
again. The UI never claims that the keyboard is open based solely on a focus
request; it derives the recovery hint from actual focus and visual-viewport
signals.

## 5. Adventure and Ranking on phones

Adventure uses the same map-and-drawer presentation as Transit. Opening the
destination does not automatically resume a Run. Its expanded drawer contains:

- `Resume from [Station]` when a saved Adventure position exists;
- a starting Station selector; and
- `Start Adventure`.

During Adventure, the drawer and bottom navigation disappear. The shared input
bridge opens the native keyboard. A visible, touch-sized `Turn around` action
appears whenever turning around is valid; desktop retains Backspace. Junction,
Direction, and walk-link actions are touch-sized. Selecting one refocuses the
hidden input from the same tap when typing resumes.

Ranking displays the existing leaderboard content within the fixed mobile
shell. Its content region may scroll internally; the page itself may not.

## 6. Profile persistence

The existing storage key and schema version remain unchanged because the new
data is additive and has safe defaults. `Profile` gains:

```ts
quickBest: Partial<Record<LineCode, number>>;
lastSelectedLine?: LineCode;
```

`emptyProfile()` supplies an empty `quickBest`. Absence of
`lastSelectedLine` resolves to `KJ` without writing until the player makes a
selection. Migration sanitizes both new fields independently: malformed new
data falls back to defaults without discarding otherwise readable progress.

Completing a Station records its unlock and Station WPM through the existing
progress behavior, including during a later-interrupted Quick Run. A completed
Quick Run compares its Score with `quickBest[line]` and writes only the higher
value. An interrupted Run never writes `quickBest`.

Storage errors remain non-fatal. The current Run and Summary continue to work,
but the new best or selected Line may not survive reload.

## 7. Failure handling and accessibility

- A Line without a valid Direction or eligible starting Station disables the
  relevant Start action and presents a short explanation.
- A missing `visualViewport` uses `100dvh`; viewport listeners are removed when
  the shell unmounts.
- An ended Run ignores further characters, ticks, interruptions, and saves.
- The prompt remains visible text rather than using the transparent input as
  the only accessible typing surface.
- Line pills, Direction controls, drawer controls, and Adventure actions expose
  pressed/selected state and accessible names.
- Touch targets meet a minimum `44px` interactive size even when their visual
  marks are smaller.
- Focus indicators remain visible for keyboard and assistive-technology use.
- Reduced-motion preferences suppress nonessential arrival and completion
  animation without changing timing or feedback.
- Sound remains optional; every success, error, and completion state has a
  visual equivalent.

## 8. Automated verification

### 8.1 Engine tests

Quick Run tests cover:

- preparation does not start the clock;
- the first correct or incorrect character starts it;
- traversal follows the selected Direction;
- the destination Terminus is excluded from starting candidates;
- the previous starting Station is avoided when alternatives exist;
- reaching either Terminus reverses travel;
- input at the 45-second boundary is rejected;
- partial correct characters affect metrics;
- a partial Station is neither completed nor unlocked;
- interruption is idempotent and ineligible for a best; and
- random selection is deterministic under an injected random source.

### 8.2 Profile tests

Profile tests cover:

- old Profiles loading with defaults for new fields;
- malformed Quick Run fields falling back safely;
- personal bests remaining separate by Line;
- lower Scores not replacing a best;
- interrupted results never replacing a best; and
- last selected Line persistence.

### 8.3 UI tests

UI tests cover:

- the phone-presentation boundary;
- fixed drawer states and explicit chevron behavior;
- stable Line-pill order, selection, and auto-scroll request;
- Direction shared between Quick Run and Line Run;
- hidden-input attributes and character forwarding;
- repeated letters and completed IME composition;
- keyboard-recovery messaging;
- Adventure's touch `Turn around` action;
- bottom-navigation destinations; and
- compact Quick Run Summary contents.

The existing desktop suite must continue to pass. Automated browser checks may
verify layout and console behavior, but they do not replace the real-iPhone
gate because simulated viewports do not reproduce Safari's keyboard behavior.

## 9. Post-ship POC gate

Complete this section against the first shipped build before scheduling Android
optimization or the full Run-state refactor.

### 9.1 Test record

| Field | Recorded value |
|---|---|
| Build or commit | |
| Deployment URL | |
| Test date | |
| iPhone model | |
| iOS version | |
| Tester | |
| Portrait and landscape checked | |

Run Quick Run five times in iPhone Safari. Four Runs must reach the 45-second
deadline. Use one Run to test interruption by locking the phone or changing
apps after typing has begun.

| Run | Outcome | Stations | WPM | Accuracy | Keyboard opened | No page scroll | Prompt readable | Input felt trustworthy | Notes |
|---:|---|---:|---:|---:|---|---|---|---|---|
| 1 | Completed | | | | | | | | |
| 2 | Completed | | | | | | | | |
| 3 | Completed | | | | | | | | |
| 4 | Completed | | | | | | | | |
| 5 | Interrupted | | | | | | | | |

The tester also checks these once across the five Runs:

- [ ] Opening the keyboard never zooms or moves the document.
- [ ] Repeated letters and spaces register correctly.
- [ ] Wrong characters feel attributable to the player, not lost or reordered
      browser input.
- [ ] Closing the keyboard keeps the clock running and reveals the recovery
      hint.
- [ ] Tapping the prompt reopens the keyboard.
- [ ] Every completed Run ends at 45 seconds, including during a partial
      Station.
- [ ] The intentionally hidden page produces an interrupted Summary.
- [ ] The interrupted result does not update the personal best.
- [ ] An eligible higher Score updates only the selected Line's personal best.
- [ ] `Run again` avoids the immediately previous starting Station when the
      Line has another eligible Station.

### 9.2 Product verdict

Record answers immediately after the fifth Run:

| Question | Answer |
|---|---|
| Did 45 seconds feel too short, suitable, or too long? | |
| Did the tester voluntarily press `Run again` at least once? | |
| Was typing satisfying enough to prefer over idle scrolling? | |
| What was the largest source of friction? | |

Choose exactly one outcome:

- **Continue:** all technical checks pass, 45 seconds is suitable or needs only
  a small tuning change, and the tester voluntarily chose `Run again`.
- **Adjust and repeat:** the mechanic still shows promise, but a keyboard,
  viewport, input-trust, or duration problem prevents a confident decision.
  Record the smallest correction and rerun this gate after shipping it.
- **Stop:** the interaction works technically but is not satisfying enough to
  justify Android optimization or deeper architecture work.

**Recorded outcome:**<br>
**Reason:**<br>
**Next action:**

## 10. Implementation boundary after the POC

Passing the gate authorizes planning Android Chrome verification and deciding
whether Quick Run should join the accepted `RunCore` per-Mode architecture.
It does not automatically authorize extra durations, daily challenges, online
leaderboards, or a broader mobile redesign. Those remain separate product
decisions.
