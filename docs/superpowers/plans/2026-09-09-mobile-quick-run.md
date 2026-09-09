# Mobile Quick Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliable 45-second Quick Run and a fixed-viewport phone presentation while preserving the existing desktop game.

**Architecture:** Implement Quick Run as an independent pure engine rather than extending the existing generic `RunState`. A persistent input provider converts a real mobile text input or desktop key events into the same character stream. Phone-only presentation components share the existing network, map, Profile, Line Run, Adventure, and Ranking behavior with desktop.

**Tech Stack:** React 18, TypeScript, Vite 5, Vitest, Testing Library, CSS, browser `visualViewport`, `matchMedia`, and `localStorage`.

---

## Scope and file map

This is one connected vertical slice: the Quick Run rules, native keyboard,
fixed viewport, setup UI, and Summary are only useful when wired together. Keep
it in one plan, but commit each boundary independently.

**Create**

- `src/engine/quickRun.ts` — pure Quick Run state and transitions.
- `src/engine/quickRun.test.ts` — deterministic route, timing, input, and metric tests.
- `src/ui/usePhoneLayout.ts` — phone breakpoint subscription.
- `src/ui/usePhoneLayout.test.ts` — breakpoint behavior.
- `src/ui/useVisualViewport.ts` — visual viewport height and keyboard signal.
- `src/ui/useVisualViewport.test.ts` — viewport subscription and fallback.
- `src/ui/TypingInputProvider.tsx` — persistent native input, focus controls, and game-input hook.
- `src/ui/TypingInputProvider.test.tsx` — native input, repeated characters, composition, and desktop fallback.
- `src/ui/MobileShell.tsx` — fixed-height destination shell and bottom navigation.
- `src/ui/MobileShell.test.tsx` — navigation and viewport-height behavior.
- `src/ui/MobileDrawer.tsx` — controlled compact/expanded drawer.
- `src/ui/MobileDrawer.test.tsx` — explicit two-state behavior.
- `src/ui/MobileTransit.tsx` — phone map, Line pills, Direction, and Run actions.
- `src/ui/MobileTransit.test.tsx` — selection, persistence, ordering, and callbacks.
- `src/ui/MobileAdventureSetup.tsx` — resume and starting-Station setup.
- `src/ui/MobileAdventureSetup.test.tsx` — no auto-resume and explicit starts.
- `src/ui/QuickRunScreen.tsx` — Quick Run orchestration and map presentation.
- `src/ui/QuickRunScreen.test.tsx` — clock, visibility, persistence, and keyboard recovery.
- `src/ui/QuickRunSummary.tsx` — compact Quick-specific Summary.
- `src/ui/QuickRunSummary.test.tsx` — completed/interrupted result presentation.
- `src/ui/mobile.css` — phone shell, drawer, Run, Summary, and safe-area styles.

**Modify**

- `src/engine/progress.ts` and `src/engine/progress.test.ts` — additive Quick best and selected-Line persistence.
- `src/ui/useKeyboard.ts` — remains the desktop event primitive; document that mobile input enters through the provider.
- `src/ui/App.tsx` and `src/ui/App.test.tsx` — responsive routing and Quick Run destination.
- `src/ui/HomeMap.tsx` and `src/ui/HomeMap.test.tsx` — desktop Quick Run entry.
- `src/ui/DirectionChooser.tsx` and `src/ui/DirectionChooser.test.tsx` — optional Quick action for desktop.
- `src/ui/LineRunScreen.tsx` and `src/ui/LineRunScreen.test.tsx` — shared input bridge.
- `src/ui/AdventureScreen.tsx` and `src/ui/AdventureScreen.test.tsx` — shared input bridge and touch `Turn around`.
- `src/ui/JunctionPicker.tsx` and `src/ui/JunctionPicker.test.tsx` — shared input and synchronous mobile refocus.
- `src/ui/LeaderboardScreen.tsx` and `src/ui/LeaderboardScreen.test.tsx` — embeddable phone destination.
- `src/index.css` — root scroll lock and deletion of the interim mobile dock rules superseded by `mobile.css`.

Do not start a mockup or development server during implementation. Automated
verification is `npm test` and `npm run build`; the real-iPhone gate happens
against the shipped build using the design spec's evaluation record.

### Task 1: Add additive Profile fields and helpers

**Files:**
- Modify: `src/engine/progress.ts`
- Modify: `src/engine/progress.test.ts`

- [ ] **Step 1: Write failing Profile tests**

Add imports for `recordQuickBest` and `saveSelectedLine`, then add:

```ts
describe('Quick Run progress', () => {
  it('gives old profiles safe Quick Run defaults', () => {
    const old = { ...emptyProfile() } as Record<string, unknown>;
    delete old.quickBest;
    delete old.lastSelectedLine;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));

    expect(loadProfile().quickBest).toEqual({});
    expect(loadProfile().lastSelectedLine).toBeUndefined();
  });

  it('sanitizes malformed new fields without losing old progress', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyProfile(),
      visited: ['imbi'],
      quickBest: 'broken',
      lastSelectedLine: 'NOPE',
    }));

    const loaded = loadProfile();
    expect(loaded.visited).toEqual(['imbi']);
    expect(loaded.quickBest).toEqual({});
    expect(loaded.lastSelectedLine).toBeUndefined();
    expect(loaded.recovered).toBeUndefined();
  });

  it('keeps only a higher Quick Run score for each Line', () => {
    let profile = recordQuickBest(emptyProfile(), 'KJ', 120);
    profile = recordQuickBest(profile, 'KJ', 90);
    profile = recordQuickBest(profile, 'MR', 75);

    expect(profile.quickBest).toEqual({ KJ: 120, MR: 75 });
  });

  it('persists the last selected Line without disturbing progress', () => {
    const profile = saveSelectedLine(
      { ...emptyProfile(), visited: ['imbi'] },
      'PY',
    );
    expect(profile.lastSelectedLine).toBe('PY');
    expect(profile.visited).toEqual(['imbi']);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/engine/progress.test.ts`

Expected: FAIL because `quickBest`, `recordQuickBest`, and `saveSelectedLine` do not exist.

- [ ] **Step 3: Add safe defaults, migration, and immutable helpers**

In `progress.ts`, import `LINE_CODES` with `LineCode`, add the fields, and replace
the direct migration spread for these fields:

