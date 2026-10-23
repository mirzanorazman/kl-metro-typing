# Dispatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build Dispatcher: a Career of compressed service-day Shifts. The player types Station names to Clear Signals and fix Incidents across a growing Served network. It replaces Rush Hour.

**Architecture:** A pure, fixed-tick, seeded engine in `src/engine/`, split by responsibility:
- the Served network and Expansions;
- the train and passenger sim;
- Incidents;
- typing Targets;
- the Career state machine.

A Career replays exactly from its Keylog plus action log, so it can be judged for the leaderboard. A React screen renders the whole Served network on the existing `MapCanvas`, with an SVG overlay for trains, Signals and Incidents. This is the same shape as Rush Hour (`src/engine/rushHour.ts`, `src/ui/RushHourScreen.tsx`); read those two files before starting any task.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Vitest 1 + Testing Library (jsdom), Tone.js audio. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-23-dispatcher-design.md`. Read it in full before Task 1. Vocabulary follows `CONTEXT.md` plus the spec's "New vocabulary".

## Global Constraints

- `src/engine/*` stays pure: no React, timers, storage or `Math.random`. Time enters as `now`, and randomness comes from `rng.ts` state carried in the Career (STATUS invariant 2).
- One projection: positions come from `networkLayout()` in `geo/networkLayout.ts` (invariant 1).
- Colour is never the only signal. Line codes appear as text, and Incident and Out-of-service marks have shapes or icons, not just red (invariant 3).
- No runtime network requests (invariant 5). Ridership is hand-set; nothing is fetched or bundled from data.gov.my.
- Every typed thing is a real Station name or a short real-world phrase. Never a command code like "T3 HOLD".
- All tuning numbers live in `src/engine/dispatchBalance.ts`. Balancing never touches logic.
- Copy uses the spec's terms: Career, Shift, Signal, Clear, Held, Incident, Out of service, Expansion, Era. Never "fire", "issue", "prompt" or "gate".
- Desktop and tablet only. Phone-landscape gets the existing `PhoneLandscapeBlock`, as Rush Hour does.
- Only a Career that ends in a Failed Shift and passes replay plus `verifyKeyLog` can enter the board. An abandoned Career never can.
- Credit line, verbatim: "Ridership estimates informed by data.gov.my (CC BY 4.0)".
- Commit after every task with a `feat:`/`test:`/`docs:` prefix, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/dispatcher`.

## Review Focus

1. **Name collisions while narrowing:** names sharing a prefix (KLCC / KL Sentral / Kampung Baru / Kerinchi), and identical texts in both directions at one Station. Typing must land on the Target the player meant and never deadlock. Tests are in Task 5.
2. **A Target vanishing mid-typing:** an Incident escalates, or a Signal gets suppressed by a new Incident, while the player is halfway through its name. The aim must reset cleanly, never point at a dead Target, and never throw. Tests are in Task 5.
3. **Shared track:** Ampang and Sri Petaling Trains on Sentul Timur–Chan Sow Lin must use the same blocks, and the Sri Petaling-over-Ampang Expansion must be offered and valid. Tests are in Tasks 1 and 2.
4. **The clock across pause, the between-Shift screen and the next Shift's ready state:** no game time may pass while stopped, and replay must reproduce `endedAt` exactly. Tests are in Tasks 6 and 7.
5. **Window blur during the Expansion screen or a tip:** pausing must not corrupt state or be logged as a refused action. Tests are in Task 9.

---

### Task 1: Balance constants, Served network, Eras and Expansions

**Files:**
- Create: `src/engine/dispatchBalance.ts`
- Create: `src/engine/dispatchNetwork.ts`
- Test: `src/engine/dispatchNetwork.test.ts`

**Interfaces:**
- Consumes: `NetworkIndex`, `stationAt` from `network.ts`; `nextRandom` from `rng.ts`.
- Produces:
  - `dispatchBalance.ts`: every constant listed in Step 1.
  - `dispatchNetwork.ts`:
    ```ts
    export interface ServedRange { line: LineCode; from: number; to: number } // inclusive indices into Line.stations, from <= to
    export type Served = readonly ServedRange[]; // at most one range per Line, sorted by line code
    export const STARTING_NETWORK: Served; // [{ line: 'KJ', from: 4 /* setiawangsa */, to: 17 /* kerinchi */ }]
    export interface EraOpening { line: LineCode; from: string; to: string } // station ids, inclusive
    export interface Era { label: string; opens: readonly EraOpening[] }
    export const ERAS: readonly Era[];
    export function eraFor(cleared: number): number; // min(floor(cleared / SHIFTS_PER_ERA), ERAS.length - 1)
    export function servedKey(served: Served): string; // e.g. "AG:0-17|KJ:4-17"
    export function servedStations(net: NetworkIndex, served: Served): string[]; // unique ids, sorted
    export function servedLines(served: Served): LineCode[];
    export function isServed(net: NetworkIndex, served: Served, id: string): boolean;
    export interface Expansion { line: LineCode; from: number; to: number; farEnd: string; added: string[] }
    export function expansionCandidates(net: NetworkIndex, served: Served, era: number): Expansion[];
    export function drawOffers(net: NetworkIndex, served: Served, era: number, rng: number): [Expansion[], number];
    export function applyExpansion(served: Served, e: Expansion): Served;
    export function servedDistances(net: NetworkIndex, served: Served): ReadonlyMap<string, ReadonlyMap<string, number>>;
    ```

- [x] **Step 1: Write `src/engine/dispatchBalance.ts`.** Document each constant in one line, in the style of `rushBalance.ts`. These are starting values; Task 11 tunes them.
  ```ts
  TICK_MS = 100
  TRAVEL_MS = 5_000              // one block, Station to Station
  DWELL_BASE_MS = 1_500
  DWELL_PER_PASSENGER_MS = 40    // per Passenger boarding or alighting
  TURNAROUND_MS = 3_000          // at the end of a served range
  STATIONS_PER_TRAIN = 5         // trains on a Line = max(2, round(stations / this))
  TRAIN_CAPACITY = 60
  PLATFORM_CAPACITY = 80         // crowd at a Station, all directions
  OOS_CROWD_MS = 20_000          // full platform this long -> Out of service
  OOS_FAIL_SHARE = 0.25          // this share of served Stations Out of service fails the Shift
  PASSENGER_RATE = 0.08          // Passengers per second per unit of demand at multiplier 1
  CENTRAL_PULL = 3
  CENTRAL_STATIONS: readonly string[] = ['masjid-jamek','klcc','kl-sentral','bukit-bintang','pasar-seni','dang-wangi','kampung-baru','bandaraya','plaza-rakyat','hang-tuah','merdeka','raja-chulan','bukit-nanas','tun-razak-exchange','persiaran-klcc','conlay','ampang-park','sultan-ismail','medan-tuanku','imbi']
  SHIFT_PHASES: readonly ShiftPhaseSpec[] = [
    { name: 'Morning peak', ms: 80_000, multiplier: 1.6, flow: 'inbound',  trainFactor: 1 },
    { name: 'Midday',       ms: 50_000, multiplier: 0.7, flow: 'none',     trainFactor: 0.6 },
    { name: 'Evening peak', ms: 80_000, multiplier: 1.6, flow: 'outbound', trainFactor: 1 },
  ]
  FULL_NETWORK_ESCALATION = 0.15 // per Shift once no Expansion remains
  WRONG_KEY_STALL_MS = 500
  LATE_FACTOR = 1.5              // platform wait > this x target Headway -> the approaching Train is late
  ON_TIME_FACTOR = 1.25          // a call is on time when the platform waited <= this x target Headway
  INCIDENTS_PER_MINUTE = 1.5     // at multiplier 1
  INCIDENT_MAX = 3
  INCIDENT_FIRST_MS = 20_000     // none in a Shift's first 20 s
  INCIDENT_LIMIT_MS = 40_000     // unfixed this long -> its place goes Out of service
  STRAIN_CROWD_WEIGHT = 4
  STRAIN_HELD_WEIGHT = 2
  SIGNAL_FAULT_STATIONS = 3
  SKIP_MAX_AHEAD = 3             // Skip-stop tries the Station 2 ahead, then 3; none beyond
  BUNCH_BLOCKS = 1               // same Line and direction, within this many blocks -> bunched
  EXPANSION_OFFERS = 3
  EXPANSION_MIN_STATIONS = 2
  EXPANSION_MAX_STATIONS = 5
  SHIFTS_PER_ERA = 2
  DISPATCH_KEYLOG_MAX_EVENTS = 60_000
  ```
  Also export `type ShiftFlow = 'inbound' | 'outbound' | 'none'` and `interface ShiftPhaseSpec { name: string; ms: number; multiplier: number; flow: ShiftFlow; trainFactor: number }`.

- [x] **Step 2: Write the failing tests** in `src/engine/dispatchNetwork.test.ts`, using the real network (`buildNetwork(loadNetworkData())`):
  - `starting network is the central Kelana Jaya stretch`: `servedStations(net, STARTING_NETWORK)` has length 14, starts with `setiawangsa`, and contains `masjid-jamek`, `klcc`, `kl-sentral` and `kerinchi`.
  - `eras open in history order`: `ERAS.length === 5`. `ERAS[0].opens` covers KJ `gombak`–`kelana-jaya`, AG whole and SP `sentul-timur`–`sri-petaling`. `ERAS[1]` is MR. `ERAS[2]` is KJ `kelana-jaya`–`putra-heights`, SP `sri-petaling`–`putra-heights` and KG. `ERAS[3]` is PY. `ERAS[4]` is SA. Also check `eraFor(0) === 0`, `eraFor(2) === 1` and `eraFor(99) === 4`.
  - `every candidate keeps the network connected`: for era 0 and 4 from `STARTING_NETWORK`, for every candidate `e`, `servedDistances(net, applyExpansion(STARTING_NETWORK, e))` gives every served Station a finite distance from every other.
  - `candidates respect the era`: no era-0 candidate is on MR, KG, PY or SA, and none reaches past `kelana-jaya` on KJ.
  - `candidates are 2–5 Stations and attach`: each candidate either extends the served KJ range contiguously, or starts a new Line at a served Station. `added.length` is between 0 and 5, and the range length is between 2 and 5 for a new Line.
  - `shared track: Sri Petaling over served Ampang is a valid Expansion with nothing added`: with served `[{ line: 'AG', from: 0, to: 10 }]`, era 0, some candidate has `line === 'SP'` and `added.length === 0`.
  - `offers are deterministic, distinct and uniquely named`: `drawOffers(net, STARTING_NETWORK, 0, 42)` called twice gives equal results. At most `EXPANSION_OFFERS` offers; their `farEnd` names are distinct and no two share a Line *and* an end.
  - `a fully served network offers nothing`: served = every Line's full range, era 4 → `expansionCandidates` is `[]`.
  - `distances cross Interchanges and shared track`: served `[AG 0–10, KJ 4–17]` → `servedDistances(...).get('setiawangsa')!.get('sentul-timur')` is finite.

- [x] **Step 3: Run them and confirm they fail.** Run: `npx vitest run src/engine/dispatchNetwork.test.ts`. Expected: FAIL, module not found.

- [x] **Step 4: Implement `dispatchNetwork.ts`.**
  - `expansionCandidates` for each Line whose era-open ranges intersect:
    - **If served:** extend either end by k = `EXPANSION_MIN_STATIONS`..`EXPANSION_MAX_STATIONS` Stations, clipped to the era-open range and the Line's ends. Skip k = 0.
    - **If not served:** for each served Station on that Line inside the era-open range, a range from it extending k Stations in either direction, clipped. For a new Line, `from..to` covers k+1 Stations, including the anchor.
    - `farEnd` is the Station at the new outer end. `added` is the range's Stations not already served.
    - De-duplicate on `(line, from, to)`.
  - `drawOffers` shuffles candidates with `nextRandom`. It greedily takes those whose `(line, end)` pair and `farEnd` name are new, up to `EXPANSION_OFFERS`, and returns the advanced rng.
  - `servedDistances` is all-pairs BFS over consecutive served Stations of each range. Ignore Walk links. Cache it in a `WeakMap<NetworkIndex, Map<servedKey, …>>`, as `railHops` does in `rushHour.ts`.

- [x] **Step 5: Run them and confirm they pass.** Run: `npx vitest run src/engine/dispatchNetwork.test.ts`. Expected: PASS.

- [x] **Step 6: Commit.** `git add src/engine/dispatchBalance.ts src/engine/dispatchNetwork.ts src/engine/dispatchNetwork.test.ts && git commit -m "feat: dispatcher served network, eras and expansions"`

---

### Task 2: Trains, blocks and Signals

**Files:**
- Create: `src/engine/dispatchSim.ts`
- Test: `src/engine/dispatchSim.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Served`, `servedStations`, constants).
- Produces (later tasks add to `SimState`; keep the object flat and JSON-safe):
  ```ts
  export type Dir = 1 | -1; // along Line.stations index
  export type TrainStage = 'signal' | 'cleared' | 'dwell' | 'running' | 'turnaround';
  export interface Train {
    id: number; line: LineCode; dir: Dir;
    /** Index along the Line: the Station being approached ('signal'/'cleared'), at ('dwell'/'turnaround'), or departed ('running'). */
    at: number;
    stage: TrainStage;
    /** 'running': ms into the block; 'dwell'/'turnaround': ms remaining; 'signal': ms Held. */
    ms: number;
    /** Line index this Train runs express to after a Skip-stop, else null. */
    skipTo: number | null;
    load: Record<string, number>; // destination Station id -> count
  }
  export interface SimState {
    served: Served; trains: Train[]; nextTrainId: number; rng: number; shiftMs: number;
    // Task 3 adds: platforms, outOfService, delivered, stranded, calls, onTimeCalls, spawnDebt
    // Task 4 adds: incidents, nextIncidentId, incidentDebt
  }
  export interface PhaseNow { multiplier: number; flow: ShiftFlow; trainFactor: number; escalation: number }
  export function blockKey(net: NetworkIndex, line: LineCode, fromIndex: number, toIndex: number): string; // `${fromId}>${toId}`: Line-independent, so shared track shares blocks
  export function trainsForLine(range: ServedRange, trainFactor: number): number; // max(1, round(max(2, round((to - from + 1) / STATIONS_PER_TRAIN)) × trainFactor))
  export function targetHeadwayMs(range: ServedRange): number; // full out-and-back cycle / trainsForLine(range, 1)
  export function startShiftSim(net: NetworkIndex, served: Served, rng: number): SimState;
  export function stepSim(net: NetworkIndex, s: SimState, phase: PhaseNow): void; // mutates; one TICK_MS
  export function clearSignal(net: NetworkIndex, s: SimState, trainId: number): boolean;
  export function cloneSim(s: SimState): SimState; // deep copy for the advance-on-a-copy pattern
  export function trainPosition(net: NetworkIndex, t: Train): { from: string; to: string; t: number }; // for render, t in 0..1
  export function bunchedTrains(net: NetworkIndex, s: SimState): Set<number>;
  ```

- [x] **Step 1: Write the failing tests** in `src/engine/dispatchSim.test.ts`. Use a helper `run(s, ms, phase = MIDDAY)` that calls `stepSim` `ms / TICK_MS` times. `MIDDAY` is `{ multiplier: 0, flow: 'none', trainFactor: 1, escalation: 1 }`; multiplier 0 means no Passengers yet.
  - `a Shift starts with every Train Held at a Signal, evenly spread`: `startShiftSim(net, STARTING_NETWORK, 1)` has `trainsForLine(KJ 4–17, 1)` (3) Trains, all `stage === 'signal'`, at distinct `(at, dir)` pairs.
  - `an uncleared Train stays Held and counts the wait`: after `run(s, 10_000)`, every Train is still `'signal'` with `ms === 10_000`.
  - `Clear → dwell → run → next Signal`: `clearSignal` on Train 1 returns true. After `DWELL_BASE_MS + TRAVEL_MS + TICK_MS` of run time, Train 1 is `'signal'` at `at + dir`.
  - `knock-on: a Train cannot enter an occupied block`: place Train A Held at a Signal in block X→Y and Train B dwelling at X in the same direction. After B's dwell ends, B stays at X (`stage === 'dwell'`, `ms === 0`) until A is cleared.
  - `a cleared Train waits for its platform`: two Trains, same direction. One is dwelling at Y; the other is cleared at Y's Signal. It stays `'cleared'` until the platform frees.
  - `turnaround at the end of a served range`: a Train arriving at the range end goes to `'turnaround'` and comes back as `'running'` with `dir` flipped.
  - `shared track shares blocks`: `blockKey(net, 'AG', 0, 1) === blockKey(net, 'SP', 0, 1)`.
  - `bunching is detected`: two KJ Trains, same direction, one block apart → both ids are in `bunchedTrains`.
  - `cloneSim is deep`: mutating a clone's train load leaves the original unchanged.

- [x] **Step 2: Run them and confirm they fail.** Run: `npx vitest run src/engine/dispatchSim.test.ts`. Expected: FAIL.

- [x] **Step 3: Implement the Train model.**
  - **Placement:** spread Trains evenly over the out-and-back cycle of each range. Each starts at stage `'signal'` for its next Station, with `ms = 0`.
  - **Block occupancy:** a block is held by Trains `'running'`, `'signal'` or `'cleared'` in it. A platform `(station, dir)` is held by a Train `'dwell'`/`'turnaround'` there.
  - **Departure:** a dwell ends with `ms = 0` and departs only once the next block is free.
  - **Train-count changes:** extra Trains for a phase's `trainFactor` enter at a range end when below the count. Surplus Trains leave at a range end during turnaround. Keep this in `stepSim`.

- [x] **Step 4: Run them and confirm they pass.** Run the same command. Expected: PASS.

- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher trains, blocks and signals"`

