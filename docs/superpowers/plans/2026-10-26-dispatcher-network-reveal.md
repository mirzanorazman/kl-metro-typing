# Dispatcher network reveals (F15, F4, F19) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paint exactly the served network, reveal it before each new Career's lesson, and animate Expansions with a badge/chime for a newly joined Line.

**Architecture:** Generic range and track-point helpers give the map and previews one geometry. Optional `MapCanvas` props render served ranges and temporary directed additions without changing whole-Line callers. A separate UI controller owns reveal deadlines, discarded typing and new-Line notice lifetime; the Career engine and evidence stay unchanged.

**Tech Stack:** React 18, TypeScript, SVG/CSS, Tone.js, Vitest and Testing Library.

**Spec:** [approved design](../specs/2026-10-26-dispatcher-network-reveal-design.md).
**Source baseline:** `feat/dispatcher` at `64e0d4d`; planning branch `codex/dispatcher-network-reveal`.
**Status:** Tasks 1–8 implemented and verified by 2026-10-27 (Kuala Lumpur), with separate spec and quality reviews for Tasks 1–7. Task 8 review and whole-branch review follow this handoff. Full gates passed at `9d98057` (83 files, 1,197 passed tests, 2 skipped); browser evidence and bounded manual coverage are recorded in [verification results](../dispatcher-network-reveal-verification.md). Not merged or deployed. The execution ledger is `/tmp/myrapid-network-reveal-progress.md`.

---

## Constraints and decisions

- Order: F15 served geometry → F4 entry and lesson handoff → F19 Expansion feedback.
- Entry is 1,000 ms and Expansion is 800 ms, **including** the Station pops.
- Ignore characters, Space, Enter and Backspace until the deadline. Do not skip,
  buffer, replay or record them. The Shift remains ready and its clock stopped.
- Preserve Back to map before the first key and End Career between Shifts.
  An ignored game key must not accidentally click a focused button. Keep the
  existing click/tap-only confirmation rule and Enter/Space button shields;
  Escape provides the keyboard exit before the first Career key.
- Entry precedes the lesson on every normal new Career; How to play, lesson
  completion and lesson skip do not replay entry. Explicit `initial` fixtures
  bypass entry; `lessonFor` does not. App's existing Career key handles Again.
- Reduced motion means immediate settled track **and no input wait**. Observe a
  preference change during a reveal, not just the preference at mount.
- Animate every added track edge, even for zero-new-Station shared track. Pop
  only globally new Stations. No addition means no reveal, lock or celebration.
- New-Line code/name notice sits in the measured typing panel, stays until the
  next Shift starts, and has one chime. Ordinary extensions have neither.
- Do not change the engine, Keylog schema, actions, evidence version, replay,
  judge, balance, profile schema, Green wave timing or closure behavior.
- F11 and F23 remain separate. No camera tour, new screen or new dependencies.

## File map

| File | Responsibility |
|---|---|
| Create `src/render/trackRanges.ts` and `.test.ts` | Generic inclusive ranges, directed additions, Station membership and lane-aware subset points. |
| Create `src/render/trackReveal.ts` and `.test.ts` | Temporary reveal contract and distance/easing-based Station timing. |
| Modify `src/render/MapCanvas.tsx`, `src/render/map.css`, `src/render/MapCanvas.test.tsx` | Optional range emphasis, static prior track plus animated additions; preserve old entrance callers. |
| Modify `src/render/DispatchOverlay.tsx` | Reuse subset geometry for Incidents, waves and dashed offers. |
| Create `src/ui/useDispatchReveal.ts` and `.test.tsx` | UI event ids, monotonic deadlines, synchronous gate, completion callback and notice lifetime. |
| Modify `src/ui/DispatcherScreen.tsx`, `src/ui/Dispatcher.test.tsx` | Entry/lesson sequence, input routing, accepted Expansion transaction and F17 integration. |
| Create `src/ui/DispatchNetworkNotice.tsx` and `.test.tsx`; modify `src/ui/dispatch.css` | Opaque in-panel Line notice and opening status. |
| Modify `src/audio/sound.ts`, `src/audio/sound.test.ts` | Synthesised new-Line cue using existing mute/unlock handling. |
| Modify tracker and `docs/superpowers/dispatcher-handover.md` | Task status and observed verification results; do not mark unobserved effects verified. |

`useDispatchLesson` already exposes `start()` and supports `autoStart=false`;
prefer coordinating those controls from the screen over changing its engine.
Do not split or refactor unrelated screen concerns.

## Task 1: Shared subset geometry and directed range differences

**Files:** Create `src/render/trackRanges.ts`, `src/render/trackRanges.test.ts`;
modify `src/render/DispatchOverlay.tsx`.

- [x] **Step 1 — Add failing geometry tests.** Use the real network and layout:

