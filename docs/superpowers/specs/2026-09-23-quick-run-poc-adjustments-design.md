# Quick Run POC Adjustments — Design Spec

**Date:** 2026-09-23<br>
**Status:** Implemented (automated and browser verification complete; real-device POC pending)

## 1. Purpose

The first real-iPhone POC proved that Quick Run can accept mobile typing, but
it also exposed five product problems:

1. phone landscape is not usable while the keyboard is open;
2. reduced motion removes the only visible wrong-key feedback;
3. the train is framed too far away during a Run;
4. a 45-second Run repeats short Lines, especially MR; and
5. WPM and Accuracy are not visible while typing.

This follow-up keeps Quick Run as a small POC while correcting those problems.
It supersedes the conflicting Quick Run decisions in
`2026-09-09-mobile-quick-run-design.md`. The original document remains the
record of the first shipped design.

The reference implementation investigated during design is recorded in
`docs/research/2026-09-18-tw-metro-typing-timed-run.md`. It starts a 30-second
timed Run at an origin Terminus and wraps to the first Station after the other
Terminus. This design adopts the shorter duration but rejects the abrupt wrap.

## 2. Revised product decisions

1. Quick Run lasts 30 seconds. The clock still begins on the first printable
   character, whether the character is correct or incorrect.
2. Quick Run is one Mode-wide challenge. A Run can use more than one Line, and
   its personal best is not associated with its starting Line.
3. The player still selects the starting Line and Direction.
4. The first Station is random but must be at least four Station advances from
   the selected Terminus. In index terms, the distance between the starting
   Station and that Terminus is at least four.
5. If the player completes the Terminus before the deadline, the train jumps
   to an eligible Station on a different Line. The Lines do not need to meet at
   an Interchange.
6. A jump never pauses the clock or blocks typing. The new prompt and Line
   context appear immediately; the map transition is decorative.
7. Jump selection prefers Lines and Stations that have not yet appeared in the
   current Run.
8. Phone-sized landscape screens cannot start or continue a Run. Tablet
   landscape is not rejected solely because it is landscape.
9. WPM and Accuracy are visible during the Run and refresh once per second.
10. Wrong-key feedback remains visible until the correct character is entered,
    including with reduced motion enabled.
11. The follow camera frames approximately one Station behind and two ahead,
    while retaining the existing safety zoom for unusually long gaps.
12. Quick Run evidence contains an explicit leg trace. Replay does not
    regenerate random jumps from a seed.

## 3. Quick Run model

### 3.1 Leg and jump

A **leg** is one continuous ordered sequence of Stations on one Line. It is
described by:

```ts
interface QuickLeg {
  line: LineCode;
  at: string;
  toward: string;
}
```

`at` is the first Station prompt for the leg. `toward` is one of that Line's
Termini. A leg is eligible when:

- `at` belongs to `line`;
- `toward` is a Terminus of `line`; and
- following the Line from `at` toward `toward` requires at least four Station
  advances.

A **jump** replaces the current leg with another eligible leg. It is an
intentional Quick Run mechanic, not an Interchange or a Walk link. The UI must
not draw a rail connection between the old and new Stations.

Implementation updates `CONTEXT.md` with canonical definitions for Quick Run,
leg, and jump. The evidence name is **leg trace**, not Route: the existing
domain term Route remains exclusive to Line Run.

### 3.2 Initial leg

The selected Line and Direction fix `line` and `toward`. The engine enumerates
eligible starting Stations for that pair. It excludes the previous Quick Run's
starting Station when another eligible Station exists, then uses the injected
random source to choose among the remaining candidates.

If the selected Line has no eligible starting Station, Quick Run is unavailable
for that Line and the Start action gives a short explanation. All seven current
Lines have at least five Stations, so this is defensive failure handling.

### 3.3 Jump selection

When the player completes a Terminus before the deadline, the engine chooses a
new leg in this order:

1. Enumerate Lines other than the current Line that contain at least one
   eligible leg.
2. Prefer Lines not yet used in this Run. Reuse a Line only when every eligible
   different Line has already been used.
3. Choose one Line at random from that preferred set. Line selection is equal
   by Line, so Lines with more Stations do not receive extra weight.
4. On that Line, enumerate both Directions and all landing Stations that meet
   the four-advance minimum.
5. Prefer landing Stations not yet typed in this Run. Reuse a Station only when
   the chosen Line has no eligible untyped landing Station.
6. Choose one eligible `(at, toward)` pair at random from that preferred set.

The just-completed Terminus is recorded before the jump. The new Station prompt
then becomes active immediately. The Run never reverses at a Terminus.

If corrupted network data leaves no eligible different Line, the engine ends
the Run as interrupted with a continuation error. It does not silently relax
the different-Line or four-advance rules, and the result cannot set a personal
best.

### 3.4 Deadline precedence

The 30-second deadline remains authoritative. Input stamped at or after the
deadline is rejected and completes the Run. If the final character of a
Terminus is entered before the deadline, the jump occurs. If it is entered at
or after the deadline, the Run completes without a jump.

A partly typed Station contributes correct characters, keystrokes, and errors
to Metrics but is not completed or unlocked.

