# Local Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Line Run a local, per-device leaderboard — top 20 overall and top 20 per line, with longer lines weighted more heavily — that a small group can pass a device around and compete on.

**Architecture:** A pure scoring/ranking module (`engine/leaderboard.ts`) computes weights, weighted scores, and ranked-list math with no IO, mirroring `engine/metrics.ts`. A separate impure module (`data/leaderboardStore.ts`) owns `localStorage` and orchestrates qualification checks and submissions, deliberately placed outside `engine/` so it doesn't repeat the purity violation `progress.ts` is documented as owing a fix. Two new UI pieces — an inline `LeaderboardPanel` on the post-run summary, and a standalone `LeaderboardScreen` reachable from the map — read and write through the store.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (existing stack, no new dependencies).

**Spec:** No separate spec document — this plan was produced directly from a grilling session (see Global Constraints below for the settled decisions; there is no other doc to cross-reference).

## Global Constraints

These came out of the grilling session. Every task below implicitly assumes them.

- **Scope: Line Run only.** Adventure and Rush Hour do not feed the leaderboard. Adventure has no single fixed "line" for a whole run, and Rush Hour doesn't exist yet.
- **Eligibility: full completion only.** A run only becomes leaderboard-eligible when it completes its entire route (`run.stationTimes.length === route.length`). A run ended early via the "End run" button is not eligible.
- **Weighting formula:** `weightedScore = score × (lineCharCount / longestLineCharCount)`, where `lineCharCount` is the sum of station-name lengths along a line's fixed route. The longest line (Putrajaya, 469 chars) weighs 1; the shortest (KL Monorail, 114 chars) weighs ≈0.243.
- **Per-line boards rank by raw `score`; only the overall board ranks by `weightedScore`.** Within one line every entry gets the same weight, so weighting can't reorder a per-line board — only cross-line comparison needs it.
- **Board size: top 20, both overall and every per-line board.** The store holds only the top 20 per board — trimmed on every write, no unbounded run history.
- **Duplicate names allowed.** The same name can hold multiple slots on a board.
- **Tie-break: descending score, then ascending `playedAt`.** The first player to set a given score keeps the higher slot.
- **Name-entry flow:** after a completed Line Run, silently check qualification for both boards. If either qualifies, show a name-entry form (autocompleted from previously used names, trimmed, required, max 24 characters). If neither qualifies, show a message naming the exact score needed to have placed, instead of a form.
- **Storage split, not the `progress.ts` precedent:** pure ranking/weighting logic lives in `engine/leaderboard.ts` (no `localStorage`, matches invariant 2 in `STATUS.md`); the actual persistence and orchestration live in `src/data/leaderboardStore.ts`. No interface/abstraction layer is being built for a future online scoreboard yet — only the entry record's shape is designed to be network-ready (stable id, name, lineCode, metrics, weightedScore, playedAt).

---

## File Structure

```
src/
  engine/
    leaderboard.ts          NEW — pure: weighting, entry creation, ranked-list math
    leaderboard.test.ts     NEW
  data/
    leaderboardStore.ts     NEW — impure: localStorage, qualification, submission
    leaderboardStore.test.ts NEW
  ui/
    LeaderboardPanel.tsx    NEW — inline name-entry / qualify feedback on SummaryScreen
    LeaderboardPanel.test.tsx NEW
    LeaderboardScreen.tsx   NEW — full board browser (Overall + 7 line tabs)
    LeaderboardScreen.test.tsx NEW
    leaderboard.css         NEW — shared styling for the two components above
    SummaryScreen.tsx       MODIFY — accepts leaderboardLine, renders LeaderboardPanel
    SummaryScreen.test.tsx  MODIFY — new tests, localStorage.clear() in beforeEach
    LineRunScreen.tsx       MODIFY — passes leaderboardLine only on full completion
    LineRunScreen.test.tsx  MODIFY — new tests, stub reduced-motion so tests don't wait on the real celebration timer
    HomeMap.tsx             MODIFY — new "Leaderboard" button, onOpenLeaderboard prop
    HomeMap.test.tsx        MODIFY — onOpenLeaderboard={noop} added to every render call, one new test
    App.tsx                 MODIFY — new 'leaderboard' screen kind
    App.test.tsx            MODIFY — one new test
```

---

### Task 1: `engine/leaderboard.ts` — pure weighting and ranking

**Files:**
- Create: `src/engine/leaderboard.ts`
- Test: `src/engine/leaderboard.test.ts`

**Interfaces:**
- Consumes: `NetworkIndex` from `./network` (`lines: Map<LineCode, Line>`, each `Line.stations: string[]`); `Station.name` via `net.stations`; `Metrics` from `./metrics` (`{ wpm, accuracy, score }`); `LineCode` from `../data/types`.
- Produces (consumed by Task 2):
  - `export const LEADERBOARD_LIMIT = 20`
  - `export interface LeaderboardEntry { id: string; name: string; lineCode: LineCode; wpm: number; accuracy: number; score: number; weightedScore: number; playedAt: number }`
  - `export type LeaderboardKey = 'score' | 'weightedScore'`
  - `export function lineCharCount(net: NetworkIndex, lineCode: LineCode): number`
  - `export function longestLineCharCount(net: NetworkIndex): number`
  - `export function weightForLine(net: NetworkIndex, lineCode: LineCode): number`
  - `export function makeEntry(params: { id: string; name: string; lineCode: LineCode; metrics: Metrics; weight: number; playedAt: number }): LeaderboardEntry`
  - `export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry, key: LeaderboardKey): number`
  - `export function rankedInsert(entries: LeaderboardEntry[], entry: LeaderboardEntry, key: LeaderboardKey, limit?: number): LeaderboardEntry[]`
  - `export function cutoffValue(entries: LeaderboardEntry[], key: LeaderboardKey, limit?: number): number | null`
  - `export function wouldQualify(entries: LeaderboardEntry[], value: number, key: LeaderboardKey, limit?: number): boolean`
  - `export function rankOf(entries: LeaderboardEntry[], id: string): number | null`

  `rankedInsert` assumes `entries` is already sorted descending by `key` (which is always true for anything the store hands it, since the store only ever stores what `rankedInsert` produced) and does not mutate its input. `cutoffValue`/`wouldQualify` make the same sorted assumption.

- [ ] **Step 1: Write the failing test**