```ts
import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { networkLayout } from '../geo/networkLayout';
import { trackLines } from './mapMarks';
import { rangeAdditions, rangeStations, trackPoints } from './trackRanges';

const net = buildNetwork(loadNetworkData());
const { geo: layout } = networkLayout();

it('starts a lower extension at the old endpoint, drawing backwards', () => {
  expect(rangeAdditions(net, [{ line: 'KJ', from: 4, to: 17 }],
    [{ line: 'KJ', from: 1, to: 17 }])).toEqual([
    { line: 'KJ', from: 1, to: 4, reverse: true },
  ]);
});

it('starts an upper extension at the old endpoint', () => {
  expect(rangeAdditions(net, [{ line: 'KJ', from: 4, to: 17 }],
    [{ line: 'KJ', from: 4, to: 20 }])).toEqual([
    { line: 'KJ', from: 17, to: 20, reverse: false },
  ]);
});

it('opens another Line even if every Station is already served', () => {
  const before = [{ line: 'AG' as const, from: 0, to: 5 }];
  const after = [...before, { line: 'SP' as const, from: 0, to: 5 }];
  expect(rangeStations(net, after)).toEqual(rangeStations(net, before));
  expect(rangeAdditions(net, before, after)).toEqual([
    { line: 'SP', from: 0, to: 5, reverse: false },
  ]);
  expect(rangeAdditions(net, after, after)).toEqual([]);
});

it('selects the original offset lane, never a whole-Line replacement', () => {
  const lanes = trackLines(net, layout, 7);
  const ids = net.lines.get('SP')!.stations.slice(1, 4);
  expect(trackPoints(net, layout, lanes, 'SP', ids)).toEqual(lanes.get('SP')!.slice(1, 4));
  expect(trackPoints(net, layout, lanes, 'SP', [...ids].reverse()))
    .toEqual(lanes.get('SP')!.slice(1, 4).reverse());
});
```

Also test a new Line attached at its upper endpoint (reversed), Station
membership at both inclusive endpoints, and a shared Interchange counted once.
Use endpoint ids from `net.lines`, rather than assuming sorted Station ids
encode travel order. Confirm the AG/SP fixture actually shares the chosen ids.

- [x] **Step 2 — Run red:** `npx vitest run src/render/trackRanges.test.ts`.
  Expected: failure because the new module is absent.
- [x] **Step 3 — Implement the contracts and algorithms below.** Move the
  overlay's existing subset-point logic here; it already resolves ids into
  full-Line lane indices.

```ts
import type { LineCode, Point } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import type { Layout } from '../geo/layout';

export interface LineRange { line: LineCode; from: number; to: number }
export interface DirectedRange extends LineRange { reverse: boolean }
export type TrackLanes = ReadonlyMap<LineCode, readonly Point[]> | null;

export function rangeIds(net: NetworkIndex, r: LineRange): string[] {
  return net.lines.get(r.line)!.stations.slice(r.from, r.to + 1);
}

export function rangeStations(net: NetworkIndex, ranges: readonly LineRange[]): Set<string> {
  return new Set(ranges.flatMap((r) => rangeIds(net, r)));
}

export function trackPoints(net: NetworkIndex, layout: Layout, tracks: TrackLanes,
  line: LineCode, ids: readonly string[]): Point[] {
  const lane = tracks?.get(line);
  return ids.flatMap((id) => {
    const index = net.order.get(line)?.get(id);
    const p = index === undefined ? layout.get(id) : lane?.[index] ?? layout.get(id);
    return p ? [p] : [];
  });
}

export function linePoints(net: NetworkIndex, layout: Layout, tracks: TrackLanes,
  line: LineCode, ids: readonly string[]): string {
  return trackPoints(net, layout, tracks, line, ids).map((p) => `${p.x},${p.y}`).join(' ');
}

export function rangeAdditions(net: NetworkIndex, before: readonly LineRange[],
  after: readonly LineRange[]): DirectedRange[] {
  const stations = rangeStations(net, before);
  return after.flatMap((r): DirectedRange[] => {
    const old = before.find((p) => p.line === r.line);
    if (!old) {
      const ids = rangeIds(net, r);
      return [{ ...r, reverse: stations.has(ids[ids.length - 1]!) && !stations.has(ids[0]!) }];
    }
    const added: DirectedRange[] = [];
    if (r.from < old.from) added.push({ line: r.line, from: r.from, to: old.from, reverse: true });
    if (r.to > old.to) added.push({ line: r.line, from: old.to, to: r.to, reverse: false });
    return added;
  });
}
```

Inputs are trusted engine ranges with one range per Line, growing monotonically;
no additional validation framework is needed. Keep coordinates from the full
network layout, which has every Station point.

In `DispatchOverlay.tsx`, delete the local `linePoints`, import this shared
function, and use it for offers too:

```tsx
const points = linePoints(net, layout, tracks, offer.line, ids);
```

- [x] **Step 4 — Run green:** `npx vitest run src/render/trackRanges.test.ts src/render/dispatchLayout.test.ts src/render/dispatchReadability.test.ts src/ui/Dispatcher.test.tsx`.
  Expected: all pass, including existing Incident/wave rendering.
- [x] **Step 5 — Commit:** `git add src/render/trackRanges.ts src/render/trackRanges.test.ts src/render/DispatchOverlay.tsx`, then `git commit -m "refactor: share lane-aware track subsets and range differences"`.