```ts
import { LINE_CODES, type LineCode } from '../data/types';

export interface Profile {
  version: number;
  visited: string[];
  bestWpm: Record<string, number>;
  adventure: AdventurePosition | null;
  rushHigh: Record<string, number>;
  muted: boolean;
  theme?: Theme;
  wpmHistory: { t: number; wpm: number }[];
  quickBest: Partial<Record<LineCode, number>>;
  lastSelectedLine?: LineCode;
  recovered?: boolean;
}

export function emptyProfile(): Profile {
  return {
    version: SCHEMA_VERSION,
    visited: [],
    bestWpm: {},
    adventure: null,
    rushHigh: {},
    muted: false,
    wpmHistory: [],
    quickBest: {},
  };
}

function isLineCode(value: unknown): value is LineCode {
  return typeof value === 'string' && LINE_CODES.includes(value as LineCode);
}

function cleanQuickBest(value: unknown): Partial<Record<LineCode, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(
    LINE_CODES.flatMap((code) => {
      const score = raw[code];
      return typeof score === 'number' && Number.isFinite(score) && score >= 0
        ? [[code, score]]
        : [];
    }),
  ) as Partial<Record<LineCode, number>>;
}

function migrate(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Partial<Profile>;
  if (rec.version !== SCHEMA_VERSION) return null;
  const migrated = { ...emptyProfile(), ...rec, version: SCHEMA_VERSION };
  migrated.quickBest = cleanQuickBest(rec.quickBest);
  migrated.lastSelectedLine = isLineCode(rec.lastSelectedLine)
    ? rec.lastSelectedLine
    : undefined;
  return migrated;
}

export function recordQuickBest(
  profile: Profile,
  line: LineCode,
  score: number,
): Profile {
  const current = profile.quickBest[line] ?? 0;
  if (!Number.isFinite(score) || score <= current) return profile;
  return { ...profile, quickBest: { ...profile.quickBest, [line]: score } };
}

export function saveSelectedLine(profile: Profile, line: LineCode): Profile {
  return { ...profile, lastSelectedLine: line };
}
```

- [ ] **Step 4: Run Profile tests**

Run: `npm test -- src/engine/progress.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Profile persistence**

```bash
git add src/engine/progress.ts src/engine/progress.test.ts
git commit -m "feat: persist quick run progress"
```

### Task 2: Build deterministic Quick Run route preparation

**Files:**
- Create: `src/engine/quickRun.ts`
- Create: `src/engine/quickRun.test.ts`

- [ ] **Step 1: Write failing route-preparation tests**

Create `quickRun.test.ts` with the shared network and these first cases:

```ts
import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import {
  prepareQuickRun,
  quickRunToward,
  type QuickRunState,
} from './quickRun';

const net = buildNetwork(loadNetworkData());

describe('prepareQuickRun', () => {
  it('prepares a Station without starting the clock', () => {
    const state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    expect(state.status).toBe('ready');
    expect(state.at).toBe('kl-sentral');
    expect(state.typing.target).toBe('KL Sentral');
    expect(state.startedAt).toBeNull();
    expect(state.deadline).toBeNull();
  });

  it('excludes the selected destination Terminus', () => {
    const state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0.999);
    expect(state.at).not.toBe('titiwangsa');
    expect(quickRunToward(net, state)).toBe('Titiwangsa');
  });

  it('avoids only the immediately previous start when possible', () => {
    const first = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    const second = prepareQuickRun(net, 'MR', 'titiwangsa', first.at, () => 0);
    expect(second.at).not.toBe(first.at);
  });

  it('rejects a destination that is not a Terminus of the Line', () => {
    expect(() => prepareQuickRun(net, 'MR', 'imbi', null, () => 0)).toThrow(
      'Quick Run destination must be a terminus',
    );
  });
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: FAIL because `./quickRun` does not exist.

- [ ] **Step 3: Implement the state and preparation API**

Create `quickRun.ts` with these definitions and preparation rules:

```ts
import type { LineCode } from '../data/types';
import { computeMetrics, type Metrics } from './metrics';
import { lineAt, stationAt, type NetworkIndex } from './network';
import { applyKey, beginTyping, isPrintable, type TypingState } from './typing';

export const QUICK_RUN_MS = 45_000;
export type QuickRunStatus = 'ready' | 'running' | 'completed' | 'interrupted';
type TravelDirection = -1 | 1;

export interface QuickStationTime {
  id: string;
  ms: number;
}

export interface QuickRunState {
  line: LineCode;
  initialToward: string;
  direction: TravelDirection;
  at: string;
  arrivedFrom: string | null;
  typing: TypingState;
  completedStations: QuickStationTime[];
  startedAt: number | null;
  stationStartedAt: number | null;
  deadline: number | null;
  endedAt: number | null;
  correctChars: number;
  keystrokes: number;
  errors: number;
  status: QuickRunStatus;
}

function pick<T>(values: readonly T[], random: () => number): T {
  const index = Math.min(values.length - 1, Math.floor(random() * values.length));
  return values[Math.max(0, index)]!;
}

export function prepareQuickRun(
  net: NetworkIndex,
  lineCode: LineCode,
  toward: string,
  previousStart: string | null,
  random: () => number = Math.random,
): QuickRunState {
  const line = lineAt(net, lineCode);
  if (!line || line.stations.length < 2) throw new Error('Quick Run needs a valid Line');
  const last = line.stations.length - 1;
  const towardIndex = line.stations.indexOf(toward);
  if (towardIndex !== 0 && towardIndex !== last) {
    throw new Error('Quick Run destination must be a terminus');
  }
  const eligible = line.stations.filter((id) => id !== toward);
  const withoutPrevious = eligible.filter((id) => id !== previousStart);
  const candidates = withoutPrevious.length > 0 ? withoutPrevious : eligible;
  const at = pick(candidates, random);
  const station = stationAt(net, at);
  if (!station) throw new Error(`unknown Quick Run station: ${at}`);

  return {
    line: lineCode,
    initialToward: toward,
    direction: towardIndex === last ? 1 : -1,
    at,
    arrivedFrom: null,
    typing: beginTyping(station.name),
    completedStations: [],
    startedAt: null,
    stationStartedAt: null,
    deadline: null,
    endedAt: null,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
    status: 'ready',
  };
}

export function quickRunToward(net: NetworkIndex, state: QuickRunState): string {
  const line = lineAt(net, state.line);
  if (!line) return '';
  return state.direction === 1 ? line.termini[1] : line.termini[0];
}
```

- [ ] **Step 4: Run route-preparation tests**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit route preparation**

```bash
git add src/engine/quickRun.ts src/engine/quickRun.test.ts
git commit -m "feat: prepare deterministic quick runs"
```

### Task 3: Complete Quick Run timing, traversal, and metrics

**Files:**
- Modify: `src/engine/quickRun.ts`
- Modify: `src/engine/quickRun.test.ts`

- [ ] **Step 1: Add failing transition tests**

Add helpers and cases to `quickRun.test.ts`:

```ts
import {
  advanceQuickRun,
  enterQuickCharacter,
  interruptQuickRun,
  quickRunMetrics,
} from './quickRun';

function typeCurrent(state: QuickRunState, startAt: number): QuickRunState {
  return [...state.typing.target].reduce(
    (next, character, index) => enterQuickCharacter(net, next, character, startAt + index),
    state,
  );
}

describe('Quick Run transitions', () => {
  it('starts on the first wrong printable character', () => {
    const ready = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    const running = enterQuickCharacter(net, ready, 'x', 1_000);
    expect(running.status).toBe('running');
    expect(running.startedAt).toBe(1_000);
    expect(running.deadline).toBe(46_000);
    expect(running.errors).toBe(1);
  });

  it('does not start for a named key', () => {
    const ready = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    expect(enterQuickCharacter(net, ready, 'Shift', 1_000)).toEqual(ready);
  });

  it('advances toward the selected Terminus', () => {
    const ready = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    const moved = typeCurrent(ready, 1_000);
    expect(moved.at).toBe('tun-sambanthan');
    expect(moved.completedStations[0]?.id).toBe('kl-sentral');
  });

  it('reverses after completing a Terminus', () => {
    const ready = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0.999);
    const atTerminus = typeCurrent(ready, 1_000);
    expect(atTerminus.at).toBe('titiwangsa');
    const reversed = typeCurrent(atTerminus, 2_000);
    expect(reversed.at).toBe('chow-kit');
    expect(quickRunToward(net, reversed)).toBe('KL Sentral');
  });

  it('ends at 45 seconds before applying boundary input', () => {
    let state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    state = enterQuickCharacter(net, state, 'K', 1_000);
    const ended = enterQuickCharacter(net, state, 'L', 46_000);
    expect(ended.status).toBe('completed');
    expect(ended.typing.cursor).toBe(1);
    expect(ended.endedAt).toBe(46_000);
  });

  it('counts partial correct characters but not a partial Station', () => {
    let state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    state = enterQuickCharacter(net, state, 'K', 1_000);
    state = enterQuickCharacter(net, state, 'L', 2_000);
    state = advanceQuickRun(state, 46_000);
    expect(quickRunMetrics(state, 99_000).wpm).toBeGreaterThan(0);
    expect(state.completedStations).toEqual([]);
  });

  it('interrupts a running Run without making it completed', () => {
    let state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    state = enterQuickCharacter(net, state, 'K', 1_000);
    const interrupted = interruptQuickRun(state, 2_000);
    expect(interrupted.status).toBe('interrupted');
    expect(interruptQuickRun(interrupted, 3_000)).toEqual(interrupted);
  });

  it('completes when interruption is observed after the deadline', () => {
    let state = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    state = enterQuickCharacter(net, state, 'K', 1_000);
    expect(interruptQuickRun(state, 46_001).status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run transition tests and verify failure**

Run: `npm test -- src/engine/quickRun.test.ts`

Expected: FAIL because the transition functions do not exist.

- [ ] **Step 3: Implement traversal and terminal transitions**

Append these functions to `quickRun.ts`:

```ts
function finish(state: QuickRunState): QuickRunState {
  if (state.status !== 'running' || state.deadline === null) return state;
  return { ...state, status: 'completed', endedAt: state.deadline };
}

export function advanceQuickRun(state: QuickRunState, now: number): QuickRunState {
  if (state.status !== 'running' || state.deadline === null || now < state.deadline) {
    return state;
  }
  return finish(state);
}

function nextStation(net: NetworkIndex, state: QuickRunState, now: number): QuickRunState {
  const line = lineAt(net, state.line)!;
  const currentIndex = line.stations.indexOf(state.at);
  let direction = state.direction;
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= line.stations.length) {
    direction = direction === 1 ? -1 : 1;
    nextIndex = currentIndex + direction;
  }
  const at = line.stations[nextIndex]!;
  const station = stationAt(net, at)!;
  return {
    ...state,
    direction,
    arrivedFrom: state.at,
    at,
    typing: beginTyping(station.name),
    stationStartedAt: now,
  };
}

