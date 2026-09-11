# Run Integrity — Execution Record

**Date:** 2026-09-11
**Status:** Complete. Unmerged, on branch `worktree-run-integrity` (`80ed5b8..0188244`).
**Spec:** `docs/superpowers/specs/2026-09-10-run-integrity-design.md`
**Plan:** `docs/superpowers/plans/2026-09-11-run-integrity.md`

Eight tasks, 13 commits, executed by subagent-driven development: a fresh
implementer per task, a spec-and-quality review after each, and a whole-branch
review at the end. Final state: 56 test files, 565 tests, clean build
(135 kB gzipped).

This document exists for the same reason the visual-revamp one does: the
decisions below were made *on the user's behalf, during execution*, and would
otherwise have been lost with the gitignored progress ledger. Commit messages
carry the *what*, not the *why* — and in this run five rulings corrected the
spec or the plan that are themselves committed here.

One thing is worth stating at the top, because it is the most useful lesson in
this record: **the two worst defects on this branch were both invisible to a
green test suite, and one of them was an anti-cheat check that silently refused
honest players.** See §5.

---

## 1. Task completion

Every task was reviewed for spec compliance *and* code quality before being
marked complete. "Fix rounds" are the review loop; a task closed only when its
findings were addressed.

| Task | Commits | Fix rounds | Notes |
|---|---|---|---|
| 1 — Keylog record format | `735808b` | 0 | |
| 2 — Lift the Line Run route rule into the engine | `7bf33c5` | 0 | Pays down debt `STATUS.md` had listed |
| 3 — Replay | `1ca6baf`, `91b09b5` | 1 | Test never reached the branch it covered (§3.2) |
| 4 — The validator | `0dc45e8`, `bf5d902` | 1 | Two findings (§3.3, §3.4) |
| 5 — Profile and leaderboard record fields | `fa52936` | 0 | Only task reviewed with zero findings at any severity |
| 6 — Input provenance and the recorder | `e27fdfe` | 0 | |
| 7 — Gate the leaderboard on the Verdict | `53ffdd4`, `aadc360` | 1 | Largest task; a Critical and an Important (§3.5–§3.8). Interrupted by an API spend limit, resumed |
| 8 — Update the project documents | `5b37b80`, `da18211` | 1 | Both findings were defects in the plan's own prose (§3.9, §3.10) |
| Final review fix wave | `0188244` | — | 1 Critical, 3 Important, 3 Minor (§3.11–§3.14) |

The plan's step checkboxes are left unticked deliberately, following the
precedent of the visual-revamp record: several steps were superseded during
execution (Task 3's and Task 4's tests, Task 7's prescribed test, and the whole
batch-encoding half of Task 6), so ticking them would assert something untrue.
**This table is the authoritative status.**

---

## 2. Where the shipped code diverges from the spec

| Spec section | Divergence | Where recorded |
|---|---|---|
| The validator | `verifyKeyLog(log)` → `verifyKeyLog(log, replayedWpm)` | Spec amended before implementation (`2c3f8ff`) |
| The validator | First event's `dt` excluded from interval statistics | Spec amended before implementation (`2c3f8ff`) |
| Replay | `replayQuickRun` takes `start` and `toward` explicitly | Spec amended during its own self-review (`1d64c28`) |
| The validator | Per-Station `bestWpm` explicitly *not* gated | Spec amended during its own self-review (`1d64c28`) |
| The record format | `KeyLog` gains `truncated?: true` | Here (§3.14) |
| The record format | `b` marks only a burst's **first** character, not every character in it | Here (§3.11) |
| The record format | Non-printable keys (`Shift`, arrows, `F5`) are not logged at all | Here (§3.12) |
| The validator | A non-finite `replayedWpm` fails as `malformed-log` | Here (§3.4) |
| Architecture | `quickRunAt` split out of `prepareQuickRun` | Plan, Task 3 — replay cannot re-roll a random start |
| Error handling | `verifyKeyLog` gains runtime shape guards | Implements the spec's "total" requirement rather than diverging from it (§3.3) |

---

## 3. Rulings

Each was a decision the plan or spec did not settle, made during execution
rather than referred back. Recorded with what it would cost if wrong.

### 3.1 Fix `remaining.forEach(onKey)` before it breaks — found in the pre-flight scan
`LineRunScreen.tsx`'s dev-only `skipToEnd` passed `onKey` straight to
`forEach`, which supplies the element **index** as a second argument. Harmless
while the handler took one parameter; a type error the moment Task 6 widened it
to `(key, source)`, and had it compiled, a corrupted Source on every dev-skip
keystroke. Ruled into Task 7 as an explicit lambda.
*Cost if wrong: the dev-only skip button, which `import.meta.env.DEV` strips
from production builds.*