## Task 2: Static served-range rendering (F15)

**Files:** Modify `src/render/MapCanvas.tsx`, `src/render/MapCanvas.test.tsx`,
`src/ui/DispatcherScreen.tsx`, `src/ui/Dispatcher.test.tsx`.

- [x] **Step 1 — Add failing rendering tests.** Extend the real-render
  `MapCanvas` tests with these checks:

```tsx
const { container } = render(<MapCanvas net={net} layout={layout}
  visited={new Set()} activeStation={null}
  emphasisRanges={[{ line: 'KJ', from: 4, to: 17 }]} />);
const ids = net.lines.get('KJ')!.stations;
expect(container.querySelector('polyline[data-line="KJ"]')?.getAttribute('data-dim')).toBe('true');
expect(container.querySelector('polyline[data-served-line="KJ"]')?.getAttribute('points'))
  .toBe(ids.slice(4, 18).map((id) => layout.get(id)!).map((p) => `${p.x},${p.y}`).join(' '));
for (const i of [4, 17]) {
  expect(container.querySelector(`[data-station="${ids[i]}"]`)?.getAttribute('data-dim')).toBeNull();
}
for (const i of [3, 18]) {
  expect(container.querySelector(`[data-station="${ids[i]}"]`)?.getAttribute('data-dim')).toBe('true');
}
```

Add a lane-enabled AG-only range test: SP stays a faded base even at an active
shared Station. Assert labels and Interchange cores share the Station's dim
state. Render `emphasisRanges={[]}` to require a fully faded network, distinct
from absent/null props. Keep the existing seven-base-polylines and emphasis
tests unchanged for ordinary callers.

- [x] **Step 2 — Run red:** `npx vitest run src/render/MapCanvas.test.tsx`.
  Expected: new served-track assertions fail.
- [x] **Step 3 — Add the optional prop and rendering branch.** Import
  `LineRange`, `linePoints`, `rangeIds`, `rangeStations`; remove the local
  helper which ignored subsets when lanes existed.

```ts
// MapCanvasProps; default null in the component parameter list.
emphasisRanges?: readonly LineRange[] | null;

const rangeMode = emphasisRanges !== null;
const servedMarks = useMemo(() => emphasisRanges === null ? null
  : rangeStations(net, emphasisRanges), [net, emphasisRanges]);
const pointsFor = (code: LineCode, ids: readonly string[]) =>
  linePoints(net, layout, tracks, code, ids);
```

When range mode is set, all existing full-Line base polylines are dimmed; add
bright polylines with `data-served-line` for the ranges. Retain the existing
whole-Line branch, glow and home entrance when range mode is absent. The
Station dim condition gives range membership priority:

```ts
const dim = servedMarks !== null
  ? (servedMarks.has(station.id) ? undefined : 'true')
  : ((emphasis && !codes.includes(emphasis)) ||
      (emphasisSet && !codes.some((c) => emphasisSet.has(c))) ? 'true' : undefined);
```

Use this same `dim` for marks, cores and the existing label dim map. Draw range
track with the existing Line colour, width 6, round joins/caps and non-scaling
stroke. Do not emit a polyline with fewer than two points.

```tsx
{emphasisRanges?.map((r) => r.from < r.to && <polyline
  key={`${r.line}:${r.from}-${r.to}`} data-served-line={r.line}
  points={pointsFor(r.line, rangeIds(net, r))}
  fill="none" stroke={net.lines.get(r.line)!.colour} strokeWidth={6}
  vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
```

In Dispatcher, replace `emphasisSet={lessonLines ?? lines}` with
`emphasisRanges={lesson?.career.served ?? run.served}`. Remove only the unused
`lessonLines` memo, keeping `lines` for ShiftBar counts. Preserve closure marks.

- [x] **Step 4 — Run green:** `npx vitest run src/render/MapCanvas.test.tsx src/ui/Dispatcher.test.tsx src/ui/HomeMap.test.tsx src/ui/LineRunScreen.test.tsx src/ui/QuickRunScreen.test.tsx src/ui/RushHour.test.tsx`.
  Expected: all pass; Dispatcher no longer brightens whole served Lines.
- [x] **Step 5 — Commit:** stage these four files; `git commit -m "feat: paint only Dispatcher served track and Stations"`.

## Task 3: Reveal timing constrained to the complete window

**Files:** Create `src/render/trackReveal.ts`, `src/render/trackReveal.test.ts`.

- [x] **Step 1 — Test the timing contract.** For a directed KJ range with
  deliberately unequal adjacent coordinate distances, assert the first new
  Station's delay is based on cumulative distance through the offset path,
  rather than Station index. Use this test shape:

```ts
const duration = 800;
const drawMs = duration - 320;
const delay = timeToReach(distanceToStation / completePathLength) * drawMs;
expect(timing.station.get(stationId)).toBeCloseTo(delay, 5);
expect(timing.total).toBe(duration);
for (const at of timing.station.values()) expect(at + 320).toBeLessThanOrEqual(duration);
expect(timing.station.has(existingAnchor)).toBe(false);
```