---

### Task 3: Passengers, crowding, on-time and Out of service

**Files:**
- Modify: `src/engine/dispatchSim.ts`
- Test: `src/engine/dispatchSim.test.ts` (new `describe('passengers')`)

**Interfaces:**
- Consumes: Task 1 `servedDistances`, `CENTRAL_STATIONS`; Task 2 sim.
- Produces (added to `SimState`):
  ```ts
  export type IncidentKind = 'signal-fault' | 'train-fault' | 'crowd-surge'; // the Incident types live in dispatchSim.ts so the sim never imports dispatchIncidents.ts (no cycle)
  export type OosCause = 'crowding' | IncidentKind;
  export interface Platform { waiting: Record<string, number>; fullMs: number; lastCall: Record<string, number> } // lastCall key `${line}:${dir}` -> shiftMs
  // SimState gains:
  platforms: Record<string, Platform>; outOfService: Record<string, OosCause>; oosOrder: string[];
  delivered: number; stranded: number; calls: number; onTimeCalls: number; spawnDebt: Record<string, number>;
  export function crowdAt(s: SimState, id: string): number;
  export function isLate(net: NetworkIndex, s: SimState, t: Train): boolean;
  export function originWeight(net: NetworkIndex, id: string, flow: ShiftFlow): number; // demand x (flow === 'inbound' && !central ? CENTRAL_PULL : flow === 'outbound' && central ? CENTRAL_PULL : 1)
  export function destinationWeight(net: NetworkIndex, id: string, flow: ShiftFlow): number; // demand x (flow === 'inbound' && central ? CENTRAL_PULL : flow === 'outbound' && !central ? CENTRAL_PULL : 1)
  ```

