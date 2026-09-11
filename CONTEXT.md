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
Which kind of Run this is: Line Run, Adventure, or Rush Hour.
_Avoid_: kind, variant, type

**Line Run**:
The mode where the player types one line from end to end. The route is fixed and
interchanges never prompt.

**Adventure**:
The mode where the player roams freely and chooses a Direction at every junction.

**Rush Hour**:
The survival mode. Passengers accumulate at stations, the player's typing speed
is the train's throughput, and one overcrowded station ends the Run.

**Status**:
Where a Run is right now: typing, at a junction, or ended.
_Avoid_: phase, state

**Route**:
The ordered stations a Line Run will type. Line Runs have a route; Adventure and
Rush Hour do not.

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
Adventure resume position, Rush Hour high scores, and WPM history.

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

## A note on "line"

Three different things are called a line, and the distinction matters:

1. The line a train travels on **now**, which changes during a Run.
2. The set of lines chosen before a Rush Hour Run starts, which does not change.
3. Line Run, the name of a mode.