Build the distances with `Math.hypot` from known test coordinates, not by
calling the production timing helper. Add reversed-path, duplicate-Interchange
(earliest arrival wins), zero-length-path (finite timings), and 1,000 ms entry
tests. Newly served ids are `afterStations − beforeStations`.

- [x] **Step 2 — Run red:** `npx vitest run src/render/trackReveal.test.ts`.
  Expected: missing module/export failure.
- [x] **Step 3 — Implement this public contract and distance calculation.**

```ts
export interface TrackReveal {
  id: number;
  before: readonly LineRange[];
  segments: readonly DirectedRange[];
  stations: ReadonlySet<string>;
  duration: number;
}
export interface TrackRevealTiming {
  draw: number;
  station: ReadonlyMap<string, number>;
  total: number;
}
export function trackRevealTiming(net: NetworkIndex, layout: Layout,
  tracks: TrackLanes, reveal: TrackReveal): TrackRevealTiming {
  const draw = Math.max(0, reveal.duration - 320);
  const station = new Map<string, number>();
  for (const segment of reveal.segments) {
    const ids = rangeIds(net, segment);
    if (segment.reverse) ids.reverse();
    const points = trackPoints(net, layout, tracks, segment.line, ids);
    let length = 0;
    const cumulative = points.map((p, i) => {
      if (i > 0) length += Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y);
      return length;
    });
    ids.forEach((id, i) => {
      if (!reveal.stations.has(id)) return;
      const at = timeToReach(length > 0 ? cumulative[i]! / length : 0) * draw;
      station.set(id, Math.min(station.get(id) ?? Infinity, at));
    });
  }
  return { draw, station, total: reveal.duration };
}
```

Imports: range types/helpers from Task 1, `NetworkIndex`, `Layout`, and
`timeToReach` from `src/render/entrance.ts`. All layout points are present in
the validated network. Do not change the existing home timing constants.

- [x] **Step 4 — Run green:** `npx vitest run src/render/trackReveal.test.ts src/render/entrance.test.ts`.
  Expected: both timing suites pass with no home entrance changes.
- [x] **Step 5 — Commit:** stage the new helper/test; `git commit -m "feat: time partial track reveals by path distance"`.

## Task 4: Render only the changing track and Station pops

**Files:** Modify `src/render/MapCanvas.tsx`, `src/render/MapCanvas.test.tsx`,
`src/render/map.css` only if new selectors are needed.

- [x] **Step 1 — Add failing DOM behavior tests.** Supply target ranges plus a
  `TrackReveal` with a known before range and one extension. Assert the static
  bright path covers only the before range, the animated path contains the old
  endpoint and only the added tail, and the new Station has a pop delay. Existing
  Stations have no pop. Capture the animated DOM node, rerender with the same
  reveal id and different layout/zoom, and assert node identity is unchanged.
  Rerender with `trackReveal={null}` and assert one complete settled served path
  replaces the temporary pieces, with no remaining `data-draw` or `data-pop`.

```tsx
const reveal: TrackReveal = { id: 1, before: [{ line: 'KJ', from: 4, to: 17 }],
  segments: [{ line: 'KJ', from: 17, to: 20, reverse: false }],
  stations: new Set(net.lines.get('KJ')!.stations.slice(18, 21)), duration: 800 };
expect(animated.getAttribute('pathLength')).toBe('1');
expect(animated.style.getPropertyValue('--draw-dur')).toBe('480ms');
expect(container.querySelector('g[data-labels]')?.getAttribute('data-pop')).toBeNull();
```

Use a second fixture with `reverse: true` to assert reversed point order, and
an entry fixture with `before: []` to assert no bright static path underneath.

- [x] **Step 2 — Run red:** `npx vitest run src/render/MapCanvas.test.tsx`.
  Expected: temporary reveal path/pop assertions fail.
- [x] **Step 3 — Add optional `trackReveal?: TrackReveal | null`.** Compute
  timings from Task 3. The static range layer becomes
  `trackReveal?.before ?? emphasisRanges`; membership remains the target
  `emphasisRanges`. Append directed animated segments after static track:

```tsx
{trackReveal?.segments.map((r) => {
  const ids = rangeIds(net, r);
  if (r.reverse) ids.reverse();
  return ids.length < 2 ? null : <polyline
    key={`reveal:${trackReveal.id}:${r.line}:${r.from}-${r.to}`}
    data-reveal-line={r.line} data-draw="true" pathLength={1}
    points={pointsFor(r.line, ids)} fill="none"
    stroke={net.lines.get(r.line)!.colour} strokeWidth={6}
    vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
    style={{ '--draw-delay': '0ms', '--draw-dur': `${revealTiming!.draw}ms`,
      '--draw-ease': DRAW_EASE.css } as React.CSSProperties} />;
})}
```

For each Station, prefer the partial timing over the existing entrance timing:

```ts
const pop = trackReveal ? revealTiming?.station.get(station.id)
  : entrance?.station.get(station.id);
```