export function enterQuickCharacter(
  net: NetworkIndex,
  state: QuickRunState,
  key: string,
  now: number,
): QuickRunState {
  if (state.status === 'completed' || state.status === 'interrupted') return state;
  if (!isPrintable(key)) return state;

  let running = state;
  if (state.status === 'ready') {
    running = {
      ...state,
      status: 'running',
      startedAt: now,
      stationStartedAt: now,
      deadline: now + QUICK_RUN_MS,
    };
  } else {
    const advanced = advanceQuickRun(state, now);
    if (advanced.status === 'completed') return advanced;
  }

  const before = running.typing;
  const typing = applyKey(before, key);
  const gained = typing.cursor > before.cursor;
  const entered: QuickRunState = {
    ...running,
    typing,
    correctChars: running.correctChars + (gained ? 1 : 0),
    keystrokes: running.keystrokes + 1,
    errors: running.errors + (gained ? 0 : 1),
  };
  if (!typing.done) return entered;

  const completed: QuickRunState = {
    ...entered,
    completedStations: [
      ...entered.completedStations,
      { id: entered.at, ms: now - (entered.stationStartedAt ?? now) },
    ],
  };
  return nextStation(net, completed, now);
}

export function interruptQuickRun(state: QuickRunState, now: number): QuickRunState {
  if (state.status !== 'running') return state;
  const advanced = advanceQuickRun(state, now);
  if (advanced.status === 'completed') return advanced;
  return { ...state, status: 'interrupted', endedAt: now };
}

export function quickRunMetrics(state: QuickRunState, now: number): Metrics {
  if (state.startedAt === null) return computeMetrics(0, 0, 0);
  const end = state.endedAt ?? Math.min(now, state.deadline ?? now);
  return computeMetrics(state.correctChars, state.keystrokes, end - state.startedAt);
}
```

- [ ] **Step 4: Run all engine tests**

Run: `npm test -- src/engine/quickRun.test.ts src/engine/typing.test.ts src/engine/metrics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the complete Quick Run engine**

```bash
git add src/engine/quickRun.ts src/engine/quickRun.test.ts
git commit -m "feat: add quick run engine"
```

### Task 4: Add phone and visual-viewport hooks

**Files:**
- Create: `src/ui/usePhoneLayout.ts`
- Create: `src/ui/usePhoneLayout.test.ts`
- Create: `src/ui/useVisualViewport.ts`
- Create: `src/ui/useVisualViewport.test.ts`

- [ ] **Step 1: Write failing hook tests**

Use `renderHook` to assert initial values, media-query change subscription,
visual-viewport resize subscription, and the `innerHeight` fallback. The core
expectations are:

```ts
expect(result.current).toBe(true); // matching phone query
expect(result.current.height).toBe(430); // visualViewport.height
expect(result.current.keyboardLikelyOpen).toBe(true); // 430 vs 844 layout height
```

The fake `MediaQueryList` must expose `addEventListener` and
`removeEventListener`; the fake `visualViewport` must expose `height`, `offsetTop`,
and the same listener pair. Restore both globals after every test.

- [ ] **Step 2: Run hook tests and verify failure**

Run: `npm test -- src/ui/usePhoneLayout.test.ts src/ui/useVisualViewport.test.ts`

Expected: FAIL because both hooks are missing.

- [ ] **Step 3: Implement the phone query hook**

Create `usePhoneLayout.ts`:

```ts
import { useEffect, useState } from 'react';

export const PHONE_QUERY =
  '(max-width: 700px), (pointer: coarse) and (max-height: 700px)';

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE_QUERY).matches),
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}
```

- [ ] **Step 4: Implement the viewport hook**

Create `useVisualViewport.ts`:

```ts
import { useEffect, useState } from 'react';

export interface VisualViewportState {
  height: number;
  keyboardLikelyOpen: boolean;
}

function readViewport(): VisualViewportState {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  return {
    height,
    keyboardLikelyOpen: Boolean(viewport && window.innerHeight - height > 80),
  };
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState(readViewport);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setState(readViewport());
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);
  return state;
}
```

- [ ] **Step 5: Run and commit the hooks**

Run: `npm test -- src/ui/usePhoneLayout.test.ts src/ui/useVisualViewport.test.ts`

Expected: PASS.

```bash
git add src/ui/usePhoneLayout.ts src/ui/usePhoneLayout.test.ts src/ui/useVisualViewport.ts src/ui/useVisualViewport.test.ts
git commit -m "feat: detect phone and visual viewport"
```

### Task 5: Build the persistent mobile typing bridge

**Files:**
- Create: `src/ui/TypingInputProvider.tsx`
- Create: `src/ui/TypingInputProvider.test.tsx`
- Modify: `src/ui/useKeyboard.ts`

- [ ] **Step 1: Write failing provider tests**

Cover these exact behaviors:

```tsx
function Probe({ onKey }: { onKey: (key: string) => void }) {
  useGameInput(onKey);
  const { focusInput, inputFocused } = useTypingInputControls();
  return <button onClick={focusInput}>{inputFocused ? 'focused' : 'focus'}</button>;
}

it('uses a real input with phone-safe attributes', () => {
  render(<TypingInputProvider enabled><Probe onKey={() => {}} /></TypingInputProvider>);
  const input = screen.getByLabelText('Typing input for Station name');
  expect(input.getAttribute('autocomplete')).toBe('off');
  expect(input.getAttribute('autocapitalize')).toBe('none');
  expect(input.getAttribute('spellcheck')).toBe('false');
});

it('emits repeated characters after clearing the browser value', () => {
  const keys: string[] = [];
  render(<TypingInputProvider enabled><Probe onKey={(key) => keys.push(key)} /></TypingInputProvider>);
  const input = screen.getByLabelText('Typing input for Station name');
  fireEvent.input(input, { target: { value: 'aa' } });
  fireEvent.input(input, { target: { value: 'a' } });
  expect(keys).toEqual(['a', 'a', 'a']);
  expect((input as HTMLInputElement).value).toBe('');
});

it('waits for composition to finish', () => {
  const keys: string[] = [];
  render(<TypingInputProvider enabled><Probe onKey={(key) => keys.push(key)} /></TypingInputProvider>);
  const input = screen.getByLabelText('Typing input for Station name');
  fireEvent.compositionStart(input);
  fireEvent.input(input, { target: { value: 'é' } });
  expect(keys).toEqual([]);
  fireEvent.compositionEnd(input, { data: 'é' });
  expect(keys).toEqual(['é']);
});

it('falls back to keydown when the phone input is disabled', () => {
  const keys: string[] = [];
  render(<TypingInputProvider enabled={false}><Probe onKey={(key) => keys.push(key)} /></TypingInputProvider>);
  fireEvent.keyDown(window, { key: 'K' });
  expect(keys).toEqual(['K']);
});
```

- [ ] **Step 2: Run the provider tests and verify failure**

Run: `npm test -- src/ui/TypingInputProvider.test.tsx`

Expected: FAIL because the provider and hooks do not exist.

- [ ] **Step 3: Implement the provider and hooks**

Create a context whose registration cleanup only clears the same handler that
registered it. This prevents an unmounting typing view from clearing a newly
mounted Junction handler.

```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from 'react';
import { useKeyboard } from './useKeyboard';

type Handler = (key: string) => void;
interface TypingInputContextValue {
  enabled: boolean;
  register: (handler: Handler) => () => void;
  focusInput: () => void;
  inputFocused: boolean;
}

const TypingInputContext = createContext<TypingInputContextValue | null>(null);

export function TypingInputProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handlerRef = useRef<Handler | null>(null);
  const composing = useRef(false);
  const [inputFocused, setInputFocused] = useState(false);

  const register = useCallback((handler: Handler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);
  const focusInput = useCallback(() => {
    if (enabled) inputRef.current?.focus({ preventScroll: true });
  }, [enabled]);
  const flush = useCallback((input: HTMLInputElement) => {
    const value = input.value;
    input.value = '';
    for (const character of value) handlerRef.current?.(character);
  }, []);
  const onInput = useCallback((event: FormEvent<HTMLInputElement>) => {
    if (!composing.current) flush(event.currentTarget);
  }, [flush]);

  const value = useMemo(
    () => ({ enabled, register, focusInput, inputFocused }),
    [enabled, register, focusInput, inputFocused],
  );

  return (
    <TypingInputContext.Provider value={value}>
      {children}
      {enabled && (
        <input
          ref={inputRef}
          className="mobile-typing-input"
          aria-label="Typing input for Station name"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onInput={onInput}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(event) => {
            composing.current = false;
            flush(event.currentTarget);
          }}
        />
      )}
    </TypingInputContext.Provider>
  );
}

export function useGameInput(onKey: Handler, active = true): void {
  const bridge = useContext(TypingInputContext);
  useKeyboard(onKey, active && !bridge?.enabled);
  useEffect(() => {
    if (!active || !bridge?.enabled) return;
    return bridge.register(onKey);
  }, [active, bridge, onKey]);
}

export function useTypingInputControls() {
  const bridge = useContext(TypingInputContext);
  if (!bridge) throw new Error('TypingInputProvider is missing');
  return { focusInput: bridge.focusInput, inputFocused: bridge.inputFocused };
}
```

