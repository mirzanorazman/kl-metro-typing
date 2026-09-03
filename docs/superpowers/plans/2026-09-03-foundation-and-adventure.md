# MyRapid Typing — Plan 1: Foundation and Adventure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete, playable Adventure mode — free-roam the Rapid KL rail network by typing station names, with a dual-layout SVG map, junction routing, permanent station unlocking, and local progress.

**Architecture:** Static Vite + React + TypeScript SPA, no server. Network data lives in three JSON files; adjacency, screen coordinates, and schematic layout are all *derived* at load rather than stored, so there is one source of truth for each fact. The correctness-critical modules (`engine/typing`, `engine/network`) are pure functions with no React, timers, or storage, and carry the bulk of the test suite. React renders state and owns no game logic.

**Tech Stack:** Vite, React 18, TypeScript (strict), Vitest, SVG (no canvas, no map library, no state library).

**Spec:** `docs/superpowers/specs/2026-09-03-myrapid-typing-design.md`

**Plan 2 (Rush Hour) is written after this plan completes.**

---

## Two deliberate refinements to the spec

Both improve on the spec as written. They are noted here so the deviation is intentional and reviewable, not accidental.

**1. Schematic coordinates are derived, not stored.** The spec has each station record carrying a `schematic: {x, y}` pair. Storing ~180 hand-placed points has two problems: octolinearity is only as good as the hand-placement, and an interchange served by three lines has three chances to disagree with itself.

Instead each *line* carries a path description — a start point and a list of `[compass direction, number of gaps]` segments. A pure function expands that into per-station positions. Octolinearity is then true **by construction** (only the eight compass directions exist), and the validation test asserts that every interchange resolves to the same point from every line that serves it. Authoring 7 short path descriptions is also far less work than placing 180 points.

**2. Geographic screen coordinates are derived too.** `stations.json` stores real `lat`/`lng` only. The projection to screen space happens at load. There is no duplicated, drift-prone copy.

The renderer is unaffected: it still only ever reads a resolved `{x, y}`, exactly as the spec requires.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/types.ts` | All shared types. No logic. |
| `src/data/lines.json` | 7 lines: code, name, colour, termini, ordered station ids, schematic path |
| `src/data/stations.json` | Per station: id, name, per-line codes, demand, lat/lng |
| `src/data/links.json` | Walk-transfer pairs between differently-named stations |
| `src/data/load.ts` | Parses JSON into typed objects; single entry point for data |
| `src/data/validate.ts` | Pure data-integrity checks, returns error list |
| `src/geo/project.ts` | lat/lng → screen x/y (Web Mercator, fit to viewport) |
| `src/geo/schematic.ts` | Expands line path descriptions → octolinear x/y |
| `src/geo/layout.ts` | Resolves the active layout + interpolates between the two |
| `src/engine/network.ts` | Graph: neighbours, onward options, line completion |
| `src/engine/typing.ts` | Typing state machine |
| `src/engine/metrics.ts` | WPM, accuracy, score |
| `src/engine/run.ts` | Run lifecycle: position, advance, junction pause, history |
| `src/engine/progress.ts` | localStorage, schema version, migration, corrupt recovery |
| `src/render/MapCanvas.tsx` | SVG map: line polylines, station marks, pan/zoom |
| `src/render/TrainMarker.tsx` | Animated train position along a segment |
| `src/render/LineStrip.tsx` | Current-line strip showing where you are |
| `src/render/Prompt.tsx` | Station name prompt with per-character state |
| `src/render/HUD.tsx` | Live WPM / accuracy / station count |
| `src/ui/App.tsx` | Screen routing |
| `src/ui/HomeScreen.tsx` | Mode menu, per-line progress, disclaimer |
| `src/ui/StationSearch.tsx` | Fuzzy station picker for run start |
| `src/ui/AdventureScreen.tsx` | Wires engine + render together |
| `src/ui/JunctionPicker.tsx` | Direction choice at junctions |
| `src/ui/SummaryScreen.tsx` | End-of-run stats |
| `src/ui/useKeyboard.ts` | Keystroke capture hook |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx` (all from the Vite template)
- Create: `src/smoke.test.ts`

The template's own `src/App.tsx` stays untouched until Task 24 replaces it with `src/ui/App.tsx`.

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/mirzahaikarl/Developer/Projects/myrapid-typing
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Configure Vitest**

Replace `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Enable strict TypeScript**

In `tsconfig.json` under `compilerOptions`, ensure:

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"resolveJsonModule": true
```

`noUncheckedIndexedAccess` matters here: this codebase indexes into station and line maps constantly, and it turns "that id might not exist" into a compile error instead of a runtime crash.

- [ ] **Step 4: Write a smoke test**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript with Vitest"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/data/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type LineCode = 'KJ' | 'AG' | 'SP' | 'SA' | 'MR' | 'KG' | 'PY';

export const LINE_CODES: LineCode[] = ['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY'];

/** The eight octolinear directions a schematic segment may run in. */
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** One straight run of the schematic diagram: a direction and a number of station gaps. */
export type Segment = [Compass, number];