Apply its timing to that Station's mark/core and newly served label only.
Keep the old home entrance's global furniture/label delay tied exclusively to
`entrance`. Keep stable keys independent of points, camera or elapsed time.
Reuse existing CSS keyframes. Do not introduce a whole-network overlay entrance.

- [x] **Step 4 — Run green:** `npx vitest run src/render/MapCanvas.test.tsx src/render/trackReveal.test.ts src/ui/HomeMap.test.tsx src/ui/Dispatcher.test.tsx`.
  Expected: no new-layer behavior leaks to whole-Line callers.
- [x] **Step 5 — Commit:** stage renderer/test/CSS changes; `git commit -m "feat: draw only newly served track during network reveals"`.

## Task 5: UI reveal controller with a synchronous deadline gate

**Files:** Create `src/ui/useDispatchReveal.ts`, `src/ui/useDispatchReveal.test.tsx`.

Keep this hook independent of `CareerState`, recording and sound. Consume the
range helpers and `TrackReveal` contracts from Tasks 1/3. Test it with fake
timers and a controlled `performance.now()`.

- [x] **Step 1 — Write failing hook tests for these exact public contracts.**

```ts
export const DISPATCH_ENTRY_MS = 1_000;
export const DISPATCH_EXPANSION_MS = 800;
export interface RevealEvent {
  id: number;
  kind: 'entry' | 'expansion';
  until: number;
  track: TrackReveal;
}
export interface DispatchRevealControls {
  event: RevealEvent | null;
  joining: LineCode | null;
  /** Last accepted new-Line event, stable even when reduced motion skips its draw. */
  celebration: { id: number; line: LineCode } | null;
  /** Settles an elapsed deadline first; true only while typing must be discarded. */
  blocksInput(): boolean;
  beginExpansion(before: readonly LineRange[], after: readonly LineRange[]): void;
  clearNotice(): void;
  cancel(): void;
}
export function useDispatchReveal(net: NetworkIndex, starting: readonly LineRange[],
  entry: boolean, onEntryDone: () => void): DispatchRevealControls;
```

Required assertions: entry blocks through 999 ms and finishes at 1,000 ms;
completion calls `onEntryDone` exactly once under StrictMode; new-Line event
sets `joining` and `celebration`; extension sets neither; unchanged ranges
create no event; reduced motion skips input wait but retains new-Line notice
and celebration; preference change ends the current wait; `cancel`/unmount
clear the timer; rerenders do not extend deadlines or allocate new ids.

```tsx
let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);
const taught = vi.fn();
const { result } = renderHook(() => useDispatchReveal(net, start, true, taught));
expect(result.current.blocksInput()).toBe(true);
now = 999;
expect(result.current.blocksInput()).toBe(true);
now = 1_000;
act(() => { expect(result.current.blocksInput()).toBe(false); });
expect(taught).toHaveBeenCalledTimes(1);
act(() => { expect(result.current.blocksInput()).toBe(false); });
expect(taught).toHaveBeenCalledTimes(1);
```

The last check must work **without firing the completion timer**, proving
background throttling cannot leave input locked after the deadline.

- [x] **Step 2 — Run red:** `npx vitest run src/ui/useDispatchReveal.test.tsx`.
  Expected: missing hook failure.
- [x] **Step 3 — Implement a ref-backed controller, then publish React state.**
  Keep authoritative event, next id and pending entry-completion flag in refs.
  `setState` receives values; no timers, callbacks or sound inside updaters.
  Build every track event with:

```ts
const segments = rangeAdditions(net, before, after);
const oldStations = rangeStations(net, before);
const stations = new Set([...rangeStations(net, after)].filter((id) => !oldStations.has(id)));
const track: TrackReveal = { id, before, segments, stations, duration };
const event: RevealEvent = { id, kind, until: performance.now() + duration, track };
```

`beginExpansion` synchronously changes the authoritative ref before returning;
it allocates nothing if `segments.length === 0`. Capture first joining Line
by comparing before/after Line codes; normal engine actions add at most one.
Store its notice and celebration even if reduced motion suppresses `event`.

Completion must atomically clear the current event and pending entry flag
**before** invoking the current `onEntryDone` callback. Both the timer and
`blocksInput` use the same completion operation:

```ts
const blocksInput = () => {
  const current = eventRef.current;
  if (current && !reducedRef.current && performance.now() < current.until) return true;
  finish(); // Clears the ref first; invokes entry callback once, if pending.
  return false;
};
```

Here `finish` is a private hook callback, not an engine function. When starting
entry, install its event in the lazy initial state so no ready screen flashes.
For reduced motion, install no event but finish pending entry from a layout
effect, never during render. `cancel` clears event, pending callback, notice and
celebration; a normal finish keeps the notice/celebration until cleared.

Observe `matchMedia('(prefers-reduced-motion: reduce)')` changes with proper
listener cleanup. A completion effect schedules only the remaining deadline;
on cleanup cancel its timer, but do not erase the event or mark completion
lost (StrictMode replays setup). `clearNotice` removes notice/celebration only.

- [x] **Step 4 — Run green:** `npx vitest run src/ui/useDispatchReveal.test.tsx`.
  Expected: all deadline, cancellation and StrictMode assertions pass.