Create `src/engine/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import {
  LEADERBOARD_LIMIT,
  cutoffValue,
  compareEntries,
  lineCharCount,
  longestLineCharCount,
  makeEntry,
  rankOf,
  rankedInsert,
  weightForLine,
  wouldQualify,
  type LeaderboardEntry,
} from './leaderboard';

const net = buildNetwork(loadNetworkData());

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: 'e1',
    name: 'Ali',
    lineCode: 'MR',
    wpm: 60,
    accuracy: 1,
    score: 60,
    weightedScore: 60,
    playedAt: 0,
    ...overrides,
  };
}

describe('LEADERBOARD_LIMIT', () => {
  it('is 20', () => {
    expect(LEADERBOARD_LIMIT).toBe(20);
  });
});

describe('lineCharCount', () => {
  it('sums station name lengths along the fixed route', () => {
    // KL Sentral, Tun Sambanthan, Maharajalela, Hang Tuah, Imbi, Bukit Bintang,
    // Raja Chulan, Bukit Nanas, Medan Tuanku, Chow Kit, Titiwangsa
    expect(lineCharCount(net, 'MR')).toBe(114);
  });
});

describe('longestLineCharCount', () => {
  it('finds the longest line by character count', () => {
    expect(longestLineCharCount(net)).toBe(469); // Putrajaya Line
  });
});

describe('weightForLine', () => {
  it('gives the longest line a weight of 1', () => {
    expect(weightForLine(net, 'PY')).toBeCloseTo(1);
  });

  it('gives a shorter line a proportionally smaller weight', () => {
    expect(weightForLine(net, 'MR')).toBeCloseTo(114 / 469);
  });
});

describe('makeEntry', () => {
  it('computes weightedScore from score and weight', () => {
    const e = makeEntry({
      id: 'e1',
      name: 'Ali',
      lineCode: 'MR',
      metrics: { wpm: 60, accuracy: 1, score: 60 },
      weight: 0.5,
      playedAt: 10,
    });
    expect(e.weightedScore).toBe(30);
    expect(e.name).toBe('Ali');
    expect(e.playedAt).toBe(10);
  });
});

describe('compareEntries', () => {
  it('orders by key, descending', () => {
    const a = entry({ id: 'a', score: 80 });
    const b = entry({ id: 'b', score: 90 });
    expect(compareEntries(a, b, 'score')).toBeGreaterThan(0);
  });

  it('breaks ties by earlier playedAt', () => {
    const earlier = entry({ id: 'a', score: 80, playedAt: 1 });
    const later = entry({ id: 'b', score: 80, playedAt: 2 });
    expect(compareEntries(earlier, later, 'score')).toBeLessThan(0);
  });
});

describe('rankedInsert', () => {
  it('inserts in sorted order', () => {
    const entries = [entry({ id: 'a', score: 90 }), entry({ id: 'c', score: 70 })];
    const next = rankedInsert(entries, entry({ id: 'b', score: 80 }), 'score');
    expect(next.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('trims to the limit', () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}`, score: 100 - i }));
    const next = rankedInsert(entries, entry({ id: 'new', score: 50 }), 'score', 20);
    expect(next).toHaveLength(20);
    expect(next.find((e) => e.id === 'new')).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 'a', score: 90 })];
    rankedInsert(entries, entry({ id: 'b', score: 80 }), 'score');
    expect(entries).toHaveLength(1);
  });
});

describe('cutoffValue', () => {
  it('is null when the board has not reached the limit', () => {
    const entries = [entry({ id: 'a', score: 90 })];
    expect(cutoffValue(entries, 'score', 20)).toBeNull();
  });

  it('is the lowest score on a full board', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry({ id: `e${i}`, score: 90 - i * 10 }));
    expect(cutoffValue(entries, 'score', 3)).toBe(70);
  });
});

describe('wouldQualify', () => {
  it('always qualifies while the board has room', () => {
    expect(wouldQualify([], 1, 'score', 20)).toBe(true);
  });

  it('qualifies only by beating the cutoff on a full board', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry({ id: `e${i}`, score: 90 - i * 10 }));
    expect(wouldQualify(entries, 71, 'score', 3)).toBe(true);
    expect(wouldQualify(entries, 70, 'score', 3)).toBe(false);
  });
});