export interface Point {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Line {
  code: LineCode;
  name: string;
  /** Hex colour taken from the official network map. Never invented. */
  colour: string;
  termini: [string, string];
  /** Ordered station ids, first terminus to second. */
  stations: string[];
  /** Schematic layout: where the line starts and how it runs. */
  schematic: {
    start: Point;
    segments: Segment[];
  };
}

export interface Station {
  /** Slug, e.g. "masjid-jamek". Stable across lines. */
  id: string;
  name: string;
  /** Official per-line code, e.g. { KJ: "KJ13", AG: "AG7" }. Keys are the lines served. */
  codes: Partial<Record<LineCode, string>>;
  /** Passenger spawn weight for Rush Hour. 1 = ordinary stop. */
  demand: number;
  geo: LatLng;
}

/** Two differently-named stations joined by a walkway. */
export interface WalkLink {
  a: string;
  b: string;
}

export interface NetworkData {
  lines: Line[];
  stations: Station[];
  links: WalkLink[];
}
```

Note there is no `lines: LineCode[]` field on `Station` — the lines a station serves are the keys of `codes`, so the fact is stored once. `linesOf()` in Task 5 reads it.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add src/data/types.ts
git commit -m "feat: add shared network types"
```

---

## Task 3: Line and station data

This is the one genuinely laborious task in the plan. **Every value here is a fact to be transcribed from a public source, never recalled or invented** — a wrong coordinate produces a visibly broken map, and a wrong station order produces an unplayable line.

**Sources:**
- Official integrated transit map (line colours, codes, interchanges): `https://myrapid.com.my/wp-content/uploads/2023/03/20230211_integrated_kv_transit_map.pdf`
- Rapid KL rail pages: `https://myrapid.com.my/bus-train/rapid-kl/lrt/`
- Wikipedia per-line articles for ordered station lists and coordinates: `Kelana Jaya line`, `Ampang line`, `Sri Petaling line`, `Shah Alam line`, `KL Monorail`, `Kajang line`, `Putrajaya line`
- Each station's own Wikipedia article carries its lat/long in the infobox

**Files:**
- Create: `src/data/lines.json`, `src/data/stations.json`, `src/data/links.json`

- [ ] **Step 1: Transcribe the line list**

Write `src/data/lines.json` as an array of 7 objects. Fill `code`, `name`, `colour` (hex from the official map legend), `termini`, and `stations` (ordered slug ids, first terminus to second). Leave `schematic` out for now — **Task 9** authors it. The type check stays green in the meantime: the loader's `as Line[]` assertion in Task 4 is legal because `Line` is assignable to the JSON's inferred shape. Nothing reads `line.schematic` until Task 9.

The 7 lines and their routes:

| code | name | route |
|---|---|---|
| KJ | Kelana Jaya Line | Gombak ↔ Putra Heights |
| AG | Ampang Line | Sentul Timur ↔ Ampang |
| SP | Sri Petaling Line | Sentul Timur ↔ Putra Heights |
| SA | Shah Alam Line | Bandar Utama ↔ Johan Setia |
| MR | KL Monorail | KL Sentral ↔ Titiwangsa |
| KG | Kajang Line | Kwasa Damansara ↔ Kajang |
| PY | Putrajaya Line | Kwasa Damansara ↔ Putrajaya Sentral |

Station ids are kebab-case slugs of the display name (`Taman Paramount` → `taman-paramount`, `KL Sentral` → `kl-sentral`, `SS 15` → `ss-15`).

**Three things that must be right:**
- Ampang and Sri Petaling share every station from Sentul Timur through Chan Sow Lin. Those station ids appear in *both* lines' `stations` arrays — the same id, not two copies.
- Sri Petaling and Kelana Jaya both terminate at `putra-heights`. Same id.
- Kajang and Putrajaya both start at `kwasa-damansara` and share stations to Kampung Batu... verify the exact shared range against the map rather than assuming.

Worked example — the Monorail, the shortest line:

```json
{
  "code": "MR",
  "name": "KL Monorail",
  "colour": "<hex from official map legend>",
  "termini": ["KL Sentral", "Titiwangsa"],
  "stations": [
    "kl-sentral", "tun-sambanthan", "maharajalela", "hang-tuah", "imbi",
    "bukit-bintang", "raja-chulan", "bukit-nanas", "medan-tuanku",
    "chow-kit", "titiwangsa"
  ]
}
```

- [ ] **Step 2: Transcribe the stations**

Write `src/data/stations.json` as an array of `Station` objects — one per **unique** station id used anywhere in `lines.json`. Set `demand` to 1 for ordinary stops; 3 for the busiest hubs (`kl-sentral`, `klcc`, `masjid-jamek`); 2 for other multi-line interchanges. `codes` maps each line the station serves to its official code on that line.

```json
{
  "id": "masjid-jamek",
  "name": "Masjid Jamek",
  "codes": { "KJ": "KJ13", "AG": "AG7", "SP": "SP7" },
  "demand": 3,
  "geo": { "lat": 3.1497, "lng": 101.6958 }
}
```

Verify every `lat`/`lng` against the station's Wikipedia infobox. Klang Valley coordinates all fall within roughly `lat 2.85–3.30`, `lng 101.35–101.80` — Task 6's validation asserts this, which catches transposed or mistyped pairs immediately.

- [ ] **Step 3: Transcribe the walk links**

Write `src/data/links.json` — pairs of differently-named stations joined by a walkway. Confirm each against the official map's interchange symbols (it distinguishes same-station interchange from linked-by-walkway). Do not include same-name interchanges; those need no entry.

Note: Hang Tuah is a single three-line interchange (AG/SP/MR), **not** a walkway pair with Imbi. An earlier draft of this plan had that wrong.

```json
[
  { "a": "sultan-ismail", "b": "medan-tuanku" },
  { "a": "dang-wangi", "b": "bukit-nanas" },
  { "a": "plaza-rakyat", "b": "merdeka" },
  { "a": "kl-sentral", "b": "muzium-negara" },
  { "a": "glenmarie", "b": "glenmarie-2" }
]
```

- [ ] **Step 4: Sanity-check the counts**

```bash
node -e "const l=require('./src/data/lines.json'),s=require('./src/data/stations.json');
const ids=new Set(l.flatMap(x=>x.stations));
console.log('lines',l.length,'unique station ids',ids.size,'station records',s.length);
l.forEach(x=>console.log(x.code,x.stations.length));"
```

Expected: 7 lines, and `unique station ids` exactly equal to `station records`. A mismatch means a typo'd slug or a missing record — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/data/
git commit -m "feat: add Rapid KL line, station, and walk-link data"
```

---

## Task 4: Data loader

**Files:**
- Create: `src/data/load.ts`
- Test: `src/data/load.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from './load';

describe('loadNetworkData', () => {
  it('loads all seven lines', () => {
    const data = loadNetworkData();
    expect(data.lines).toHaveLength(7);
  });

  it('gives every line at least two stations', () => {
    for (const line of loadNetworkData().lines) {
      expect(line.stations.length).toBeGreaterThan(1);
    }
  });

  it('has a station record for every referenced id', () => {
    const data = loadNetworkData();
    const ids = new Set(data.stations.map((s) => s.id));
    for (const line of data.lines) {
      for (const id of line.stations) expect(ids.has(id)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- load`
Expected: FAIL, cannot resolve `./load`.

- [ ] **Step 3: Write the loader**

```ts
import type { Line, Station, WalkLink, NetworkData } from './types';
import linesJson from './lines.json';
import stationsJson from './stations.json';
import linksJson from './links.json';

/** Single entry point for network data. Nothing else imports the JSON directly. */
export function loadNetworkData(): NetworkData {
  return {
    lines: linesJson as Line[],
    stations: stationsJson as Station[],
    links: linksJson as WalkLink[],
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- load`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/load.ts src/data/load.test.ts
git commit -m "feat: add typed network data loader"
```

---

## Task 5: Network index and neighbours

**Files:**
- Create: `src/engine/network.ts`
- Test: `src/engine/network.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, linesOf, neighboursOf, stationAt } from './network';

const net = buildNetwork(loadNetworkData());

describe('buildNetwork', () => {
  it('indexes every station by id', () => {
    expect(stationAt(net, 'kl-sentral')?.name).toBe('KL Sentral');
  });
});

describe('linesOf', () => {
  it('reads the lines a station serves from its codes', () => {
    const jamek = stationAt(net, 'masjid-jamek')!;
    expect(linesOf(jamek).sort()).toEqual(['AG', 'KJ', 'SP']);
  });
});

describe('neighboursOf', () => {
  it('gives a mid-line station two rail neighbours on one line', () => {
    const n = neighboursOf(net, 'raja-chulan').filter((x) => x.line === 'MR');
    expect(n.map((x) => x.station).sort()).toEqual(['bukit-bintang', 'bukit-nanas']);
  });

  it('gives a terminus exactly one rail neighbour on that line', () => {
    const n = neighboursOf(net, 'gombak').filter((x) => x.line === 'KJ');
    expect(n).toHaveLength(1);
  });

  it('includes walk links with a null line', () => {
    const walk = neighboursOf(net, 'dang-wangi').filter((x) => x.line === null);
    expect(walk.map((x) => x.station)).toContain('bukit-nanas');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- network`
Expected: FAIL, cannot resolve `./network`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Line, LineCode, NetworkData, Station } from '../data/types';

export interface NetworkIndex {
  lines: Map<LineCode, Line>;
  stations: Map<string, Station>;
  /** station id -> walk-linked station ids */
  walk: Map<string, string[]>;
  /** line -> (station id -> index along the line) */
  order: Map<LineCode, Map<string, number>>;
}

/** A rail neighbour has a line; a walk-link neighbour has null. */
export interface Neighbour {
  station: string;
  line: LineCode | null;
}

export function buildNetwork(data: NetworkData): NetworkIndex {
  const lines = new Map(data.lines.map((l) => [l.code, l]));
  const stations = new Map(data.stations.map((s) => [s.id, s]));

  const order = new Map<LineCode, Map<string, number>>();
  for (const line of data.lines) {
    order.set(line.code, new Map(line.stations.map((id, i) => [id, i])));
  }

  const walk = new Map<string, string[]>();
  const addWalk = (from: string, to: string) => {
    const list = walk.get(from) ?? [];
    list.push(to);
    walk.set(from, list);
  };
  for (const link of data.links) {
    addWalk(link.a, link.b);
    addWalk(link.b, link.a);
  }

  return { lines, stations, walk, order };
}

export function stationAt(net: NetworkIndex, id: string): Station | undefined {
  return net.stations.get(id);
}

export function lineAt(net: NetworkIndex, code: LineCode): Line | undefined {
  return net.lines.get(code);
}

/** The lines a station serves. Stored once, as the keys of its code map. */
export function linesOf(station: Station): LineCode[] {
  return Object.keys(station.codes) as LineCode[];
}

export function neighboursOf(net: NetworkIndex, id: string): Neighbour[] {
  const station = net.stations.get(id);
  if (!station) return [];

  const out: Neighbour[] = [];
  for (const code of linesOf(station)) {
    const line = net.lines.get(code);
    const idx = net.order.get(code)?.get(id);
    if (!line || idx === undefined) continue;
    const before = line.stations[idx - 1];
    const after = line.stations[idx + 1];
    if (before !== undefined) out.push({ station: before, line: code });
    if (after !== undefined) out.push({ station: after, line: code });
  }

  for (const to of net.walk.get(id) ?? []) {
    out.push({ station: to, line: null });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- network`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/network.ts src/engine/network.test.ts
git commit -m "feat: add network index and neighbour queries"
```

---

## Task 6: Onward options at a junction

This is the routing core. Three rules interact: you may not immediately reverse, a terminus must reverse, and the Ampang/Sri Petaling shared trunk means one physical direction can belong to two lines.

**Files:**
- Modify: `src/engine/network.ts`
- Modify: `src/engine/network.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/network.test.ts`:

```ts
import { onwardOptions, walkOptions } from './network';

describe('onwardOptions', () => {
  it('excludes the station just arrived from', () => {
    const opts = onwardOptions(net, 'raja-chulan', 'bukit-bintang');
    expect(opts.map((o) => o.next)).not.toContain('bukit-bintang');
    expect(opts.map((o) => o.next)).toContain('bukit-nanas');
  });

  it('offers both directions when starting a run', () => {
    const opts = onwardOptions(net, 'raja-chulan', null);
    expect(opts.map((o) => o.next).sort()).toEqual(['bukit-bintang', 'bukit-nanas']);
  });

  it('reverses at a terminus rather than returning nothing', () => {
    const line = net.lines.get('MR')!;
    const secondLast = line.stations[line.stations.length - 2]!;
    const opts = onwardOptions(net, 'titiwangsa', secondLast).filter((o) => o.line === 'MR');
    expect(opts.map((o) => o.next)).toEqual([secondLast]);
  });

  it('reverses on a line that ends here while still offering the other lines', () => {
    // Titiwangsa is the Monorail terminus AND an AG/SP/PY interchange.
    const opts = onwardOptions(net, 'titiwangsa', 'chow-kit');
    expect(opts.some((o) => o.line === 'MR' && o.next === 'chow-kit')).toBe(true);
    expect(opts.some((o) => o.line !== 'MR')).toBe(true);
  });

  it('offers both lines out of the Ampang / Sri Petaling trunk split', () => {
    const opts = onwardOptions(net, 'chan-sow-lin', null);
    const codes = new Set(opts.map((o) => o.line));
    expect(codes.has('AG')).toBe(true);
    expect(codes.has('SP')).toBe(true);
  });

  it('labels each option with the terminus it heads toward', () => {
    const opts = onwardOptions(net, 'raja-chulan', 'bukit-bintang');
    expect(opts[0]!.toward).toBeTruthy();
  });
});

describe('walkOptions', () => {
  it('lists walk transfers separately from rail directions', () => {
    expect(walkOptions(net, 'dang-wangi')).toContain('bukit-nanas');
    expect(onwardOptions(net, 'dang-wangi', null).map((o) => o.next))
      .not.toContain('bukit-nanas');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- network`
Expected: FAIL, `onwardOptions is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/engine/network.ts`:

```ts
/** One rail direction the train may take out of a station. */
export interface Direction {
  line: LineCode;
  /** The station this direction leads to next. */
  next: string;
  /** Terminus name this direction heads toward, for display. */
  toward: string;
}

function railDirections(net: NetworkIndex, id: string): Direction[] {
  const station = net.stations.get(id);
  if (!station) return [];

  const out: Direction[] = [];
  for (const code of linesOf(station)) {
    const line = net.lines.get(code);
    const idx = net.order.get(code)?.get(id);
    if (!line || idx === undefined) continue;

    const back = line.stations[idx - 1];
    const fwd = line.stations[idx + 1];
    if (back !== undefined) out.push({ line: code, next: back, toward: line.termini[0] });
    if (fwd !== undefined) out.push({ line: code, next: fwd, toward: line.termini[1] });
  }
  return out;
}

/**
 * Directions available from `at`, having arrived from `arrivedFrom`
 * (null when starting a run).
 *
 * Immediate reversal is filtered out, so the player cannot bounce back and
 * forth on a through line. The exception is per-LINE, not global: if the line
 * you arrived on ends here, reversing on that line is offered even when other
 * lines still have somewhere to go. Titiwangsa is the case that forces this —
 * it is the Monorail terminus but also serves AG, SP, and PY, so a global
 * "only reverse when there is nothing else" rule would strand the player at
 * the end of the Monorail.
 */
export function onwardOptions(
  net: NetworkIndex,
  at: string,
  arrivedFrom: string | null,
): Direction[] {
  const all = railDirections(net, at);
  if (arrivedFrom === null) return all;

  const forward = all.filter((d) => d.next !== arrivedFrom);
  const linesWithForward = new Set(forward.map((d) => d.line));

  const terminusReversals = all.filter(
    (d) => d.next === arrivedFrom && !linesWithForward.has(d.line),
  );

  const options = [...forward, ...terminusReversals];
  return options.length > 0 ? options : all;
}

/** Walk transfers out of a station. Free in Adventure. */
export function walkOptions(net: NetworkIndex, at: string): string[] {
  return net.walk.get(at) ?? [];
}

/** True when every station on the line is present in `visited`. */
export function isLineComplete(
  net: NetworkIndex,
  code: LineCode,
  visited: ReadonlySet<string>,
): boolean {
  const line = net.lines.get(code);
  if (!line) return false;
  return line.stations.every((id) => visited.has(id));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- network`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/network.ts src/engine/network.test.ts
git commit -m "feat: add onward direction, walk, and line-completion queries"
```

---

## Task 7: Data validation

Bad data must fail at test time, never render a broken map at runtime.

**Files:**
- Create: `src/data/validate.ts`
- Test: `src/data/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from './load';
import { validateNetworkData } from './validate';

describe('validateNetworkData', () => {
  it('reports no errors for the shipped data', () => {
    expect(validateNetworkData(loadNetworkData())).toEqual([]);
  });

  it('catches a station referenced by a line but missing a record', () => {
    const data = loadNetworkData();
    const broken = { ...data, stations: data.stations.filter((s) => s.id !== 'imbi') };
    expect(validateNetworkData(broken).join(' ')).toContain('imbi');
  });

  it('catches a station whose codes disagree with the lines listing it', () => {
    const data = loadNetworkData();
    const stations = data.stations.map((s) =>
      s.id === 'imbi' ? { ...s, codes: {} } : s,
    );
    expect(validateNetworkData({ ...data, stations }).join(' ')).toContain('imbi');
  });

  it('catches coordinates outside the Klang Valley', () => {
    const data = loadNetworkData();
    const stations = data.stations.map((s) =>
      s.id === 'imbi' ? { ...s, geo: { lat: 51.5, lng: -0.12 } } : s,
    );
    expect(validateNetworkData({ ...data, stations }).join(' ')).toContain('imbi');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- validate`
Expected: FAIL, cannot resolve `./validate`.

- [ ] **Step 3: Write the implementation**

```ts
import type { LineCode, NetworkData } from './types';

/** Klang Valley bounding box. Anything outside is a transcription error. */
const BOUNDS = { minLat: 2.85, maxLat: 3.3, minLng: 101.35, maxLng: 101.8 };

/** Returns a list of human-readable problems. Empty means the data is sound. */
export function validateNetworkData(data: NetworkData): string[] {
  const errors: string[] = [];
  const byId = new Map(data.stations.map((s) => [s.id, s]));

  if (byId.size !== data.stations.length) {
    errors.push('duplicate station ids in stations.json');
  }

  /** station id -> lines that list it, built from lines.json */
  const listedBy = new Map<string, Set<LineCode>>();

  for (const line of data.lines) {
    const seen = new Set<string>();
    for (const id of line.stations) {
      if (seen.has(id)) errors.push(`line ${line.code} lists ${id} more than once`);
      seen.add(id);

      if (!byId.has(id)) {
        errors.push(`line ${line.code} references unknown station ${id}`);
        continue;
      }
      const set = listedBy.get(id) ?? new Set<LineCode>();
      set.add(line.code);
      listedBy.set(id, set);
    }
    if (line.stations.length < 2) {
      errors.push(`line ${line.code} has fewer than two stations`);
    }
  }

  for (const station of data.stations) {
    const listed = listedBy.get(station.id);
    if (!listed || listed.size === 0) {
      errors.push(`station ${station.id} is not on any line`);
      continue;
    }

    const declared = new Set(Object.keys(station.codes) as LineCode[]);
    for (const code of listed) {
      if (!declared.has(code)) {
        errors.push(`station ${station.id} is on line ${code} but has no ${code} code`);
      }
    }
    for (const code of declared) {
      if (!listed.has(code)) {
        errors.push(`station ${station.id} declares a ${code} code but is not on line ${code}`);
      }
    }

    const { lat, lng } = station.geo;
    const inBounds =
      lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat &&
      lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;
    if (!inBounds) {
      errors.push(`station ${station.id} has coordinates outside the Klang Valley: ${lat}, ${lng}`);
    }

    if (!(station.demand >= 1)) {
      errors.push(`station ${station.id} has an invalid demand weight`);
    }
  }

  for (const link of data.links) {
    if (link.a === link.b) errors.push(`walk link joins ${link.a} to itself`);
    if (!byId.has(link.a)) errors.push(`walk link references unknown station ${link.a}`);
    if (!byId.has(link.b)) errors.push(`walk link references unknown station ${link.b}`);
  }

  return errors;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- validate`
Expected: PASS, 4 tests. If the first test fails, the shipped data has a real problem — fix `src/data/*.json`, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/data/validate.ts src/data/validate.test.ts
git commit -m "feat: add network data validation with a shipped-data test"
```

---

## Task 8: Geographic projection

**Files:**
- Create: `src/geo/project.ts`
- Test: `src/geo/project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { projectStations } from './project';

const vp = { width: 1000, height: 800, padding: 40 };
const pts = projectStations(loadNetworkData().stations, vp);

describe('projectStations', () => {
  it('projects every station', () => {
    expect(pts.size).toBe(loadNetworkData().stations.length);
  });

  it('keeps every point inside the padded viewport', () => {
    for (const p of pts.values()) {
      expect(p.x).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.x).toBeLessThanOrEqual(vp.width - vp.padding + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.y).toBeLessThanOrEqual(vp.height - vp.padding + 0.001);
    }
  });

  it('puts a northern station above a southern one', () => {
    const gombak = pts.get('gombak')!;
    const putrajaya = pts.get('putrajaya-sentral')!;
    expect(gombak.y).toBeLessThan(putrajaya.y);
  });

  it('puts an eastern station right of a western one', () => {
    expect(pts.get('ampang')!.x).toBeGreaterThan(pts.get('johan-setia')!.x);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- project`
Expected: FAIL, cannot resolve `./project`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Point, Station } from '../data/types';

export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

/** Web Mercator northing. Longitude needs no transform. */
export function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * Projects stations to screen space, fitting the whole network into the
 * padded viewport at a uniform scale so the map is not stretched.
 */
export function projectStations(stations: Station[], vp: Viewport): Map<string, Point> {
  const out = new Map<string, Point>();
  if (stations.length === 0) return out;

  const xs = stations.map((s) => s.geo.lng);
  const ys = stations.map((s) => mercatorY(s.geo.lat));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const usableW = vp.width - vp.padding * 2;
  const usableH = vp.height - vp.padding * 2;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  // Centre whatever the uniform scale leaves over.
  const offsetX = vp.padding + (usableW - spanX * scale) / 2;
  const offsetY = vp.padding + (usableH - spanY * scale) / 2;

  for (const s of stations) {
    const my = mercatorY(s.geo.lat);
    out.set(s.id, {
      x: offsetX + (s.geo.lng - minX) * scale,
      // Screen y grows downward; mercator y grows northward. Flip it.
      y: offsetY + (maxY - my) * scale,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- project`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/geo/project.ts src/geo/project.test.ts
git commit -m "feat: add Web Mercator projection fitted to the viewport"
```

---

## Task 9: Schematic layout

Octolinear by construction: each line is described as a start point plus straight runs in one of eight compass directions, and a pure function expands that into station positions.

**Files:**
- Create: `src/geo/schematic.ts`
- Modify: `src/data/lines.json`, `src/data/validate.ts`, `src/data/validate.test.ts`
- Test: `src/geo/schematic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { expandLine, buildSchematic, STEP } from './schematic';
import type { Line } from '../data/types';

const stub: Line = {
  code: 'MR',
  name: 'Test',
  colour: '#000000',
  termini: ['A', 'C'],
  stations: ['a', 'b', 'c'],
  schematic: { start: { x: 100, y: 100 }, segments: [['E', 1], ['SE', 1]] },
};

describe('expandLine', () => {
  it('places the first station at the start point', () => {
    expect(expandLine(stub).get('a')).toEqual({ x: 100, y: 100 });
  });

  it('advances one grid step per gap in the segment direction', () => {
    expect(expandLine(stub).get('b')).toEqual({ x: 100 + STEP, y: 100 });
    expect(expandLine(stub).get('c')).toEqual({ x: 100 + STEP * 2, y: 100 + STEP });
  });

  it('throws when the segments do not account for every gap', () => {
    const bad = { ...stub, schematic: { ...stub.schematic, segments: [['E', 1] as const] } };
    expect(() => expandLine(bad as Line)).toThrow(/gap/i);
  });
});

describe('buildSchematic (shipped data)', () => {
  it('resolves every station to exactly one point', async () => {
    const { loadNetworkData } = await import('../data/load');
    const data = loadNetworkData();
    const { points, conflicts } = buildSchematic(data.lines);
    expect(conflicts).toEqual([]);
    expect(points.size).toBe(data.stations.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- schematic`
Expected: FAIL, cannot resolve `./schematic`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Compass, Line, Point } from '../data/types';

/** Grid spacing between adjacent stations, in schematic units. */
export const STEP = 44;

const DELTA: Record<Compass, Point> = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 },
};

/**
 * Expands one line's path description into per-station positions.
 * Only the eight compass directions exist, so the result is octolinear
 * by construction rather than by careful hand-placement.
 */
export function expandLine(line: Line, step = STEP): Map<string, Point> {
  const totalGaps = line.schematic.segments.reduce((n, [, count]) => n + count, 0);
  const needed = line.stations.length - 1;
  if (totalGaps !== needed) {
    throw new Error(
      `line ${line.code}: segments describe ${totalGaps} gaps but the line has ${needed}`,
    );
  }

  const out = new Map<string, Point>();
  let cursor = { ...line.schematic.start };
  let i = 0;
  out.set(line.stations[0]!, { ...cursor });

  for (const [dir, count] of line.schematic.segments) {
    const d = DELTA[dir];
    for (let n = 0; n < count; n++) {
      cursor = { x: cursor.x + d.x * step, y: cursor.y + d.y * step };
      i++;
      out.set(line.stations[i]!, { ...cursor });
    }
  }
  return out;
}

/**
 * Merges every line's expansion. A station served by several lines must
 * resolve to the same point from each of them; anything else is a conflict.
 */
export function buildSchematic(
  lines: Line[],
  step = STEP,
): { points: Map<string, Point>; conflicts: string[] } {
  const points = new Map<string, Point>();
  const conflicts: string[] = [];

  for (const line of lines) {
    for (const [id, p] of expandLine(line, step)) {
      const existing = points.get(id);
      if (!existing) {
        points.set(id, p);
      } else if (existing.x !== p.x || existing.y !== p.y) {
        conflicts.push(
          `station ${id} is at (${existing.x}, ${existing.y}) on another line ` +
            `but (${p.x}, ${p.y}) on ${line.code}`,
        );
      }
    }
  }
  return { points, conflicts };
}
```

- [ ] **Step 4: Author the schematic path for each line**

Add a `schematic` object to each line in `src/data/lines.json`:

```json
"schematic": { "start": { "x": 120, "y": 80 }, "segments": [["SE", 4], ["S", 6], ["SW", 3]] }
```

Work one line at a time, running `npm test -- schematic` after each. The test tells you exactly what is wrong: a gap-count mismatch names the line, and a conflict names the station and both positions.

Method that converges fastest:
1. Start with the two MRT lines (KG, PY) — they are the longest and set the overall shape.
2. Add KJ, then AG and SP. Their shared trunk must be expressed so both lines produce identical points for those stations; the easiest way is to give both the same `start` and identical leading segments up to Chan Sow Lin.
3. Add MR and SA last, fitting them to the interchange points already fixed.

Segment counts are constrained: they must sum to `stations.length - 1`, and every interchange must land on the point the other line already put it at. Expect several passes — this is layout work, and the conflict list is the feedback loop.

- [ ] **Step 5: Extend validation to cover the schematic**

In `src/data/validate.ts`, add the import and append the check before `return errors;`:

```ts
import { buildSchematic } from '../geo/schematic';
```

```ts
  try {
    const { conflicts } = buildSchematic(data.lines);
    errors.push(...conflicts);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all tests including `validateNetworkData` reporting no errors for the shipped data.

- [ ] **Step 7: Commit**

```bash
git add src/geo/schematic.ts src/geo/schematic.test.ts src/data/
git commit -m "feat: derive octolinear schematic layout from per-line path descriptions"
```

---

## Task 10: Layout resolution and morphing

**Files:**
- Create: `src/geo/layout.ts`
- Test: `src/geo/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { lerpLayouts } from './layout';
import type { Point } from '../data/types';

const a = new Map<string, Point>([['s', { x: 0, y: 0 }]]);
const b = new Map<string, Point>([['s', { x: 100, y: 50 }]]);

describe('lerpLayouts', () => {
  it('returns the start layout at t = 0', () => {
    expect(lerpLayouts(a, b, 0).get('s')).toEqual({ x: 0, y: 0 });
  });

  it('returns the end layout at t = 1', () => {
    expect(lerpLayouts(a, b, 1).get('s')).toEqual({ x: 100, y: 50 });
  });

  it('interpolates in between', () => {
    expect(lerpLayouts(a, b, 0.5).get('s')).toEqual({ x: 50, y: 25 });
  });

  it('clamps t outside the unit range', () => {
    expect(lerpLayouts(a, b, 2).get('s')).toEqual({ x: 100, y: 50 });
    expect(lerpLayouts(a, b, -1).get('s')).toEqual({ x: 0, y: 0 });
  });

  it('skips stations missing from either layout rather than throwing', () => {
    const partial = new Map<string, Point>();
    expect(lerpLayouts(a, partial, 0.5).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- layout`
Expected: FAIL, cannot resolve `./layout`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Point } from '../data/types';

export type LayoutMode = 'geo' | 'schematic';

export type Layout = Map<string, Point>;

/** Smooth ease for the layout morph. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Position-by-position interpolation between two layouts. */
export function lerpLayouts(from: Layout, to: Layout, t: number): Layout {
  const clamped = Math.max(0, Math.min(1, t));
  const out: Layout = new Map();
  for (const [id, a] of from) {
    const b = to.get(id);
    if (!b) continue;
    out.set(id, {
      x: a.x + (b.x - a.x) * clamped,
      y: a.y + (b.y - a.y) * clamped,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- layout`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/geo/layout.ts src/geo/layout.test.ts
git commit -m "feat: add layout interpolation for the geographic/schematic morph"
```

---

## Task 11: Typing state machine

The rule that makes everything else simple: a wrong key never advances the cursor, so the typed prefix is always a correct prefix of the target and there is no backspace to reason about.

**Files:**
- Create: `src/engine/typing.ts`
- Test: `src/engine/typing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { beginTyping, applyKey, isPrintable } from './typing';

const typeAll = (target: string, input: string) =>
  [...input].reduce((s, k) => applyKey(s, k), beginTyping(target));

describe('beginTyping', () => {
  it('starts at the beginning with nothing typed', () => {
    const s = beginTyping('Imbi');
    expect(s.cursor).toBe(0);
    expect(s.keystrokes).toBe(0);
    expect(s.errors).toBe(0);
    expect(s.done).toBe(false);
  });
});

describe('applyKey', () => {
  it('advances on a correct key', () => {
    const s = applyKey(beginTyping('Imbi'), 'I');
    expect(s.cursor).toBe(1);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(typeAll('Imbi', 'imbi').done).toBe(true);
    expect(typeAll('KLCC', 'klcc').done).toBe(true);
  });

  it('does not advance on a wrong key but does count it', () => {
    const s = applyKey(beginTyping('Imbi'), 'x');
    expect(s.cursor).toBe(0);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(1);
  });

  it('requires spaces to be typed', () => {
    const s = typeAll('KL Sentral', 'KLSentral');
    expect(s.done).toBe(false);
    expect(s.errors).toBeGreaterThan(0);
  });

  it('accepts a space in the right place', () => {
    expect(typeAll('KL Sentral', 'KL Sentral').done).toBe(true);
  });

  it('accepts digits in real station names', () => {
    expect(typeAll('SS 15', 'ss 15').done).toBe(true);
    expect(typeAll('16 Sierra', '16 sierra').done).toBe(true);
  });

  it('marks done only at the end', () => {
    const s = typeAll('Imbi', 'Imb');
    expect(s.done).toBe(false);
    expect(applyKey(s, 'i').done).toBe(true);
  });

  it('ignores further keys once done', () => {
    const done = typeAll('Imbi', 'Imbi');
    const after = applyKey(done, 'x');
    expect(after).toEqual(done);
  });

  it('ignores non-printable keys entirely', () => {
    const s = applyKey(beginTyping('Imbi'), 'Shift');
    expect(s.keystrokes).toBe(0);
    expect(s.errors).toBe(0);
  });
});

describe('isPrintable', () => {
  it('accepts single characters and rejects key names', () => {
    expect(isPrintable('a')).toBe(true);
    expect(isPrintable(' ')).toBe(true);
    expect(isPrintable('Enter')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- typing`
Expected: FAIL, cannot resolve `./typing`.

- [ ] **Step 3: Write the implementation**

```ts
export interface TypingState {
  target: string;
  /** Characters correctly typed so far. Always a correct prefix of target. */
  cursor: number;
  keystrokes: number;
  errors: number;
  done: boolean;
}

/** True for keys that represent a character, false for named keys like "Shift". */
export function isPrintable(key: string): boolean {
  return [...key].length === 1;
}

export function beginTyping(target: string): TypingState {
  return { target, cursor: 0, keystrokes: 0, errors: 0, done: target.length === 0 };
}

/**
 * Applies one keystroke. A wrong key counts against accuracy but never moves
 * the cursor, so the state can never desync from the target.
 */
export function applyKey(state: TypingState, key: string): TypingState {
  if (state.done || !isPrintable(key)) return state;

  const expected = state.target[state.cursor];
  if (expected === undefined) return state;

  const correct = key.toLowerCase() === expected.toLowerCase();
  if (!correct) {
    return { ...state, keystrokes: state.keystrokes + 1, errors: state.errors + 1 };
  }

  const cursor = state.cursor + 1;
  return {
    ...state,
    cursor,
    keystrokes: state.keystrokes + 1,
    done: cursor === state.target.length,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- typing`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/typing.ts src/engine/typing.test.ts
git commit -m "feat: add typing state machine"
```

---

## Task 12: Metrics

**Files:**
- Create: `src/engine/metrics.ts`
- Test: `src/engine/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeMetrics } from './metrics';

const MIN = 60_000;

describe('computeMetrics', () => {
  it('treats five correct characters as one word', () => {
    // 300 correct characters in one minute = 60 wpm
    expect(computeMetrics(300, 300, MIN).wpm).toBeCloseTo(60);
  });

  it('scales with elapsed time', () => {
    expect(computeMetrics(300, 300, MIN / 2).wpm).toBeCloseTo(120);
  });

  it('measures accuracy against total keystrokes', () => {
    expect(computeMetrics(90, 100, MIN).accuracy).toBeCloseTo(0.9);
  });

  it('squares accuracy in the score', () => {
    const m = computeMetrics(90, 100, MIN);
    expect(m.score).toBeCloseTo(m.wpm * 0.81);
  });

  it('returns zeroes rather than Infinity when no time has passed', () => {
    const m = computeMetrics(10, 10, 0);
    expect(m.wpm).toBe(0);
    expect(m.score).toBe(0);
  });

  it('reports perfect accuracy before any keystroke', () => {
    expect(computeMetrics(0, 0, MIN).accuracy).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- metrics`
Expected: FAIL, cannot resolve `./metrics`.

- [ ] **Step 3: Write the implementation**

```ts
export interface Metrics {
  /** Correct characters / 5 / minutes. The standard definition. */
  wpm: number;
  /** Correct keystrokes / total keystrokes. */
  accuracy: number;
  /** wpm * accuracy^2 — squaring prices sloppiness above raw speed. */
  score: number;
}

export function computeMetrics(
  correctChars: number,
  keystrokes: number,
  elapsedMs: number,
): Metrics {
  const minutes = elapsedMs / 60_000;
  const wpm = minutes > 0 ? correctChars / 5 / minutes : 0;
  const accuracy = keystrokes > 0 ? correctChars / keystrokes : 1;
  return { wpm, accuracy, score: wpm * accuracy * accuracy };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- metrics`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/metrics.ts src/engine/metrics.test.ts
git commit -m "feat: add WPM, accuracy, and score metrics"
```

---

## Task 13: Run lifecycle

Ties typing to movement. Time is passed in as `now` rather than read from a clock, so runs are deterministic under test.

**Files:**
- Create: `src/engine/run.ts`
- Test: `src/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork, stationAt } from './network';
import { startRun, keyRun, chooseDirection, runMetrics } from './run';

const net = buildNetwork(loadNetworkData());

/** Types the current station's full name, one key at a time. */
function typeStation(state: ReturnType<typeof startRun>, at = 0) {
  const name = stationAt(net, state.at)!.name;
  return [...name].reduce((s, k, i) => keyRun(net, s, k, at + i), state);
}

describe('startRun', () => {
  it('starts by typing the chosen station name', () => {
    const s = startRun(net, 'raja-chulan', 0);
    expect(s.phase).toBe('typing');
    expect(s.typing.target).toBe('Raja Chulan');
    expect(s.visited).toEqual([]);
  });
});

describe('keyRun', () => {
  it('marks the station visited once its name is complete', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.visited).toContain('raja-chulan');
  });

  it('pauses for a junction choice when several directions exist', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.phase).toBe('junction');
    expect(s.options.length).toBeGreaterThan(1);
  });

  it('records how long the station took', () => {
    const s = typeStation(startRun(net, 'raja-chulan', 0));
    expect(s.stationTimes).toHaveLength(1);
    expect(s.stationTimes[0]!.id).toBe('raja-chulan');
  });

  it('counts keystrokes and errors across the run', () => {
    let s = startRun(net, 'imbi', 0);
    s = keyRun(net, s, 'z', 1);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(1);
  });
});

describe('chooseDirection', () => {
  it('moves to the chosen station and begins typing it', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    const dir = junction.options.find((o) => o.next === 'bukit-nanas')!;
    const s = chooseDirection(net, junction, dir, 100);
    expect(s.at).toBe('bukit-nanas');
    expect(s.arrivedFrom).toBe('raja-chulan');
    expect(s.line).toBe('MR');
    expect(s.phase).toBe('typing');
    expect(s.typing.target).toBe('Bukit Nanas');
    expect(s.typing.cursor).toBe(0);
  });

  it('auto-advances without a junction when only one direction remains', () => {
    const start = typeStation(startRun(net, 'raja-chulan', 0));
    const dir = start.options.find((o) => o.next === 'bukit-nanas')!;
    let s = chooseDirection(net, start, dir, 100);
    s = typeStation(s, 100);
    // Bukit Nanas continues on the Monorail with no branch, so it keeps going.
    expect(s.phase).toBe('typing');
    expect(s.at).toBe('medan-tuanku');
  });
});

describe('runMetrics', () => {
  it('reports metrics for the whole run', () => {
    const s = typeStation(startRun(net, 'imbi', 0));
    const m = runMetrics(s, 60_000);
    expect(m.accuracy).toBe(1);
    expect(m.wpm).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- run`
Expected: FAIL, cannot resolve `./run`.

- [ ] **Step 3: Write the implementation**

```ts
import type { LineCode } from '../data/types';
import {
  onwardOptions,
  stationAt,
  type Direction,
  type NetworkIndex,
} from './network';
import { applyKey, beginTyping, type TypingState } from './typing';
import { computeMetrics, type Metrics } from './metrics';

export type RunPhase = 'typing' | 'junction' | 'ended';

export interface StationTime {
  id: string;
  ms: number;
}

export interface RunState {
  at: string;
  arrivedFrom: string | null;
  /** Line currently being travelled. Null before the first direction choice. */
  line: LineCode | null;
  phase: RunPhase;
  typing: TypingState;
  /** Directions offered while phase is 'junction'. */
  options: Direction[];
  visited: string[];
  stationTimes: StationTime[];
  startedAt: number;
  stationStartedAt: number;
  correctChars: number;
  keystrokes: number;
  errors: number;
}

export function startRun(net: NetworkIndex, at: string, now: number): RunState {
  const station = stationAt(net, at);
  if (!station) throw new Error(`unknown start station: ${at}`);
  return {
    at,
    arrivedFrom: null,
    line: null,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    visited: [],
    stationTimes: [],
    startedAt: now,
    stationStartedAt: now,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
  };
}

/** Begins typing `to`, having come from `state.at` along `line`. */
function moveTo(
  net: NetworkIndex,
  state: RunState,
  to: string,
  line: LineCode,
  now: number,
): RunState {
  const station = stationAt(net, to);
  if (!station) throw new Error(`unknown station: ${to}`);
  return {
    ...state,
    at: to,
    arrivedFrom: state.at,
    line,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    stationStartedAt: now,
  };
}

/** Called when the current station's name has been typed in full. */
function arrive(net: NetworkIndex, state: RunState, now: number): RunState {
  const visited = state.visited.includes(state.at)
    ? state.visited
    : [...state.visited, state.at];

  const arrived: RunState = {
    ...state,
    visited,
    stationTimes: [
      ...state.stationTimes,
      { id: state.at, ms: now - state.stationStartedAt },
    ],
  };

  const options = onwardOptions(net, state.at, state.arrivedFrom);
  if (options.length === 0) return { ...arrived, phase: 'ended', options: [] };

  // A single onward direction needs no decision — keep the train rolling.
  const only = options.length === 1 ? options[0]! : null;
  if (only) return moveTo(net, arrived, only.next, only.line, now);

  return { ...arrived, phase: 'junction', options };
}

export function keyRun(
  net: NetworkIndex,
  state: RunState,
  key: string,
  now: number,
): RunState {
  if (state.phase !== 'typing') return state;

  const before = state.typing;
  const typing = applyKey(before, key);
  if (typing === before) return state;

  const gainedChar = typing.cursor > before.cursor;
  const next: RunState = {
    ...state,
    typing,
    correctChars: state.correctChars + (gainedChar ? 1 : 0),
    keystrokes: state.keystrokes + 1,
    errors: state.errors + (gainedChar ? 0 : 1),
  };

  return typing.done ? arrive(net, next, now) : next;
}

export function chooseDirection(
  net: NetworkIndex,
  state: RunState,
  dir: Direction,
  now: number,
): RunState {
  if (state.phase !== 'junction') return state;
  return moveTo(net, state, dir.next, dir.line, now);
}

/** Walk transfers are free in Adventure: no line, no cost. */
export function walkTo(net: NetworkIndex, state: RunState, to: string, now: number): RunState {
  const station = stationAt(net, to);
  if (!station) return state;
  return {
    ...state,
    at: to,
    arrivedFrom: null,
    phase: 'typing',
    typing: beginTyping(station.name),
    options: [],
    stationStartedAt: now,
  };
}

export function endRun(state: RunState): RunState {
  return { ...state, phase: 'ended', options: [] };
}

export function runMetrics(state: RunState, now: number): Metrics {
  return computeMetrics(state.correctChars, state.keystrokes, now - state.startedAt);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- run`
Expected: PASS, 8 tests.

If the auto-advance test fails because `bukit-nanas` has a walk link, check that `onwardOptions` returns rail directions only — walk transfers come from `walkOptions` and must not appear here.

- [ ] **Step 5: Commit**

```bash
git add src/engine/run.ts src/engine/run.test.ts
git commit -m "feat: add run lifecycle tying typing to movement"
```

---

## Task 14: Progress persistence

**Files:**
- Create: `src/engine/progress.ts`
- Test: `src/engine/progress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyProfile, loadProfile, saveProfile, recordStation, STORAGE_KEY } from './progress';

beforeEach(() => localStorage.clear());

describe('loadProfile', () => {
  it('returns an empty profile when nothing is stored', () => {
    expect(loadProfile().visited).toEqual([]);
  });

  it('round-trips a saved profile', () => {
    const p = { ...emptyProfile(), visited: ['imbi'] };
    saveProfile(p);
    expect(loadProfile().visited).toEqual(['imbi']);
  });

  it('recovers from a corrupt record instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json {{{');
    const p = loadProfile();
    expect(p.visited).toEqual([]);
    expect(p.recovered).toBe(true);
  });

  it('recovers from a record with an unknown schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999 }));
    expect(loadProfile().recovered).toBe(true);
  });
});

describe('recordStation', () => {
  it('adds a newly visited station', () => {
    expect(recordStation(emptyProfile(), 'imbi', 50).visited).toEqual(['imbi']);
  });

  it('does not duplicate a station already visited', () => {
    const once = recordStation(emptyProfile(), 'imbi', 50);
    expect(recordStation(once, 'imbi', 40).visited).toEqual(['imbi']);
  });

  it('keeps the best WPM for a station', () => {
    let p = recordStation(emptyProfile(), 'imbi', 50);
    p = recordStation(p, 'imbi', 70);
    p = recordStation(p, 'imbi', 60);
    expect(p.bestWpm['imbi']).toBe(70);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- progress`
Expected: FAIL, cannot resolve `./progress`.

- [ ] **Step 3: Write the implementation**

```ts
import type { LineCode } from '../data/types';

export const STORAGE_KEY = 'myrapid.v1';
const SCHEMA_VERSION = 1;

export interface AdventurePosition {
  at: string;
  arrivedFrom: string | null;
  line: LineCode | null;
}

export interface Profile {
  version: number;
  visited: string[];
  bestWpm: Record<string, number>;
  adventure: AdventurePosition | null;
  /** Rush Hour high scores, keyed by sorted line-set. Written by Plan 2. */
  rushHigh: Record<string, number>;
  wpmHistory: { t: number; wpm: number }[];
  /** True when this profile replaced an unreadable saved record. */
  recovered?: boolean;
}

export function emptyProfile(): Profile {
  return {
    version: SCHEMA_VERSION,
    visited: [],
    bestWpm: {},
    adventure: null,
    rushHigh: {},
    wpmHistory: [],
  };
}

/**
 * Future schema versions migrate here. An unknown version is treated as
 * unreadable rather than guessed at.
 */
function migrate(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Partial<Profile>;
  if (rec.version !== SCHEMA_VERSION) return null;
  return { ...emptyProfile(), ...rec, version: SCHEMA_VERSION };
}

export function loadProfile(): Profile {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...emptyProfile(), recovered: true };
  }
  if (stored === null) return emptyProfile();

  try {
    const migrated = migrate(JSON.parse(stored));
    if (migrated) return migrated;
  } catch {
    // falls through to recovery
  }
  return { ...emptyProfile(), recovered: true };
}

export function saveProfile(profile: Profile): void {
  const clean: Profile = { ...profile };
  delete clean.recovered;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage unavailable or full. The run continues; progress is simply not kept.
  }
}

export function recordStation(profile: Profile, id: string, wpm: number): Profile {
  const visited = profile.visited.includes(id) ? profile.visited : [...profile.visited, id];
  const best = profile.bestWpm[id] ?? 0;
  return {
    ...profile,
    visited,
    bestWpm: { ...profile.bestWpm, [id]: Math.max(best, wpm) },
  };
}

export function recordRun(profile: Profile, at: number, wpm: number): Profile {
  return { ...profile, wpmHistory: [...profile.wpmHistory, { t: at, wpm }] };
}

export function saveAdventurePosition(
  profile: Profile,
  position: AdventurePosition | null,
): Profile {
  return { ...profile, adventure: position };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- progress`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/progress.ts src/engine/progress.test.ts
git commit -m "feat: add versioned local progress with corrupt-save recovery"
```

---

## Task 15: Pan and zoom hook

Kept separate from the map component so `MapCanvas` stays a pure renderer.

**Files:**
- Create: `src/render/usePanZoom.ts`
- Test: `src/render/usePanZoom.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { zoomAt, panBy, viewBoxString, type ViewBox } from './usePanZoom';

// A realistic starting view: the whole network spans about 1364 x 1100 units.
const base: ViewBox = { x: 0, y: 0, w: 1000, h: 1000 };

describe('zoomAt', () => {
  it('shrinks the view box when zooming in', () => {
    expect(zoomAt(base, 0.5, 500, 500).w).toBeCloseTo(500);
  });

  it('keeps the focal point stationary', () => {
    const z = zoomAt(base, 0.5, 0, 0);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
  });

  it('refuses to zoom past the limits', () => {
    let v = base;
    for (let i = 0; i < 50; i++) v = zoomAt(v, 0.5, 500, 500);
    expect(v.w).toBeGreaterThan(0);
  });
});

describe('panBy', () => {
  it('shifts the view box', () => {
    expect(panBy(base, 10, -5)).toMatchObject({ x: 10, y: -5 });
  });
});

describe('viewBoxString', () => {
  it('formats for the SVG attribute', () => {
    expect(viewBoxString(base)).toBe('0 0 1000 1000');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- usePanZoom`
Expected: FAIL, cannot resolve `./usePanZoom`.

- [ ] **Step 3: Write the implementation**

```ts
import { useCallback, useRef, useState } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_WIDTH = 120;
const MAX_WIDTH = 6000;

/** Zooms by `factor` about the point (fx, fy) in view-box coordinates. */
export function zoomAt(v: ViewBox, factor: number, fx: number, fy: number): ViewBox {
  const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v.w * factor));
  const applied = w / v.w;
  const h = v.h * applied;
  return {
    w,
    h,
    x: fx - (fx - v.x) * applied,
    y: fy - (fy - v.y) * applied,
  };
}

export function panBy(v: ViewBox, dx: number, dy: number): ViewBox {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

export function viewBoxString(v: ViewBox): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

export function usePanZoom(initial: ViewBox) {
  const [view, setView] = useState<ViewBox>(initial);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    setView((v) => {
      const fx = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
      const fy = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
      return zoomAt(v, e.deltaY > 0 ? 1.1 : 0.9, fx, fy);
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const from = dragging.current;
    if (!from) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setView((v) => {
      const dx = ((e.clientX - from.x) / rect.width) * v.w;
      const dy = ((e.clientY - from.y) / rect.height) * v.h;
      return panBy(v, -dx, -dy);
    });
    dragging.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  return { view, setView, handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp } };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- usePanZoom`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/usePanZoom.ts src/render/usePanZoom.test.ts
git commit -m "feat: add pan and zoom for the SVG map"
```

---

## Task 16: Map canvas

**Files:**
- Create: `src/render/MapCanvas.tsx`
- Test: `src/render/MapCanvas.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { buildSchematic } from '../geo/schematic';
import { MapCanvas } from './MapCanvas';

const data = loadNetworkData();
const net = buildNetwork(data);
const layout = buildSchematic(data.lines).points;

describe('MapCanvas', () => {
  it('draws one polyline per line', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws a mark for every station', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('circle[data-station]')).toHaveLength(data.stations.length);
  });

  it('marks the active station', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation="imbi" />,
    );
    expect(container.querySelector('circle[data-station="imbi"]')?.getAttribute('data-active'))
      .toBe('true');
  });

  it('labels stations for screen readers rather than relying on colour', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const title = container.querySelector('circle[data-station="imbi"] title');
    expect(title?.textContent).toContain('Imbi');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- MapCanvas`
Expected: FAIL, cannot resolve `./MapCanvas`.

- [ ] **Step 3: Write the implementation**

```tsx
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import { usePanZoom, viewBoxString, type ViewBox } from './usePanZoom';

export interface MapCanvasProps {
  net: NetworkIndex;
  layout: Layout;
  visited: ReadonlySet<string>;
  activeStation: string | null;
  /** Candidate next stations, highlighted during a junction choice. */
  highlight?: ReadonlySet<string>;
  initialView?: ViewBox;
}

const DEFAULT_VIEW: ViewBox = { x: 0, y: 0, w: 1000, h: 800 };

export function MapCanvas({
  net,
  layout,
  visited,
  activeStation,
  highlight,
  initialView = DEFAULT_VIEW,
}: MapCanvasProps) {
  const { view, handlers } = usePanZoom(initialView);

  return (
    <svg
      className="map-canvas"
      viewBox={viewBoxString(view)}
      role="img"
      aria-label="Rapid KL network map"
      {...handlers}
    >
      {[...net.lines.values()].map((line) => {
        const pts = line.stations
          .map((id) => layout.get(id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined)
          .map((p) => `${p.x},${p.y}`)
          .join(' ');
        return (
          <polyline
            key={line.code}
            data-line={line.code}
            points={pts}
            fill="none"
            stroke={line.colour}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {[...net.stations.values()].map((station) => {
        const p = layout.get(station.id);
        if (!p) return null;
        const isInterchange = linesOf(station).length > 1;
        const isActive = station.id === activeStation;
        const isNext = highlight?.has(station.id) ?? false;
        return (
          <circle
            key={station.id}
            data-station={station.id}
            data-active={isActive ? 'true' : undefined}
            data-next={isNext ? 'true' : undefined}
            data-visited={visited.has(station.id) ? 'true' : undefined}
            cx={p.x}
            cy={p.y}
            r={isActive ? 8 : isInterchange ? 6 : 4}
          >
            <title>
              {station.name} — {linesOf(station).join(', ')}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Add the styles**

Create `src/render/map.css` and import it from `MapCanvas.tsx`:

```css
.map-canvas { width: 100%; height: 100%; touch-action: none; background: #12141a; }
.map-canvas circle { fill: #12141a; stroke: #9aa3b2; stroke-width: 2.5; }
.map-canvas circle[data-visited='true'] { stroke: #f2f4f8; }
.map-canvas circle[data-next='true'] { stroke: #ffd166; stroke-width: 4; }
.map-canvas circle[data-active='true'] { fill: #f2f4f8; stroke: #f2f4f8; }
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- MapCanvas`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css
git commit -m "feat: render the network as an SVG map"
```

---

## Task 17: Layout mode with animated morph

**Files:**
- Create: `src/render/useLayoutMode.ts`
- Test: `src/render/useLayoutMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Point } from '../data/types';
import { useLayoutMode, prefersReducedMotion } from './useLayoutMode';

const geo = new Map<string, Point>([['s', { x: 0, y: 0 }]]);
const schematic = new Map<string, Point>([['s', { x: 100, y: 0 }]]);

describe('useLayoutMode', () => {
  it('starts in the requested mode with no animation', () => {
    const { result } = renderHook(() => useLayoutMode(geo, schematic, 'geo'));
    expect(result.current.layout.get('s')).toEqual({ x: 0, y: 0 });
  });

  it('lands exactly on the target layout when the morph is skipped', () => {
    const { result } = renderHook(() => useLayoutMode(geo, schematic, 'geo'));
    act(() => result.current.setMode('schematic', { animate: false }));
    expect(result.current.layout.get('s')).toEqual({ x: 100, y: 0 });
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when the browser reports no preference', () => {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- useLayoutMode`
Expected: FAIL, cannot resolve `./useLayoutMode`.

- [ ] **Step 3: Write the implementation**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { easeInOut, lerpLayouts, type Layout, type LayoutMode } from '../geo/layout';

const MORPH_MS = 600;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useLayoutMode(geo: Layout, schematic: Layout, initial: LayoutMode) {
  const layoutFor = useCallback(
    (m: LayoutMode) => (m === 'geo' ? geo : schematic),
    [geo, schematic],
  );

  const [mode, setModeState] = useState<LayoutMode>(initial);
  const [layout, setLayout] = useState<Layout>(() => layoutFor(initial));
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const setMode = useCallback(
    (next: LayoutMode, opts?: { animate?: boolean }) => {
      const animate = (opts?.animate ?? true) && !prefersReducedMotion();
      const from = layout;
      const to = layoutFor(next);
      setModeState(next);

      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (!animate) {
        setLayout(to);
        return;
      }

      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / MORPH_MS);
        setLayout(lerpLayouts(from, to, easeInOut(t)));
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [layout, layoutFor],
  );

  return { mode, layout, setMode };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- useLayoutMode`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/useLayoutMode.ts src/render/useLayoutMode.test.ts
git commit -m "feat: morph between geographic and schematic layouts"
```

---

## Task 18: Prompt, HUD, and line strip

**Files:**
- Create: `src/render/Prompt.tsx`, `src/render/HUD.tsx`, `src/render/LineStrip.tsx`
- Test: `src/render/Prompt.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { beginTyping, applyKey } from '../engine/typing';
import { Prompt } from './Prompt';

describe('Prompt', () => {
  it('renders one element per character', () => {
    const { container } = render(<Prompt state={beginTyping('Imbi')} />);
    expect(container.querySelectorAll('[data-char]')).toHaveLength(4);
  });

  it('marks typed characters as done', () => {
    const s = applyKey(beginTyping('Imbi'), 'I');
    const { container } = render(<Prompt state={s} />);
    expect(container.querySelector('[data-char]')?.getAttribute('data-state')).toBe('done');
  });

  it('marks the current character', () => {
    const { container } = render(<Prompt state={beginTyping('Imbi')} />);
    expect(container.querySelector('[data-state="current"]')?.textContent).toBe('I');
  });

  it('shows a visible marker for a space so it is not invisible to type', () => {
    const { container } = render(<Prompt state={beginTyping('KL Sentral')} />);
    const chars = container.querySelectorAll('[data-char]');
    expect(chars[2]?.getAttribute('data-space')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- Prompt`
Expected: FAIL, cannot resolve `./Prompt`.

- [ ] **Step 3: Write Prompt**

```tsx
import type { TypingState } from '../engine/typing';

export function Prompt({ state }: { state: TypingState }) {
  return (
    <div className="prompt" aria-label={`Type ${state.target}`}>
      {[...state.target].map((ch, i) => (
        <span
          key={i}
          data-char
          data-space={ch === ' ' ? 'true' : undefined}
          data-state={i < state.cursor ? 'done' : i === state.cursor ? 'current' : 'pending'}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write HUD**

```tsx
import type { Metrics } from '../engine/metrics';

export interface HUDProps {
  metrics: Metrics;
  stationsThisRun: number;
  lineName: string | null;
  toward: string | null;
}

export function HUD({ metrics, stationsThisRun, lineName, toward }: HUDProps) {
  return (
    <div className="hud">
      <span className="hud-line">{lineName ?? 'Choose a direction'}</span>
      {toward && <span className="hud-toward">toward {toward}</span>}
      <span>WPM {Math.round(metrics.wpm)}</span>
      <span>ACC {Math.round(metrics.accuracy * 100)}%</span>
      <span>Stations {stationsThisRun}</span>
    </div>
  );
}
```

- [ ] **Step 5: Write LineStrip**

```tsx
import { stationAt, type NetworkIndex } from '../engine/network';
import type { LineCode } from '../data/types';

export interface LineStripProps {
  net: NetworkIndex;
  line: LineCode | null;
  at: string;
  /** How many stations to show either side of the current one. */
  span?: number;
}

export function LineStrip({ net, line, at, span = 4 }: LineStripProps) {
  if (!line) return null;
  const def = net.lines.get(line);
  const idx = net.order.get(line)?.get(at);
  if (!def || idx === undefined) return null;

  const from = Math.max(0, idx - span);
  const slice = def.stations.slice(from, idx + span + 1);

  return (
    <ol className="line-strip" style={{ ['--line-colour' as string]: def.colour }}>
      {slice.map((id) => (
        <li key={id} data-current={id === at ? 'true' : undefined}>
          {stationAt(net, id)?.name ?? id}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- Prompt`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/render/Prompt.tsx src/render/HUD.tsx src/render/LineStrip.tsx src/render/Prompt.test.tsx
git commit -m "feat: add typing prompt, HUD, and line strip"
```

---

## Task 19: Keyboard capture

**Files:**
- Create: `src/ui/useKeyboard.ts`

- [ ] **Step 1: Write the implementation**

There is no separate test for this task — it is a thin `window` binding, and Task 21 exercises it end to end.

```ts
import { useEffect } from 'react';

/**
 * Captures every keystroke for the game. Suppresses the browser default for
 * printable keys and space so the page never scrolls mid-run.
 */
export function useKeyboard(onKey: (key: string) => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || [...e.key].length === 1) e.preventDefault();
      onKey(e.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, active]);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/ui/useKeyboard.ts
git commit -m "feat: add keyboard capture hook"
```

---

## Task 20: Station search

**Files:**
- Create: `src/ui/StationSearch.tsx`
- Test: `src/ui/StationSearch.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { searchStations, StationSearch } from './StationSearch';

const net = buildNetwork(loadNetworkData());

describe('searchStations', () => {
  it('matches on a name prefix', () => {
    expect(searchStations(net, 'imbi').map((s) => s.id)).toContain('imbi');
  });

  it('is case-insensitive', () => {
    expect(searchStations(net, 'IMBI').map((s) => s.id)).toContain('imbi');
  });

  it('matches on a station code', () => {
    const jamek = net.stations.get('masjid-jamek')!;
    const code = Object.values(jamek.codes)[0]!;
    expect(searchStations(net, code).map((s) => s.id)).toContain('masjid-jamek');
  });

  it('returns nothing for an empty query', () => {
    expect(searchStations(net, '  ')).toEqual([]);
  });

  it('ranks a prefix match above a mid-word match', () => {
    const results = searchStations(net, 'taman');
    expect(results[0]!.name.toLowerCase().startsWith('taman')).toBe(true);
  });
});

describe('StationSearch', () => {
  it('calls back with the chosen station', () => {
    let chosen = '';
    render(<StationSearch net={net} onPick={(id) => (chosen = id)} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /imbi/i }));
    expect(chosen).toBe('imbi');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- StationSearch`
Expected: FAIL, cannot resolve `./StationSearch`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useMemo, useState } from 'react';
import type { Station } from '../data/types';
import { linesOf, type NetworkIndex } from '../engine/network';

const MAX_RESULTS = 8;

/** Matches on name or official code. Prefix matches rank first. */
export function searchStations(net: NetworkIndex, query: string): Station[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: { station: Station; score: number }[] = [];
  for (const station of net.stations.values()) {
    const name = station.name.toLowerCase();
    const codes = Object.values(station.codes).map((c) => c.toLowerCase());

    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (codes.some((c) => c.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;

    if (score >= 0) scored.push({ station, score });
  }

  scored.sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name));
  return scored.slice(0, MAX_RESULTS).map((s) => s.station);
}

export function StationSearch({
  net,
  onPick,
}: {
  net: NetworkIndex;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchStations(net, query), [net, query]);

  return (
    <div className="station-search">
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Start from which station?"
        aria-label="Search stations"
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul>
        {results.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)}>
              {s.name} <span className="codes">{linesOf(s).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- StationSearch`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StationSearch.tsx src/ui/StationSearch.test.tsx
git commit -m "feat: add station search for choosing a start"
```

---

## Task 21: Junction picker

Keyboard-first. No station prompt is active while a junction is open, so digits and line codes are unambiguously direction input.

**Files:**
- Create: `src/ui/JunctionPicker.tsx`
- Test: `src/ui/JunctionPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork, onwardOptions } from '../engine/network';
import { JunctionPicker, matchOption } from './JunctionPicker';

const net = buildNetwork(loadNetworkData());
const options = onwardOptions(net, 'raja-chulan', null);

describe('matchOption', () => {
  it('selects by position with a number key', () => {
    expect(matchOption(options, '1')).toBe(options[0]);
  });

  it('ignores a number beyond the option count', () => {
    expect(matchOption(options, '9')).toBeUndefined();
  });

  it('selects by line code, case-insensitively', () => {
    expect(matchOption(options, 'm')?.line).toBe('MR');
  });
});

describe('JunctionPicker', () => {
  it('lists every option with its number and destination', () => {
    render(<JunctionPicker net={net} options={options} walk={[]} onChoose={() => {}} onWalk={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(options.length);
  });

  it('chooses on click', () => {
    let picked = '';
    render(
      <JunctionPicker net={net} options={options} walk={[]} onChoose={(d) => (picked = d.next)} onWalk={() => {}} />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(picked).toBe(options[0]!.next);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- JunctionPicker`
Expected: FAIL, cannot resolve `./JunctionPicker`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useCallback } from 'react';
import { lineAt, stationAt, type Direction, type NetworkIndex } from '../engine/network';
import { useKeyboard } from './useKeyboard';

/** Resolves a keystroke to an option: a 1-based number, or a line code letter. */
export function matchOption(options: Direction[], key: string): Direction | undefined {
  const asNumber = Number(key);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  const k = key.toLowerCase();
  return options.find((o) => o.line.toLowerCase().startsWith(k));
}

export interface JunctionPickerProps {
  net: NetworkIndex;
  options: Direction[];
  walk: string[];
  onChoose: (dir: Direction) => void;
  onWalk: (stationId: string) => void;
}

export function JunctionPicker({ net, options, walk, onChoose, onWalk }: JunctionPickerProps) {
  const onKey = useCallback(
    (key: string) => {
      const match = matchOption(options, key);
      if (match) onChoose(match);
    },
    [options, onChoose],
  );
  useKeyboard(onKey);

  return (
    <div className="junction" role="group" aria-label="Choose a direction">
      <h2>Which way?</h2>
      <ul>
        {options.map((dir, i) => {
          const line = lineAt(net, dir.line);
          return (
            <li key={`${dir.line}-${dir.next}`}>
              <button
                type="button"
                style={{ ['--line-colour' as string]: line?.colour }}
                onClick={() => onChoose(dir)}
              >
                <kbd>{i + 1}</kbd>
                <strong>{dir.line}</strong>
                <span>{line?.name}</span>
                <span>toward {dir.toward}</span>
                <em>next: {stationAt(net, dir.next)?.name}</em>
              </button>
            </li>
          );
        })}
        {walk.map((id) => (
          <li key={`walk-${id}`}>
            <button type="button" onClick={() => onWalk(id)}>
              walk to {stationAt(net, id)?.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Every option shows its line **code as text** alongside the colour, so the choice is readable without relying on colour vision.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- JunctionPicker`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/JunctionPicker.tsx src/ui/JunctionPicker.test.tsx
git commit -m "feat: add keyboard-first junction picker"
```

---

## Task 22: Adventure screen

Wires the engine to the renderers. All game logic already exists and is tested; this component only routes events and persists.

**Files:**
- Create: `src/ui/AdventureScreen.tsx`
- Test: `src/ui/AdventureScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { AdventureScreen } from './AdventureScreen';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};

beforeEach(() => localStorage.clear());

describe('AdventureScreen', () => {
  it('shows the start station name to type', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the junction picker once the name is typed', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(screen.getByRole('group', { name: /choose a direction/i })).toBeTruthy();
  });

  it('persists the visited station', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(loadProfile().visited).toContain('imbi');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- AdventureScreen`
Expected: FAIL, cannot resolve `./AdventureScreen`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { buildSchematic } from '../geo/schematic';
import { projectStations } from '../geo/project';
import { lineAt, stationAt, walkOptions, type Direction, type NetworkIndex } from '../engine/network';
import { chooseDirection, endRun, keyRun, runMetrics, startRun, walkTo, type RunState } from '../engine/run';
import {
  loadProfile, recordStation, saveAdventurePosition, saveProfile, type Profile,
} from '../engine/progress';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { HUD } from '../render/HUD';
import { LineStrip } from '../render/LineStrip';
import { useLayoutMode } from '../render/useLayoutMode';
import { JunctionPicker } from './JunctionPicker';
import { useKeyboard } from './useKeyboard';
import { SummaryScreen } from './SummaryScreen';

const VIEWPORT = { width: 1000, height: 800, padding: 60 };

export interface AdventureScreenProps {
  net: NetworkIndex;
  startAt: string;
  onExit: () => void;
}

export function AdventureScreen({ net, startAt, onExit }: AdventureScreenProps) {
  const data = useMemo(() => loadNetworkData(), []);
  const geo = useMemo(() => projectStations(data.stations, VIEWPORT), [data]);
  const schematic = useMemo(() => buildSchematic(data.lines).points, [data]);
  const { mode, layout, setMode } = useLayoutMode(geo, schematic, 'schematic');

  const [run, setRun] = useState<RunState>(() => startRun(net, startAt, performance.now()));
  const [profile, setProfile] = useState<Profile>(() => loadProfile());

  /** Persists anything the run has newly established. */
  const persist = useCallback((next: RunState) => {
    setProfile((prev) => {
      let updated = prev;
      const last = next.stationTimes[next.stationTimes.length - 1];
      if (last) {
        const chars = stationAt(net, last.id)?.name.length ?? 0;
        const wpm = last.ms > 0 ? chars / 5 / (last.ms / 60_000) : 0;
        updated = recordStation(updated, last.id, wpm);
      }
      updated = saveAdventurePosition(updated, {
        at: next.at, arrivedFrom: next.arrivedFrom, line: next.line,
      });
      saveProfile(updated);
      return updated;
    });
  }, [net]);

  const onKey = useCallback((key: string) => {
    setRun((prev) => {
      if (prev.phase !== 'typing') return prev;
      const next = keyRun(net, prev, key, performance.now());
      if (next.stationTimes.length !== prev.stationTimes.length) persist(next);
      return next;
    });
  }, [net, persist]);

  useKeyboard(onKey, run.phase === 'typing');

  const onChoose = useCallback((dir: Direction) => {
    setRun((prev) => chooseDirection(net, prev, dir, performance.now()));
  }, [net]);

  const onWalk = useCallback((to: string) => {
    setRun((prev) => walkTo(net, prev, to, performance.now()));
  }, [net]);

  if (run.phase === 'ended') {
    return <SummaryScreen net={net} run={run} onExit={onExit} />;
  }

  const line = run.line ? lineAt(net, run.line) : null;
  const heading = run.options[0]?.toward ?? null;
  const highlight = new Set(run.options.map((o) => o.next));

  return (
    <div className="adventure">
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set(profile.visited)}
        activeStation={run.at}
        highlight={highlight}
      />

      <button
        type="button"
        className="layout-toggle"
        onClick={() => setMode(mode === 'geo' ? 'schematic' : 'geo')}
      >
        {mode === 'geo' ? 'Schematic view' : 'Geographic view'}
      </button>

      <LineStrip net={net} line={run.line} at={run.at} />

      {run.phase === 'typing' && <Prompt state={run.typing} />}

      {run.phase === 'junction' && (
        <JunctionPicker
          net={net}
          options={run.options}
          walk={walkOptions(net, run.at)}
          onChoose={onChoose}
          onWalk={onWalk}
        />
      )}

      <HUD
        metrics={runMetrics(run, performance.now())}
        stationsThisRun={run.stationTimes.length}
        lineName={line?.name ?? null}
        toward={run.line ? heading : null}
      />

      <button type="button" onClick={() => setRun((prev) => endRun(prev))}>
        End journey
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- AdventureScreen`
Expected: PASS, 3 tests. This task depends on `SummaryScreen` from Task 23 — if it does not exist yet, create it as the stub in Task 23 Step 3 first, then return here.

- [ ] **Step 5: Commit**

```bash
git add src/ui/AdventureScreen.tsx src/ui/AdventureScreen.test.tsx
git commit -m "feat: wire Adventure mode together"
```

---

## Task 23: Run summary

**Files:**
- Create: `src/ui/SummaryScreen.tsx`
- Test: `src/ui/SummaryScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { SummaryScreen } from './SummaryScreen';

const net = buildNetwork(loadNetworkData());
const finished = endRun(
  [...'Imbi'].reduce((s, k, i) => keyRun(net, s, k, i * 100), startRun(net, 'imbi', 0)),
);

describe('SummaryScreen', () => {
  it('reports how many stations were visited', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getByText(/1 station/i)).toBeTruthy();
  });

  it('names the fastest and slowest stations of the run', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getAllByText(/Imbi/).length).toBeGreaterThan(0);
  });

  it('handles a run that ended before any station was completed', () => {
    render(<SummaryScreen net={net} run={endRun(startRun(net, 'imbi', 0))} onExit={() => {}} />);
    expect(screen.getByText(/0 stations/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- SummaryScreen`
Expected: FAIL, cannot resolve `./SummaryScreen`.

- [ ] **Step 3: Write the implementation**

```tsx
import { stationAt, type NetworkIndex } from '../engine/network';
import { runMetrics, type RunState } from '../engine/run';

export function SummaryScreen({
  net,
  run,
  onExit,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
}) {
  const times = [...run.stationTimes].sort((a, b) => a.ms - b.ms);
  const fastest = times[0];
  const slowest = times[times.length - 1];
  const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
  const metrics = runMetrics(run, run.startedAt + elapsed);
  const count = run.stationTimes.length;

  return (
    <div className="summary">
      <h2>Journey complete</h2>
      <p>{count === 1 ? '1 station' : `${count} stations`} this run</p>
      <dl>
        <dt>WPM</dt><dd>{Math.round(metrics.wpm)}</dd>
        <dt>Accuracy</dt><dd>{Math.round(metrics.accuracy * 100)}%</dd>
        <dt>Score</dt><dd>{Math.round(metrics.score)}</dd>
      </dl>
      {fastest && slowest && (
        <ul>
          <li>Fastest: {stationAt(net, fastest.id)?.name} ({(fastest.ms / 1000).toFixed(1)}s)</li>
          <li>Slowest: {stationAt(net, slowest.id)?.name} ({(slowest.ms / 1000).toFixed(1)}s)</li>
        </ul>
      )}
      <button type="button" onClick={onExit}>Back to the map</button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- SummaryScreen`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SummaryScreen.tsx src/ui/SummaryScreen.test.tsx
git commit -m "feat: add run summary screen"
```

---

## Task 24: Home screen and app shell

**Files:**
- Create: `src/ui/HomeScreen.tsx`
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `src/ui/HomeScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { HomeScreen } from './HomeScreen';

const net = buildNetwork(loadNetworkData());
beforeEach(() => localStorage.clear());

describe('HomeScreen', () => {
  it('lists all seven lines with progress', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(7);
  });

  it('shows overall station progress', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('offers to resume a saved journey', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- HomeScreen`
Expected: FAIL, cannot resolve `./HomeScreen`.

- [ ] **Step 3: Write HomeScreen**

```tsx
import { useMemo, useState } from 'react';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { StationSearch } from './StationSearch';

export function HomeScreen({
  net,
  onStart,
}: {
  net: NetworkIndex;
  onStart: (stationId: string) => void;
}) {
  const profile = useMemo(() => loadProfile(), []);
  const [choosing, setChoosing] = useState(false);
  const visited = new Set(profile.visited);
  const total = net.stations.size;

  return (
    <div className="home">
      <h1>MyRapid Typing</h1>
      <p className="tagline">Type your way across the Klang Valley.</p>

      {profile.recovered && (
        <p role="status">Saved progress could not be read, so a fresh profile was started.</p>
      )}

      <p>{visited.size} / {total} stations visited</p>

      <ul className="line-progress">
        {[...net.lines.values()].map((line) => {
          const done = line.stations.filter((id) => visited.has(id)).length;
          return (
            <li key={line.code}>
              <span style={{ ['--line-colour' as string]: line.colour }}>{line.code}</span>
              <span>{line.name}</span>
              <progress
                aria-label={`${line.name} progress`}
                value={done}
                max={line.stations.length}
              />
              <span>{done} / {line.stations.length}</span>
            </li>
          );
        })}
      </ul>

      {profile.adventure && (
        <button type="button" onClick={() => onStart(profile.adventure!.at)}>
          Resume from {stationAt(net, profile.adventure.at)?.name}
        </button>
      )}

      <button type="button" onClick={() => setChoosing(true)}>Start a new journey</button>
      {choosing && <StationSearch net={net} onPick={onStart} />}

      <footer>
        An unofficial fan project. Not affiliated with Prasarana Malaysia or Rapid KL.
        Station names, codes, and line colours are public information.
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Write App**

Replace `src/ui/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { HomeScreen } from './HomeScreen';
import { AdventureScreen } from './AdventureScreen';

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [startAt, setStartAt] = useState<string | null>(null);

  // Data is validated by the test suite; this is a developer safety net only.
  if (import.meta.env.DEV) {
    const errors = validateNetworkData(data);
    if (errors.length > 0) console.error('network data errors:', errors);
  }

  return startAt === null ? (
    <HomeScreen net={net} onStart={setStartAt} />
  ) : (
    <AdventureScreen net={net} startAt={startAt} onExit={() => setStartAt(null)} />
  );
}
```

Update `src/main.tsx` to import `App` from `./ui/App` and delete the Vite starter's `src/App.tsx`, `src/App.css`, and `src/assets/react.svg`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add home screen and app shell"
```

---

## Task 25: Build, styles, and README

**Files:**
- Create: `src/index.css`, `README.md`
- Modify: `index.html`

- [ ] **Step 1: Write the styles**

Create `src/index.css` with the flat, minimal transit-diagram look described in the spec — dark ground, thick flat line colours, generous whitespace, no gradients. Import it from `src/main.tsx`.

```css
:root {
  --bg: #12141a;
  --fg: #f2f4f8;
  --dim: #9aa3b2;
  --accent: #ffd166;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.prompt { font-size: 2.5rem; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.prompt [data-state='pending'] { color: var(--dim); }
.prompt [data-state='done'] { color: var(--fg); }
.prompt [data-state='current'] { color: var(--accent); border-bottom: 3px solid var(--accent); }
.prompt [data-space='true'][data-state='pending'] { border-bottom: 2px solid var(--dim); }

.line-strip { display: flex; gap: 1rem; list-style: none; padding: 0; color: var(--dim); }
.line-strip [data-current='true'] { color: var(--fg); font-weight: 600; }

.hud { display: flex; gap: 1.5rem; font-variant-numeric: tabular-nums; color: var(--dim); }

.junction button { display: flex; gap: 0.75rem; align-items: baseline;
  border-left: 6px solid var(--line-colour, var(--dim)); }

.line-progress span:first-child { color: var(--line-colour, var(--fg)); font-weight: 700; }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Set the page title**

In `index.html`, set `<title>MyRapid Typing</title>` and `<html lang="en">`.

- [ ] **Step 3: Write the README**

```markdown
# MyRapid Typing

A typing game on the Kuala Lumpur Rapid KL rail network. Drive a train across
the Klang Valley by typing station names.

**Adventure mode** — free-roam the network with no clock and no fail state.
Choose a direction at every junction; stations unlock permanently as you visit them.

## Development

    npm install
    npm run dev
    npm test

## Data

`src/data/` holds the network as three JSON files. Adjacency, screen positions,
and the schematic layout are all derived at load — see
`docs/superpowers/specs/2026-09-03-myrapid-typing-design.md`.

Run `npm test` after any data change: `validateNetworkData` fails the build on
broken line sequences, mismatched station codes, out-of-range coordinates, and
schematic conflicts.

## Unofficial

Not affiliated with Prasarana Malaysia or Rapid KL. Station names, codes, and
line colours are public information.
```

- [ ] **Step 4: Verify the production build**

Run: `npm run build`
Expected: build succeeds, `dist/` produced.

Run: `npm run preview` and open the printed URL. Confirm: the map renders, the view toggle morphs between layouts, typing a station name advances the train, the junction picker responds to number keys, and progress survives a page reload.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add styles, page metadata, and README"
```

---

## Task 26: Train marker animation

**Spec requirement this closes:** *"the marker eases along the polyline over ~400ms while the next prompt fades in, so typing and motion feel causally linked rather than turn-based."* Up to this point the active-station highlight jumps instantly between stations.

**Files:**
- Create: `src/render/TrainMarker.tsx`
- Modify: `src/render/MapCanvas.tsx`, `src/ui/AdventureScreen.tsx`
- Test: `src/render/TrainMarker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { tweenPoint } from './TrainMarker';
import { TrainMarker } from './TrainMarker';
import type { Point } from '../data/types';

const a: Point = { x: 0, y: 0 };
const b: Point = { x: 100, y: 40 };

describe('tweenPoint', () => {
  it('sits at the origin at t = 0', () => {
    expect(tweenPoint(a, b, 0)).toEqual({ x: 0, y: 0 });
  });

  it('arrives exactly at t = 1', () => {
    expect(tweenPoint(a, b, 1)).toEqual({ x: 100, y: 40 });
  });

  it('interpolates in between', () => {
    expect(tweenPoint(a, b, 0.5)).toEqual({ x: 50, y: 20 });
  });
});

describe('TrainMarker', () => {
  it('renders at the destination when there is no previous station', () => {
    const { container } = render(
      <svg><TrainMarker from={null} to={b} /></svg>,
    );
    const c = container.querySelector('circle[data-train]')!;
    expect(c.getAttribute('cx')).toBe('100');
  });

  it('renders nothing when the destination is unknown', () => {
    const { container } = render(<svg><TrainMarker from={a} to={null} /></svg>);
    expect(container.querySelector('circle[data-train]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- TrainMarker`
Expected: FAIL, cannot resolve `./TrainMarker`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Point } from '../data/types';
import { easeInOut } from '../geo/layout';
import { prefersReducedMotion } from './useLayoutMode';

const TRAVEL_MS = 400;

export function tweenPoint(from: Point, to: Point, t: number): Point {
  const c = Math.max(0, Math.min(1, t));
  return { x: from.x + (to.x - from.x) * c, y: from.y + (to.y - from.y) * c };
}

/**
 * Eases from the previous station to the current one whenever `to` changes,
 * so the train visibly travels rather than teleporting.
 */
export function TrainMarker({ from, to }: { from: Point | null; to: Point | null }) {
  const [pos, setPos] = useState<Point | null>(to);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!to) return;
    if (!from || prefersReducedMotion()) {
      setPos(to);
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / TRAVEL_MS);
      setPos(tweenPoint(from, to, easeInOut(t)));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // `from` is intentionally excluded: the tween is driven by arriving at a
    // new `to`, and re-running it when the origin changes would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to?.x, to?.y]);

  if (!pos) return null;
  return <circle data-train cx={pos.x} cy={pos.y} r={9} className="train" />;
}
```

- [ ] **Step 4: Render it in MapCanvas**

Add to `MapCanvasProps`:

```tsx
  /** Station the train is travelling from, for the arrival tween. */
  previousStation?: string | null;
```

Add the import and destructure `previousStation = null` alongside the other props, then render the marker after the station circles, inside the `<svg>`:

```tsx
      <TrainMarker
        from={previousStation ? layout.get(previousStation) ?? null : null}
        to={activeStation ? layout.get(activeStation) ?? null : null}
      />
```

Add to `src/render/map.css`:

```css
.map-canvas .train { fill: var(--accent, #ffd166); stroke: #12141a; stroke-width: 2; }
```

- [ ] **Step 5: Pass the previous station from AdventureScreen**

In `src/ui/AdventureScreen.tsx`, add `previousStation={run.arrivedFrom}` to the `<MapCanvas />` element.

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- TrainMarker MapCanvas`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/TrainMarker.tsx src/render/TrainMarker.test.tsx src/render/MapCanvas.tsx src/render/map.css src/ui/AdventureScreen.tsx
git commit -m "feat: ease the train marker between stations on arrival"
```

---

## Task 27: Turn-around key

**Spec requirement this closes:** *"A dedicated key turns the train around mid-line, so the player can never be stranded down an unintended branch."* `onwardOptions` deliberately filters out immediate reversal, so without this there is no way back until a terminus.

`Backspace` is the key: it is non-printable, so it can never collide with typing a station name, and it already means "go back".

**Files:**
- Modify: `src/engine/run.ts`, `src/engine/run.test.ts`, `src/ui/AdventureScreen.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/run.test.ts`:

```ts
import { turnAround } from './run';

describe('turnAround', () => {
  it('sends the train back the way it came', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    const dir = junction.options.find((o) => o.next === 'bukit-nanas')!;
    const moved = chooseDirection(net, junction, dir, 100);

    const back = turnAround(net, moved, 200);
    expect(back.at).toBe('raja-chulan');
    expect(back.arrivedFrom).toBe('bukit-nanas');
    expect(back.typing.target).toBe('Raja Chulan');
  });

  it('does nothing at the very start of a run, when there is nowhere to go back to', () => {
    const s = startRun(net, 'raja-chulan', 0);
    expect(turnAround(net, s, 10)).toEqual(s);
  });

  it('does nothing while a junction choice is open', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    expect(turnAround(net, junction, 10)).toEqual(junction);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- run`
Expected: FAIL, `turnAround is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/engine/run.ts`:

```ts
/**
 * Reverses mid-line: the station just left becomes the next one to type.
 * A no-op before the first move, or while a junction choice is open.
 */
export function turnAround(net: NetworkIndex, state: RunState, now: number): RunState {
  if (state.phase !== 'typing') return state;
  if (state.arrivedFrom === null || state.line === null) return state;
  return moveTo(net, state, state.arrivedFrom, state.line, now);
}
```

- [ ] **Step 4: Wire the key up**

In `src/ui/AdventureScreen.tsx`, import `turnAround` and handle it first in `onKey`:

```tsx
  const onKey = useCallback((key: string) => {
    if (key === 'Backspace') {
      setRun((prev) => turnAround(net, prev, performance.now()));
      return;
    }
    setRun((prev) => {
      if (prev.phase !== 'typing') return prev;
      const next = keyRun(net, prev, key, performance.now());
      if (next.stationTimes.length !== prev.stationTimes.length) persist(next);
      return next;
    });
  }, [net, persist]);
```

Add a hint next to the prompt so the key is discoverable:

```tsx
      {run.phase === 'typing' && run.arrivedFrom && (
        <p className="hint"><kbd>Backspace</kbd> to turn around</p>
      )}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- run AdventureScreen`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/run.ts src/engine/run.test.ts src/ui/AdventureScreen.tsx
git commit -m "feat: add Backspace to turn the train around mid-line"
```

---

## Definition of done

- [ ] `npm test` passes with no skipped tests
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run build` succeeds
- [ ] `validateNetworkData(loadNetworkData())` returns `[]`
- [ ] A journey can be started, typed, routed through a junction, ended, and resumed after reload
- [ ] Both map layouts render and morph between each other
- [ ] Every line code is shown as text wherever line colour carries meaning
- [ ] The train eases between stations rather than jumping
- [ ] `Backspace` turns the train around mid-line
