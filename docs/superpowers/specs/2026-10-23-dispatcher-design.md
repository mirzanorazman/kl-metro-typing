# Dispatcher — design

**Date:** 2026-10-23
**Status:** Agreed with the user in a brainstorming session; not yet planned.
**Replaces:** Rush Hour (`2026-09-28-rush-hour-design.md` and its tuning
amendment). Rush Hour stays playable until Dispatcher ships, then it is removed.
Vocabulary follows `CONTEXT.md`; new terms are defined below and get added
there when this is built.

## Why

The user playtested Rush Hour and found it unrewarding and unpolished:

1. **Disconnected Line sets.** Choosing Sri Petaling and Shah Alam (no shared
   Station) spawns Passengers who can never be delivered. Root cause:
   `rushGeometry` (`src/engine/rushHour.ts:119`) picks target Lines from
   everything the whole Line set touches, never checking that the spawn
   Station can reach them.
2. **Spawning feels arbitrary.** Passengers appear at random Stations wanting
   random Lines, so a good route is luck and goes stale immediately.
3. **Tunnel vision.** The follow camera shows a few Stations around the train,
   so the player can answer "which way at this Junction?" but never "what is
   my plan for the next minute?"
4. **Nothing builds.** A clever route pays off once and the game forgets it.

The inspiration was Mini Metro: simple rules, emergent chaos, and the
satisfaction of reshaping a network and watching the flow improve. But this is
a **typing game first**. Typing is fast and frantic where Mini Metro lets you
slow down, so this is not "Mini Metro with typing". The player is promoted from
driving one train to **dispatching the whole network**: many trains at once,
delays that spread the way real ones do, and a network that grows from a small
central core across a Career.

## Summary

Dispatcher is a Mode. A **Career** is a sequence of **Shifts** on a network
that starts small and central. In a Shift, Trains run on every served Line;
each one stops at a red **Signal** before each Station and shows that Station's
name, and typing the name clears it. Untyped Trains wait and delay builds,
spreading through headway, knock-on, platform crowding and bunching. On top of
that steady beat, **Incidents** break out and need longer typing to fix.
Surviving a Shift's service day earns an **Expansion**: the player picks where
the network grows, from choices that follow the order KL's lines really
opened. A Shift that collapses ends the Career. One standardised score goes on
one local leaderboard.

## Goals

- **Typing is the only way to act during a Shift.** Every action is typing a
  real Station name. WPM is the dispatcher's capacity, and accuracy has a
  visible cost.
- **Always typing, only sometimes busy.** Off-peak there is a steady,
  comfortable stream of Signals; at peak the Signals overlap and Incidents
  stack.
- **Chaos with readable causes.** Delays come from a system with feedback, not
  dice. A player who loses can see why, and the summary says so.
- **The whole network is visible.** No follow camera. The map frames the
  served network, which is small early on and grows with it.
- **Choices add up.** Expansion choices across a Career shape every later
  Shift.
- **Comparable scores.** Every Career starts from the same network under the
  same rules, so one leaderboard is fair.

## Non-goals (v1)

- Saving and resuming a Career partway through. A Career is played in one
  sitting. This may come later; it complicates replay integrity.
- Phone layout. Desktop and tablet only, like Rush Hour.
- Downloading or bundling the data.gov.my ridership files. Demand is hand-set
  from rough estimates (see Passengers).
- Per-stage or per-network leaderboards. The user found that idea confusing.
- Fixing Rush Hour's disconnected-Line-set bug. Rush Hour is being replaced.

## Anti-goals (failure even if it technically works)

- **Typing turns into short commands** ("T3 HOLD", "KJ2 GO"). Every typed
  thing is a real Station name, or a short real-world phrase if an Incident
  needs one.
- **Losing without understanding why.** Random failure the player couldn't
  have seen coming or fixed.
- **A spreadsheet instead of a railway.** The map is the main view; lists are
  secondary.
- **Needing to stop and think mid-Shift.** Planning happens in the Expansion
  between Shifts and during the calm middle of the day, never by pausing.
