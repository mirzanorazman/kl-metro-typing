# Dispatcher network reveal verification

Verified on 2026-10-27 (Asia/Kuala_Lumpur), on
`codex/dispatcher-network-reveal`. The branch is not merged or deployed.
The [design](specs/2026-10-26-dispatcher-network-reveal-design.md) and
[plan](plans/2026-10-26-dispatcher-network-reveal.md) retain their original dates.

## Automated gates

At `9d98057`, after the browser-discovered narrow Shift-bar fix:

- `npm test`: exit 0; 83 files passed, 1,197 tests passed and 2 skipped
  (1,199 total), 24.59 s. The existing `TypingInputProvider` warning about an
  update outside `act(...)` remains in the on-screen-keyboard Space test.
- `npm run build`: exit 0; TypeScript passed and Vite built 1,107 modules.
  Vite reported its over-500 kB chunk warning: JavaScript 592.34 kB,
  175.08 kB gzip. CSS was 55.28 kB, 14.34 kB gzip.
- `git diff --check`: exit 0.
- After the CSS fix, the focused Dispatcher, MapCanvas, readability and
  new-Line notice suites also passed: 4 files, 221 tests.

The full suite also passed before the layout fix (83 files, 1,197 passed,
2 skipped). No simulation, balance, evidence version, replay, judge or profile
schema changes were made, and no balance survey was rerun. No dependency was
added.

## Browser observations

The real application ran at `http://127.0.0.1:5173/`. Bounded initial-Career
fixtures used the actual Dispatcher screen, map, network data and engine at
`/.superpowers/brainstorm/network-reveal-qa/`. The optional HTML/TSX harness is
git-ignored and is not a production route. Ordinary extension/new-Line offers
came from `expansionCandidates`; the AG 0–5 → SP 0–5 zero-new-Station case
intentionally supplied that shared-track offer. Timers and the production
controller were unchanged. No profile or leaderboard was cleared and no fixture
score was submitted. Fixtures do not supply valid complete Career evidence.

| Check | Observed result |
|---|---|
| Starting served network | Exactly 14 bright KJ points, including Kerinchi; Universiti beyond it and the other track remained faded. |
| Returning entry | During Opening, early `j` did nothing and the Shift clock remained 1:30; entry then reached ready. |
| Entry before an owed lesson | How to play then Back prepared the owed-lesson path without clearing the profile. Opening handed over to an untouched lesson with no typed characters. Completing Jelatek and Setiawangsa returned to ready without replaying entry. |
| Lower-end extension | Wangsa Maju addition followed the preview in reverse from the old endpoint; existing 14-point KJ track stayed bright. Kerinchi did not pop again and there was no new-Line banner. |
| Upper-end extension | Taman Jaya addition followed the preview forward from the old endpoint; existing 14-point track stayed bright and there was no new-Line banner. |
| New AG Line | At 1440×900 paper, early `j` during Opening left zero typed characters and the clock at 1:30. The AG code/full name and +1 Line/+1 Station appeared. Only the two-point served AG stretch revealed; after settling, AG had 2 bright points and KJ 14. The notice and growth remained until the first accepted `j`, then cleared. |
| Zero-new-Station shared Line | SP preview and reveal used the same six-point prefix of the full offset SP lane. No Station popped; Stations stayed at 6, Lines gained +1, and the SP code/full name notice appeared. |
| No-op Continue | On the complete-network fixture, Continue produced no Opening, reveal or banner. An immediate first signal character (`T`) was accepted. |
| Entry cancellation | Selecting normal entry and immediately pressing Escape returned to the picker. After waiting, the picker remained visible with no Dispatcher or delayed lesson. |
| End during Expansion | Pointer-operated End Career remained usable during Opening and showed the confirmation with “Your Career will be ranked.” Enter and Space on the focused Yes button did not confirm. A Space after the deadline reached the ordinary Shift input, as expected. No synthetic Career was submitted. |
| Resize and settled state | Resizing the same midnight AG event through 390, 1024 and 1440 px kept the notice and settled track, with zero reveal nodes after settlement. At 1440 px, chips remained outside the enlarged panel. |
| Narrow notice and growth | At 390×844 midnight, the notice fit its panel; all eight metric label/value elements, including `2+1` Lines and `15+1` Stations, fit the bar. Early `j` still produced zero typed characters and the page had no horizontal overflow. |
| Phone-sized landscape guard | At 600×390 in the real app, “Rotate to portrait to play” appeared and Quick Run/Full Line start buttons were disabled. This was a viewport check, not a coarse-pointer device test; an 844 px fine-pointer viewport was not classified as a phone. |

## Browser-discovered layout fix

