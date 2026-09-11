# Run integrity — design

**Date:** 2026-09-10
**Status:** Designed, not implemented.

A lightweight integrity layer for scored Runs. It closes the exploits that need
no tools at all, and — more importantly — makes a Run produce *evidence* rather
than a number, so the same judgment can be made on a server later without
rewriting anything.

This is not an attempt to make the game cheat-proof. The station names ship in
the bundle and the target string sits in React state; anyone determined enough
will read it. The goal is narrower and achievable: make the leaderboard mean
something, and don't paint the future online board into a corner.

## Why now

The board is local today, so nothing here is urgent on its own. It is being
built now because one part of it is expensive to add retroactively: a Run
currently records no timing evidence at all, and code that never captured
evidence cannot be persuaded to have captured it later. Everything else in this
design is additive; that one thing is not.

## What is exploitable today

Found by reading the code, ordered by how little the player needs to know.

**Free, on a phone, no tools:**

1. **Paste completes a station.** `TypingInputProvider.tsx:53` — `emitInputValue`
   reads `input.value` and fans every character out as a keystroke. Long-press,
   Paste, and the station is done at 100% accuracy with zero errors. No length
   cap, no per-event budget.

**One line in a console:**

2. **Synthetic keystrokes.** `useKeyboard.ts:13` does not consult `e.isTrusted`.
   A dispatch loop types a whole line at machine speed — and that is also the
   shape any real bot takes.
3. **Clock override.** `performance.now = () => 0` divides elapsed time to
   nothing. Nothing downstream sanity-checks the resulting WPM.
4. **Direct board edit.** `klmetro.leaderboard.v1` is plain JSON in
   `localStorage`.

**Structural, and the reason this is a design rather than four patches:**

5. **No timing evidence exists.** `RunState.stationTimes` holds per-station
   totals and nothing finer. No inter-keystroke intervals are recorded anywhere,
   so a human and a script are indistinguishable *in principle* — now, and on
   any server built on today's data.
6. **No plausibility ceiling.** `computeMetrics` returns whatever the arithmetic
   gives. 9,000 WPM submits cleanly.
7. **Nothing binds a Run to a session.** No server-issued id, no nonce. One
   winning submission would replay forever.
8. **The answer key is in the bundle.** Client-side obfuscation is worthless
   here. Only behavioural evidence and server-side re-simulation can work.

Two things are already right and this design depends on both: Runs use
`performance.now()` rather than wall clock, and `src/engine/*` is pure. That
purity is the entire reason a validator written today runs unchanged inside a
Node server tomorrow.

Item 7 is out of scope — a nonce is additive once the server's shape is known.
Item 4 stops mattering the moment the server derives scores itself rather than
believing a submitted one.

## The principle

**The input layer never rejects. It annotates. One pure function judges.**

The obvious alternative was to harden the boundary: drop untrusted events, cap a
non-composition `input` event at one character. It was rejected. Android
predictive keyboards deliver multi-character `input` events with no composition
event, and some assistive input tools dispatch synthetic key events. When a
guard there is wrong the player cannot type at all — the worst available failure
for a typing game, and one that surfaces as "the game is broken on my phone",
not as "the anti-cheat is too strict".

Annotating instead means everyone can always play. A pasted station still
completes; it is simply not leaderboard-eligible, and the summary says so. Every
judgment lives in one pure function with no DOM near it, which is exactly the
thing that ships to a server later. Tuning a threshold becomes a one-line edit
with tests around it rather than a re-test across four mobile browsers.

The honest cost: cheating for your own amusement stays possible. The board is
the thing being protected, and this is the only version where a false positive
costs a leaderboard entry instead of the ability to play.

## Scope

**In:** Line Run (the only mode with a board today) and Quick Run (a
45-second sprint on one Line — the natural shape for an online board, and
instrumenting it now avoids doing this work twice).

**Out:** Adventure. Free roam, no score, no board, nothing to protect.

## Vocabulary

Additions to `CONTEXT.md`. Existing terms are used as that document defines
them. Note that `CONTEXT.md` does not yet name Quick Run at all; that gap
predates this work.

**Keylog**:
The record of one Run's typing — every keystroke with its timing and how it
arrived. The Run's evidence.
_Avoid_: keystroke log, trace, telemetry

**Source**:
How a keystroke reached the game: whether the browser marked its event trusted,
and how many characters arrived in the same event.
_Avoid_: provenance, origin

**Verdict**:
The result of judging a Keylog: a pass, or a single named Reason for failing.

**Replay**:
Feeding a Keylog back through the Run engine to derive its Metrics, rather than
believing the Metrics the Run reported.

**Eligible**:
A completed Run whose Keylog replays cleanly and passes its Verdict. Only
eligible Runs reach a leaderboard.

## Architecture

Six pieces. Everything that judges is pure and lives in `src/engine/`. Exactly
one unit is impure.

### New, pure

**`src/engine/keylog.ts`** — the record format and its construction.
`beginLog(now)`, `appendKey(log, key, source, now)`. Owns the delta encoding.
Knows nothing about Runs, Stations, or cheating.