### 3.2 Uphold a test that never reached the branch it covered
The plan's Quick Run replay test typed continuously past the 45-second
deadline, so `enterQuickCharacter` completed the run on a trailing keystroke
and the `advanceQuickRun` call it claimed to cover was a no-op — deleting that
line left the suite green. The spec names the interval-tick path as the entire
reason the line exists, so the spec sided with the reviewer over my plan text.
*Cost if wrong: one test.*

### 3.3 `verifyKeyLog` must survive malformed input, not just malformed *values*
The function dereferenced `log.v` and `log.events` with no runtime guard, so a
`KeyLog`-shaped value with no `events` array threw a `TypeError` instead of
returning a Verdict. The spec calls the function total, and its stated endpoint
is a server calling it on **submitted, untrusted JSON** — where a TypeScript
annotation is worth nothing. Kept the parameter typed `KeyLog`; widening it to
`unknown` would have rippled into callers for no gain.
*Cost if wrong: a few defensive lines in a function whose job is defending
against tampered input.*

### 3.4 Guard a non-finite `replayedWpm` — beyond the spec
`NaN > 300` is `false`, so a non-finite speed slipped past the ceiling
untouched. Unreachable from `computeMetrics` today, which clamps to zero, but a
speed check that silently accepts `NaN` is the class of hole this validator
exists to close.
*Cost if wrong: one unreachable branch, defensible as server hardening.*

### 3.5 The Quick Run "Run again" bug was a **verification bypass**, not a false positive
The review diagnosed it as an honest second run being refused. That mechanism
does not reproduce. The stale log's `t0` is run 1's start, so run 1's first
keystroke sets the replayed deadline; every run-2 keystroke then arrives past
it and replay short-circuits, returning `complete: true` carrying **run 1's**
metrics. So run 2's eligibility was decided by run 1's typing — an honest first
run laundered a cheated second one. The fix is the same two lines; the defect
was considerably more serious and pointed the opposite way.
*Cost if wrong: nothing — the fix was prescribed either way; only the severity
assessment turned on it.*