- [x] **Step 5 — Commit:** stage hook/tests; `git commit -m "feat: control Dispatcher reveal deadlines outside the Career"`.

## Task 6: Entry → lesson → ready, with discarded typing (F4)

**Files:** Modify `src/ui/DispatcherScreen.tsx`, `src/ui/Dispatcher.test.tsx`,
`src/ui/dispatch.css`.

- [x] **Step 1 — Add failing first-entry integration tests.** Extend the
  existing "The guided first Shift" group, preserving its post-entry coverage.
  Use a `finishEntry()` test helper that advances both the fake clock and
  timers by `DISPATCH_ENTRY_MS`, then flushes React effects.

```tsx
// renderFresh already uses lessonFor, so it includes entry.
renderFresh();
expect(mapProps().trackReveal?.duration).toBe(1_000);
expect(mapProps().fitKey).not.toBe('dispatch:lesson');
type('Jelatek');
expect(loadProfile().dispatchTipsSeen ?? []).not.toContain('lesson');
expect(screen.queryByText(/Type Jelatek to send it on/)).toBeNull();
finishEntry();
expect(mapProps().fitKey).toBe('dispatch:lesson');
expect(screen.getByText(/Type Jelatek to send it on/)).toBeTruthy();
```

Use the existing pass-through judge spy/recorded-evidence pattern to verify
the ignored characters never enter evidence; UI appearance alone is not
enough. Test Enter, Backspace and Space too. Add returning-player entry →
ready, Escape during entry exits without marking lesson seen, Again creates a
fresh reveal, reduced motion has no wait, and `initial` bypasses only entry.
Existing lesson tests should explicitly finish entry before typing, rather
than globally disabling entry in all tests.

- [x] **Step 2 — Run red:** `npx vitest run src/ui/Dispatcher.test.tsx src/ui/App.test.tsx`.
  Expected: entry/order/input assertions fail.
- [x] **Step 3 — Wire explicit lesson start and the controller.** Pass `false`
  as the lesson's automatic-start flag. Freeze whether a lesson is owed in a
  ref at mount. In the controller's one-shot completion callback, create the
  lesson at that moment and update the synchronous routing ref:

```ts
const lessonDue = useRef(initial === undefined && !seenTips.current.has(LESSON_SEEN));
const reveal = useDispatchReveal(net, run.served, initial === undefined, () => {
  if (!lessonDue.current) return;
  lessonDue.current = false;
  startLesson();
  inLesson.current = true;
});
```

Declare `inLesson` and the lesson controls before calling the reveal hook.
The existing `startLesson()` already updates its private current-lesson ref
synchronously. This matters if a first accepted key itself settles a throttled
entry timer: it must be routed to the freshly created lesson on that key,
rather than starting the real Career.

Place this guard immediately after the existing phone/ended checks and before
tips, lesson handling, start-tip marking, actions and recorder calls:

```ts
if (reveal.blocksInput()) {
  if (key === 'Escape' && cur.startedAt === null) onExit();
  return;
}
```

Render `trackReveal={reveal.event?.track ?? null}` on the map. During entry
there is no lesson yet, so range emphasis/frame naturally use the Career.
While `event !== null`, replace `TypingLine`/start caption with
`<p role="status">Opening the network…</p>` and hide How to play. Keep exit
controls in place. Cancelling on exit/retirement must run before navigation.

Keep the game input handler registered during the reveal so it drains phone
input bursts instead of leaving text to be delivered later. Keep the existing
focused-button shield and `ConfirmEndButton`'s click/tap-only confirmation;
do not change its keyboard policy. Add tests that Escape exits during entry,
pointer activation still opens/answers End Career during an Expansion reveal,
and Enter/Space cannot accidentally activate a focused button.

Return stable controller methods from the hook. Add `blocksInput` to `onKey`'s
dependency list, and `beginExpansion`/`cancel` to `act`'s dependency list when
they are used. Destructure these methods rather than depending on a newly
allocated controls object in each callback.

- [x] **Step 4 — Run green:** `npx vitest run src/ui/Dispatcher.test.tsx src/ui/App.test.tsx src/ui/TypingInputProvider.test.tsx src/engine/dispatchLesson.test.ts`.
  Expected: existing lesson behavior remains after the explicit entry window;
  the lesson clock is created after entry, with no silent advance.
- [x] **Step 5 — Commit:** stage screen/tests/CSS; `git commit -m "feat: reveal each Dispatcher Career before its guided lesson"`.

## Task 7: Expansion reveal, persistent Line notice and additive chime (F19)

**Files:** Modify `src/ui/DispatcherScreen.tsx`, `src/ui/Dispatcher.test.tsx`,
`src/ui/dispatch.css`, `src/audio/sound.ts`, `src/audio/sound.test.ts`;
create `src/ui/DispatchNetworkNotice.tsx`, `src/ui/DispatchNetworkNotice.test.tsx`.

