# Dispatcher: the crowding hint (F29)

**Status:** the user chose to build mockups A and B as switchable options for
playtest 3 (2026-10-28), and dropped C. The calls marked *(my call)* were not
discussed; the user can check them while playing. Mockups:
`.superpowers/brainstorm/34843-1793182029/content/crowding-hint-v2.html`.

## Why

A Station goes Out of service by crowding when 55 or more Passengers wait on
its platform (`PLATFORM_CAPACITY`) for 19 s without a break (`OOS_CROWD_MS`).
Crowding is how a player who keeps typing loses, and today it gives no warning:
in playtest 2's Shift 1, KLCC closed and the user asked "wait, how did that
happen?". A good player then asks "how do I avoid Out of service?", and the
game cannot answer either question.

The user's goal: a player does not have to save every Station, but they must
be able to see what went wrong and how to do better in the next Shifts. The
player types all the time and does not look at the map the way a Mini Metro
player can, so the hint goes where the eyes already are: the Signal chips.

### What a replay of Shifts 1 and 2 showed

Scripted typists at 40, 45, 60 and 90 WPM, 20 seeds each (probe kept in the
session scratchpad, not the repo):

- 127 of 163 crowding closures were Masjid Jamek or KLCC, all in the Evening
  peak, when central Stations send everyone out. The 60 WPM typist lost one
  in Shift 1 on about half the seeds; 90 WPM never did.
- In 72 % no Train called at the Station in its last 19 s; the crowd went from
  55 to about 100.
- On average about one Train (at most four) was Held at a Signal three
  Stations or fewer before it, heading its way. Clearing those sooner would
  usually have saved it.
- Some closures cannot be prevented by typing: Titiwangsa and PWTC in Shift 2
  (one or two Trains on the new Line, almost nothing Held), and some Masjid
  Jamek closures at 90 WPM where Trains called and the platform filled again.
- Noise: some platform is at 55 or more for 28–39 % of running time, and about
  twice as many full spells recover as close. A hint from the first moment at
  55 would be on a lot; hence the delay slider below.

## What the player sees

A **crowded Station** is one where the closure countdown is running
(`platform.fullMs > 0`) and has run for at least the **hint delay**. Its
**relieving Trains** are Trains that have a Signal chip (Held at a Signal) on
a Line through the crowded Station, heading toward it, where the crowded
Station is the one at their Signal or one of the next three along their Line
(three blocks or fewer ahead, as the replay counted).

The hint has three settings:

- **Off:** today's game.
- **A, amber chips:** the Signal chip of every relieving Train turns amber
  (`--warn` border, a light amber fill; mockup A). The crowded Station has no
  mark. A Train relieving two crowded Stations is amber once.
- **B, amber chips and a ring:** A, plus a ring on each crowded Station that
  fills with the countdown (`fullMs / OOS_CROWD_MS`) and the count waiting
  beside it (mockup B).

The ring follows today's rule exactly: when the crowd drops below 55 the
countdown restarts from zero, so the ring empties at once and goes away. The
user chose this over Mini Metro's slow drain (2026-10-28): here a closure is
one step toward a quarter of the Stations, not game over, and the balance is
tuned for today's rule. A ring that drained slowly over a rule that resets
would show something false.

**Declutter labels** is a separate switch. When on, a Station keeps its Station
label only if a Train is Held at its Signal (it has a Signal chip), it is an
Incident's place, or it is a crowded Station showing a ring. Every other
Station label is hidden: termini, Interchanges and the zoom tiers included
*(my call: the user's rule taken literally, to see the busy centre at its
cleanest)*. Signal chips and fix chips never hide. Declutter applies only
while a Shift is ready, running or paused; between Shifts (where the
Expansion offers need their names) and during the guided lesson, labels are
as today *(my call)*.

## Settings and defaults

All three controls go in the dev camera panel (bottom left, development
builds only), in a "Crowding" group under the camera controls *(my call: one
dev panel, not two)*:

- **Crowding hint:** Off / A / B. Development default **B** *(my call: it shows
  everything there is to judge)*.