### 3.6 Accept a substituted test when the prescribed one targeted a fiction
Following from §3.5, the implementer wrote its regression test against the real
failure mode (a bot-paced second run hiding behind run 1's variance) instead of
the prescribed one. Testing the prescribed behaviour would have pinned
something that does not exist.
*Cost if wrong: none — the prescribed two-runs-in-sequence test was added and
kept as well, and the report is open that it passes both before and after.*

### 3.7 Reject "out of this task's file scope" on the profile-write race
`LineRunScreen`'s station-persist effect rebuilt the profile from a ref
snapshot taken before `SummaryScreen` wrote the integrity-failure record,
dropping it. The implementer flagged it and declined to fix it as out of scope;
`LineRunScreen.tsx` is the first file in that task's own Files list. The review
established what made it reachable: the two effects share a commit only on the
**reduced-motion** path, where the 1.1s celebration delay that normally
separates them is skipped. So a denied Line Run left no record at all for any
player with `prefers-reduced-motion`.
*Cost if wrong: one extra `localStorage` read per station arrival.*

### 3.8 Fold a reviewer's suggested test into the fix round rather than deferring it
The reviewer noted that a screen-level test typing through the *unmocked*
keyboard module "would also have caught issue 2". That made it the direct
regression guard for a bug being fixed in the same round, not a nice-to-have.
*Cost if wrong: one test in the round it belongs to.*

### 3.9 Fix the contradiction that removing a debt bullet created
Task 8 correctly deleted the bullet saying the Line Run route rule lived in the
screen. The bullet immediately below it still said "…which is why the rule
ended up in the screen", in the present tense — leaving the document asserting
both. Corrected the tense while keeping the half that is still true
(`RunState` really does carry unused `options` and no `route`).
*Cost if wrong: a sentence.*

### 3.10 Fix the *document*, not the code, when an invariant overstated itself
The plan's invariant 10 claimed screens stamp Run state with `runTick()`, never
`performance.now()`. `QuickRunScreen`'s visibility handler does exactly the
latter. Considered changing the code; rejected — an interrupted Run is never
replayed or scored, so the exactness guarantee is untouched, and editing a
working code path during a documentation task is scope creep needing its own
review. The honest fix is a document that states the exception.
*Cost if wrong: the invariant reads as qualified rather than absolute; the
guarantee it protects is unchanged.*

### 3.11 The anti-paste budget was 2–4× tighter than the spec says — my defect, in both halves
`emitInputValue` stamped **every** character of a burst with `b: batch`, while
`verifyKeyLog` counted log **events** against a threshold of 8. The spec sets
that as "more than 8 multi-character events", explicitly because "Android
predictive keyboards legitimately deliver 2–3". As encoded, the real budget was
**four two-character bursts per run**, across a Line Run of 114–469 characters.
A Gboard user who got five word-completions was silently refused the
leaderboard — precisely the false positive the "annotate, never reject"
principle was adopted to prevent, landing on the mobile path this codebase
invests most in.

Chose to mark only a burst's **first** character, so `b` means "this keystroke
began a burst of N": paste detection still fires on that first character, and
the burst count becomes correct by construction. Rejected a fractional-counting
alternative (sum of `1/b`) as clever but opaque.

Verified by hand after the fix: a 200-character run with six scattered
two-character bursts now verifies `ok` (6 flagged ≤ 8) where it previously
failed (12 flagged > 8); a pasted "Kelana Jaya" still fails on its first
character (`b: 11` ≥ 4).
*Cost if wrong: `b` describes the burst rather than the character, documented
in the field's comment.*

### 3.12 Stop logging non-printable keys
`useKeyboard` emits every non-chorded key, and the recorder logged `Shift`,
`Tab`, arrows and `F5` alongside real characters. A held key's OS auto-repeat
arrives at roughly 30/s, which can drag the median interval under the 40 ms
`impossible-speed` floor for a player who typed nothing wrong; in the other
direction, no-op keydowns dilute a metronomic coefficient of variation and
weaken the anti-bot check. Filtered at the recorder, which cannot perturb
replay — both engines already no-op on non-printables, so those events
contributed nothing to either side of the comparison.
*Cost if wrong: the log stops recording keys no replay ever consumed.*

### 3.13 Quick Run must save the **replayed** score
The Verdict came from the replayed metrics; the personal best was then written
from the live run's. Line Run already did this correctly. Provably equal today
— `completeQuickRun` clamps `endedAt` to the exact deadline — so this is latent
rather than live, but the spec's whole claim is that the number that counts is
derived from the evidence rather than believed.
*Cost if wrong: nothing observable today; see §4 for the residual.*

### 3.14 Mark a truncated Keylog rather than only widening the comparison
`appendKey` caps at exactly 5,000 events; `verifyKeyLog` checked for *more*
than 5,000, which no recorder-produced log can satisfy. The spec says a capped
log "is marked; it fails as `malformed-log`" — nothing marked it. Chose an
explicit `truncated?: true` flag over loosening the comparison, because the
flag survives a server round-trip and says *why*.
*Cost if wrong: one optional additive field; `KEYLOG_VERSION` stays 1.*

---

## 4. Open items

**§3.13 carries no regression test.** Live and replayed Quick Run scores are
numerically identical under current engine timing, so no black-box test can
distinguish them; constructing a divergence would mean desyncing engine
internals. Nothing will fail if someone later changes `completeQuickRun` to
stamp real tick time, at which point the split silently reopens.

**A shared `isWellFormedKeyLog` is needed before any server parses submitted
JSON.** `replayLineRun`, `replayQuickRun` and `verifyKeyLog` all dereference
element fields without checking element shape, and *replay runs first* at both
call sites — so guarding the validator alone would be theatre. Recorded in
`STATUS.md`'s debt list.

**`untrusted-input` remains a hard fail with an unquantified false-positive
rate.** Assistive tools that dispatch synthetic DOM events would be refused the
leaderboard. `profile.integrityFails` records every refusal precisely so this
becomes visible in data; nothing reads it yet. Recorded in `STATUS.md`.

**Minor findings triaged as deferrable** by the final review: a Quick Run
analogue of the version-mismatch test; a partial-log `complete: false` test;
`QuickRunScreen`'s own persist effect still reading a ref (safe today because
no child writes the profile); and a duplicated four-line block across two
branches of the Quick Run completion effect.

---

## 5. Defects that no test could catch

Four of the six most serious defects on this branch were found by reading and
reasoning, not by running the suite. Every one of them coexisted with a fully
green test run.

**The anti-paste budget (§3.11).** The covering test synthesised twelve
independent `b: 2` events — a shape the real encoder *cannot produce*. The
fixture agreed with the validator; both disagreed with reality. The fix added a
test that drives `fireEvent.input` through the actual provider and builds its
log from the emitted Sources, which is the only kind of test that could have
caught it.

**Two tests that passed while the line they covered was deleted.** Task 3's
`advanceQuickRun` call and Task 4's median-interval check were each provably
inert: removing them left the suite green. Both were found by a reviewer asking
"would this test fail if the behaviour regressed?" — and both were then
verified by *actually deleting the line* and watching the test go red. That
verification is cheap and should be routine for any test claiming to pin a
specific branch.

**The "Run again" verification bypass (§3.5).** The only existing test for
"Run again" asserted route and focus behaviour and never reached a second
completion, so the entire second-run code path was untested.

**The profile-write race (§3.7).** Only manifests when two effects land in the
same commit, which happens only under `prefers-reduced-motion` — a live user
preference. Under default motion the celebration delay hides it entirely.

The pattern: **a test written alongside the code it tests tends to share that
code's blind spot.** The defects here were caught by review that asked what the
code does at its boundaries, not by coverage.