- [x] **Step 1 — Add failing expansion/notice/sound tests.** Reuse real
  `DispatchExpansion` buttons and the existing `offerAt` fixture. Assert one
  accepted choice installs the reveal before the next key; typing for the
  first 799 ms changes no aim/clock/evidence; the 800 ms boundary accepts input.
  Assert the same for a typed choice followed immediately by another letter.
  An extension has no new-Line notice/chime; a new Line has exactly one.

```tsx
fireEvent.click(screen.getByRole('button', { name: /Ampang/ }));
expect(mapProps().trackReveal?.duration).toBe(800);
expect(screen.getByRole('status', { name: 'New Line' }).textContent)
  .toContain('Ampang');
expect(vi.mocked(sound.lineOpen)).toHaveBeenCalledTimes(1);
expect(within(screen.getByRole('banner', { name: 'Shift' }))
  .getByText('Lines').nextElementSibling!.textContent).toContain('+1');
```

Add the AG→SP shared-track fixture from Task 1 as a real accepted offer: no
new Station pop, but a new track reveal and +1 Line notice. Also test full
network Continue, StrictMode effect replay, resizing/rerendering, muted sound,
retirement while revealing, and notice removal only when the Shift starts.
Update existing F17/growth and typed-Expansion tests to explicitly advance
the 800 ms reveal before their next Shift key. Add `vi.spyOn(sound, 'lineOpen')`
to the screen suite's sound-spy setup and reset it with the other spies.

- [x] **Step 2 — Run red:** `npx vitest run src/ui/Dispatcher.test.tsx src/ui/DispatchNetworkNotice.test.tsx src/audio/sound.test.ts`.
  Expected: missing notice/cue and Expansion reveal assertions fail.
- [x] **Step 3 — Begin the UI reveal only for an accepted expand action.**
  In `act`, after the engine has returned a distinct next state and before
  publishing it, call the controller in the same event batch:

```ts
if (next === prev) return;
if (body.a === 'expand') reveal.beginExpansion(prev.served, next.served);
// Preserve the existing action evidence append and commit, in their order.
```

Preserve the complete-network `Continue` action/evidence even though its range
diff is empty. A stale/refused choice must not start a reveal. If an action ends
the Career, call `reveal.cancel()` before committing/navigating.

Keep the synchronous guard from Task 6 ahead of recorder/tip paths for these
events too. After `enterDispatchCharacter` returns a ready → running
transition, clear the notice; do not clear it for ignored keys or Backspace.
Keep F17 counts on the accepted next network. Their existing +N lifetime
remains until that same first accepted Shift key.

- [x] **Step 4 — Implement the small notice and cue.**

```tsx
import type { LineCode } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import { LineBadge } from './LineBadge';

export function DispatchNetworkNotice({ net, line }: { net: NetworkIndex; line: LineCode }) {
  const joined = net.lines.get(line)!;
  return <div className="dispatch-network-notice" role="status" aria-label="New Line">
    <LineBadge code={joined.code} colour={joined.colour} />
    <span>{joined.name} joins the network</span>
  </div>;
}
```

Render it above the opening/idle prompt when `reveal.joining` exists, keyed by
`reveal.celebration.id` so its pop happens once. Use the panel background token
and normal document flow, with a 240 ms scale/opacity pop. Under
`prefers-reduced-motion: reduce`, set its animation to none. No fixed overlay,
camera move, focus call or separate dismissal button.

Add to the existing `sound` object:

```ts
lineOpen: () => play(({ complete }) => {
  ['D5', 'A5', 'D6'].forEach((note, i) => {
    complete.triggerAttackRelease(note, 0.12, `+${(i * 0.11).toFixed(2)}`);
  });
}),
```

In the screen, an effect deduplicates by the stable celebration id; sound
never runs inside a state updater. Because reduced motion has no draw event,
observe `celebration`, not `event`, for the chime:

```ts
const heardLine = useRef<number | null>(null);
useEffect(() => {
  const cue = reveal.celebration;
  if (!cue || heardLine.current === cue.id) return;
  heardLine.current = cue.id;
  if (document.visibilityState !== 'hidden') sound.lineOpen();
}, [reveal.celebration]);
```

Add `lineOpen` to the existing sound test's pre-unlock, unlocked and muted
cases; assert its three specific notes/scheduled offsets when unlocked. Notice
tests assert the Line code and full name, accessibility status, and no focus
change. Both ordinary and reduced-motion new-Line actions still chime once.

- [x] **Step 5 — Run green:** `npx vitest run src/ui/Dispatcher.test.tsx src/ui/DispatchNetworkNotice.test.tsx src/ui/useDispatchReveal.test.tsx src/audio/sound.test.ts src/render/dispatchReadability.test.ts`.
  Expected: all new-Line, extension and evidence assertions pass.
- [x] **Step 6 — Commit:** stage these files; `git commit -m "feat: reveal Expansions and celebrate newly joined Lines"`.

## Task 8: Full verification, browser evidence and tracker handoff

**Files:** Update `docs/superpowers/dispatcher-playtest-2-feedback.md`,
`docs/superpowers/dispatcher-handover.md` and this plan's completed checkboxes.
Touch application files only to correct a demonstrated failure of this spec.