Update `useKeyboard.ts` documentation to call it the desktop event primitive;
do not change its filtering behavior.

- [ ] **Step 4: Run and commit the input bridge**

Run: `npm test -- src/ui/TypingInputProvider.test.tsx`

Expected: PASS.

```bash
git add src/ui/TypingInputProvider.tsx src/ui/TypingInputProvider.test.tsx src/ui/useKeyboard.ts
git commit -m "feat: bridge native and physical typing input"
```

### Task 6: Build fixed mobile chrome and drawer primitives

**Files:**
- Create: `src/ui/MobileShell.tsx`
- Create: `src/ui/MobileShell.test.tsx`
- Create: `src/ui/MobileDrawer.tsx`
- Create: `src/ui/MobileDrawer.test.tsx`
- Create: `src/ui/mobile.css`

- [ ] **Step 1: Write failing shell and drawer tests**

Test that the active tab exposes `aria-current="page"`, each navigation button
calls its destination, viewport height reaches the inline style, and the drawer
changes only through its chevron:

```tsx
render(
  <MobileShell active="transit" onNavigate={onNavigate}>
    <p>content</p>
  </MobileShell>,
);
expect(screen.getByRole('button', { name: 'Transit' }).getAttribute('aria-current')).toBe('page');
fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
expect(onNavigate).toHaveBeenCalledWith('adventure');

render(
  <MobileDrawer title="Kelana Jaya Line" subtitle="37 Stations" initiallyExpanded>
    <button>Start</button>
  </MobileDrawer>,
);
expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/ui/MobileShell.test.tsx src/ui/MobileDrawer.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the shell and controlled drawer**

`MobileShell.tsx` exports `MobileDestination = 'transit' | 'adventure' | 'ranking'`
and renders `.mobile-shell` at `style={{ height: `${height}px` }}` using
`useVisualViewport()`. It renders a compact header containing `KL-Metro Typing`,
places children inside `.mobile-destination`, and renders bottom navigation
with exactly the three named buttons.

`MobileDrawer.tsx` owns one boolean and uses this structure:

```tsx
export function MobileDrawer({
  title,
  subtitle,
  initiallyExpanded = true,
  children,
}: {
  title: string;
  subtitle: string;
  initiallyExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <section className="mobile-drawer" data-expanded={expanded}>
      <button
        type="button"
        className="mobile-drawer-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse setup' : 'Expand setup'}
        onClick={() => setExpanded((value) => !value)}
      >
        <span><strong>{title}</strong><small>{subtitle}</small></span>
        <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
      </button>
      {expanded && <div className="mobile-drawer-content">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 4: Add the first mobile CSS contract**

Create `mobile.css` with the fixed shell primitives:

```css
.mobile-shell {
  position: fixed;
  top: 0; left: 0;
  width: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--paper);
}
.mobile-header {
  min-height: 44px;
  display: flex; align-items: center;
  padding: max(var(--s), env(safe-area-inset-top)) var(--s2) var(--s);
  background: var(--panel);
  border-bottom: 1px solid var(--panel-edge);
}
.mobile-destination { min-height: 0; overflow: hidden; }
.mobile-bottom-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: var(--s) max(var(--s), env(safe-area-inset-right))
    max(var(--s), env(safe-area-inset-bottom)) max(var(--s), env(safe-area-inset-left));
  background: var(--panel);
  border-top: 1px solid var(--panel-edge);
}
.mobile-bottom-nav button { min-height: 44px; border: 0; }
.mobile-bottom-nav [aria-current='page'] { font-weight: 700; color: var(--ink); }
.mobile-drawer {
  flex: 0 0 auto;
  max-height: min(52dvh, 28rem);
  overflow: hidden;
  background: var(--panel);
  border-top: 1px solid var(--panel-edge);
}
.mobile-drawer-toggle {
  width: 100%; min-height: 44px;
  display: flex; justify-content: space-between; align-items: center;
  text-align: left; border: 0; border-radius: 0;
}
.mobile-drawer-toggle span:first-child { display: grid; }
.mobile-drawer-toggle small { color: var(--ink-muted); }
.mobile-drawer-content {
  max-height: calc(min(52dvh, 28rem) - 44px);
  overflow-y: auto;
  padding: 0 var(--s2) var(--s2);
}
.mobile-typing-input {
  position: fixed;
  left: 50%; bottom: max(1px, env(safe-area-inset-bottom));
  width: 1px; height: 1px; padding: 0;
  opacity: 0.01; font-size: 16px;
  border: 0; pointer-events: none;
}
```

- [ ] **Step 5: Run and commit mobile primitives**

Run: `npm test -- src/ui/MobileShell.test.tsx src/ui/MobileDrawer.test.tsx`

Expected: PASS.

```bash
git add src/ui/MobileShell.tsx src/ui/MobileShell.test.tsx src/ui/MobileDrawer.tsx src/ui/MobileDrawer.test.tsx src/ui/mobile.css
git commit -m "feat: add fixed mobile shell"
```

### Task 7: Build the mobile Transit setup

**Files:**
- Create: `src/ui/MobileTransit.tsx`
- Create: `src/ui/MobileTransit.test.tsx`
- Modify: `src/ui/mobile.css`

- [ ] **Step 1: Write failing Transit tests**

Render with the real network and assert:

```tsx
expect(screen.getAllByRole('button', { name: / Line$/ }).map((button) => button.textContent))
  .toEqual(expect.arrayContaining(['KJKelana Jaya Line', 'PYPutrajaya Line']));
expect(screen.getByText('Kelana Jaya Line')).toBeTruthy();
expect(screen.getByRole('button', { name: /toward gombak/i }).getAttribute('aria-pressed')).toBe('true');

fireEvent.click(screen.getByRole('button', { name: /putrajaya line/i }));
expect(loadProfile().lastSelectedLine).toBe('PY');

fireEvent.click(screen.getByRole('button', { name: /start 45s quick run/i }));
expect(onStartQuick).toHaveBeenCalledWith('KJ', 'gombak');

fireEvent.click(screen.getByRole('button', { name: /full line run/i }));
expect(onStartLine).toHaveBeenCalledWith('KJ', 'putra-heights');
```

Also spy on the selected pill's `scrollIntoView` and assert selection requests
`{ inline: 'center', block: 'nearest' }`.

- [ ] **Step 2: Run the Transit test and verify failure**

Run: `npm test -- src/ui/MobileTransit.test.tsx`

Expected: FAIL because `MobileTransit` does not exist.

- [ ] **Step 3: Implement Transit behavior**

`MobileTransit` accepts:

```ts
interface MobileTransitProps {
  net: NetworkIndex;
  onStartQuick: (line: LineCode, toward: string) => void;
  onStartLine: (line: LineCode, from: string) => void;
}
```

Initialize `selected` from `loadProfile().lastSelectedLine ?? 'KJ'`. On a pill
click, update state and persist `saveSelectedLine(loadProfile(), code)`. Reset
Direction to the selected Line's first Station. Use `terminiOf()` for Station
ids and `line.termini` for labels.

The Quick action calls `focusInput()` synchronously, then
`onStartQuick(selected, toward)`. The full action derives the opposite
Terminus, calls `focusInput()`, then `onStartLine(selected, from)`. Disable both
when `terminiOf()` returns an empty id.

Render `MapCanvas` with the geographic layout, selected-Line extent,
`emphasis={selected}`, and bottom-heavy fit padding. Place `LINE_CODES` pills
in one `.mobile-line-pills` row, each containing `LineBadge` and the full Line
name in its accessible name. Place the row and `MobileDrawer` below the map.

- [ ] **Step 4: Add Transit CSS**

Append:

```css
.mobile-map-screen { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.mobile-map-region { position: relative; flex: 1 1 auto; min-height: 8rem; }
.mobile-map-region .map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.mobile-line-pills {
  display: flex; flex: 0 0 auto; gap: var(--s);
  overflow-x: auto; scrollbar-width: none;
  padding: var(--s) var(--s2);
  background: var(--panel);
}
.mobile-line-pills::-webkit-scrollbar { display: none; }
.mobile-line-pills button { flex: 0 0 auto; min-height: 44px; display: flex; gap: var(--s); align-items: center; }
.mobile-line-pills [aria-pressed='true'] { border-color: var(--focus-ring); }
.mobile-direction { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s); }
.mobile-direction button { min-height: 52px; }
.mobile-direction [aria-pressed='true'] { border-color: var(--line-colour); background: var(--paper-sub); }
.mobile-run-actions { display: grid; gap: var(--s); margin-top: var(--s2); }
.mobile-run-actions button { min-height: 52px; }
.mobile-run-actions .primary { background: var(--ink); color: var(--paper); }
```

- [ ] **Step 5: Run and commit Transit setup**

Run: `npm test -- src/ui/MobileTransit.test.tsx src/engine/progress.test.ts`

Expected: PASS.

```bash
git add src/ui/MobileTransit.tsx src/ui/MobileTransit.test.tsx src/ui/mobile.css
git commit -m "feat: add mobile transit setup"
```

### Task 8: Build Quick Run Summary and Run orchestration

**Files:**
- Create: `src/ui/QuickRunSummary.tsx`
- Create: `src/ui/QuickRunSummary.test.tsx`
- Create: `src/ui/QuickRunScreen.tsx`
- Create: `src/ui/QuickRunScreen.test.tsx`
- Modify: `src/ui/mobile.css`

- [ ] **Step 1: Write failing Summary tests**

Use a fixed metrics object and verify the compact content:

```tsx
render(
  <QuickRunSummary
    lineName="Kelana Jaya Line"
    status="completed"
    stations={6}
    metrics={{ wpm: 51.2, accuracy: 0.968, score: 48.0 }}
    personalBest={48}
    newBest
    onAgain={() => {}}
    onBack={() => {}}
  />,
);
expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
expect(screen.getByText('6')).toBeTruthy();
expect(screen.getByText('New personal best')).toBeTruthy();
expect(screen.queryByLabelText(/Journey through/i)).toBeNull();
```

Add an interrupted case that renders `Run interrupted`, explains that the best
was not updated, and still exposes `Run again` and `Back to Transit`.

- [ ] **Step 2: Implement and verify the compact Summary**

Implement `QuickRunSummary` as a `.quick-summary` section with a heading,
Line name, four definition-list rows, status message, and two buttons. Round WPM
and Score to integers and Accuracy to one decimal percent.

Run: `npm test -- src/ui/QuickRunSummary.test.tsx`

Expected: PASS.

- [ ] **Step 3: Write failing Quick Run screen tests**

Wrap the screen in `<TypingInputProvider enabled>`. Use fake timers and a mocked
`performance.now()` to verify:

1. the first input changes the timer from `0:45` to running;
2. advancing 45 seconds renders the Summary;
3. a completed Station is persisted even if a later visibility event interrupts;
4. an interrupted Run does not replace `quickBest[line]`;
5. a completed higher Score does replace it and says `New personal best`;
6. blur plus a visible document shows `Tap to continue typing`; and
7. hiding the document while `ready` calls `onBack` without a Summary.

Use `Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })`
inside the relevant tests and restore it afterward.

- [ ] **Step 4: Implement Quick Run orchestration**

`QuickRunScreen` accepts:

```ts
interface QuickRunScreenProps {
  net: NetworkIndex;
  line: LineCode;
  toward: string;
  previousStart: string | null;
  onStartingStation: (stationId: string) => void;
  onBack: () => void;
  random?: () => number;
}
```

Prepare state once. Register `enterQuickCharacter(net, previous, key,
performance.now())` with `useGameInput`. Tick every 100ms with
`advanceQuickRun(previous, performance.now())`; clear the interval on unmount.
Listen for `visibilitychange`: call `onBack()` from a `ready` state and
`interruptQuickRun()` from a running state.

Persist every newly completed Station from
`run.completedStations.slice(persistedCount.current)`, because several
characters from one mobile input event may be React-batched. Use each entry's
`ms` and Station-name length for Station WPM, then call `recordStation` and
`saveProfile` once with the accumulated Profile.

When status first becomes `completed`, compute `quickRunMetrics`, compare it to
the Profile value captured for that Run, call `recordQuickBest`, and persist
once. Store `newBest` for the Summary before updating local Profile state. Do
not execute this effect for `interrupted`.

Drive key, error, arrival, and completion sounds from count/status effects using
the same pure-updater pattern as `LineRunScreen`.

For the active view, render `PlayLayout`, `MapCanvas`, `Prompt`, a compact Line
and Direction label, and a stable-width countdown. Use `lineExtent()` and
`followPoints()` around `completedStations.length`; pass completed ids plus
`run.at` as travelled context. Show `Tap to continue typing` when
`!inputFocused || !keyboardLikelyOpen`; its button calls `focusInput()`.

`Run again` must call `focusInput()` first, then prepare a new state with the
current `run.at` as the excluded previous start, reset persistence refs, and
notify `onStartingStation(newRun.at)`. `Back to Transit` calls `onBack`.

- [ ] **Step 5: Add Quick Run CSS**

Append:

```css
.quick-run .play-panel { max-height: none; padding: var(--s2); gap: var(--s); }
.quick-run-context { display: flex; justify-content: space-between; gap: var(--s); font: var(--t-xs) var(--font-mono); }
.quick-run-timer { min-width: 5ch; text-align: right; font-variant-numeric: tabular-nums; }
.quick-run-timer[data-final='true'] { color: var(--error); font-weight: 700; }
.quick-run-refocus { min-height: 44px; width: 100%; }
.quick-summary {
  height: 100%; max-width: 32rem; margin: 0 auto;
  display: flex; flex-direction: column; justify-content: center; gap: var(--s2);
  padding: max(var(--s2), env(safe-area-inset-top)) var(--s2)
    max(var(--s2), env(safe-area-inset-bottom));
}
.quick-summary dl { display: grid; grid-template-columns: 1fr auto; gap: var(--s) var(--s2); }
.quick-summary dd { margin: 0; font: 700 var(--t-lg) var(--font-mono); }
.quick-summary-actions { display: grid; gap: var(--s); }
.quick-summary-actions button { min-height: 52px; }
```

- [ ] **Step 6: Run and commit the Quick Run UI**

Run: `npm test -- src/ui/QuickRunSummary.test.tsx src/ui/QuickRunScreen.test.tsx src/engine/quickRun.test.ts`

Expected: PASS.

```bash
git add src/ui/QuickRunSummary.tsx src/ui/QuickRunSummary.test.tsx src/ui/QuickRunScreen.tsx src/ui/QuickRunScreen.test.tsx src/ui/mobile.css
git commit -m "feat: add quick run screen and summary"
```

### Task 9: Add phone Adventure setup and embeddable Ranking

**Files:**
- Create: `src/ui/MobileAdventureSetup.tsx`
- Create: `src/ui/MobileAdventureSetup.test.tsx`
- Modify: `src/ui/LeaderboardScreen.tsx`
- Modify: `src/ui/LeaderboardScreen.test.tsx`
- Modify: `src/ui/mobile.css`

- [ ] **Step 1: Write failing Adventure setup tests**

Seed an Adventure position, render the setup, and assert that it offers but does
not call Resume until clicked. Then search for `Imbi`, click the result, and
assert `onStart('imbi')`. Spy on `focusInput` through a provider probe or on the
real input's `focus` method and assert focus happens before the callback.

```tsx
expect(screen.getByRole('button', { name: /resume from imbi/i })).toBeTruthy();
expect(onStart).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole('button', { name: /resume from imbi/i }));
expect(onStart).toHaveBeenCalledWith('imbi');
```

- [ ] **Step 2: Implement the Adventure setup**

Render the geographic `MapCanvas` and a `MobileDrawer` titled `Adventure`.
Inside, show the saved Resume button when present, `StationSearch`, and the
selected Station's explicit `Start Adventure` button. Do not start from a
search result immediately: store the result as the selection, then require the
Start button. Both Resume and Start call `focusInput()` synchronously before
`onStart(stationId)`.

- [ ] **Step 3: Make Ranking embeddable**

Add `embedded = false` to `LeaderboardScreenProps`. When true, add
`leaderboard-screen--embedded` and omit `Back to the map`; when false, retain
the current behavior. Add a test for both branches.

- [ ] **Step 4: Add destination CSS and run tests**

```css
.mobile-adventure-content { display: grid; gap: var(--s); }
.mobile-adventure-content button { min-height: 44px; }
.leaderboard-screen--embedded {
  height: 100%; max-width: none; margin: 0;
  overflow: auto;
  padding: max(var(--s2), env(safe-area-inset-top)) var(--s2) var(--s2);
}
```

Run: `npm test -- src/ui/MobileAdventureSetup.test.tsx src/ui/LeaderboardScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit phone destinations**

```bash
git add src/ui/MobileAdventureSetup.tsx src/ui/MobileAdventureSetup.test.tsx src/ui/LeaderboardScreen.tsx src/ui/LeaderboardScreen.test.tsx src/ui/mobile.css
git commit -m "feat: add mobile adventure and ranking destinations"
```

### Task 10: Adapt existing Runs to the shared input bridge

**Files:**
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/LineRunScreen.test.tsx`
- Modify: `src/ui/AdventureScreen.tsx`
- Modify: `src/ui/AdventureScreen.test.tsx`
- Modify: `src/ui/JunctionPicker.tsx`
- Modify: `src/ui/JunctionPicker.test.tsx`

- [ ] **Step 1: Add failing mobile-input tests**

For Line Run and Adventure, render inside `<TypingInputProvider enabled>`, fire
`input` on the labelled native input, and assert the prompt advances. For
Adventure, reach a Station after the starting Station and assert a visible
`Turn around` button returns to the previous Station. For `JunctionPicker`,
click an option and assert the native input receives focus before `onChoose`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.test.tsx src/ui/JunctionPicker.test.tsx`

Expected: FAIL because the screens still register only desktop `keydown`, and
Adventure lacks the touch control.

- [ ] **Step 3: Replace screen-level keyboard hooks**

Replace `useKeyboard(onKey, active)` with `useGameInput(onKey, active)` in both
Run screens and `JunctionPicker`. In `JunctionPicker`, obtain `focusInput`; each
click handler that resumes typing must execute:

```ts
focusInput();
onChoose(dir);
```

and each walk action must execute:

```ts
focusInput();
onWalk(id);
```

Desktop behavior remains the `useKeyboard` fallback inside `useGameInput`.

- [ ] **Step 4: Add Adventure's touch Turn around action**

Call `usePhoneLayout()` in `AdventureScreen`. While `run.phase === 'typing'`,
`run.arrivedFrom` exists, and the layout is phone-sized, render:

```tsx
<button
  type="button"
  className="mobile-turn-around"
  onClick={() => {
    focusInput();
    setRun((previous) => turnAround(net, previous, performance.now()));
  }}
>
  Turn around
</button>
```

Keep the current Backspace hint and shortcut on desktop; replace it with the
button on phone layouts.

- [ ] **Step 5: Run and commit shared Run input**

Run: `npm test -- src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.test.tsx src/ui/JunctionPicker.test.tsx`

Expected: PASS, including existing physical-keyboard tests.

```bash
git add src/ui/LineRunScreen.tsx src/ui/LineRunScreen.test.tsx src/ui/AdventureScreen.tsx src/ui/AdventureScreen.test.tsx src/ui/JunctionPicker.tsx src/ui/JunctionPicker.test.tsx
git commit -m "feat: support native input across runs"
```

### Task 11: Add desktop Quick entry and responsive App routing

**Files:**
- Modify: `src/ui/DirectionChooser.tsx`
- Modify: `src/ui/DirectionChooser.test.tsx`
- Modify: `src/ui/HomeMap.tsx`
- Modify: `src/ui/HomeMap.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing desktop Quick entry tests**

Extend `DirectionChooserProps` with optional
`onQuick?: (towardStationId: string) => void`. Assert the existing full-Line
buttons remain and that a `45s Quick Run toward Titiwangsa` button calls
`onQuick('titiwangsa')`. Extend `HomeMapProps` with `onStartQuick` and assert the
callback receives `('MR', 'titiwangsa')`.

- [ ] **Step 2: Implement the desktop Quick action**

Keep the same desktop picker footprint. Under the two existing Direction rows,
render one compact Quick action per Direction only when `onQuick` exists:

```tsx
<button type="button" onClick={() => onQuick?.(e.toward)}>
  <span>45s Quick Run</span>
  <em>toward {stationAt(net, e.toward)?.name}</em>
</button>
```

Pass each target through `HomeMap` as `onStartQuick(selected, toward)`.

- [ ] **Step 3: Write failing App routing tests**

Stub `matchMedia` separately for desktop and phone. Assert:

- desktop still opens `HomeMap` and can enter Quick Run;
- phone opens Transit with bottom navigation and no desktop line picker;
- phone navigation switches to Adventure and embedded Ranking;
- starting Quick Run removes bottom navigation;
- Back to Transit restores it; and
- `previousStart` is retained when beginning another Quick Run in the same App.

- [ ] **Step 4: Implement the routing union and provider**

Use this routing shape:

```ts
type Screen =
  | { kind: 'home' }
  | { kind: 'adventure-setup' }
  | { kind: 'line'; code: LineCode; from: string }
  | { kind: 'adventure'; at: string }
  | { kind: 'leaderboard' }
  | { kind: 'quick'; code: LineCode; toward: string };
```

Call `usePhoneLayout()` once in `App`. Wrap every screen in
`<TypingInputProvider enabled={phone}>`. Keep `lastQuickStart` in a ref.

For `home`, render `HomeMap` on desktop or `MobileShell` plus `MobileTransit` on
phone. `adventure-setup` exists only in the phone shell. Render phone Ranking
as `<LeaderboardScreen embedded net={net} />` inside the shell. Active Run
screens render without `MobileShell`, which removes the drawer and bottom nav.

Quick Run receives the ref value as `previousStart` and updates it through
`onStartingStation`. Its Back action returns to phone Transit or desktop Home.

Import `./ui/mobile.css` from `main.tsx` after `index.css` so the phone layer can
override shared presentation rules without moving theme tokens.

- [ ] **Step 5: Run and commit responsive routing**

Run: `npm test -- src/ui/DirectionChooser.test.tsx src/ui/HomeMap.test.tsx src/ui/App.test.tsx`

Expected: PASS for both old desktop flows and new phone flows.

```bash
git add src/ui/DirectionChooser.tsx src/ui/DirectionChooser.test.tsx src/ui/HomeMap.tsx src/ui/HomeMap.test.tsx src/ui/App.tsx src/ui/App.test.tsx src/main.tsx
git commit -m "feat: route desktop and mobile quick runs"
```

### Task 12: Lock the viewport, remove superseded mobile CSS, and verify the feature

**Files:**
- Modify: `src/index.css`
- Modify: `src/ui/mobile.css`
- Modify: `docs/superpowers/specs/2026-09-09-mobile-quick-run-design.md` only after a shipped iPhone test

- [ ] **Step 1: Add a CSS contract test**

Add a source-level assertion to `src/smoke.test.ts` that reads the two CSS files
and verifies the app-height and scroll-lock rules exist exactly once:

```ts
expect(indexCss).toContain('html, body, #root { height: 100%; overflow: hidden; }');
expect(mobileCss).toContain('.mobile-shell');
expect(mobileCss).toContain('position: fixed');
expect(mobileCss).toContain('env(safe-area-inset-bottom)');
```

- [ ] **Step 2: Run the smoke test and verify failure**

Run: `npm test -- src/smoke.test.ts`

Expected: FAIL until the root lock is added and the obsolete dock rules are removed.

- [ ] **Step 3: Finalize global and phone CSS**

Change the global root rule to:

```css
html, body, #root { height: 100%; overflow: hidden; }
body { overscroll-behavior: none; }
```

In the compound phone media query, also pin the body so Safari cannot retain a
document scroll offset behind the visual viewport:

```css
@media (max-width: 700px), (pointer: coarse) and (max-height: 700px) {
  body { position: fixed; inset: 0; width: 100%; }
}
```

Delete the old `@media (max-width: 700px)` HomeMap dock rules from
`index.css`; the desktop component is no longer mounted for phone layouts.
Move the shared mobile Play-panel sizing for Line Run and Adventure to
`mobile.css` under:

```css
@media (max-width: 700px), (pointer: coarse) and (max-height: 700px) {
  .play-panel {
    left: 0; right: 0; bottom: 0;
    width: 100%; transform: none;
    max-height: min(42dvh, 22rem); overflow-y: auto;
    border-radius: 10px 10px 0 0;
    padding: var(--s2);
    padding-bottom: max(var(--s2), env(safe-area-inset-bottom));
  }
  .mobile-turn-around, .junction button { min-height: 44px; }
}
```

Ensure landscape uses the same compound query as `PHONE_QUERY`, every fixed
surface includes safe areas, the Line pill row is the only horizontal scroll,
and no Run panel uses a free-drag gesture.

- [ ] **Step 4: Run the complete automated suite**

Run: `npm test`

Expected: 51 test files PASS; zero failures.

- [ ] **Step 5: Run the production build and whitespace check**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 6: Review the implementation against the design spec**

Check each requirement in
`docs/superpowers/specs/2026-09-09-mobile-quick-run-design.md` against a passing
test or visible implementation. In particular, confirm that Quick Run remains
outside the generic `RunState`, phone and desktop share one Profile, incomplete
Stations are not unlocked, interrupted Runs cannot save a best, and the Line
Run leaderboard receives no Quick result.

- [ ] **Step 7: Commit final viewport integration**

```bash
git add src/index.css src/ui/mobile.css src/smoke.test.ts
git commit -m "feat: lock mobile gameplay to the visual viewport"
```

- [ ] **Step 8: Leave the shipped-device gate explicitly pending**

Do not mark the POC gate complete from an emulator, jsdom, or desktop responsive
mode. Report the implementation as automated-verification complete and point to
Section 9 of the design spec. After the user supplies or authorizes a shipped
URL, run the five iPhone Safari attempts and fill in the existing record with
the actual build, device, outcomes, product verdict, and next action. Commit
that filled record separately:

```bash
git add docs/superpowers/specs/2026-09-09-mobile-quick-run-design.md
git commit -m "docs: record mobile quick run POC gate"
```