## 4. Architecture and evidence

### 4.1 Engine ownership

`src/engine/quickRun.ts` remains the deep module for Quick Run. Its interface
prepares a Run, accepts characters and timestamps, advances time, interrupts a
Run, and reports Metrics. Its implementation owns:

- eligible-leg enumeration;
- the initial starting Station rule;
- jump selection and preference tiers;
- Line and Direction changes;
- the 30-second deadline;
- completed-Station recording; and
- leg-trace construction and validation.

`QuickRunScreen` does not select Lines, Stations, or Directions during a Run.
It supplies the live random source and renders the state returned by the
engine. The random source remains injectable so engine tests are deterministic.

### 4.2 Leg trace

Quick Run evidence contains two independent records:

```ts
interface QuickLegTrace {
  version: 1;
  legs: QuickLeg[];
}

interface QuickRunEvidence {
  keylog: KeyLog;
  trace: QuickLegTrace;
}
```

The first trace entry is the initial leg. Each used jump appends one entry when
the new leg becomes active. The trace contains no speculative or unused legs
and needs no timestamps: replay reaches each jump at the timestamp of the key
that completed the preceding Terminus.

This explicit leg trace replaces a random seed. A seed would couple historical
Replay to the exact pseudo-random algorithm, candidate ordering, and network
data. The trace keeps those implementation details out of the evidence
interface.

### 4.3 Replay and Verdict

`replayQuickRun` accepts the network plus `QuickRunEvidence`. It initializes
from the first recorded leg, replays the Keylog through the Quick Run engine,
and consumes one recorded leg whenever the preceding Terminus is completed.

Replay validates that:

- every leg references a real Line, Station, and Terminus;
- every leg satisfies the four-advance minimum;
- each jump changes Line;
- each jump belongs to the highest available unused-Line and untyped-Station
  preference tier at that point in the Run;
- every required jump has one trace entry; and
- no unused trace entries remain when the Run completes.

Missing, extra, or invalid entries make Replay fail. The existing Keylog
Verdict then judges input trust, batches, speed, and timing consistency using
the replayed WPM. The leg trace does not alter those heuristics.

This separation is deliberate: Replay establishes what prompts the player
received and derives the Metrics; the Verdict judges how the keystrokes
arrived. The screen does neither.

A client-authored leg trace cannot prove that a selection was genuinely random.
The present integrity layer is local and is not designed to be cheat-proof. A
future online board may use a server-issued seed or server-selected legs
without changing the evidence's explicit-leg shape.

## 5. Active Run presentation

### 5.1 Context and Metrics

The active panel keeps the Station prompt dominant. Its compact context shows:

- current Line code and name;
- current Direction;
- remaining time;
- integer WPM; and
- integer Accuracy percentage.

WPM and Accuracy display `—` before the first character. After typing begins,
their displayed values refresh once per second. Engine timing and deadline
checks do not depend on that display cadence.

### 5.2 Wrong-key feedback

After an incorrect character, the current character receives an error colour
and a double underline. A nearby visible `Wrong key` status remains until the
player enters the correct character. A subsequent wrong character refreshes
the optional bounce when motion is allowed, but the persistent treatment does
not depend on animation or sound.

Reduced motion disables the bounce only. It keeps the error treatment and
status. The status uses `role="status"` and does not move focus away from the
typing input.

### 5.3 Jump transition

When a jump occurs:

1. the Line, Direction, and Station prompt update immediately;
2. an inline `Jumped to [Line code] · [Station]` status remains visible until
   the first correct character on the new leg;
3. the map fades down, reframes without spatial travel, and fades in within
   250 ms; and
4. the train reappears at the landing Station without a connecting path.

Typing remains active throughout. Characters typed during the map transition
apply to the new prompt. Reduced motion makes the map change instantaneous but
keeps the same text announcement.

### 5.4 Camera

The followed view uses approximately one Station behind and two Stations ahead
instead of two behind and three ahead. The active segment and mandatory map
marks must remain visible. Existing containment logic may open the view for an
unusually long Station gap.

## 6. Phone landscape policy

The restriction applies only when the phone presentation is active and the
viewport is wider than it is tall. It must not be a blanket
`orientation: landscape` rule.

- Setup, Transit, Adventure setup, and Ranking remain available.
- Run actions are disabled and the UI says `Rotate to portrait to play`.
- Rotating a prepared Quick Run before its first character cancels it without a
  result.
- Rotating a running Quick Run interrupts it immediately. The interrupted
  Summary becomes available after the player returns to portrait.
- The same guard applies to Line Run and Adventure because their prompt and map
  have the same unusable keyboard-open constraint.
- Desktop presentation is unaffected.

iPad Mini landscape is not part of this implementation gate. It remains a
follow-up compatibility gate: test the current desktop/tablet presentation
with its keyboard open, then retain it if both prompt and map remain usable.

## 7. Summary and Profile

The Quick Run Summary continues to show completed Stations, WPM, Accuracy, and
Score. It also shows the Lines used in order, for example `MR → SP → KJ`.

The Profile gains one additive mode-wide field:

```ts
quickBestOverall?: number;
```

