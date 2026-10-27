# Dispatcher: the crowd cleared moment (F11, direction A)

**Status:** the user chose direction A from the mockups (2026-10-28) and asked
for it to be designed, planned and built. The calls marked *(my call)* were not
discussed; the user can check them in playtest 3.

## Why

In playtest 2, clearing a crowd surge was "just another Incident". The waiting
count lives on the Incident card and the dispersal pop on the map, and the
player's eyes are on neither: while typing a fix they look at the prompt. The
user's idea: bring the crowd count into the typing panel while the fix is
typed, and make the clear visible as people leaving.

## What the player sees

1. **While the fix is aimed.** As soon as the prompt shows a crowd surge's fix
   ("Crowd control at KLCC"), a crowd count sits in the typing row between the
   prompt and the Streak: a small person figure and "96 waiting". It updates
   live as the surge grows. At 55 or more (`PLATFORM_CAPACITY`, where a
   platform starts counting toward closing by crowding) it turns amber
   (`--warn`) *(my call: the threshold)*. It shows only while the prompt holds
   that fix; it is not a live region, so screen readers are not flooded.
2. **The clear.** When the fix lands, the count stays in the typing row for
   the dispersal's length, in signal green: the old count slides out, the new
   one slides in (the map pop's existing crossfade), with "−58" beside it. It
   is a `role="status"` line ("40 waiting, 58 dispersed") so the clear is
   announced once. If the player aims another surge fix meanwhile, the live
   count takes the row *(my call)*.
3. **The map.** Today's dispersal, bigger and slower: 6 to 12 people (was 4 to
   10), walking about half as far again, over 1.3 s (was 0.9 s), and the whole
   pop holds 1.8 s (`DISPERSAL_MS`, was 1.1 s) *(my call: the numbers, from the
   mockup)*. The map's own "N waiting / −K dispersed" text stays.
4. **Sound.** A crowd surge's clear plays its own cue, a quick falling major
   arpeggio ("release"), instead of the generic fix sound (`sound.arrive`)
   *(my call: no per-count ticks while typing; every keystroke already ticks)*.

## Reduced motion

The panel count changes at once with no slide; on the map nobody walks and
the count stands still, as today. The sound plays.

## Not in scope

Direction B's map crowd before the clear, the ring, the "Crowd cleared"
stamp and the green card; the close camera (done in F27, which zooms out on
the clear); any engine, balance or evidence change. Platform overflow without
an Incident is parked as F29.

## Constraints

- Presentation only: nothing reaches the engine, replay or evidence.
- The lesson's typing line never shows the count (it has no surges).
- The row must fit at phone width: the count does not wrap, and the prompt
  keeps its flexible width.