At 390×844 paper, the original Shift bar overflowed: Stations reached beyond
the right edge and Delivered/On time were offscreen. The single-row metrics
grid could not fit beside the other flex children. Screenshot:
`/tmp/myrapid-shared-paper-390.jpg`.

Commit `9d98057` changes only `src/ui/dispatch.css`. Below 900 px, the Shift,
phase and time occupy one row, the clock its own row, metric label/value pairs
use two rows, and the closure gauge gets a full row. The Incidents panel starts
below the taller header. Widths of 900 px and above retain their original row.

The browser repeated the failing layout with the actual CSS and fonts:

- 390×844 paper, upper extension: all eight metric elements fit within the bar
  at x=20–370; `16+2` Stations fit at x=266.84–353. Bar height 85.5 px,
  bottom 101.5 px; Incidents top 144 px.
- 390×844 paper, Shift 12 / Evening peak outbound / full network / 3 closures:
  all metrics and the gauge fit. Bar height 108 px, bottom 124 px; Incidents
  top 144 px.
- 1024×768, same long-phase/gauge fixture: the bar stayed one line, 32.5 px
  high; metrics fit and Incidents remained below it.
- 390×844 midnight, simultaneous +Lines/+Stations: all metrics and the notice
  fit, with no horizontal overflow.

The browser measurement is the regression check for this CSS layout; a jsdom
test that repeats CSS declarations would not test the failure.

## Evidence and limits

Local screenshots (ephemeral `/tmp` artifacts):

- `/tmp/myrapid-served-network.png`
- `/tmp/myrapid-entry-opening.png`
- `/tmp/myrapid-entry-lesson.png`
- `/tmp/myrapid-new-line-opening.jpg`
- `/tmp/myrapid-shared-line-opening.jpg`
- `/tmp/myrapid-shared-paper-390.jpg` (layout failure before the fix)
- `/tmp/myrapid-phone-growth-fixed.jpg`
- `/tmp/myrapid-phone-gauge-fixed.jpg`
- `/tmp/myrapid-tablet-gauge-fixed.jpg`
- `/tmp/myrapid-new-line-midnight-390.jpg`
- `/tmp/myrapid-new-line-midnight-1024.jpg`
- `/tmp/myrapid-new-line-midnight-1440.jpg`

Two screenshots were also copied to the durable task visualization folder:
[desktop](/Users/mirzahaikarl/.codex/visualizations/2026/10/26/01a177f2-a9ed-7710-9f90-1a932e00dffa/dispatcher-network-reveal-desktop.jpg)
and [phone](/Users/mirzahaikarl/.codex/visualizations/2026/10/26/01a177f2-a9ed-7710-9f90-1a932e00dffa/dispatcher-network-reveal-phone.jpg).

The real app's browser error/warning log remained empty. The fixture log included
two
development-only duplicate-`createRoot` warnings from updating the throwaway
harness through HMR; they preceded the fresh fixture loads. Do not describe
all fixture logs as warning-free.

Native audible chimes, real phone keyboard/device behavior, true hidden-tab
lifecycle and live OS reduced-motion changes were not observed. The browser
tooling exposed viewport and visibility controls but no reduced-motion emulation.
The corresponding code paths have automated input/controller/rendering/audio
coverage; this does not verify a physical device or audible output. Audio tests
verify unlock, mute and scheduled
notes; screen tests verify one cue per new Line and no extension cue. Reduced
motion tests verify immediate settled track and no JavaScript input wait,
including a preference change during a reveal. The exact 799 ms boundary,
StrictMode deduplication, evidence exclusion, hidden deadlines and valid ranked
retirement are automated integration checks; screenshots alone do not prove them.

This was bounded browser coverage, rather than every manual matrix cell.
Again, lesson Skip, pan, closure/Green-wave animation and other-mode/home
transition regressions have automated coverage; no new live observation of
those flows is claimed here. All temporary browser tabs were closed and
viewport overrides reset after verification.

## Review and handoff

All eight tasks passed separate spec and code-quality reviews. The final
whole-branch review of `f3879b3..0d68fd0` found no Critical, Important or Minor
issues and judged the branch ready for playtest. The controller independently
reran the complete suite (83 files, 1,197 passed, 2 skipped, 24.28 s) and
production build (TypeScript plus Vite, 1,107 modules, 2.58 s) on the final
application source. The warnings above remain; no application source changed
after those gates.

Branch `codex/dispatcher-network-reveal` and its existing worktree are kept for
playtesting. No merge or deployment was performed.

## Playtest 3

- Does the one-second entry feel worth its wait?
- Is each Expansion's outward direction clear?
- Is a newly joined Line's code/name and optional chime noticeable?
- Is ignoring input for the fixed 800 ms Expansion reveal comfortable?

Also try muted sound, native reduced motion and a real phone keyboard. F11,
F23, other excluded feedback and the gated Rush Hour retirement remain open.