- **Runtime network requests.** STATUS invariant 5 still holds.

## New vocabulary

These go into `CONTEXT.md` when this is built.

- **Dispatcher**: the Mode.
- **Career**: one Dispatcher play session, from the Starting network until a
  Shift fails or the player abandons. A Dispatcher Career is a kind of Run;
  use "Career" in Dispatcher copy.
- **Shift**: one compressed service day within a Career.
- **Signal**: the stop point before a Station where a Train waits until its
  name is typed. *Avoid: prompt, gate.*
- **Clear**: typing a Signal's Station name so its Train may proceed.
- **Held**: a Train waiting at an uncleared Signal, or stopped by an Incident.
- **Headway**: the gap between consecutive Trains on a Line in one direction.
- **Bunching**: two or more Trains running close together with a large gap
  behind them.
- **Incident**: a breakdown at a place on the network that holds or slows
  Trains until fixed. *Avoid: fire, issue, event* (the user said "fires"
  informally).
- **Out of service**: a Station or stretch that has collapsed and no longer
  carries Passengers.
- **Served network**: the Stations and Lines the Career currently operates.
- **Expansion**: a contiguous run of Stations added to the Served network
  between Shifts.
- **Era**: a period in KL rail history that decides which Expansions can be
  offered.

## The Shift

### Two layers

**The steady beat: Signals.** Trains run in both directions on every Line of
the Served network, at a target Headway. When a Train reaches the Signal
before a Station, it stops and its Station name appears beside it on the map.
Typing that name Clears the Signal. The Train enters, dwells while Passengers
alight and board, then runs to the next Signal. The player is typing almost
all the time. How busy it gets depends on how many Trains are arriving, which
follows the time of day.