- [x] **Step 1: Write the failing tests.**
  - `Passengers appear by demand and phase`: after `run(s, 60_000, { multiplier: 1, flow: 'none', trainFactor: 1, escalation: 1 })` with no Clears, each Station's waiting count is within 1 of `floor(60 × PASSENGER_RATE × demand)` (spawn debt is deterministic per Station). Every destination is a served Station other than the origin.
  - `morning flows inward, evening outward`: over 200 s with flow `'inbound'`, the share of waiting Passengers with a central destination exceeds that under `'outbound'` (same seed).
  - `Passengers transfer and are Delivered`: served `[KJ 4–17, AG 0–10]`. Put 10 Passengers at `setiawangsa` for `sultan-ismail` and Clear every Signal as it appears (loop helper). Within 10 min of sim, `delivered >= 10`, and at some tick they were waiting at `masjid-jamek` (the transfer).
  - `dwell grows with the crowd boarding`: a Train calling where 50 wait dwells `DWELL_BASE_MS + 50 × DWELL_PER_PASSENGER_MS` (capped by `TRAIN_CAPACITY`).
  - `a full platform goes Out of service and strands its Passengers`: fill `klcc` to `PLATFORM_CAPACITY` and run `OOS_CROWD_MS`. `outOfService.klcc === 'crowding'`, `oosOrder` ends with `klcc`, its waiting count is 0, `stranded` has grown, and Passengers aboard bound for `klcc` are gone.
  - `Trains pass through an Out-of-service Station`: a Train approaching an Out-of-service Station is never Held at its Signal; it runs on without dwell.
  - `on-time counts calls against the target Headway`: a call after waiting `<= ON_TIME_FACTOR × targetHeadwayMs` increments `onTimeCalls`; a later one increments only `calls`.
  - `isLate` is true when the platform the Train approaches has waited more than `LATE_FACTOR × targetHeadwayMs`.

