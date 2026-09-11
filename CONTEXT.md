# KL-Metro Typing

A typing game on the Kuala Lumpur Rapid KL rail network. You type station names
to drive a train across the Klang Valley.

This is the canonical vocabulary. Where two words exist for one concept, the
entry names the winner and lists the losers under _Avoid_. Code, documents, and
player-facing copy all use the winner.

## The network

**Station**:
One stop on the network, identified by a slug. A station serving several lines
is one station, not several.
_Avoid_: stop, node

**Line**:
One of the seven Prasarana rail lines, running as an ordered sequence of
stations between two termini.

**Line code**:
The two-letter identifier for a line — KJ, AG, SP, SA, MR, KG, PY. Always shown
as text wherever a line colour appears, because colour is never the only signal.

**Terminus**:
A station at either end of a line.

**Interchange**:
A station serving more than one line. Changing line there is free.
_Avoid_: transfer, connection

**Junction**:
A point in a Run where more than one onward Direction is available and the
player must choose. A property of the Run, not of the station — the same station
is a junction in one Run and a through stop in another.

**Direction**:
One onward rail option out of a station: a line, the next station along it, and
the terminus it heads toward.
_Avoid_: option, choice

**Walk link**:
Two differently-named stations joined by a walkway. Free in Adventure; costs
time in Rush Hour.

## Playing

**Run**:
One play session, from a starting station until the game ends it.
_Avoid_: journey, session, game, play

**Mode**:
Which kind of Run this is: Line Run, Quick Run, or Adventure.
_Avoid_: kind, variant, type

**Line Run**:
The mode where the player types one line from end to end. The route is fixed and
interchanges never prompt.

**Quick Run**:
The 45-second sprint along one line toward a chosen terminus, from a random
starting station. Ends at the deadline, not at a terminus; reversing at the end
of the line rather than stopping. Records a best per line.

**Adventure**:
The mode where the player roams freely and chooses a Direction at every junction.

**Rush Hour**:
The survival mode: passengers accumulate at stations, the player's typing speed
is the train's throughput, and one overcrowded station ends the Run.
**Designed but never built** — it is specified in
`docs/superpowers/specs/2026-09-03-myrapid-typing-design.md` and nothing in
`src/` implements it. Passenger, Demand and Day phase below belong to it and are
likewise unbuilt; `Profile.rushHigh` is a field reserved for it and never
written.

**Status**:
Where a Run is right now. A Line Run or Adventure is typing, at a junction, or
ended; a Quick Run is ready, running, completed, or interrupted.
_Avoid_: phase, state

The code honours neither half of this yet: `RunState` calls the field `phase`,
which this glossary rejects, while `QuickRunState` calls it `status` with a
different set of values. Two distinct concepts wearing one word is exactly what
this document exists to prevent, and it is on the rename list in
`docs/STATUS.md`.

**Route**:
The ordered stations a Line Run will type. Line Runs have a route; Quick Run
picks its next station from the line and direction, and Adventure has none.

**Visited**:
The stations reached during the current Run.

**Unlocked**:
The stations reached in any Run, ever. Survives closing the tab.
_Avoid_: visited (for the lifetime set), discovered, completed

**Passenger**:
Someone waiting at a station in Rush Hour. A passenger wants a line, not a
station, and is delivered on reaching any station that line serves.

**Demand**:
A station's passenger spawn weight. 1 is an ordinary stop; major hubs are higher.

**Day phase**:
Rush Hour's time of day — Off-Peak, Morning Peak, Midday, Evening Peak, Late
Night. "Phase" always means this, never the status of a Run.

## Measuring

**WPM**:
Correct characters, divided by five, divided by elapsed minutes. The standard
definition.

**Accuracy**:
Correct keystrokes over total keystrokes.

**Score**:
WPM multiplied by accuracy squared. Squaring prices sloppiness above raw speed.

**Profile**:
The player's persisted record: unlocked stations, best WPM per station, the
Adventure resume position, Quick Run bests per line, WPM history, the sound and
theme preferences, and the integrity-failure log.

**Integrity-failure log**:
The Runs that failed their Verdict, newest first, capped at twenty. It has no
interface and nothing reads it. It exists so that if the checks start refusing
honest players, that becomes visible in the data before anyone builds a server
on the assumption that they cannot.

**Keylog**:
The record of one Run's typing — every keystroke with its timing and how it
arrived. The Run's evidence.
_Avoid_: keystroke log, trace, telemetry

**Source**:
How a keystroke reached the game: whether the browser marked its event trusted,
and how many characters arrived in the same event. A burst of several characters
carries its size on the **first** keystroke only — the budget for batched input
counts bursts, not characters.
_Avoid_: provenance, origin

**Reason**:
The single named cause of a failing Verdict — malformed log, too few keystrokes,
untrusted input, batched input, impossible speed, inhuman consistency. Never
shown to the player: an honest player knows something happened and can say so, a
cheater gets no gradient to tune against.

**Verdict**:
The result of judging a Keylog: a pass, or a single named Reason for failing.

**Replay**:
Feeding a Keylog back through the Run engine to derive its Metrics, rather than
believing the Metrics the Run reported.

**Eligible**:
A completed Run whose Keylog replays cleanly and passes its Verdict. Only an
eligible Line Run is offered the leaderboard, and only an eligible Quick Run can
record a best.

## A note on "line"

Three different things are called a line, and the distinction matters:

1. The line a train travels on **now**, which changes during a Run.
2. The line chosen before a Line Run or Quick Run starts, which does not change
   for the length of that Run. (Rush Hour, when built, chooses a *set* of them.)
3. Line Run, the name of a mode.