An absent or invalid value behaves as no personal best. The existing
line-keyed `quickBest` field remains readable for backward compatibility but is
legacy data: the new Mode neither displays nor updates it. Old 45-second,
single-Line Scores are not converted because they are not comparable with the
new 30-second, multi-Line Score.

Only a normally completed Run whose evidence replays and passes its Verdict can
update `quickBestOverall`. A higher eligible Score replaces it. Storage failure
remains non-fatal.

Every completed Station still updates unlocked progress and its best Station
WPM, including Stations reached after a jump and before a later interruption.

`Run again` preserves the selected starting Line and Direction. It chooses a
new eligible starting Station when possible and creates a fresh Keylog and
leg trace.

## 8. Failure handling

- Invalid or insufficient Line data disables the affected Start action.
- No eligible jump ends the Run as interrupted and cannot set a personal best.
- A map transition failure does not stop typing or the clock; the prompt and
  text context remain authoritative.
- A missing, malformed, inconsistent, or partially consumed leg trace fails
  Replay and prevents a personal-best update.
- An ended or interrupted Run ignores later input, ticks, jumps, and saves.
- Existing visibility interruption and keyboard-recovery behavior remains.
- All persistence and completion effects remain idempotent.

## 9. Automated verification

### 9.1 Engine tests

- the deadline is 30 seconds and starts on the first printable character;
- initial Stations are at least four advances from the selected Terminus;
- the previous starting Station is avoided when an alternative exists;
- completing a non-Terminus advances on the same Line;
- completing a Terminus before the deadline chooses a different Line;
- jump selection prefers unused Lines, then untyped landing Stations;
- random selection is deterministic under an injected random source;
- every jump landing has at least four advances to its new Terminus;
- the deadline wins over a character entered at the deadline;
- a missing jump pool interrupts rather than relaxing the rules; and
- unfinished Stations retain the existing Metrics and unlock behavior.

### 9.2 Evidence and Profile tests

- Replay reproduces live Lines, Stations, Metrics, and completion;
- Replay rejects an invalid first leg, same-Line jump, too-short leg, missing
  leg, extra leg, and a leg outside the active preference tier;
- valid randomness does not need to be regenerated during Replay;
- Keylog Verdict thresholds remain unchanged;
- `quickBestOverall` loads safely from old Profiles, is sanitized independently,
  and rejects malformed data;
- old line-keyed Quick Run bests remain stored but are not displayed or
  updated; and
- interrupted or failed-evidence Runs cannot replace the mode-wide best.

### 9.3 UI tests

- Start actions say `Start 30s Quick Run`;
- WPM and Accuracy show `—` before typing and refresh once per second;
- a wrong key produces persistent colour-plus-shape feedback and visible status;
- correct input clears the persistent wrong-key state;
- reduced motion removes the bounce but not the error state;
- a jump changes prompt and context immediately while input remains active;
- jump presentation does not draw a connection between unrelated Stations;
- reduced motion makes the jump instantaneous but keeps its announcement;
- the camera requests one Station behind and two ahead;
- the Summary lists Lines in order and uses the mode-wide best;
- phone landscape disables Run starts with the portrait instruction;
- rotation while ready cancels, and rotation while running interrupts; and
- tablet/desktop presentation is not blocked by the phone-only guard.

The existing Line Run, Adventure, input bridge, Replay, integrity, Profile, and
desktop suites must continue to pass.

## 10. Revised post-ship POC gate

Run Quick Run five times in portrait iPhone Safari. Four Runs must reach the
30-second deadline. Use one Run to test interruption by changing apps or
locking the phone after typing begins.

Across the five Runs:

- start on MR at least once and reach at least one jump;
- start on a second Line at least once;
- verify every initial and jump leg provides at least four Station advances;
- verify no jump repeats the current Line;
- verify unused Lines and Stations are preferred until reuse is necessary;
- confirm typing continues during a jump transition without lost characters;
- confirm the clock continues during the transition;
- confirm the map never draws a false rail connection;
- confirm WPM and Accuracy remain readable and update once per second;
- test one wrong key with normal motion and one with reduced motion;
- confirm both error states remain understandable without sound;
- confirm the closer camera keeps the train and active segment identifiable;
- confirm phone landscape blocks starting a Run;
- rotate one running attempt and confirm it becomes interrupted; and
- confirm only an eligible higher Score updates the single Quick Run personal
  best.

Record whether 30 seconds feels suitable, whether the jumps improve variety,
whether the player voluntarily selects `Run again`, and the largest remaining
source of friction.

The outcome remains one of `Continue`, `Adjust and repeat`, or `Stop`.
`Continue` authorizes Android Chrome validation. iPad Mini landscape remains a
separate follow-up compatibility gate and does not block this POC verdict.

## 11. Out of scope

- An online or global Quick Run leaderboard.
- Server-issued randomness or proof that a client-side jump was random.
- Player-selected jump destinations.
- Additional Quick Run durations or difficulty settings.
- Android-specific optimization before the revised iPhone POC passes.
- A tablet layout redesign before the iPad Mini compatibility check.
- Replacing the accepted per-Mode Run architecture.