describe('rankOf', () => {
  it('is 1-indexed', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(rankOf(entries, 'a')).toBe(1);
    expect(rankOf(entries, 'b')).toBe(2);
  });

  it('is null when the id is not present', () => {
    expect(rankOf([entry({ id: 'a' })], 'z')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/leaderboard.test.ts`
Expected: FAIL — `./leaderboard` has no exports yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/engine/leaderboard.ts`:

```ts
import type { LineCode } from '../data/types';
import { LINE_CODES } from '../data/types';
import type { Metrics } from './metrics';
import { stationAt, type NetworkIndex } from './network';

export const LEADERBOARD_LIMIT = 20;

export interface LeaderboardEntry {
  id: string;
  name: string;
  lineCode: LineCode;
  wpm: number;
  accuracy: number;
  score: number;
  weightedScore: number;
  playedAt: number;
}

export type LeaderboardKey = 'score' | 'weightedScore';

/** Sum of station-name lengths along a line's fixed route — a stand-in for typing effort. */
export function lineCharCount(net: NetworkIndex, lineCode: LineCode): number {
  const line = net.lines.get(lineCode);
  if (!line) return 0;
  return line.stations.reduce((n, id) => n + (stationAt(net, id)?.name.length ?? 0), 0);
}

/** The largest lineCharCount across every line in the network. */
export function longestLineCharCount(net: NetworkIndex): number {
  return Math.max(...LINE_CODES.map((code) => lineCharCount(net, code)));
}

/** 0 < weight <= 1. The longest line weighs 1; shorter lines weigh proportionally less. */
export function weightForLine(net: NetworkIndex, lineCode: LineCode): number {
  const longest = longestLineCharCount(net);
  if (longest === 0) return 1;
  return lineCharCount(net, lineCode) / longest;
}

export function makeEntry(params: {
  id: string;
  name: string;
  lineCode: LineCode;
  metrics: Metrics;
  weight: number;
  playedAt: number;
}): LeaderboardEntry {
  const { id, name, lineCode, metrics, weight, playedAt } = params;
  return {
    id,
    name,
    lineCode,
    wpm: metrics.wpm,
    accuracy: metrics.accuracy,
    score: metrics.score,
    weightedScore: metrics.score * weight,
    playedAt,
  };
}

/** Descending by `key`; ties broken by earlier playedAt (first to set the score keeps the higher slot). */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry, key: LeaderboardKey): number {
  if (b[key] !== a[key]) return b[key] - a[key];
  return a.playedAt - b.playedAt;
}

/** New array: `entry` inserted, sorted by `key`, sliced to `limit`. Does not mutate `entries`. */
export function rankedInsert(
  entries: LeaderboardEntry[],
  entry: LeaderboardEntry,
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): LeaderboardEntry[] {
  return [...entries, entry].sort((a, b) => compareEntries(a, b, key)).slice(0, limit);
}

/** The value held by the entry at rank `limit`, or null if the board hasn't reached that size yet. */
export function cutoffValue(
  entries: LeaderboardEntry[],
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): number | null {
  if (entries.length < limit) return null;
  return entries[limit - 1]![key];
}

/** True if `value` would land within the top `limit` — board not full, or value beats the current cutoff. */
export function wouldQualify(
  entries: LeaderboardEntry[],
  value: number,
  key: LeaderboardKey,
  limit: number = LEADERBOARD_LIMIT,
): boolean {
  const cutoff = cutoffValue(entries, key, limit);
  return cutoff === null || value > cutoff;
}

/** 1-indexed rank of `id` within `entries`, or null if not present. */
export function rankOf(entries: LeaderboardEntry[], id: string): number | null {
  const idx = entries.findIndex((e) => e.id === id);
  return idx === -1 ? null : idx + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/leaderboard.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/leaderboard.ts src/engine/leaderboard.test.ts
git commit -m "$(cat <<'EOF'
feat: add pure leaderboard weighting and ranking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

### Task 2: `data/leaderboardStore.ts` — persistence, qualification, submission

**Files:**
- Create: `src/data/leaderboardStore.ts`
- Test: `src/data/leaderboardStore.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces from `../engine/leaderboard`; `LINE_CODES`, `type LineCode` from `./types`; `NetworkIndex` from `../engine/network`; `Metrics` from `../engine/metrics`.
- Produces (consumed by Tasks 3–6):
  - `export const LEADERBOARD_STORAGE_KEY = 'myrapid.leaderboard.v1'`
  - `export interface LeaderboardStore { version: number; overall: LeaderboardEntry[]; perLine: Record<LineCode, LeaderboardEntry[]> }`
  - `export function emptyStore(): LeaderboardStore`
  - `export function loadStore(): LeaderboardStore`
  - `export function saveStore(store: LeaderboardStore): void`
  - `export interface Qualification { weight: number; weightedScore: number; overallQualifies: boolean; lineQualifies: boolean; overallCutoff: number | null; lineCutoff: number | null }`
  - `export function evaluateRun(net: NetworkIndex, store: LeaderboardStore, lineCode: LineCode, metrics: Metrics): Qualification`
  - `export interface SubmitResult { store: LeaderboardStore; overallRank: number | null; lineRank: number | null }`
  - `export function submitEntry(net: NetworkIndex, store: LeaderboardStore, params: { name: string; lineCode: LineCode; metrics: Metrics; playedAt: number }): SubmitResult`
  - `export function knownNames(store: LeaderboardStore): string[]` — unique names across every board, alphabetical.

- [ ] **Step 1: Write the failing test**

Create `src/data/leaderboardStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadNetworkData } from './load';
import { buildNetwork } from '../engine/network';
import type { Metrics } from '../engine/metrics';
import {
  LEADERBOARD_STORAGE_KEY,
  emptyStore,
  evaluateRun,
  knownNames,
  loadStore,
  saveStore,
  submitEntry,
} from './leaderboardStore';

const net = buildNetwork(loadNetworkData());
const metrics = (score: number): Metrics => ({ wpm: score, accuracy: 1, score });

beforeEach(() => localStorage.clear());

describe('emptyStore', () => {
  it('has an empty overall board and an empty board for every line', () => {
    const store = emptyStore();
    expect(store.overall).toEqual([]);
    expect(store.perLine.MR).toEqual([]);
    expect(store.perLine.PY).toEqual([]);
  });
});

describe('loadStore / saveStore', () => {
  it('round-trips through localStorage', () => {
    const { store } = submitEntry(net, emptyStore(), {
      name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    saveStore(store);
    expect(loadStore().perLine.MR).toHaveLength(1);
  });

  it('returns an empty store when nothing is saved', () => {
    expect(loadStore()).toEqual(emptyStore());
  });

  it('recovers from unreadable data', () => {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, 'not json {{{');
    expect(loadStore()).toEqual(emptyStore());
  });
});

describe('evaluateRun', () => {
  it('qualifies for both boards while they have room', () => {
    const q = evaluateRun(net, emptyStore(), 'MR', metrics(60));
    expect(q.overallQualifies).toBe(true);
    expect(q.lineQualifies).toBe(true);
    expect(q.overallCutoff).toBeNull();
    expect(q.lineCutoff).toBeNull();
  });

  it('weights the score by the line length', () => {
    const q = evaluateRun(net, emptyStore(), 'MR', metrics(60));
    expect(q.weightedScore).toBeCloseTo(60 * (114 / 469));
  });

  it('stops qualifying once a board is full of higher scores', () => {
    let store = emptyStore();
    for (let i = 0; i < 20; i++) {
      store = submitEntry(net, store, {
        name: `p${i}`, lineCode: 'MR', metrics: metrics(100), playedAt: i,
      }).store;
    }
    const q = evaluateRun(net, store, 'MR', metrics(10));
    expect(q.lineQualifies).toBe(false);
    expect(q.lineCutoff).toBe(100);
  });
});

describe('submitEntry', () => {
  it('adds the entry to both boards and reports each rank', () => {
    const result = submitEntry(net, emptyStore(), {
      name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    expect(result.overallRank).toBe(1);
    expect(result.lineRank).toBe(1);
    expect(result.store.perLine.MR[0]?.name).toBe('Ali');
    expect(result.store.overall[0]?.name).toBe('Ali');
  });

  it('only adds to a board it qualifies for', () => {
    let store = emptyStore();
    for (let i = 0; i < 20; i++) {
      store = submitEntry(net, store, {
        name: `p${i}`, lineCode: 'MR', metrics: metrics(100), playedAt: i,
      }).store;
    }
    const result = submitEntry(net, store, {
      name: 'Late', lineCode: 'MR', metrics: metrics(10), playedAt: 100,
    });
    expect(result.lineRank).toBeNull();
    expect(result.store.perLine.MR.find((e) => e.name === 'Late')).toBeUndefined();
  });

  it('persists to localStorage', () => {
    submitEntry(net, emptyStore(), { name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1 });
    expect(loadStore().perLine.MR).toHaveLength(1);
  });

  it('trims whitespace from the name', () => {
    const result = submitEntry(net, emptyStore(), {
      name: '  Ali  ', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    expect(result.store.overall[0]?.name).toBe('Ali');
  });
});

describe('knownNames', () => {
  it('collects unique names from every board, alphabetically', () => {
    let store = emptyStore();
    store = submitEntry(net, store, { name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1 }).store;
    store = submitEntry(net, store, { name: 'Ali', lineCode: 'PY', metrics: metrics(50), playedAt: 2 }).store;
    store = submitEntry(net, store, { name: 'Bee', lineCode: 'AG', metrics: metrics(40), playedAt: 3 }).store;
    expect(knownNames(store)).toEqual(['Ali', 'Bee']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/leaderboardStore.test.ts`
Expected: FAIL — `./leaderboardStore` has no exports yet.

- [ ] **Step 3: Write the implementation**

Create `src/data/leaderboardStore.ts`:

```ts
import { LINE_CODES, type LineCode } from './types';
import type { Metrics } from '../engine/metrics';
import type { NetworkIndex } from '../engine/network';
import {
  LEADERBOARD_LIMIT,
  cutoffValue,
  makeEntry,
  rankOf,
  rankedInsert,
  weightForLine,
  wouldQualify,
  type LeaderboardEntry,
} from '../engine/leaderboard';

export const LEADERBOARD_STORAGE_KEY = 'myrapid.leaderboard.v1';
const SCHEMA_VERSION = 1;

export interface LeaderboardStore {
  version: number;
  overall: LeaderboardEntry[];
  perLine: Record<LineCode, LeaderboardEntry[]>;
}

export function emptyStore(): LeaderboardStore {
  return {
    version: SCHEMA_VERSION,
    overall: [],
    perLine: Object.fromEntries(LINE_CODES.map((code) => [code, []])) as Record<LineCode, LeaderboardEntry[]>,
  };
}

/**
 * Future schema versions migrate here. An unknown version is treated as
 * unreadable rather than guessed at — matches engine/progress.ts's approach.
 */
export function loadStore(): LeaderboardStore {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
  } catch {
    return emptyStore();
  }
  if (stored === null) return emptyStore();

  try {
    const parsed = JSON.parse(stored) as Partial<LeaderboardStore>;
    if (parsed.version === SCHEMA_VERSION) {
      return {
        ...emptyStore(),
        ...parsed,
        perLine: { ...emptyStore().perLine, ...parsed.perLine },
      };
    }
  } catch {
    // falls through to an empty store
  }
  return emptyStore();
}

export function saveStore(store: LeaderboardStore): void {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable or full. The run continues; the score is simply not kept.
  }
}

export interface Qualification {
  weight: number;
  weightedScore: number;
  overallQualifies: boolean;
  lineQualifies: boolean;
  overallCutoff: number | null;
  lineCutoff: number | null;
}

/** Pre-submission check: would this run's metrics place on either board? Does not mutate the store. */
export function evaluateRun(
  net: NetworkIndex,
  store: LeaderboardStore,
  lineCode: LineCode,
  metrics: Metrics,
): Qualification {
  const weight = weightForLine(net, lineCode);
  const weightedScore = metrics.score * weight;
  const lineEntries = store.perLine[lineCode];
  return {
    weight,
    weightedScore,
    overallQualifies: wouldQualify(store.overall, weightedScore, 'weightedScore', LEADERBOARD_LIMIT),
    lineQualifies: wouldQualify(lineEntries, metrics.score, 'score', LEADERBOARD_LIMIT),
    overallCutoff: cutoffValue(store.overall, 'weightedScore', LEADERBOARD_LIMIT),
    lineCutoff: cutoffValue(lineEntries, 'score', LEADERBOARD_LIMIT),
  };
}

export interface SubmitResult {
  store: LeaderboardStore;
  overallRank: number | null;
  lineRank: number | null;
}

/** Inserts `name`'s run into whichever board(s) it qualifies for and saves the store. */
export function submitEntry(
  net: NetworkIndex,
  store: LeaderboardStore,
  params: { name: string; lineCode: LineCode; metrics: Metrics; playedAt: number },
): SubmitResult {
  const { name, lineCode, metrics, playedAt } = params;
  const q = evaluateRun(net, store, lineCode, metrics);
  const id = `${lineCode}-${playedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = makeEntry({ id, name: name.trim(), lineCode, metrics, weight: q.weight, playedAt });

  let overall = store.overall;
  let overallRank: number | null = null;
  if (q.overallQualifies) {
    overall = rankedInsert(store.overall, entry, 'weightedScore', LEADERBOARD_LIMIT);
    overallRank = rankOf(overall, id);
  }

  let line = store.perLine[lineCode];
  let lineRank: number | null = null;
  if (q.lineQualifies) {
    line = rankedInsert(line, entry, 'score', LEADERBOARD_LIMIT);
    lineRank = rankOf(line, id);
  }

  const next: LeaderboardStore = { ...store, overall, perLine: { ...store.perLine, [lineCode]: line } };
  saveStore(next);
  return { store: next, overallRank, lineRank };
}

/** Unique names already on either board, alphabetical — feeds the entry form's autocomplete. */
export function knownNames(store: LeaderboardStore): string[] {
  const names = new Set<string>();
  for (const entry of store.overall) names.add(entry.name);
  for (const code of LINE_CODES) {
    for (const entry of store.perLine[code]) names.add(entry.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/leaderboardStore.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/data/leaderboardStore.ts src/data/leaderboardStore.test.ts
git commit -m "$(cat <<'EOF'
feat: add leaderboard persistence and submission

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

### Task 3: `ui/LeaderboardPanel.tsx` — name entry / qualify feedback

**Files:**
- Create: `src/ui/LeaderboardPanel.tsx`
- Create: `src/ui/leaderboard.css`
- Test: `src/ui/LeaderboardPanel.test.tsx`

**Interfaces:**
- Consumes: `Qualification` from `../data/leaderboardStore` (Task 2).
- Produces (consumed by Task 4):
  - `export interface LeaderboardPanelProps { qualification: Qualification; score: number; lineName: string; knownNames: string[]; onSubmit: (name: string) => { overallRank: number | null; lineRank: number | null } }`
  - `export function LeaderboardPanel(props: LeaderboardPanelProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/ui/LeaderboardPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Qualification } from '../data/leaderboardStore';
import { LeaderboardPanel } from './LeaderboardPanel';

const qualifying: Qualification = {
  weight: 0.5,
  weightedScore: 30,
  overallQualifies: true,
  lineQualifies: true,
  overallCutoff: null,
  lineCutoff: null,
};

const notQualifying: Qualification = {
  weight: 0.5,
  weightedScore: 10,
  overallQualifies: false,
  lineQualifies: false,
  overallCutoff: 40,
  lineCutoff: 80,
};

describe('LeaderboardPanel', () => {
  it('shows the miss message with cutoff numbers when neither board qualifies', () => {
    render(
      <LeaderboardPanel
        qualification={notQualifying}
        score={20}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={() => ({ overallRank: null, lineRank: null })}
      />,
    );
    expect(screen.getByText(/didn't make the leaderboard/i)).toBeTruthy();
    expect(screen.getByText(/needs 80\+/i)).toBeTruthy();
    expect(screen.getByText(/needs 40\+/i)).toBeTruthy();
  });

  it('offers a name form when a board qualifies', () => {
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={['Ali']}
        onSubmit={() => ({ overallRank: 1, lineRank: 1 })}
      />,
    );
    expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /save score/i })).toBeTruthy();
  });

  it('lists known names for autocomplete', () => {
    const { container } = render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={['Ali', 'Bee']}
        onSubmit={() => ({ overallRank: 1, lineRank: 1 })}
      />,
    );
    expect(container.querySelectorAll('datalist option')).toHaveLength(2);
  });

  it('submits the trimmed name and shows the ranks achieved', () => {
    let submitted = '';
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={(name) => {
          submitted = name;
          return { overallRank: 4, lineRank: 2 };
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: '  Ali  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(submitted).toBe('Ali');
    expect(screen.getByText(/new kl monorail line record — #2/i)).toBeTruthy();
    expect(screen.getByText(/#4 overall/i)).toBeTruthy();
  });

  it('only reports the board it actually landed on', () => {
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={() => ({ overallRank: null, lineRank: 5 })}
      />,
    );
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(screen.getByText(/new kl monorail line record — #5/i)).toBeTruthy();
    expect(screen.queryByText(/overall/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/LeaderboardPanel.test.tsx`
Expected: FAIL — `./LeaderboardPanel` has no exports yet.

- [ ] **Step 3: Write the implementation**

Create `src/ui/leaderboard.css`:

```css
.leaderboard-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s);
  padding: var(--s2);
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
}

.leaderboard-panel input {
  width: 100%;
  padding: var(--s);
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
}
```

Create `src/ui/LeaderboardPanel.tsx`:

```tsx
import { useState } from 'react';
import type { Qualification } from '../data/leaderboardStore';
import './leaderboard.css';

export interface LeaderboardPanelProps {
  qualification: Qualification;
  score: number;
  lineName: string;
  knownNames: string[];
  onSubmit: (name: string) => { overallRank: number | null; lineRank: number | null };
}

export function LeaderboardPanel({
  qualification, score, lineName, knownNames, onSubmit,
}: LeaderboardPanelProps) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ overallRank: number | null; lineRank: number | null } | null>(null);

  if (result) {
    return (
      <div className="leaderboard-panel" role="status">
        {result.lineRank !== null && <p>New {lineName} line record — #{result.lineRank}!</p>}
        {result.overallRank !== null && <p>#{result.overallRank} overall!</p>}
      </div>
    );
  }

  const qualifies = qualification.overallQualifies || qualification.lineQualifies;

  if (!qualifies) {
    return (
      <div className="leaderboard-panel">
        <p>Didn&rsquo;t make the leaderboard this time.</p>
        {qualification.lineCutoff !== null && (
          <p>
            {lineName} line needs {Math.round(qualification.lineCutoff)}+ — you got {Math.round(score)}.
          </p>
        )}
        {qualification.overallCutoff !== null && (
          <p>
            Overall needs {Math.round(qualification.overallCutoff)}+ (weighted) — you got{' '}
            {Math.round(qualification.weightedScore)}.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="leaderboard-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setResult(onSubmit(trimmed));
      }}
    >
      <p>You made the leaderboard! Enter a name:</p>
      <input
        list="leaderboard-known-names"
        value={name}
        maxLength={24}
        required
        onChange={(e) => setName(e.target.value)}
        aria-label="Your name"
      />
      <datalist id="leaderboard-known-names">
        {knownNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <button type="submit">Save score</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/LeaderboardPanel.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/LeaderboardPanel.tsx src/ui/LeaderboardPanel.test.tsx src/ui/leaderboard.css
git commit -m "$(cat <<'EOF'
feat: add leaderboard name-entry panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

### Task 4: Wire the leaderboard into `SummaryScreen` and `LineRunScreen`

**Files:**
- Modify: `src/ui/SummaryScreen.tsx`
- Modify: `src/ui/SummaryScreen.test.tsx`
- Modify: `src/ui/LineRunScreen.tsx:115-117`
- Modify: `src/ui/LineRunScreen.test.tsx`

**Interfaces:**
- Consumes: `evaluateRun`, `knownNames`, `loadStore`, `submitEntry` from `../data/leaderboardStore` (Task 2); `LeaderboardPanel` from `./LeaderboardPanel` (Task 3).
- Produces: `SummaryScreen` gains an optional `leaderboardLine?: LineCode | null` prop (default `null`). Nothing downstream depends on new exports from this task.

- [ ] **Step 1: Write the failing tests**

In `src/ui/SummaryScreen.test.tsx`, add `beforeEach(() => localStorage.clear());` near the top (after the existing `afterEach`), and add `emptyStore, submitEntry` to a new import from `../data/leaderboardStore`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { music, sound } from '../audio/sound';
import { emptyStore, submitEntry } from '../data/leaderboardStore';
import { SummaryScreen } from './SummaryScreen';

const net = buildNetwork(loadNetworkData());
const finished = endRun(
  [...'Imbi'].reduce((s, k, i) => keyRun(net, s, k, i * 100), startRun(net, 'imbi', 0)),
);
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});
```

Then, at the end of the `describe('SummaryScreen', ...)` block (after the existing tests, before the closing `});`), add:

```tsx
  describe('leaderboard', () => {
    it('invites a name when the run qualifies for the leaderboard', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not show the leaderboard panel for a run with no eligible line', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });

    it('shows the miss message once the board is full of better scores', () => {
      let store = emptyStore();
      for (let i = 0; i < 20; i++) {
        store = submitEntry(net, store, {
          name: `p${i}`, lineCode: 'AG', metrics: { wpm: 999, accuracy: 1, score: 999 }, playedAt: i,
        }).store;
      }
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      expect(screen.getByText(/didn't make the leaderboard/i)).toBeTruthy();
    });

    it('records the entry and shows the achieved rank', () => {
      render(<SummaryScreen net={net} run={finished} onExit={() => {}} leaderboardLine="AG" />);
      fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
      fireEvent.click(screen.getByRole('button', { name: /save score/i }));
      expect(screen.getByText(/#1 overall/i)).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/SummaryScreen.test.tsx`
Expected: FAIL — `SummaryScreen` doesn't accept `leaderboardLine` and never renders a name field.

- [ ] **Step 3: Wire `SummaryScreen.tsx`**

Modify `src/ui/SummaryScreen.tsx`. Add imports, widen the props, and add the store/qualification state plus the panel:

```tsx
import { useMemo, useState, useEffect } from 'react';
import { music, sound } from '../audio/sound';
import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { runMetrics, type RunState } from '../engine/run';
import { fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import { evaluateRun, knownNames, loadStore, submitEntry } from '../data/leaderboardStore';
import { LeaderboardPanel } from './LeaderboardPanel';
import './summary.css';

export function SummaryScreen({
  net,
  run,
  onExit,
  leaderboardLine = null,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
  leaderboardLine?: LineCode | null;
}) {
  useEffect(() => {
    music.startMenu();
    return () => music.stopMenu();
  }, []);

  const times = [...run.stationTimes].sort((a, b) => a.ms - b.ms);
  const fastest = times[0];
  const slowest = times[times.length - 1];
  const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
  const metrics = runMetrics(run, run.startedAt + elapsed);
  const count = run.stationTimes.length;

  // Get journey points for SVG
  const { geo } = networkLayout();
  const travelledPoints = run.stationTimes.map((st) => {
    const pt = geo.get(st.id);
    return pt || { x: 0, y: 0 };
  });

  const hasJourney = travelledPoints.length > 0;
  const viewBox = hasJourney ? fitViewBox(travelledPoints, 0.15) : null;

  // Get the journey line colour
  const lineColour = run.line ? lineAt(net, run.line)?.colour : null;
  const pathColour = lineColour || 'var(--accent)';

  // The store is read once per summary: a completed run cannot change which
  // scores it is being compared against mid-screen.
  const [store, setStore] = useState(() => loadStore());
  const qualification = useMemo(
    () => (leaderboardLine ? evaluateRun(net, store, leaderboardLine, metrics) : null),
    [leaderboardLine, net, store, metrics.score, metrics.wpm, metrics.accuracy],
  );

  return (
    <div className="summary">
      <h2>Journey complete</h2>
      <p>{count === 1 ? '1 station' : `${count} stations`} this run</p>

      {hasJourney && viewBox && (
        <div className="summary-journey">
          <svg
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            role="img"
            aria-label={`Journey through ${count} station${count === 1 ? '' : 's'}`}
          >
            {[...net.lines.values()].map((line) => {
              const pts = line.stations
                .map((id) => geo.get(id))
                .filter((p): p is { x: number; y: number } => p !== undefined);
              if (pts.length === 0) return null;
              return (
                <polyline
                  key={`network-${line.code}`}
                  data-network={line.code}
                  points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                />
              );
            })}

            {travelledPoints.length > 0 && (
              <polyline
                data-journey="true"
                points={travelledPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                stroke={pathColour}
              />
            )}

            {travelledPoints.map((point, idx) => (
              <circle key={`station-${idx}`} data-station="true" cx={point.x} cy={point.y} r="6" />
            ))}
          </svg>
        </div>
      )}

      <div className="summary-stats">
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.wpm)}</div>
          <div className="summary-stat-label">WPM</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.accuracy * 100)}%</div>
          <div className="summary-stat-label">Accuracy</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.score)}</div>
          <div className="summary-stat-label">Score</div>
        </div>
      </div>

      {fastest && slowest && (
        <ul>
          <li>Fastest: {stationAt(net, fastest.id)?.name} ({(fastest.ms / 1000).toFixed(1)}s)</li>
          <li>Slowest: {stationAt(net, slowest.id)?.name} ({(slowest.ms / 1000).toFixed(1)}s)</li>
        </ul>
      )}

      {leaderboardLine && qualification && (
        <LeaderboardPanel
          qualification={qualification}
          score={metrics.score}
          lineName={lineAt(net, leaderboardLine)?.name ?? leaderboardLine}
          knownNames={knownNames(store)}
          onSubmit={(name) => {
            const result = submitEntry(net, store, {
              name, lineCode: leaderboardLine, metrics, playedAt: Date.now(),
            });
            setStore(result.store);
            return { overallRank: result.overallRank, lineRank: result.lineRank };
          }}
        />
      )}

      <button
        type="button"
        onClick={() => {
          sound.back();
          onExit();
        }}
      >
        Back to the map
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire `LineRunScreen.tsx`**

In `src/ui/LineRunScreen.tsx`, replace:

```tsx
  if (run.phase === 'ended' && !celebrating) {
    return <SummaryScreen net={net} run={run} onExit={onExit} />;
  }
```

with:

```tsx
  if (run.phase === 'ended' && !celebrating) {
    // Only a fully completed route is leaderboard-eligible — an early "End
    // run" click also sets phase to 'ended', but stationTimes falls short.
    const leaderboardLine = run.stationTimes.length === route.length ? line : null;
    return <SummaryScreen net={net} run={run} onExit={onExit} leaderboardLine={leaderboardLine} />;
  }
```

- [ ] **Step 5: Add `LineRunScreen` integration tests**

In `src/ui/LineRunScreen.test.tsx`, update the `beforeEach` to also stub reduced motion — without it, a completed run schedules a real 1100ms `setTimeout` before `SummaryScreen` renders (see `LineRunScreen.tsx`'s celebration effect), same trick `useLayoutMode.test.ts` already uses for the same function:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { LineRunScreen } from './LineRunScreen';

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

beforeEach(() => {
  localStorage.clear();
  // Skips the 1.1s post-completion celebration delay so completion tests
  // don't need real timers.
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
```

(the rest of the file — the four existing `it` blocks — is unchanged), then add a new `describe` block before the file's closing `});`:

```tsx
  describe('leaderboard', () => {
    it('invites the player to the leaderboard after completing the whole line', () => {
      render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
      for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not invite the player when the run ends early', () => {
      render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
      type('KL Sentral');
      fireEvent.click(screen.getByRole('button', { name: /end run/i }));
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/ui/SummaryScreen.test.tsx src/ui/LineRunScreen.test.tsx`
Expected: PASS, all tests green (including the pre-existing ones, unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/ui/SummaryScreen.tsx src/ui/SummaryScreen.test.tsx src/ui/LineRunScreen.tsx src/ui/LineRunScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat: surface the leaderboard on the run summary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

### Task 5: `ui/LeaderboardScreen.tsx` — full board browser

**Files:**
- Create: `src/ui/LeaderboardScreen.tsx`
- Test: `src/ui/LeaderboardScreen.test.tsx`

**Interfaces:**
- Consumes: `loadStore`, `type LeaderboardStore` from `../data/leaderboardStore` (Task 2); `type LeaderboardEntry` from `../engine/leaderboard` (Task 1); `LINE_CODES`, `type LineCode` from `../data/types`; `lineAt`, `type NetworkIndex` from `../engine/network`.
- Produces (consumed by Task 6):
  - `export interface LeaderboardScreenProps { net: NetworkIndex; onExit: () => void }`
  - `export function LeaderboardScreen(props: LeaderboardScreenProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/ui/LeaderboardScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyStore, saveStore, submitEntry } from '../data/leaderboardStore';
import { LeaderboardScreen } from './LeaderboardScreen';

const net = buildNetwork(loadNetworkData());
beforeEach(() => localStorage.clear());

describe('LeaderboardScreen', () => {
  it('shows an empty state when nothing has been recorded', () => {
    render(<LeaderboardScreen net={net} onExit={() => {}} />);
    expect(screen.getByText(/no scores yet/i)).toBeTruthy();
  });

  it('lists the overall board with a line column, ranked by weighted score', () => {
    let store = emptyStore();
    store = submitEntry(net, store, {
      name: 'Ali', lineCode: 'PY', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 1,
    }).store;
    store = submitEntry(net, store, {
      name: 'Bee', lineCode: 'MR', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 2,
    }).store;
    saveStore(store);

    render(<LeaderboardScreen net={net} onExit={() => {}} />);

    // Equal raw score, but Putrajaya (the longest line) weighs 1 vs KL
    // Monorail's ~0.24, so Ali's weighted score ranks first.
    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows[0]?.textContent).toContain('Ali');
    expect(rows[0]?.textContent).toContain('Putrajaya Line');
  });

  it('switches to a per-line board without a line column', () => {
    let store = emptyStore();
    store = submitEntry(net, store, {
      name: 'Ali', lineCode: 'MR', metrics: { wpm: 50, accuracy: 1, score: 50 }, playedAt: 1,
    }).store;
    saveStore(store);

    render(<LeaderboardScreen net={net} onExit={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'MR' }));

    expect(screen.queryByText(/^line$/i)).toBeNull();
    expect(screen.getByText('Ali')).toBeTruthy();
  });

  it('returns to the map', () => {
    const onExit = vi.fn();
    render(<LeaderboardScreen net={net} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/LeaderboardScreen.test.tsx`
Expected: FAIL — `./LeaderboardScreen` has no exports yet.

- [ ] **Step 3: Write the implementation**

Append to `src/ui/leaderboard.css`:

```css
.leaderboard-screen {
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.leaderboard-screen h2 { margin: 0; font-size: var(--t-lg); }

.leaderboard-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s);
}

.leaderboard-tabs [aria-selected='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.leaderboard-screen table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.leaderboard-screen th, .leaderboard-screen td {
  text-align: left;
  padding: var(--s) var(--s2);
  border-bottom: 1px solid var(--panel-edge);
}

.leaderboard-screen th { color: var(--dim); font-size: var(--t-xs); text-transform: uppercase; }
```

Create `src/ui/LeaderboardScreen.tsx`:

```tsx
import { useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { lineAt, type NetworkIndex } from '../engine/network';
import type { LeaderboardEntry } from '../engine/leaderboard';
import { loadStore, type LeaderboardStore } from '../data/leaderboardStore';
import './leaderboard.css';

export interface LeaderboardScreenProps {
  net: NetworkIndex;
  onExit: () => void;
}

type Tab = 'overall' | LineCode;

export function LeaderboardScreen({ net, onExit }: LeaderboardScreenProps) {
  const [store] = useState<LeaderboardStore>(() => loadStore());
  const [tab, setTab] = useState<Tab>('overall');

  const entries: LeaderboardEntry[] = tab === 'overall' ? store.overall : store.perLine[tab];

  return (
    <div className="leaderboard-screen">
      <h2>Leaderboard</h2>

      <div className="leaderboard-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overall'} onClick={() => setTab('overall')}>
          Overall
        </button>
        {LINE_CODES.map((code) => (
          <button key={code} type="button" role="tab" aria-selected={tab === code} onClick={() => setTab(code)}>
            {code}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p>No scores yet — be the first.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              {tab === 'overall' && <th>Line</th>}
              <th>Score</th>
              <th>WPM</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td>{i + 1}</td>
                <td>{entry.name}</td>
                {tab === 'overall' && <td>{lineAt(net, entry.lineCode)?.name ?? entry.lineCode}</td>}
                <td>{Math.round(tab === 'overall' ? entry.weightedScore : entry.score)}</td>
                <td>{Math.round(entry.wpm)}</td>
                <td>{Math.round(entry.accuracy * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" onClick={onExit}>Back to the map</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/LeaderboardScreen.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/LeaderboardScreen.tsx src/ui/LeaderboardScreen.test.tsx src/ui/leaderboard.css
git commit -m "$(cat <<'EOF'
feat: add the full leaderboard browser screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

### Task 6: Navigation — reach the leaderboard from the map

**Files:**
- Modify: `src/ui/HomeMap.tsx`
- Modify: `src/ui/HomeMap.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardScreen` from `./LeaderboardScreen` (Task 5).
- Produces: `HomeMap` gains a required `onOpenLeaderboard: () => void` prop; `App`'s internal `Screen` union gains `{ kind: 'leaderboard' }`. Nothing further downstream.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/ui/HomeMap.test.tsx` with (every `<HomeMap .../>` call now also passes `onOpenLeaderboard={noop}`, plus one new test at the end):

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { music, sound } from '../audio/sound';
import { HomeMap } from './HomeMap';

const net = buildNetwork(loadNetworkData());
const noop = () => {};
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeMap', () => {
  it('renders the network map', () => {
    const { container } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws the land backdrop beneath the tracks', () => {
    const { container } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />,
    );
    expect(container.querySelectorAll('.map-backdrop path').length).toBeGreaterThan(0);
  });

  it('starts a line run from a line chosen by click', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        onStartLine={(c, f) => (got = [c, f])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['KJ', 'gombak']);
  });

  it('starts a line run from a line chosen by typing its code', () => {
    let got: [string, string] | null = null;
    render(
      <HomeMap
        net={net}
        onStartLine={(c, f) => (got = [c, f])}
        onPickStation={noop}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: '1' });
    expect(got).toEqual(['MR', 'kl-sentral']);
  });

  it('offers to resume a saved journey', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    let picked = '';
    render(
      <HomeMap
        net={net}
        onStartLine={noop}
        onPickStation={(id) => (picked = id)}
        onOpenLeaderboard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(picked).toBe('imbi');
  });

  it('shows overall station progress', () => {
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />);
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem('myrapid.v1', 'not json {{{');
    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an icon-only sound toggle with accessible state', () => {
    const { container } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />,
    );

    const button = screen.getByRole('button', { name: /sound on/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText(/sound on/i)).toBeNull();

    fireEvent.click(button);

    expect(screen.getByRole('button', { name: /sound off/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/sound off/i)).toBeNull();
    expect(container.querySelectorAll('button svg').length).toBeGreaterThan(0);
  });

  it('starts and stops menu music with the home screen lifecycle', () => {
    const startMenu = vi.spyOn(music, 'startMenu').mockImplementation(() => {});
    const stopMenu = vi.spyOn(music, 'stopMenu').mockImplementation(() => {});

    const { unmount } = render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />,
    );

    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when opening station search', () => {
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});

    render(<HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));

    expect(select).toHaveBeenCalledTimes(1);
  });

  it('opens the leaderboard', () => {
    let opened = false;
    render(
      <HomeMap net={net} onStartLine={noop} onPickStation={noop} onOpenLeaderboard={() => (opened = true)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(opened).toBe(true);
  });
});
```

Then, in `src/ui/App.test.tsx`, add one new test:

```tsx
  it('opens the leaderboard from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeTruthy();
  });