**`src/engine/integrity.ts`** — `verifyKeyLog(log, replayedWpm): Verdict`. The
only place a judgment is made. Takes a Keylog, returns a pass or a named Reason. No network
knowledge, no Run knowledge — only the shape of the typing.

**`src/engine/replay.ts`** — `replayLineRun` and `replayQuickRun`. Feeds a
Keylog's keys back through the existing Run engines using the Keylog's own
timestamps, and returns derived Metrics. This is what makes the Keylog
authoritative rather than decorative.

### New, impure — the only one

**`src/ui/useRunRecorder.ts`** — a ref-backed hook returning
`{ record(key, source), snapshot(), reset() }`. Ref-backed deliberately: a
37-station Run is roughly 500 keystrokes, and recording must cause zero extra
renders.

### Changed

**`src/ui/useKeyboard.ts`** and **`src/ui/TypingInputProvider.tsx`** — the
handler signature grows from `(key: string)` to `(key: string, source?: KeySource)`.
`useKeyboard` reads `e.isTrusted`; `emitInputValue` reports the character count
of the event it is draining. The parameter is optional, so `AdventureScreen`
needs no change.

**`src/engine/lineRun.ts`** — gains `keyLineRun(net, route, state, key, now)`,
the route-completion and interchange rule lifted out of
`LineRunScreen.tsx:96-104`. Replay cannot reproduce a Line Run without it, and
`docs/STATUS.md` already lists that rule as debt with no direct test because it
sits inside a React callback. Paying it down is a precondition here, not a
detour.

### Flow

Keystroke → tagged with its Source at the boundary → recorder (ref, no render)
*and* Run engine, in parallel → at Run end, `SummaryScreen` takes the Keylog
snapshot, replays it for Metrics, verifies it, and offers the name panel only on
a pass.

Dependency direction is one-way: `ui` → `engine`, never back. Nothing in
`engine/` learns that a DOM exists.

## The record format

```ts
export const KEYLOG_VERSION = 1;

export interface KeySource {
  trusted: boolean;   // DOM event.isTrusted
  batch: number;      // characters delivered by the one input event; 1 is normal
}

export interface KeyEvent {
  k: string;          // the character
  dt: number;         // ms since the previous event
  u?: 1;              // present only if untrusted
  b?: number;         // present only if batch > 1
}

export interface KeyLog {
  v: number;
  t0: number;         // performance.now() when the log opened
  events: KeyEvent[];
}
```

The optional fields are absent in the ordinary case, so a typical event is
`{"k":"a","dt":142}` and a 37-station KJ Run lands around 9 kB of JSON — small
enough to hold in the Profile and to POST later without thinking about it.

### The recorder owns the clock

This is the load-bearing detail.

`dt` is the difference between *rounded* absolute offsets, not a rounded
difference. Summing deltas therefore reconstructs each timestamp exactly, with
no error accumulating across 500 events.

And the screens stop calling `performance.now()` for keystrokes.
`recorder.record(key, source)` returns the quantised tick it just wrote, and
that value is what gets passed to `keyRun`. One clock, and it is the recorded
one.

That buys an invariant worth stating outright: **replaying a Keylog reproduces
the live Run's Metrics exactly** — not approximately. Which makes the whole
design's safety net a single test. If that test is green, the Keylog is a
faithful substitute for the Run, and a server can derive scores from it without
the client sending one.

```ts
export interface ReplayResult {
  metrics: Metrics;
  stationsCompleted: number;
  complete: boolean;  // reached the terminal state a real Run would
}
export function replayLineRun(
  net: NetworkIndex, line: LineCode, from: string, log: KeyLog,
): ReplayResult | null;
```

`null` means the Keylog's keys do not drive a valid Run against that route at
all. A hand-forged Keylog fails here, before any heuristic gets a say.

Quick Run's equivalent takes the parameters that determine its route, since its
starting Station is chosen at random by `prepareQuickRun` and cannot be
re-derived:

```ts
export function replayQuickRun(
  net: NetworkIndex, line: LineCode, start: string, toward: string, log: KeyLog,
): ReplayResult | null;
```

The 45-second deadline needs no parameter: `enterQuickCharacter` derives it from
the first keystroke, so replay reproduces it. Interruption needs none either —
`profile.quickBest` is only written when `status === 'completed'`, so an
interrupted Quick Run never reaches a gate.

## The validator

One pure function, one exported threshold table, checks ordered
cheapest-and-most-certain first.

```ts
export type IntegrityReason =
  | 'malformed-log' | 'untrusted-input' | 'batched-input'
  | 'impossible-speed' | 'inhuman-consistency' | 'too-few-keystrokes';

export type Verdict = { ok: true } | { ok: false; reason: IntegrityReason };
export function verifyKeyLog(log: KeyLog, replayedWpm: number): Verdict;
```

WPM arrives as a parameter rather than being derived inside. A Keylog records
which keys were pressed and when, but not which were *correct* — only Replay
knows that, because only Replay knows the route. The caller replays first and
passes the result in, which keeps `integrity.ts` free of any network knowledge.