**The spikes: Incidents.** Every so often an Incident appears. It is listed in
the side panel and pulses on the map. It holds or slows Trains at its location
until fixed. Fixing it means typing a short sequence, usually the names of the
Stations along the affected stretch (the user's picture: "Kajang Line slowing
at TRX, head there, type three Stations, cleared"). While the player is fixing
an Incident, Signals elsewhere go uncleared. The real decision of the Mode is
"keep the beat going, or go fix it?"

### Targeting

Several Signals and Incidents are on screen at once, and many names share
first letters. The starting stretch alone has KLCC, Kampung Baru, KL Sentral
and Kerinchi.

- **Narrowing, not first-key locking** (ZType style; settled after the builder
  check): every visible target whose text starts with what has been typed so
  far stays a candidate, and candidates are highlighted. The target locks once
  only one distinct text remains.
- **Wrong keys:** a key that extends no candidate is an error. It persists
  until a correct key is typed, as in the rest of the game.
- **Identical texts:** if two targets have exactly the same text (both
  directions at Masjid Jamek, say), completing it Clears the most-delayed one.
  This is the only place "most-delayed" decides anything. Hold stays playable,
  because a Held Train is only chosen when its name is typed in full and
  nothing else shares it.
- **Unlocking:** some way to release a lock (Escape, Backspace at zero) is the
  builder's call.
- **One target kind per name at a time:** see Incidents and Skip-stop for how
  their texts avoid colliding with Signals.

### Accuracy costs time

A wrong key stalls the locked target for a short beat (around half a second,
to tune) before typing resumes. Sloppy typing at peak makes Bunching worse,
visibly. It must never feel like a crash.

### Delay physics

This list is the heart of the Mode. It is what makes the chaos readable rather
than random. The user's source was a video explaining how real rail delays
happen. Each item below must be an emergent consequence of the sim, not a
scripted event.

- **Headway:** each Line runs Trains at a target gap. Even spacing is healthy.
  The sim regulates Headway; there is **no timetable**. A Train is **late**
  when the gap ahead of it is well over the target Headway (threshold to
  tune). **On-time %** is the share of Station calls where the platform had
  waited no longer than the target Headway plus a tolerance. That is
  "Passengers didn't wait too long", the stat a real metro reports for
  high-frequency lines.
- **Knock-on:** only one Train may occupy a block (Station to Station, per
  direction). A Held Train stops the Train behind it at the previous Signal.
  Blocks belong to track, not to Lines. Where Lines share track, as Ampang and
  Sri Petaling do from Sentul Timur to Chan Sow Lin, both Lines' Trains use
  the same blocks, so delays spread between them, as they do in real life.
- **Platform crowding:** Passengers keep arriving at a Station while no Train
  calls. Dwell time grows with the crowd boarding.
- **Bunching:** a late Train picks up a bigger crowd, dwells longer and falls
  further behind. The Train behind finds emptier platforms and catches up.
- **Snowball:** these feed each other. An untreated delay grows on its own.
- **Response:** the player's tools (see below).
- **Out of service:** a platform crowd that stays at maximum too long, or an
  Incident left unfixed past its limit, puts that Station Out of service.
  Trains pass through without stopping and its Passengers are lost, until the
  end of the Shift (or until recovered, the builder's call). The map marks it
  plainly.

### Response

The player's moves are all typed Station names:

- **Clear:** type the Signal's Station.
- **Hold:** choose not to Clear a Train, to let the gap behind it open up.
  It's a real dispatching move, and it needs no extra input.
- **Skip-stop (v1):** a Train running late may offer an alternative Signal
  showing a Station further along. Typing that name runs it express past the
  intermediate Stations, recovering time at the cost of the Passengers
  waiting there. The offer is only made when its name doesn't match any other
  visible target. If it would collide, the game offers the next Station
  along, or makes no offer.
- **Short-turn:** turning a Train back early to fill a gap. Deferred, but the
  sim should not rule it out.

### Incidents

- **Kinds:** a small catalogue, for example a signal fault (holds a stretch),
  a train fault (one Train crawls), a crowd surge (a platform fills fast) and
  a track obstruction (blocks a block). The exact list and effects are the
  builder's call. Each kind must have a distinct, readable map treatment and a
  one-line card.
- **The fix:** typed Station names along the affected stretch, or a short
  real-world phrase where that reads better. Length scales with severity.
  The fix is one target: its names are typed in sequence as a single locked
  target, and the card shows progress through them.
- **An Incident replaces the Signals it holds.** Trains Held by an Incident
  show no Signal of their own, because a fault can't be cleared by waving a
  Train through. The fix is the only target on that stretch. Fixing it
  releases those Trains to the next Signal. So typing a name there is always
  unambiguous, and "keep the beat or go fix it?" stays a real choice.
- **Ignoring it:** an unfixed Incident gets worse on a visible timer, and ends
  in Out of service.
- **Mostly not random:** Incidents are seeded random, but weighted towards
  where the network is already strained (high crowding, Bunching, Held
  Trains). Most Incidents should feel like something the player could have
  seen coming.

### The service day

A Shift is one service day, compressed to a few minutes (target 3–5, to
tune):

| Phase | Character |
|---|---|
| Morning peak | Heavy flow *towards* the centre; more Trains, overlapping Signals, more Incidents |
| Midday | Calm. Fewer Trains, room to recover and look at the map |
| Evening peak | Heavy flow *away from* the centre |

This rhythm is the "mathematically beautiful", learnable part. Peaks happen at
known times and flow in known directions.

### Ending a Shift

- **Cleared:** the service day ends with the network still running. Then the
  game offers an Expansion.
- **Failed:** too much of the Served network is Out of service at once (for
  example a quarter of its Stations; tune it). This ends the Career. The
  summary names what collapsed and why: the Incident, Bunching or crowding
  that started it.

## Passengers

- Passengers appear at Stations, each with a destination Station on the
  Served network. They ride Trains automatically, change at Interchanges
  automatically, and count as **Delivered** when they alight at their
  destination. The player never routes individual Passengers; they route
  Trains. How Passengers are modelled (individuals, or counts per platform
  and direction) is the builder's call, as long as crowding and Delivered
  behave as described.
- **Busyness:** each Station gets a hand-set busyness weight, roughly based on
  real ridership. Masjid Jamek, KL Sentral and KLCC are heavy; outer Stations
  are light. The existing `demand` field (1–3) is the starting point and may
  need a finer scale. The reference for these estimates is the data.gov.my
  Rapid Rail Explorer (`https://data.gov.my/dashboard/rapid-explorer`, daily
  origin–destination ridership, CC BY 4.0). Use it to eyeball which Stations
  and pairs are busy. Nothing is fetched or bundled. Credit "Ridership
  estimates informed by data.gov.my (CC BY 4.0)" on the about or credits
  surface.
- **Destinations** are weighted by destination busyness and the time of day.
  In the morning, central Stations are likely destinations; in the evening,
  outer Stations are. "Central" is a tag on Stations, and the builder picks
  the set (roughly the CBD ring around Masjid Jamek, KLCC, Bukit Bintang and
  KL Sentral).
- Only Stations on the Served network spawn or receive Passengers. The Served
  network is always connected (see Expansions), so every Passenger can be
  delivered. This removes Rush Hour's bug #1 by construction.

## The Career

### Starting network

Every Career starts on the same network. The user's example is the central
Kelana Jaya Line stretch from Setiawangsa to Kerinchi (through KLCC, Masjid
Jamek and KL Sentral). The builder may trim it if the first Shift is too
busy. It must stay a single Line, central, and identical for everyone.

### Expansions

After each Cleared Shift, the player picks one of two or three offered
Expansions:

- An Expansion is **a Line plus a contiguous run of its Stations** (2–5, to
  tune) that attaches to the Served network. It either extends a served Line
  outward, or starts a new Line from an Interchange already served. The Served
  network can never become disconnected. A Line only runs Trains over the
  stretches of it that have been added. On shared track, adding Sri Petaling
  over Stations that Ampang already serves adds no new Stations, but adds
  Sri Petaling's Trains and its onward reach. That is still a valid
  Expansion.
- Offers come only from Lines and stretches open in the current **Era** or
  earlier.
- Offers are drawn from the Career's seed, so they replay exactly.
- **Picking:** the Expansion screen shows the whole map with each offer drawn
  dashed. Typing the name of an offer's far-end Station picks it, keeping
  "typing first". Clicking works too.
- A bigger network is a harder job. Each Expansion brings more Trains, more
  Signals per minute and more places for delay to snowball. That is the
  Career's difficulty curve, so no separate difficulty setting is needed.
- Once the entire network is served, Shifts continue on it, each slightly busier
  than the last, until one fails.

### Eras

Expansion choices follow roughly the order KL's lines opened, so a Career
grows in the shape the city did, but in an order the player picks. The dates
are approximate and are for flavour and ordering only; the builder should
check them.

| Era | Opens up |
|---|---|
| 1990s | Kelana Jaya (Gombak–Kelana Jaya), Ampang, Sri Petaling (to Sri Petaling) |
| 2003 | KL Monorail |
| 2015–17 | Kelana Jaya and Sri Petaling extensions to Putra Heights; Kajang Line |
| 2022–23 | Putrajaya Line |
| Latest | Shah Alam Line |

The Era advances every few Cleared Shifts (tune it). The current Era is shown
on the Expansion screen as light flavour, such as "1998: Kelana Jaya Line
opens".

## Screen

The layout is the live map (option A from the mockups, chosen by the user):

- **Map:** the whole Served network, framed to fit and re-framed when it grows,
  using the one shared projection (`geo/networkLayout.ts`, STATUS invariant 1).
  Trains are drawn on the track. Held Trains show their Signal's Station name
  beside them. The locked target is highlighted.
- **Making headway readable:** a curvy map makes Headway hard to judge by eye,
  so Held stretches and Bunching are marked directly. For example, a stretch
  glows, or bunched Trains get a marker. The exact treatment is the builder's
  call.
- **Side panel:** the active Incidents as cards, each with its kind, place and
  a worsening timer.
- **Top bar:** the Shift clock and phase (with peak direction), Delivered so
  far, on-time percentage and Shift number.
- **Typing line:** the locked target's text, using the existing typed, current
  and remaining treatment and the wrong-key feedback.
- Colour is never the only signal (STATUS invariant 3). Line codes appear as
  text, and Incident and Out-of-service states have shapes or icons, not just
  red.
- Overlapping labels at busy Interchanges need a layout rule. That is the
  builder's call.
- Just-in-time tips on first encounters (first Signal, first Incident, first
  Bunching, first Expansion), as Rush Hour's tuning did.

## Scoring and leaderboard

- **Career score = total Passengers Delivered across all Shifts × Career
  accuracy.** WPM is built in, because faster typing Clears more Trains and
  moves more people. Multiplying by accuracy means neither speed alone nor
  dispatching alone wins. The exact formula is to tune in playtesting, but it
  must stay one number, computed the same way for every Career.
- **One local leaderboard**, top 20 with name entry, kept in `localStorage`
  like the Line Run board. No per-stage or per-network boards.
- Only a Career that ends in a Failed Shift, and passes replay and the
  integrity judge, can enter the board. An abandoned Career never can. This
  matches Rush Hour's ruling.
- **Summary** at the end of a Career shows the score, Shifts cleared, final
  network size, Delivered, on-time percentage, WPM and accuracy. It also says
  what ended it. The player can tell whether they lost to typing or to
  dispatching.

## Integrity and engine

- Same architecture as Rush Hour. A pure fixed-tick engine in `src/engine/`
  with no React, timers or storage (STATUS invariant 2), and a seeded RNG.
  The Career replays exactly from its Keylog plus action log (Expansion picks,
  pause, resume, abandon).
- A Career may run 20–30 minutes for a strong player. The Keylog event limit
  and the integrity judge must cope with that length. Rush Hour's
  `RUSH_KEYLOG_MAX_EVENTS` is the pattern.
- Pause when the window loses focus, as in Rush Hour. The screen between
  Shifts is a natural pause and does not run the clock.

## Retiring Rush Hour

Dispatcher takes Rush Hour's place on the home map. Once Dispatcher ships,
remove Rush Hour's engine, UI and tests, and its stored `rushHigh` bests. Keep
anything Dispatcher reuses: music tracks, the tip system and the replay
scaffolding. Until then Rush Hour stays as it is, bug #1 included.

## Tuning targets for playtesting

These are starting targets, not rules:

- At a reference 60 WPM, Off-peak Signal load is around half the player's
  typing capacity. Peak briefly exceeds it.
- A 40 WPM player clears roughly 2–3 Shifts; a 90 WPM player roughly 6–8.
- The first Shift is winnable by a new player on the first try, with tips.
- Every Failed Shift has an identifiable cause in the summary.

## Left to the builder

- All numbers: Train counts and Headway per Line, travel and dwell times, the
  crowding curve, Incident rates and timers, Out-of-service thresholds, Shift
  length, Era pacing, Expansion sizes and score weighting.
- The Incident catalogue, its map treatments and fix texts.
- The Passenger model's internals.
- Label collision handling, the Headway and Bunching visuals, and audio.
- How a lock is released.
- Whether Out of service recovers within a Shift.

## Calls made without the user

These were decided by Claude after the builder check, not by the user. Check
them when reviewing:

- Targeting narrows ZType-style; it doesn't lock on the first key.
- An Incident replaces the Signals of the Trains it holds; its fix is one
  sequenced target.
- Skip-stop is only offered when its name doesn't collide.
- No timetable. "Late" and on-time % are measured against the target Headway.
- Shared track shares blocks; an Expansion is a Line plus a run of its
  Stations.
- Incidents are named "Incident" rather than "fire".
- Skip-stop is in v1 and short-turn is deferred.
- Score is Delivered × accuracy.
- Eras follow approximate opening order, and the starting network is the
  central Kelana Jaya stretch.