- [x] **Step 1 — Run the full automated gates once focused tests pass:**

```bash
npm test
npm run build
git diff --check
```

Expected: all suites pass; TypeScript and production Vite build succeed; no
whitespace errors. Run failures through diagnosis before changing expectations.
No balance survey is required because there are no simulation changes.

- [x] **Step 2 — Start the app:** `npm run dev -- --host 127.0.0.1`.
  Use the browser tool's documented UI controls and a disposable local profile.
  Save and restore profile values before changing tips; never clear a real
  player's profile/leaderboard to prepare a screenshot.

- [x] **Step 3 — Verify these browser scenarios at normal motion.**

  The browser pass is complete with bounded coverage, recorded separately from
  automated-only checks in the [verification record](../dispatcher-network-reveal-verification.md).
  The table remains the intended manual matrix; a checked step does not claim
  every row was observed live. True hidden-tab lifecycle, valid ranked
  retirement and the remaining flow regressions retain automated coverage.

| Scenario | Required observation |
|---|---|
| First-ever Career | Served KJ only draws for 1 s; other track stays faded; lesson starts after it; typing during entry does nothing. |
| Returning Career and Again | Entry runs again; a seen lesson does not auto-start; Again gives a new event. |
| Lesson finish/Skip/How to play | No second Career entrance; correct zoom/caption and train movement; no accumulated entry time. |
| Extension at each end | Only added track draws outward; no gap at the old endpoint; existing Stations do not repop; no Line chime. |
| First new Line | Only its served stretch draws; Line code/name notice pops within 800 ms; one chime; +counts agree. |
| AG/SP shared track | Faded unserved lane, preview, animated addition, resting track and existing overlays use the same offsets; zero-new-Station addition still celebrates. |
| Start typing immediately after choice | No first-letter leak during 800 ms; clock starts on the next accepted key; badge/+N then disappear. |
| Back/End Career during reveal | Buttons stay usable; no orphan timer, late lesson, stray chime or unranked between-Shift retirement. |
| Tab hidden past deadline | Return settles immediately; no replayed animation/chime; next key routes to lesson or Shift correctly. |
| Pan, resize, camera fitting, rerender | No animation restart, duplicate chime or whole-Line flash. |
| Existing closure and Green wave | Closure X/card/gauge stay intact; wave timing unchanged. |
| Other modes and home | Whole-Line emphasis, home draw-on and return-to-home behavior remain as before. |

- [x] **Step 4 — Check reduced motion and layout.** With reduced motion set
  before entry and toggled during a reveal, verify settled track and immediate
  typing, no pop/draw, visible notice, and one optional sound. Verify both themes
  at 1440×900, 1024×768 and 390×844 portrait; check the notice and opening status
  stay inside the panel, the Shift bar/growth counts remain readable, and chips
  do not hide under the enlarged panel. Phone landscape retains its existing
  block. Verify Escape exits during entry, pointer-operated End Career remains
  usable during an Expansion reveal, and game Enter/Space cannot activate a
  focused button or confirm retirement.

  Browser layout checks found narrow Shift-bar overflow and verified CSS fix
  `9d98057` at 390 px (both growth deltas and the closure gauge) and 1024 px
  (one-line bar); notice checks also covered 1440 px and both themes. Native
  audible audio, live OS reduced-motion toggling and a real phone keyboard
  were not observed. Reduced-motion mount/change and no-JavaScript-wait
  behavior passed automated tests; the record preserves those limits.

- [x] **Step 5 — Record evidence and close the group.** Add observed results,
  screenshots/recording paths and any unverified audio/device behavior to the
  tracker. Set F15/F4/F19 to `done <implementation commit>` only after their
  checks pass; tick the related improvements that were actually implemented.
  Link this spec/plan from the handover without claiming the branch was merged.
  Keep F23 and other excluded items open. Add these playtest-3 checks: does entry
  feel worth its wait, is expansion direction clear, is the new-Line moment
  noticeable, and is the fixed input wait comfortable?

- [x] **Step 6 — Commit verification docs:** stage the tracker, handover and
  completed plan; `git commit -m "docs: record Dispatcher network reveal verification"`.

## Self-review coverage map

| Approved requirement | Tasks |
|---|---|
| Inclusive served geometry, marks/labels, faded tails | 1, 2 |
| Shared-track lanes and dashed previews | 1, 2, 4, 8 |
| Directed additions, zero-new-Station Line, no-op Continue | 1, 5, 7 |
| Distance-timed pops inside fixed windows | 3, 4 |
| Every Career before lesson; lesson/How to play handoff | 5, 6 |
| Discard typing, untouched clock/evidence, deadline race | 5, 6, 7 |
| New-Line badge/chime; F17 lifetime; silent/reduced-motion path | 5, 7, 8 |
| StrictMode, cleanup, hidden tabs, dynamic reduced motion | 5, 6, 7, 8 |
| Existing callers, closures, wave and engine behavior | 2, 4, 8 |

Code examples specify the implementation shape. Completion and verification
are recorded by the checkboxes above and the feedback tracker.