| Reason | Fires when | Why that number |
|---|---|---|
| `malformed-log` | wrong version, empty, or event count over the 5,000 cap | Both instrumented modes are bounded far below the cap; it is a memory backstop. |
| `too-few-keystrokes` | fewer than 20 events | Below this the statistics are meaningless. |
| `untrusted-input` | any event carries `u` | Scripted keystrokes are the bot case and the console case at once. |
| `batched-input` | any single event delivered 4+ characters, or more than 8 multi-character events across the Run | "Kelana Jaya" pastes as one event of 11. The headroom to 4 exists because Android predictive keyboards legitimately deliver 2–3. |
| `impossible-speed` | replayed WPM above 300, or median inter-key interval below 40 ms | The sustained human record is roughly 212 WPM; 300 is not a close call. Median rather than minimum, so a couple of fast digraph rolls do not trip it. |
| `inhuman-consistency` | coefficient of variation of inter-key intervals below 0.12, with 40+ intervals | The real anti-bot check. Humans run 0.35–0.7; a `setInterval` script runs 0.01–0.05; even a jittered bot rarely clears 0.15. |

The first event's `dt` is never counted as an inter-key interval. It measures
the pause before typing began — a player thinking for ten seconds is not
evidence of anything, but it would wreck both the median and the coefficient of
variation.

Thresholds live in one exported const object so tuning is a one-line edit with
tests around it.

### Deliberate non-goals

**Accuracy is never checked.** Genuinely fast typists are also accurate;
punishing that would be exactly backwards.

**Long pauses are never checked.** They only lower the player's own score.

**Per-Station `bestWpm` is not gated.** Both modes call `recordStation` on every
arrival, mid-Run. Gating it would mean issuing a Verdict per Station rather than
per Run, which the statistics cannot support — 20 events is already the floor.
It is a private local stat with no board behind it, and it stays ungated.

### A risk on the record

`untrusted-input` is a hard fail, and assistive input tools that dispatch
synthetic DOM events cannot be fully ruled out. Most operate at the OS level and
produce trusted events, but "most" is not "all". This is precisely what the
retained failure records are for: if real players begin failing on
`untrusted-input`, that appears in the data before a server is built on the
assumption.

## Submission

`SummaryScreen` receives the Keylog alongside the Run, then:

1. Replay. `null`, or `complete === false` → ineligible.
2. Verify. On a pass, feed the **replayed** Metrics to `evaluateRun` and
   `submitEntry`.
3. On a fail, render one line where the name panel was: *"This run wasn't
   eligible for the leaderboard."* No reason is given. An honest player knows
   something happened and can report it; a cheater gets no gradient to tune
   against.

The stats blocks are untouched either way. The Run happened; those numbers are
real to the player.

Quick Run gates `profile.quickBest` on the same Verdict, or instrumenting it
would be decorative.

## Storage

`Profile` gains:

```ts
integrityFails?: { t: number; mode: 'line' | 'quick'; reason: IntegrityReason }[];
```

Capped at 20, newest first. Optional and additive, so the existing spread in
`migrate` carries old saves forward untouched — the same path `muted` and
`quickBest` took. There is no UI for it. It exists so false positives are
visible before they matter.

`LeaderboardEntry` gains `verified?: true`. Optional, so `SCHEMA_VERSION` does
not move and `loadStore`'s version check still passes. Entries already on the
local board stay unmarked, and when the server lands it is clear which were
never checked.

**The Keylog is not persisted.** It lives in the ref for the life of the Run and
is consumed at the summary. 9 kB per Run has no local value and would grow
without bound. When there is a server, the Keylog goes from the ref straight
into the request body.

## Error handling

Nothing in this design throws.

- Replay returning `null` is ineligibility plus a `malformed-log` record.
- A Keylog exceeding the 5,000-event cap stops appending and is marked; it fails
  as `malformed-log`.
- An empty or short Keylog is `too-few-keystrokes`, not an error.
- `verifyKeyLog` is total: every input produces a Verdict.

## Testing

The spine is DOM-free.

1. **The identity test.** Play a Run through `keyLineRun`, replay its Keylog,
   assert the two `Metrics` objects are identical. Everything else rests on this
   one.
2. **Validator table tests.** A synthesised Keylog per Reason: pasted, uniform
   interval, zero-delta clock override, untrusted, too short, malformed.
3. **A human-plausible fixture that must always pass.** The false-positive
   guard. Every threshold edit reruns against it.
4. **`keyLineRun` gets direct tests.** The rule has had none, having lived in a
   callback.
5. **Two component tests.** Name panel suppressed with the message on a failing
   Run; present on a passing one.

## What this sets up

When the online board is built, the client posts a Keylog and the server calls
`replayLineRun` and `verifyKeyLog` — the same two functions, unchanged, because
neither touches a DOM. The score is derived server-side rather than believed,
which retires exploits 3 and 4 outright.

Two things remain to add at that point, both additive: a server-issued nonce
bound into the Keylog so a winning submission cannot be replayed, and rate
limiting. Neither requires the record format to change.