```

(placed inside the existing `describe('App', ...)` block, after the other tests.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/HomeMap.test.tsx src/ui/App.test.tsx`
Expected: FAIL — `onOpenLeaderboard` isn't a `HomeMap` prop yet, and there's no "Leaderboard" button or route.

- [ ] **Step 3: Wire `HomeMap.tsx`**

In `src/ui/HomeMap.tsx`, widen the props:

```tsx
export interface HomeMapProps {
  net: NetworkIndex;
  onStartLine: (code: LineCode, from: string) => void;
  onPickStation: (stationId: string) => void;
  onOpenLeaderboard: () => void;
}

export function HomeMap({ net, onStartLine, onPickStation, onOpenLeaderboard }: HomeMapProps) {
```

Then add a new button right after "Start anywhere" and before `<SoundToggle />`:

```tsx
            <button type="button" onClick={() => {
              sound.select();
              setSearching((v) => !v);
            }}>
              Start anywhere
            </button>

            <button type="button" onClick={() => {
              sound.select();
              onOpenLeaderboard();
            }}>
              Leaderboard
            </button>

            <SoundToggle muted={muted} onToggle={toggleSound} />
```

- [ ] **Step 4: Wire `App.tsx`**

In `src/ui/App.tsx`, add the new screen kind, import, and route:

```tsx
import { useMemo, useState } from 'react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { setMuted, installAudioUnlock } from '../audio/sound';
import { HomeMap } from './HomeMap';
import { LineRunScreen } from './LineRunScreen';
import { AdventureScreen } from './AdventureScreen';
import { LeaderboardScreen } from './LeaderboardScreen';

type Screen =
  | { kind: 'home' }
  | { kind: 'line'; code: LineCode; from: string }
  | { kind: 'adventure'; at: string }
  | { kind: 'leaderboard' };

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  // Apply the stored sound preference once, before anything can play.
  useState(() => {
    setMuted(loadProfile().muted);
    installAudioUnlock();
  });

  if (import.meta.env.DEV) {
    const errors = validateNetworkData(data);
    if (errors.length > 0) console.error('network data errors:', errors);
  }

  const home = () => setScreen({ kind: 'home' });

  if (screen.kind === 'line') {
    return (
      <LineRunScreen net={net} line={screen.code} from={screen.from} onExit={home} />
    );
  }
  if (screen.kind === 'adventure') {
    return <AdventureScreen net={net} startAt={screen.at} onExit={home} />;
  }
  if (screen.kind === 'leaderboard') {
    return <LeaderboardScreen net={net} onExit={home} />;
  }
  return (
    <HomeMap
      net={net}
      onStartLine={(code, from) => setScreen({ kind: 'line', code, from })}
      onPickStation={(at) => setScreen({ kind: 'adventure', at })}
      onOpenLeaderboard={() => setScreen({ kind: 'leaderboard' })}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/ui/HomeMap.test.tsx src/ui/App.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, every test in the project green (the pre-existing 167 plus every test added by this plan).

Run: `npx tsc --noEmit`
Expected: clean, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/HomeMap.tsx src/ui/HomeMap.test.tsx src/ui/App.tsx src/ui/App.test.tsx
git commit -m "$(cat <<'EOF'
feat: reach the leaderboard from the home map

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HYgJQTrACSw9skXV7usabs
EOF
)"
```