- **Hint delay:** 0–15 s in 1 s steps, how much of the 19 s passes before a
  Station counts as crowded. Default **5 s** *(my call: in the replay, about
  half of the full spells that recover are gone within 5 s)*.
- **Declutter labels:** on/off, default **off** *(my call: so the first look
  compares against today)*.

Stored in browser storage under their own key (`klmetro.dispatchCrowding.v1`),
read and clamped the way `useCloseCamera` does. **Production builds are Off,
with labels as today,** and never touch that storage, until the user picks a
default after playing *(my call: nothing ships to players before then)*.

## Behaviour details

- Only Signal chips turn amber. Express skip chips stay plain, since an
  express run may pass the crowded Station; fix chips stay as they are
  *(my call)*.
- "Heading toward it" follows the Train's current direction only; a Train
  that must reverse at a terminus first does not count *(my call)*. The three
  Stations are counted along the Line, closed ones included, as the replay
  counted them; a closed Station in between does not stop the Train counting,
  but it uses up one of the three *(my call)*.
- A full Train counts like any other *(my call: the hint stays simple to read;
  see playtest notes)*.
- An Interchange's crowd is all its Passengers (`crowdAt`), and Trains on any
  of its Lines can relieve it.
- The ring sits on the Station mark, scaled with the map (`markScale`) like
  the Incident marks, and the count stays readable at phone width. Station
  labels keep clear of the ring and count (they go into `overlayObstacles`).
  Chips do not: chip placement ignores the ring, so a chip never jumps when a
  Station turns crowded, and chips draw on top of it *(my call)*.
- A crowded Station with an active crowd surge shows the ring too: the surge's
  closure is its own Incident timer, but the platform can also be counting
  down by crowding *(my call)*.
- Nothing shows during the guided lesson, between Shifts, or once the Station
  is Out of service.
- No sound *(my call: F7 found that any crowding cue plays a third of the time)*.
- **A one-time tip** (added 2026-10-28 after the user met a ring with no
  explanation): the first time the hint shows anything (a ring under B, an
  amber chip under A; never with it Off), the Career pauses on a tip that
  points at the fullest crowded Station and pulses the Trains that relieve it.
  Under B: "This platform is overcrowding. The ring fills while 55 or more
  people wait; when it is full, the station goes out of service. Clear the
  amber trains to bring trains here." Under A: "A platform ahead is
  overcrowding. Clear the amber trains to bring trains there before it goes
  out of service." One tip id (`crowding`), seen once whichever mode.
- Reduced motion: nothing here animates beyond the ring growing with the
  countdown, which is state, not motion; keep it.

## Constraints

- Presentation only: no engine rule, balance number, evidence version or
  replay change. Everything is derived from the sim state the screen already
  has.
- The hint must never move a chip: amber is a style on the existing chip.
- With everything Off, the screen is exactly as before.

## Not in scope

The Overcrowding Incident card (option C, dropped by the user); a slower
drain of the countdown (a balance lever for F12's fast-player ceiling, to
raise there); the closures that typing cannot prevent (a balance question for
F16/F12); the camera moving to the last closed Station at a failed Shift (F30,
parked); a production default.

## Verification

- Unit tests for the relieving-Train and crowded-Station rules: direction,
  three-Station limit, Interchanges, the hint delay, closed Stations in
  between, a reversing Train, Out of service, the lesson.
- Overlay tests: amber chips under A and B only; the ring's fill and count
  under B only; the ring gone the tick the crowd drops below 55; labels under
  Declutter.
- A probe like the replay above: at the 5 s default, the share of running time
  some hint shows, by Shift band, so the user knows how often it will be on.
- Browser check on the dev server at 1280 × 800 and phone width: Shift 1's
  Evening peak at Masjid Jamek or KLCC with A and B, and a late-Career network
  with Declutter on and off.

## Check in playtest 3

- A or B: does the amber tell you which Trains to Clear, and does the ring tell
  you why? Does the ring clutter the centre late in a Career?
- Is the 5 s delay right, or does the hint come too late or too often?
- Does Declutter help, or do you lose your bearings without termini and
  Interchange names?
- After a crowding closure, do you now know how you could have avoided it?
