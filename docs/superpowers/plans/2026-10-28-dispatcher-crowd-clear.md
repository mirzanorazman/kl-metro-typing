# Plan: the crowd cleared moment (F11, direction A)

Design: [specs/2026-10-28-dispatcher-crowd-clear-design.md](../specs/2026-10-28-dispatcher-crowd-clear-design.md).
Run inline, test first, one commit per task.

## Task 1: the live crowd count in the typing row

- `src/ui/DispatcherScreen.tsx`, `TypingLine`: when the prompt's target is a
  fix whose Incident is a crowd surge, render `CrowdMeter` (new, in
  `src/ui/CrowdMeter.tsx`) with `crowdAt(sim, inc.place)`; `data-full` at
  `PLATFORM_CAPACITY` or more.
- Export the person figure's path from `DispatchOverlay` so the meter draws
  the same person.
- CSS in `dispatch.css`: nowrap, tabular numbers, amber when full.
- Tests (`Dispatcher.test.tsx`): no count before typing; count after the
  first key of the fix; it follows the crowd; amber at 55; none for a
  Station name or another Incident's fix; none in the lesson.

## Task 2: the clear in the typing row

- `TypingLine` takes `moments.dispersal` (run only, not the lesson) and,
  while it shows and no surge fix is aimed, renders the cleared meter:
  from/to crossfade, "−K", `role="status"`.
- `DISPERSAL_MS` 1,100 → 1,800.
- Tests: after the fix lands the row shows the drop and "−30"; it goes after
  `DISPERSAL_MS`; under reduced motion only the new count shows; aiming a new
  surge fix shows the live count instead.

## Task 3: bigger, slower map dispersal

- `DispatchOverlay`: `peopleFor` 6–12, reach `44 + (i % 3) * 12`.
- CSS: walk 1.3 s, pop fade 1.8 s (hold to 80 %).
- Update the existing dispersal test's timings (gone after 1.8 s).

## Task 4: the release sound

- `sound.disperse`: falling C6–G5–E5–C5 on the `complete` synth.
- `DispatcherScreen`: when a crowd surge's last fix item lands, play
  `disperse` instead of `arrive`.
- Tests: a surge clear plays `disperse` and not `arrive`; another fix still
  plays `arrive`.

## Task 5: verify and record

TypeScript, the full suite, the Vite build, whitespace; a live look at a
surge fix (desktop and phone width); tracker F11 done with commits.