- [x] **Step 2: Run them and confirm they fail.**

- [x] **Step 3: Implement.**
  - **Spawning:** per served, in-service Station, each tick: `spawnDebt[id] += PASSENGER_RATE × originWeight × multiplier × escalation × TICK_MS / 1000`. While the debt is ≥ 1, draw a destination with `nextRandom`, weighted by `destinationWeight` over the other in-service served Stations.
  - **Boarding** (greedy local rule, so no route tables are needed): a waiting Passenger for `d` boards a Train whose next stop is strictly closer to `d` by `servedDistances`.
  - **Alighting:** aboard, a Passenger alights when the Station is `d` (`delivered += 1`), or when the Train's next stop is not closer (they wait there to transfer).
  - **Platform full:** `fullMs` accrues while the crowd ≥ `PLATFORM_CAPACITY` and resets otherwise.
  - Out of service lasts until the Shift ends. There is no recovery within a Shift (the builder's call in the spec, settled here).

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher passengers, crowding and out of service"`

---

### Task 4: Incidents

**Files:**
- Create: `src/engine/dispatchIncidents.ts` (imports from `dispatchSim.ts`, never the reverse)
- Modify: `src/engine/dispatchSim.ts` (the `Incident` type, `heldStations`/`heldTrains`, and respecting holds and surges inside `stepSim`)
- Test: `src/engine/dispatchIncidents.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces (the types and the two `held*` helpers in `dispatchSim.ts`, everything else in `dispatchIncidents.ts`):
  ```ts
  // dispatchSim.ts
  export interface Incident {
    id: number; kind: IncidentKind;
    /** The Station that goes Out of service if it escalates. */
    place: string;
    /** signal-fault: SIGNAL_FAULT_STATIONS consecutive ids on `line`; crowd-surge: [place]; train-fault: [] */
    stations: string[];
    line: LineCode; train: number | null; // train-fault only
    startedMs: number; step: number; // fix items completed
  }
  // SimState gains: incidents: Incident[]; nextIncidentId: number; incidentDebt: number;
  export function heldStations(s: SimState): Set<string>; // stations of active signal-faults
  export function heldTrains(s: SimState): Set<number>;   // train-fault trains + Trains whose next Station is in heldStations
  // dispatchIncidents.ts
  export function fixItems(net: NetworkIndex, inc: Incident, s: SimState): string[];
  //  signal-fault: the names of `stations`, in Line order
  //  train-fault: [`Reset train at ${name of the Train's next Station}`]
  //  crowd-surge: [`Crowd control at ${name of place}`]
  export function strain(net: NetworkIndex, s: SimState, id: string): number; // 1 + STRAIN_CROWD_WEIGHT x crowd/PLATFORM_CAPACITY + STRAIN_HELD_WEIGHT x Held Trains approaching id
  export function stepIncidents(net: NetworkIndex, s: SimState, phase: PhaseNow): void; // spawn and escalate only
  export function stepWorld(net: NetworkIndex, s: SimState, phase: PhaseNow): void;     // stepIncidents then stepSim: the one tick the Career calls
  export function advanceFix(net: NetworkIndex, s: SimState, incidentId: number): boolean; // completes one item; removes the Incident when all are done
  ```
  The tests in this task step with `stepWorld`.

- [x] **Step 1: Write the failing tests.**
  - `no Incidents in the first INCIDENT_FIRST_MS, then they come`: run with multiplier 1. There are none before 20 s, at least one by 3 min, and never more than `INCIDENT_MAX` at once.
  - `Incidents favour strained Stations`: build two sims from one seed, one with `klcc` crowded to 70. Over 50 seeds, the crowded run puts an Incident's `place` within 1 hop of `klcc` more often.
  - `a signal fault holds its stretch`: inject a signal-fault on KJ `[klcc, kampung-baru, dang-wangi]`. A Train approaching `kampung-baru` is in `heldTrains`, `clearSignal` on it returns false, and a Train dwelling at `klcc` does not depart towards `kampung-baru`.
  - `fixing releases the Trains`: `advanceFix` ×3 removes the Incident, and the previously Held Train is back at `'signal'` (Clearable).
  - `a train fault stops one Train`: that Train's `stage` and `at` don't change while the fault is active. `fixItems` is `['Reset train at <next name>']`.
  - `a crowd surge quadruples arrivals at its place` (compare spawn counts over 20 s).
  - `an unfixed Incident escalates`: after `INCIDENT_LIMIT_MS`, its `place` is in `outOfService` with cause = kind, and the Incident is gone.
  - `Incidents never start on Out-of-service Stations or overlap another Incident's stations`.

- [x] **Step 2: Run them and confirm they fail.**

- [x] **Step 3: Implement.**
  - **Rate:** `incidentDebt += INCIDENTS_PER_MINUTE × multiplier × escalation × TICK_MS / 60_000`, once `shiftMs >= INCIDENT_FIRST_MS` and below `INCIDENT_MAX`.
  - **Place:** chosen weighted by `strain`, then a kind uniformly among those that fit. A signal fault needs `SIGNAL_FAULT_STATIONS` consecutive in-service served Stations on one Line, centred on the place. A train fault needs a Train approaching the place.
  - **Inside `stepSim`** (reads `s.incidents` directly): Held Trains don't move. Crowd-surge spawning is ×4 at its place.

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher incidents"`

---

### Task 5: Targets and narrowing

**Files:**
- Create: `src/engine/dispatchTargets.ts`
- Modify: `src/engine/dispatchSim.ts` (add `skipSignal`)
- Test: `src/engine/dispatchTargets.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  ```ts
  export type TargetRef = { kind: 'signal' | 'skip'; train: number } | { kind: 'fix'; incident: number };
  export interface Target { ref: TargetRef; text: string; delayMs: number } // delayMs: Held time (signal/skip) or age (fix)
  export function sameRef(a: TargetRef, b: TargetRef): boolean;
  export function visibleTargets(net: NetworkIndex, s: SimState): Target[];
  export interface Aim { typed: string; lock: TargetRef | null; mistyped: boolean; stallUntil: number }
  export const EMPTY_AIM: Aim;
  export function candidates(targets: readonly Target[], aim: Aim): Target[]; // case-insensitive prefix match; only the lock when locked
  export function reconcileAim(targets: readonly Target[], aim: Aim): Aim;     // drop a dead lock and typed text with no candidates
  export interface KeyOutcome { aim: Aim; counted: boolean; correct: boolean; completed: TargetRef | null }
  export function aimKey(targets: readonly Target[], aim: Aim, key: string, gameMs: number): KeyOutcome;
  // dispatchSim.ts:
  export function skipSignal(net: NetworkIndex, s: SimState, trainId: number, toIndex: number): boolean;
  ```

- [x] **Step 1: Write the failing tests.** Use hand-built `Target[]` for the narrowing tests and a real sim for `visibleTargets`.
  - `narrowing, not first-key locking`: targets KLCC, KL Sentral, Kampung Baru and Kerinchi. After `k`: four candidates, `lock === null`. After `kl`: two. After `klc`: locked to KLCC.
  - `a wrong key is an error that persists and stalls`: after `kx`, `correct === false`, `counted === true` and `mistyped === true`. Another key before `stallUntil` has `counted === false`. After the stall, `l` is correct and clears `mistyped`.
  - `a key matching no target is an error`: `z` with no Z target → `counted`, `!correct`.
  - `identical texts complete on the most delayed`: two Masjid Jamek signal targets with `delayMs` 3000 and 9000. Typing the full name gives `completed` = the 9000 one.
  - `Hold stays playable`: a Held Train at Kerinchi (delay 30 s) plus KL Sentral (delay 1 s). Typing "KL Sentral" completes KL Sentral, never Kerinchi.
  - `a fix stays locked across its items`: a signal-fault target. Completing item 1 returns `completed` = the fix and an aim still locked to it with `typed === ''`.
  - `a vanished target resets the aim` (Review Focus 2): lock on KLCC, then `reconcileAim` with KLCC gone → `EMPTY_AIM`. Typed `kl` with no `kl…` targets left → `typed === ''`.
  - `visibleTargets suppresses Held and Out-of-service Signals`: Trains Held by an Incident and Trains approaching an Out-of-service Station produce no signal target. A signal-fault produces exactly one fix target, whose text is its current item.
  - `Skip-stop is offered only when late and never collides`: a late Train approaching X offers a `skip` with the name 2 Stations ahead. If that text equals another visible target's text, it offers 3 ahead. If that collides too, or is past the served range or Out of service, there is no skip.
  - `skipSignal runs express`: after `skipSignal`, the Train neither dwells nor boards at X, and its next Signal is past X.

- [x] **Step 2: Run them and confirm they fail.**

- [x] **Step 3: Implement.**
  - On a correct key, `typed` grows by the expected character, taken from the first candidate's text (preserving its case).
  - It locks once all candidates share one text. Among those, the lock goes to the highest `delayMs`, ties to the lowest train id or incident id.
  - Completion happens when `typed` equals the locked text in full.

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher targets and narrowing"`

---

### Task 6: The Career

**Files:**
- Create: `src/engine/dispatch.ts`
- Test: `src/engine/dispatch.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `computeMetrics`, `isPrintable`.
- Produces:
  ```ts
  export type CareerStatus = 'ready' | 'running' | 'paused' | 'between' | 'ended';
  export type CareerEnd = 'failed' | 'abandoned';
  export interface ShiftRecord { shift: number; delivered: number; calls: number; onTimeCalls: number; cleared: boolean }
  export interface Closure { station: string; cause: OosCause }
  /** Closures in order; the first started the collapse. (Final review: was { station, cause } of the last.) */
  export interface Failure { shift: number; closures: Closure[] }
  export interface CareerState {
    seed: number; status: CareerStatus; endReason: CareerEnd | null; failure: Failure | null;
    startedAt: number | null; stoppedAt: number | null; pausedMs: number; endedAt: number | null;
    gameMs: number; shiftStartMs: number;
    shift: number; cleared: number; served: Served; offers: Expansion[]; offerRng: number;
    /** The Shift number at which drawOffers first came back empty, else null. */
    filledAt: number | null;
    sim: SimState; aim: Aim; history: ShiftRecord[];
    correctChars: number; keystrokes: number; errors: number;
  }
  export const SHIFT_MS: number; // sum of SHIFT_PHASES
  export interface ShiftPhase { name: string; flow: ShiftFlow; multiplier: number; trainFactor: number; progress: number }
  export function shiftPhase(shiftMs: number): ShiftPhase;
  export function shiftEscalation(s: CareerState): number; // filledAt === null ? 1 : 1 + FULL_NETWORK_ESCALATION × (shift − filledAt)
  export function startCareer(net: NetworkIndex, seed: number): CareerState;
  export function advanceCareer(net: NetworkIndex, s: CareerState, now: number): CareerState;
  export function enterDispatchCharacter(net: NetworkIndex, s: CareerState, key: string, now: number): CareerState;
  export type DispatchActionBody = { a: 'unlock' } | { a: 'expand'; pick: number } | { a: 'pause' } | { a: 'resume' } | { a: 'abandon' };
  export type DispatchAction = DispatchActionBody & { i: number; t: number };
  export function applyDispatchAction(net: NetworkIndex, s: CareerState, action: DispatchActionBody, now: number): CareerState; // same object when refused
  export function careerMetrics(s: CareerState, now: number): Metrics; // typing time = gameMs (running only)
  export function careerTotals(s: CareerState): { delivered: number; calls: number; onTimeCalls: number; onTimePct: number }; // history + the live Shift
  export function careerScore(s: CareerState): number; // Math.round(totals.delivered x careerMetrics(s, …).accuracy)
  export function dispatchOvercrowded(s: CareerState): boolean; // any Incident active or any Station Out of service: the tense music
  export const DISPATCH_EVIDENCE_VERSION = 1;
  ```

- [x] **Step 1: Write the failing tests.** Use clock values like `1_000 + ms`.
  - `the first printable key starts the clock and is typed`: `startCareer(net, 1)` is `'ready'`. Typing the first letter of a visible target makes it `'running'`, with `startedAt === now` and `correctChars === 1`. A non-printable key changes nothing.
  - `Clearing a Signal through typing`: typing a whole visible signal target's text Clears that Train (its stage leaves `'signal'`).
  - `unlock releases the aim`: the `{ a: 'unlock' }` action empties `typed` and `lock`, and is refused (same object) when the aim is already empty.
  - `a Shift clears after SHIFT_MS and offers Expansions`: to keep the network alive, use a helper that clears every Signal and fix each tick. `advanceCareer` past `SHIFT_MS` gives `status === 'between'`, `cleared === 1`, `offers.length >= 1`, one `history` record with `cleared: true`, and `stoppedAt` equal to the Shift's end on the Run clock.
  - `no game time passes between Shifts or in the next ready` (Review Focus 4): wait 60 s in `'between'`, `expand`, wait 30 s, then type the first key. `gameMs` resumes from `SHIFT_MS` exactly, and `pausedMs` grew by 90 s.
  - `expand applies the pick and starts a fresh Shift`: `served` contains the offer's Stations, `shift === 2`, `status === 'ready'`, and `sim.outOfService` is empty. `pick` out of range is refused. `pick: -1` is refused while offers exist and accepted when `offers` is empty.
  - `a Shift fails when enough Stations are Out of service`: force Out of service on `ceil(OOS_FAIL_SHARE × 14)` Stations through crowding (helper that never clears). `status === 'ended'`, `endReason === 'failed'`, and `failure.closures[0]` is the first to go, with its cause, followed by every closure of that Shift in order (changed by the final review: it used to name the last to go, but the spec says the summary names what started the collapse). `endedAt` is exact.
  - `pause and resume freeze the clock`, and `abandon` works from `'running'`, `'paused'`, `'between'` and a later Shift's `'ready'`. It is refused before the first key.
  - `careerScore` is `round(delivered × accuracy)`. With 100 delivered and accuracy 0.9 (via counters), the score is 90.
  - `metrics count running time only`.
  - `escalation applies only after the network is full`.

- [x] **Step 2: Run them and confirm they fail.**

- [x] **Step 3: Implement**, following `rushHour.ts`:
  - `advanceCareer` syncs in whole ticks on one `cloneSim` copy.
  - Each tick: `stepWorld` with `PhaseNow` from `shiftPhase(gameMs - shiftStartMs)` and `shiftEscalation`, then `reconcileAim` against `visibleTargets`.
  - **Fail check:** `oosOrder.length >= Math.ceil(OOS_FAIL_SHARE × servedStations.length)`.
  - **Shift end:** `drawOffers(net, served, eraFor(cleared), offerRng)`.
  - `enterDispatchCharacter` syncs first. Then `aimKey`; counted keys update `correctChars`/`keystrokes`/`errors`. A completed ref calls `clearSignal`/`skipSignal`/`advanceFix`.

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher career state machine"`

---

### Task 7: Replay, judge and the scripted typist

**Files:**
- Modify: `src/engine/replay.ts` (add `DispatchEvidence`, `replayDispatch`)
- Create: `src/engine/dispatchJudge.ts`
- Create: `src/engine/dispatchDrive.testutil.ts`
- Test: `src/engine/dispatchReplay.test.ts`, `src/engine/dispatchProbe.test.ts`

**Interfaces:**
- Consumes: Task 6; `verifyKeyLog` and `Verdict` from `integrity.ts`; `appendKey`, `beginLog` and `PLAIN_SOURCE` from `keylog.ts`.
- Produces:
  ```ts
  // replay.ts
  export interface DispatchEvidence { v: number; seed: number; keylog: KeyLog; actions: DispatchAction[]; endedAt: number }
  export interface DispatchReplayResult { metrics: Metrics; delivered: number; cleared: number; score: number; complete: boolean }
  export function replayDispatch(net: NetworkIndex, evidence: DispatchEvidence): DispatchReplayResult | null;
  // dispatchJudge.ts
  export interface DispatchJudgement { eligible: boolean; score: number; delivered: number; cleared: number; verdict: Verdict | null }
  export function judgeCareer(net: NetworkIndex, evidence: DispatchEvidence): DispatchJudgement; // pure, never throws
  // dispatchDrive.testutil.ts
  export interface DriveOptions { seed: number; msPerKey: number; limitMs?: number; pick?: (s: CareerState) => number; watch?: (s: CareerState) => void; pauseAt?: number; resumeAt?: number }
  export function drive(o: DriveOptions): { state: CareerState; evidence: DispatchEvidence };
  ```

- [x] **Step 1: Write the failing replay tests** in `dispatchReplay.test.ts`:
  - `a driven Career replays to the same result`: `drive({ seed: 3, msPerKey: 200, limitMs: 30 * 60_000 })` ends `'failed'`. `replayDispatch` gives `complete: true`, plus the same `delivered`, `cleared`, `score` and `metrics.wpm` (to 1e-9).
  - `pauses and Expansion picks replay` (Review Focus 4): the same, with `pauseAt`/`resumeAt` set, and a `pick` that always takes the last offer.
  - `an abandoned Career replays but is never complete`.
  - `forged evidence is refused`: wrong `v`, actions out of order, an `expand` pick the engine refuses, or a non-finite `endedAt` → `null`.
  - `judgeCareer`: eligible for the driven Career, with a `verdict.ok` result. Ineligible for abandoned and forged evidence.

- [x] **Step 2: Run them and confirm they fail.**

- [x] **Step 3: Implement `replayDispatch`**, in the shape of `replayRushHour`: actions are applied before the Keylog event whose index they carry, and refusal (same object) means `null`. `complete` is true only for `endReason === 'failed'` with `endedAt === evidence.endedAt`. Implement `judgeCareer` with `verifyKeyLog(keylog, metrics.wpm, DISPATCH_KEYLOG_MAX_EVENTS)`.
  - **The typist in `drive`:** if the aim is locked, it types the locked text's next character. Otherwise it picks the Target to start, in this order: a fix whose Incident is older than `INCIDENT_LIMIT_MS / 2`, then the highest `delayMs`. It keeps typing that Target's text until done.
  - Every 23rd key is `#`, and key timing gets the same jitter as `rushDrive.testutil.ts`.
  - In `'between'` it applies `{ a: 'expand', pick: o.pick?.(s) ?? 0 }` (or -1 with no offers). It records keys only while `'ready'`/`'running'`.

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Write the balance tests** in `dispatchProbe.test.ts`, in the shape of `rushProbe.test.ts`. 300/200/133 ms per key ≈ 40/60/90 WPM.
  - `rewards speed`: the median `cleared` over seeds 1–3 at 90 WPM is greater than at 40 WPM.
  - `the first Shift is winnable`: at 60 WPM, seeds 1–3 all reach `cleared >= 1`.
  - Opt-in survey (`DISPATCH_PROBE=1`): print median Shifts cleared, delivered, score and the failure cause, for 5 seeds × three speeds.

- [x] **Step 6: Run** `npx vitest run src/engine/dispatchReplay.test.ts src/engine/dispatchProbe.test.ts`. Expected: PASS. If the balance tests fail, adjust only `dispatchBalance.ts`.

- [x] **Step 7: Commit.** `git commit -m "feat: dispatcher replay, judge and balance probe"`

---

### Task 8: Leaderboard store, profile fields and vocabulary

**Files:**
- Create: `src/data/dispatchBoardStore.ts`
- Test: `src/data/dispatchBoardStore.test.ts`
- Modify: `src/engine/progress.ts` (`dispatchTipsSeen`, `markDispatchTipSeen`, `resetDispatchTips`, `IntegrityFail.mode` gains `'dispatch'`), `src/engine/progress.test.ts`
- Modify: `src/data/types.ts:50` (`demand` doc: "Station busyness: Passenger weight for Dispatcher. 1 = ordinary stop.")
- Modify: `CONTEXT.md` (add the spec's New vocabulary entries under a "Dispatcher" heading, in the file's existing format)

**Interfaces:**
- Consumes: `LEADERBOARD_LIMIT` from `engine/leaderboard.ts`; `Metrics`.
- Produces:
  ```ts
  export const DISPATCH_BOARD_KEY = 'klmetro.dispatch.v1';
  export interface DispatchEntry { id: string; name: string; score: number; delivered: number; shifts: number; wpm: number; accuracy: number; playedAt: number; verified?: true }
  export interface DispatchBoard { version: 1; entries: DispatchEntry[] }
  export function loadDispatchBoard(): DispatchBoard; // corrupt or unknown version -> empty
  export function saveDispatchBoard(board: DispatchBoard): void;
  export function dispatchQualifies(board: DispatchBoard, score: number): boolean;
  export function submitDispatchEntry(board: DispatchBoard, p: { name: string; score: number; delivered: number; shifts: number; metrics: Metrics; playedAt: number; verified: boolean }): { board: DispatchBoard; rank: number | null };
  ```

- [x] **Step 1: Write the failing tests:**
  - The board sorts by score descending, with ties going to the earlier `playedAt`.
  - It caps at `LEADERBOARD_LIMIT`.
  - `dispatchQualifies` is true while the board isn't full, and otherwise only above the cutoff.
  - Submitting trims the name, saves, and returns the 1-indexed rank.
  - Garbage in storage loads as empty.
  - Profile: `markDispatchTipSeen` is idempotent; `migrate` keeps only string ids in `dispatchTipsSeen`.
- [x] **Step 2: Run them and confirm they fail.** Run: `npx vitest run src/data/dispatchBoardStore.test.ts src/engine/progress.test.ts`.
- [x] **Step 3: Implement**, mirroring `leaderboardStore.ts`'s load/save guards, and update `CONTEXT.md` and `types.ts`.
- [x] **Step 4: Run them and confirm they pass.**
- [x] **Step 5: Commit.** `git commit -m "feat: dispatcher leaderboard store, profile tips and vocabulary"`

---

### Task 9: The Shift screen

**Files:**
- Create: `src/render/DispatchOverlay.tsx`
- Create: `src/ui/DispatcherScreen.tsx`, `src/ui/DispatchIncidents.tsx`, `src/ui/dispatch.css`
- Modify: `src/ui/App.tsx` (`Screen` gains `{ kind: 'dispatch' }`; `activeRun` and `leaveHome`'s phone-landscape guard include it; `onAgain` remounts the screen with a fresh seed)
- Modify: `src/ui/HomeMap.tsx` (`onOpenDispatcher?: () => void` prop and a "Dispatcher" button beside Rush Hour, same markup and `sound.select()`)
- Test: `src/ui/Dispatcher.test.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–8; `MapCanvas`, `PlayLayout`, `Prompt`, `useGameInput`, `useRunRecorder`/`runTick`, `useKeyboard`, `networkLayout`, `PhoneLandscapeBlock`, `music`/`sound`.
- Produces:
  ```ts
  export interface DispatcherScreenProps {
    net: NetworkIndex; onExit: () => void; onAgain: () => void; phoneLandscape?: boolean;
    /** Test-only: start from this state instead of startCareer. */
    initial?: CareerState;
  }
  export function DispatcherScreen(p: DispatcherScreenProps): JSX.Element;
  export interface DispatchOverlayProps { net: NetworkIndex; layout: Layout; markScale: number; career: CareerState; targets: readonly Target[]; aimed: readonly Target[] }
  export function DispatchOverlay(p: DispatchOverlayProps): JSX.Element;
  export function DispatchIncidents(p: { net: NetworkIndex; career: CareerState }): JSX.Element;
  ```
  This task renders `'ready'`/`'running'`/`'paused'`. For `'between'` and `'ended'` it renders placeholders; Task 10 replaces them.

- [x] **Step 1: Write the failing UI tests**, with the harness setup from `src/ui/RushHour.test.tsx` (`getBoundingClientRect` and `matchMedia` stubs; tips pre-seen):
  - `shows the whole Served network, not a follow camera`: an SVG label for every `servedStations(net, STARTING_NETWORK)` name is in the document.
  - `each Held Train shows its Signal's Station name`: for every signal target in `visibleTargets` of the initial state, its text appears inside the overlay (`data-testid="dispatch-signal"`).
  - `typing narrows and highlights candidates`: after typing `k`, the K-named signal labels carry `data-candidate="true"` and others don't. The typing line shows the typed `k`.
  - `typing a full name Clears that Train`: its label disappears.
  - `Backspace unlocks; Escape pauses, and Enter resumes`.
  - `blur pauses only a running Career` (Review Focus 5):
    - blur while running shows the `Paused` dialog;
    - a second blur while paused changes nothing and doesn't throw, and Enter resumes;
    - with `initial` in `'between'`, blur shows no `Paused` dialog and the between placeholder stays.
  - `Incidents are listed with kind, place and a timer`: an `initial` state with a signal-fault injected. A card shows "Signal fault", the place name and a progress bar with an accessible label.
  - `the home map's Dispatcher button opens the screen` (in `App.test.tsx`).
  - `Out of service and bunching are marked with shapes, not only colour`: `data-testid="dispatch-oos"` contains an icon element; bunched Trains carry `data-bunched="true"`.
  - `top bar shows Shift number, phase with direction, Delivered and on-time %`.
  - `music: calm while running, tense while any Incident or Out of service` (the `rushCalm`/`rushTense` tracks; spy on `music.play`).

- [x] **Step 2: Run them and confirm they fail.** Run: `npx vitest run src/ui/Dispatcher.test.tsx`.

- [x] **Step 3: Implement `DispatcherScreen`** by following `RushHourScreen`'s structure: the ref-backed `commit`, `act` logging only taken actions, the rAF advance loop, blur/visibility pause, effects-only sounds, and music.
  - **Map:** `MapCanvas` gets `fitTo` = the Served Stations' layout points, `fitKey = 'dispatch:' + servedKey`, `activeStation={null}`, `emphasisSet` = served Lines, and `visited` = the served Stations.
  - **Overlay:** draws Trains at `trainPosition` (lerp between layout points). Each signal/skip target is a label beside its Train; fix targets are a pulse at the place; Out of service is a cross icon; Held stretches and bunched Trains get a glow class.
  - **Typing line:** a `Prompt` built from the aim (`target` = locked text or first candidate text, `cursor = typed.length`, `mistyped`).
  - **Keys:** Escape pauses and Backspace unlocks, recorded as actions. Printable keys are recorded with `recorder.record` only while `'ready'`/`'running'`, then `enterDispatchCharacter`.
  - **Sounds:** `sound.arrive` on a Clear, `sound.delivered` when Delivered rises, `sound.warning` on a new Incident, `sound.error` on an error.

- [x] **Step 4: Run them and confirm they pass.**

- [x] **Step 5: Browser check.** `npm run dev`, then open Dispatcher from the home map. Type through a minute and check:
  - labels are readable at the starting zoom;
  - there are no overlapping labels at Masjid Jamek or KL Sentral (offset rule is the builder's choice);
  - a full-network screenshot is legible.

  Note the findings in the commit message body.

- [x] **Step 6: Commit.** `git commit -m "feat: dispatcher shift screen"`

---

### Task 10: Expansion screen, summary, tips and wiring

**Files:**
- Create: `src/ui/DispatchExpansion.tsx`, `src/ui/DispatchSummary.tsx`, `src/ui/dispatchTips.ts`, `src/ui/dispatchTips.test.ts`
- Modify: `src/ui/DispatcherScreen.tsx` (between/ended, tips, judging)
- Modify: `src/ui/LeaderboardScreen.tsx` (a `'dispatcher'` tab listing `DispatchEntry` rows: Name, Score, Shifts, WPM, Accuracy)
- Test: `src/ui/Dispatcher.test.tsx`, `src/ui/LeaderboardScreen.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–9.
- Produces:
  ```ts
  export function DispatchExpansion(p: { net: NetworkIndex; career: CareerState; onPick: (pick: number) => void }): JSX.Element;
  export function DispatchSummary(p: { net: NetworkIndex; career: CareerState; metrics: Metrics; judgement: DispatchJudgement | null; onAgain: () => void; onBack: () => void }): JSX.Element;
  export const DISPATCH_TIPS: readonly { id: 'start' | 'incident' | 'bunching' | 'late' | 'out-of-service' | 'expansion'; text: string }[];
  export type DispatchTipId = (typeof DISPATCH_TIPS)[number]['id'];
  export function newDispatchTips(prev: CareerState, next: CareerState, seen: ReadonlySet<string>): DispatchTipId[];
  export function failureText(net: NetworkIndex, f: Failure): string;
  // e.g. "Shift 3 ended: it started when Masjid Jamek went out of service after a signal fault was left unfixed."
  //      "Shift 2 ended: it started when KLCC went out of service because its platform overflowed."
  // Final review: leads with the first closure; closureText(net, c) names each closure for the summary's list.
  ```
  Tip copy (exact):
  - start: "Type a waiting station's name to clear its signal. Trains you don't clear wait."
  - incident: "An incident holds trains until you type its fix. Left too long, the station goes out of service."
  - bunching: "Trains are bunching. Holding one back (not clearing it) evens out the gaps."
  - late: "A late train offers a station further ahead. Type that to run it express."
  - out-of-service: "A station is out of service. Lose a quarter of your network and the shift fails."
  - expansion: "Shift cleared. Choose where your network grows. Type a station's name or click it."

- [x] **Step 1: Write the failing tests:**
  - `newDispatchTips`: each moment fires once and respects `seen`. `start` is shown inline while `'ready'`, not as a moment.
  - The Expansion screen lists each offer's `farEnd` name and the Era label (`ERAS[eraFor(cleared)].label`). Typing an offer's name (narrowing via `candidates`/`aimKey` over offer names, *not* recorded in the Keylog) or clicking it calls `onPick` with its index. With no offers, it shows "Your network is complete" and a Continue button that picks `-1`.
  - The summary shows score, Shifts cleared, network size, Delivered, on-time %, WPM, accuracy, `failureText`, and the credit line.
  - Name entry appears only when `judgement.eligible && dispatchQualifies(...)`. Submitting lists the entry with its rank.
  - An abandoned Career shows "Ended early — an abandoned Career can't enter the leaderboard."
  - An ineligible failed Career records `recordIntegrityFail(..., { mode: 'dispatch' })`.
  - The Leaderboard "Dispatcher" tab lists stored entries.

- [x] **Step 2: Run them and confirm they fail.** Run: `npx vitest run src/ui`.

- [x] **Step 3: Implement.** Tips pause the Career with the ordinary pause action and resume when dismissed, exactly as `RushHourScreen` does. Judge once at `'ended'` with `judgeCareer`. Play the `rushSetup` music on the Expansion screen.

- [x] **Step 4: Run `npm test` and `npm run build`.** Expected: all pass, no type errors.

- [x] **Step 5: Browser check.** Play a full Career at a comfortable pace. Clear Shift 1, pick an Expansion, then check:
  - the map reframes to the bigger network;
  - fail a Shift on purpose, and the summary names the cause;
  - name entry works.

- [x] **Step 6: Commit.** `git commit -m "feat: dispatcher expansion, summary, tips and leaderboard tab"`

---

### Task 11: Balance pass and handover

**Files:**
- Modify: `src/engine/dispatchBalance.ts`
- Create: `docs/superpowers/dispatcher-handover.md`
- Modify: `docs/STATUS.md` (Dispatcher section; Rush Hour marked "being replaced")

- [x] **Step 1: Run the survey.** Run: `DISPATCH_PROBE=1 npx vitest run src/engine/dispatchProbe.test.ts`. Record the table.
- [x] **Step 2: Tune constants towards the spec's targets.** 40 WPM should clear 2–3 Shifts and 90 WPM 6–8. Off-peak Signal load should be about half of a 60 WPM typist's capacity (compute: Signals per second × mean name length / 5 chars per second at 60 WPM). Every failure must have a cause. Change only `dispatchBalance.ts`. Re-run until it lands within ±1 Shift, or record why not.
- [x] **Step 3: Run `npm test`.** Expected: PASS, including `dispatchProbe.test.ts`.
- [x] **Step 4: Write `docs/superpowers/dispatcher-handover.md`.** Include:
  - a "Resume here" block, in the style of `rush-hour-handover.md`;
  - the final survey table;
  - leans left for playtesting;
  - gotchas found;
  - the deviations from the spec made during implementation.

  Also update `docs/STATUS.md`.
- [x] **Step 5: Commit.** `git commit -m "docs: dispatcher balance survey and handover"`

---

### Task 12: Retire Rush Hour

**Gate:** Do not start this task until the user has playtested Dispatcher and says to retire Rush Hour. Ask them.

**Files:**
- Delete: `src/engine/rushHour.ts`, `rushBalance.ts`, `rushJudge.ts`, `rush*.test.ts`, `rushDrive.testutil.ts`, `rushTypists.testutil.ts`, `src/render/RushQueues.tsx`, `src/ui/RushHourScreen.tsx`, `RushSetup.tsx`, `RushJunction.tsx`, `RushSummary.tsx`, `RushHour.test.tsx`, `rushTips.ts`, `rushTips.test.ts`, `rush.css`
- Modify: `src/engine/replay.ts` (remove the Rush section), `src/ui/App.tsx`, `src/ui/HomeMap.tsx` (remove `onOpenRush` and its button), `src/engine/progress.ts` (remove `rushHigh`, `rushTipsSeen` and their functions; `migrate` strips both keys from old saves; `IntegrityFail.mode` keeps `'rush'` for stored history)
- Keep: the `rushSetup`/`rushCalm`/`rushTense` music and `sound.delivered`/`sound.warning`. Rename the tracks to `dispatchSetup`/`dispatchCalm`/`dispatchTense` and update their callers.
- Modify: `CONTEXT.md` (remove Rush-only terms: Queue, Overflow, Line set, Day phase; keep Walk link but drop its Rush Hour clause), `docs/STATUS.md`

- [ ] **Step 1: Write the failing test** in `src/engine/progress.test.ts`: `migrate strips Rush Hour keys`. A stored profile with `rushHigh` and `rushTipsSeen` loads without either key.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Delete and edit as listed.** Run `grep -rni "rush" src CONTEXT.md`. The only hits left should be the `'rush'` integrity mode and the migration.
- [ ] **Step 4: Run `npm test` and `npm run build`.** Expected: PASS, no type errors.
- [ ] **Step 5: Commit.** `git commit -m "feat: retire Rush Hour in favour of Dispatcher"`