---

## Self-Review

**Spec coverage** (against the Global Constraints, since there's no separate spec doc):

- Line Run only, full completion required → Task 4 (`leaderboardLine` computed from `stationTimes.length === route.length`, Adventure never passes it).
- Weighting formula, character-count based → Task 1 (`lineCharCount`, `weightForLine`).
- Per-line boards by raw score, overall by weighted → Task 2 (`evaluateRun`/`submitEntry` use `'score'` for `perLine`, `'weightedScore'` for `overall`).
- Top 20 both boards → Task 1 (`LEADERBOARD_LIMIT`), enforced by `rankedInsert`'s `limit` param used everywhere in Task 2.
- Duplicate names allowed → no dedup logic anywhere in Tasks 1–2; covered by a test in Task 2 (two `submitEntry` calls with the same name both landing).
- Tie-break rule → Task 1 (`compareEntries`), tested directly.
- Qualify-gated name entry with autocomplete, trim, required, max 24 → Task 3 (`LeaderboardPanel`), wired in Task 4.
- "So close" miss copy with exact cutoff numbers → Task 3 (the `!qualifies` branch), tested.
- Independent per-board qualification, combined success message → Task 2 (`SubmitResult` has both ranks) + Task 3 (renders each independently), tested by "only reports the board it actually landed on".
- Storage split (pure engine vs. impure data) → Tasks 1 and 2 are separate files by construction.
- Dedicated `LeaderboardScreen` reached from `HomeMap` → Tasks 5–6.

No gaps found.

**Placeholder scan:** no "TBD"/"handle appropriately"/"similar to Task N" language anywhere above; every step has real code or an exact shell command.

**Type consistency check:**
- `LeaderboardEntry`, `LeaderboardKey`, `LEADERBOARD_LIMIT` (Task 1) are used with identical names and shapes in Task 2's imports.
- `Qualification` (Task 2) is used with identical field names (`overallQualifies`, `lineQualifies`, `overallCutoff`, `lineCutoff`, `weight`, `weightedScore`) in Task 3's props and Task 4's `SummaryScreen` usage.
- `SubmitResult`'s `{ overallRank, lineRank }` shape matches `LeaderboardPanelProps.onSubmit`'s return type exactly.
- `LeaderboardStore`'s `perLine: Record<LineCode, LeaderboardEntry[]>` is read the same way (`store.perLine[code]`) in Task 2, Task 4, and Task 5.
- `HomeMapProps.onOpenLeaderboard` (Task 6) matches the callback `App.tsx` passes.
