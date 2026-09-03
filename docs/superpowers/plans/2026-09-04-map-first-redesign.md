# MyRapid Typing — Plan 2: Map-First Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the map the game — land on a geographic map of the Klang Valley with all seven lines on it, pick a line, and type it end to end — and fix the two defects that made the shipped build unusable.

**Architecture:** Unchanged from Plan 1. Static Vite + React + TypeScript, no server, no new dependencies. The engine stays pure and untouched; this plan adds one small pure module (line-run routing), one geometry module (fit-to-content), a backdrop renderer, and real presentation.

**Tech Stack:** Vite, React 18, TypeScript (strict), Vitest, SVG. No mapping library — the backdrop reuses the projection already in `src/geo/project.ts`.

**Spec:** `docs/superpowers/specs/2026-09-04-map-first-redesign-design.md`

---

## Already done before this plan starts

Two things were fixed while diagnosing, and are committed:

- **The Mercator unit mismatch.** `projectStations` used longitude in degrees for x but radian-scale `ln(tan(...))` for y, squashing the network ~57x flat. Fixed by adding `mercatorX`, with a regression test asserting screen distances stay proportional to real distances across differing bearings.
- **`src/data/boundaries.json`** — simplified Selangor / Kuala Lumpur / Putrajaya outlines from Natural Earth (public domain), 5 KB, 271 points, committed so there are no runtime requests.

Baseline: **112 tests passing**, `tsc` clean, build clean.

---

## The two defects this plan fixes

**Defect 1 — the view showed the wrong region.** `MapCanvas` hardcodes `DEFAULT_VIEW = { x: 0, y: 0, w: 1000, h: 800 }`, but the schematic layout spans x −924…440 and y −440…660. Only 32% of stations fell inside it. Fixed in Task 1–2 by framing actual content bounds.

**Defect 2 — nothing laid out the screens.** No CSS rules exist for `.adventure`, `.home`, `.summary`, or `.station-search`; `.map-canvas` has `height: 100%` inside an auto-height parent, so the SVG takes its viewBox aspect ratio and pushes everything else below the fold. Fixed in Task 5.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `src/geo/fit.ts` | Fit a viewBox to a set of points | new |
| `src/geo/project.ts` | Shared projection; gains `makeProjection` | modify |
| `src/geo/boundaries.ts` | Load + project backdrop rings | new |
| `src/data/boundaries.json` | Natural Earth outlines | done |
| `src/engine/lineRun.ts` | Route for a line from a chosen terminus | new |
| `src/engine/run.ts` | Gains `chooseTowards` | modify |
| `src/render/MapBackdrop.tsx` | Land + boundary paths under the tracks | new |
| `src/render/MapCanvas.tsx` | Frames content; renders backdrop; line emphasis | modify |
| `src/render/usePanZoom.ts` | Gains `fitTo` | modify |
| `src/ui/HomeMap.tsx` | The map-as-home screen | new |
| `src/ui/DirectionChooser.tsx` | Pick a terminus after selecting a line | new |
| `src/ui/LineRunScreen.tsx` | Play a fixed line end to end | new |
| `src/ui/PlayLayout.tsx` | Map behind, typing panel floating over | new |
| `src/ui/App.tsx` | Routes between home / line run / adventure | modify |
| `src/index.css` | Design tokens + real layout for every screen | modify |

---

## Task 1: Fit a viewBox to content

**Files:**
- Create: `src/geo/fit.ts`
- Test: `src/geo/fit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { fitViewBox } from './fit';
import type { Point } from '../data/types';

const pts: Point[] = [
  { x: -100, y: -50 },
  { x: 300, y: 150 },
];

describe('fitViewBox', () => {
  it('contains every point', () => {
    const v = fitViewBox(pts, 0);
    expect(v.x).toBeLessThanOrEqual(-100);
    expect(v.y).toBeLessThanOrEqual(-50);
    expect(v.x + v.w).toBeGreaterThanOrEqual(300);
    expect(v.y + v.h).toBeGreaterThanOrEqual(150);
  });

  it('adds padding as a fraction of the larger span', () => {
    const tight = fitViewBox(pts, 0);
    const padded = fitViewBox(pts, 0.1);
    expect(padded.w).toBeGreaterThan(tight.w);
    expect(padded.h).toBeGreaterThan(tight.h);
  });

  it('handles a single point without collapsing to zero size', () => {
    const v = fitViewBox([{ x: 5, y: 5 }], 0.1);
    expect(v.w).toBeGreaterThan(0);
    expect(v.h).toBeGreaterThan(0);
  });

  it('returns a usable box for an empty set', () => {
    const v = fitViewBox([], 0.1);
    expect(v.w).toBeGreaterThan(0);
    expect(v.h).toBeGreaterThan(0);
  });

  it('frames the real schematic layout', async () => {
    const { loadNetworkData } = await import('../data/load');
    const { buildSchematic } = await import('./schematic');
    const points = [...buildSchematic(loadNetworkData().lines).points.values()];
    const v = fitViewBox(points, 0.08);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(v.x);
      expect(p.x).toBeLessThanOrEqual(v.x + v.w);
      expect(p.y).toBeGreaterThanOrEqual(v.y);
      expect(p.y).toBeLessThanOrEqual(v.y + v.h);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- geo/fit`
Expected: FAIL, cannot resolve `./fit`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Point } from '../data/types';
import type { ViewBox } from '../render/usePanZoom';

/** Fallback box when there is nothing to frame. */
const EMPTY: ViewBox = { x: 0, y: 0, w: 1000, h: 800 };

/** Minimum span, so a single point still yields a usable box. */
const MIN_SPAN = 200;

/**
 * Smallest viewBox containing every point, plus padding.
 *
 * The SVG keeps the browser default `preserveAspectRatio="xMidYMid meet"`, so
 * whatever the container's shape, everything in this box stays visible — it is
 * letterboxed rather than cropped. That is what guarantees no station can ever
 * sit off-screen, which is exactly how the shipped build went wrong.
 *
 * @param padding fraction of the larger span to add on every side (0.08 = 8%)
 */
export function fitViewBox(points: readonly Point[], padding: number): ViewBox {
  if (points.length === 0) return { ...EMPTY };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const w = Math.max(maxX - minX, MIN_SPAN);
  const h = Math.max(maxY - minY, MIN_SPAN);
  const pad = Math.max(w, h) * padding;

  // Re-centre on the true midpoint so a clamped span stays centred.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: cx - w / 2 - pad,
    y: cy - h / 2 - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- geo/fit`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/geo/fit.ts src/geo/fit.test.ts
git commit -m "feat: fit a viewBox to content bounds"
```

---

## Task 2: Frame the content in MapCanvas

Closes Defect 1. The map must frame whatever it is currently showing — the whole network, or one selected line.

**Files:**
- Modify: `src/render/usePanZoom.ts`, `src/render/MapCanvas.tsx`
- Modify: `src/render/MapCanvas.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
import { fitViewBox } from '../geo/fit';

describe('MapCanvas framing', () => {
  it('frames the layout it is given rather than a fixed box', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const vb = container.querySelector('svg')!.getAttribute('viewBox')!;
    const [x, y, w, h] = vb.split(' ').map(Number) as [number, number, number, number];

    for (const p of layout.values()) {
      expect(p.x).toBeGreaterThanOrEqual(x);
      expect(p.x).toBeLessThanOrEqual(x + w);
      expect(p.y).toBeGreaterThanOrEqual(y);
      expect(p.y).toBeLessThanOrEqual(y + h);
    }
  });

  it('reframes when the fit key changes', () => {
    const only = new Map([...layout].slice(0, 5));
    const { container, rerender } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} fitKey="all" />,
    );
    const before = container.querySelector('svg')!.getAttribute('viewBox');
    rerender(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitKey="subset" fitTo={[...only.values()]} />,
    );
    expect(container.querySelector('svg')!.getAttribute('viewBox')).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- MapCanvas`
Expected: FAIL — the viewBox is the hardcoded `0 0 1000 800` and does not contain the layout.

- [ ] **Step 3: Add an eased `fit` to usePanZoom**

The spec calls for framing changes to ease over 500ms, not snap — selecting a
line should visibly fly the view to it. Add to `src/render/usePanZoom.ts`:

```ts
import { easeInOut } from '../geo/layout';
import { prefersReducedMotion } from './useLayoutMode';

const FIT_MS = 500;
```

Inside the hook, keep a ref to the live view so the tween never reads a stale
closure, and cancel any in-flight tween before starting another:

```ts
  const viewRef = useRef(initial);
  useEffect(() => { viewRef.current = view; }, [view]);

  const fitFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);
  }, []);

  const fit = useCallback((box: ViewBox, opts?: { animate?: boolean }) => {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);

    const animate = (opts?.animate ?? true) && !prefersReducedMotion();
    if (!animate) {
      setView(box);
      return;
    }

    const from = viewRef.current;
    const started = performance.now();
    const step = (now: number) => {
      const e = easeInOut(Math.min(1, (now - started) / FIT_MS));
      setView({
        x: from.x + (box.x - from.x) * e,
        y: from.y + (box.y - from.y) * e,
        w: from.w + (box.w - from.w) * e,
        h: from.h + (box.h - from.h) * e,
      });
      if ((now - started) / FIT_MS < 1) fitFrame.current = requestAnimationFrame(step);
    };
    fitFrame.current = requestAnimationFrame(step);
  }, []);
```

Return `fit` alongside `view`, `setView`, and `handlers`.

The very first framing on mount should not animate — there is nothing to
animate *from* — so `MapCanvas` passes `{ animate: false }` on its first run.

- [ ] **Step 4: Frame content in MapCanvas**

In `src/render/MapCanvas.tsx`:

- Import `useEffect`, `useMemo` from react, and `fitViewBox` from `../geo/fit`.
- Add two optional props:

```tsx
  /** Points to frame. Defaults to every point in `layout`. */
  fitTo?: readonly Point[];
  /** Changing this reframes the view. Use something like `${mode}:${line ?? 'all'}`. */
  fitKey?: string;
```

- Replace the `initialView` default with a computed initial box, and refit when `fitKey` changes:

```tsx
  const framed = useMemo(
    () => fitViewBox(fitTo ?? [...layout.values()], 0.08),
    [fitTo, layout],
  );
  const { view, fit, handlers } = usePanZoom(framed);

  const framedOnce = useRef(false);
  useEffect(() => {
    fit(framed, { animate: framedOnce.current });
    framedOnce.current = true;
    // Reframing is driven by fitKey alone: `framed` changes on every layout
    // tween frame, and refitting then would fight the user's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
```

Delete `DEFAULT_VIEW` and the `initialView` prop.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, 119 tests. The four original `MapCanvas` tests must still pass unedited.

- [ ] **Step 6: Commit**

```bash
git add src/render/usePanZoom.ts src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx
git commit -m "fix: frame the map to its content instead of a fixed viewBox"
```

---

## Task 3: One shared projection

The backdrop and the stations must be projected by the *same* transform. Two independent fits would put the tracks in the sea.

**Files:**
- Modify: `src/geo/project.ts`, `src/geo/project.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/geo/project.test.ts`:

```ts
import { makeProjection } from './project';

describe('makeProjection', () => {
  it('reproduces projectStations for the same inputs', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    for (const s of stations.slice(0, 20)) {
      const a = proj.project(s.geo);
      const b = pts.get(s.id)!;
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('places a point outside the fitted set outside the viewport, not clamped', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    // Far north-west of the network: the backdrop legitimately extends past it.
    const far = proj.project({ lat: 3.9, lng: 100.8 });
    expect(far.x).toBeLessThan(vp.padding);
    expect(far.y).toBeLessThan(vp.padding);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- geo/project`
Expected: FAIL, `makeProjection is not a function`.

- [ ] **Step 3: Refactor project.ts**

Extract the fitting maths into a reusable projection, and express `projectStations` in terms of it so there is exactly one implementation:

```ts
export interface Projection {
  project(at: LatLng): Point;
}

/**
 * Builds a projection fitted to `fitTo`, at a uniform scale.
 *
 * Points outside `fitTo` project outside the viewport rather than being
 * clamped — that is deliberate, and it is how the map backdrop extends past
 * the edges of the framed network.
 */
export function makeProjection(fitTo: readonly LatLng[], vp: Viewport): Projection {
  if (fitTo.length === 0) {
    return { project: () => ({ x: vp.width / 2, y: vp.height / 2 }) };
  }

  const xs = fitTo.map((c) => mercatorX(c.lng));
  const ys = fitTo.map((c) => mercatorY(c.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const usableW = vp.width - vp.padding * 2;
  const usableH = vp.height - vp.padding * 2;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = vp.padding + (usableW - spanX * scale) / 2;
  const offsetY = vp.padding + (usableH - spanY * scale) / 2;

  return {
    project: (at: LatLng): Point => ({
      x: offsetX + (mercatorX(at.lng) - minX) * scale,
      // Screen y grows downward; mercator y grows northward. Flip it.
      y: offsetY + (maxY - mercatorY(at.lat)) * scale,
    }),
  };
}

export function projectStations(stations: Station[], vp: Viewport): Map<string, Point> {
  const proj = makeProjection(stations.map((s) => s.geo), vp);
  return new Map(stations.map((s) => [s.id, proj.project(s.geo)]));
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, 121 tests. The five existing `project` tests must still pass unedited — that is the point of expressing `projectStations` through `makeProjection`.

- [ ] **Step 5: Commit**

```bash
git add src/geo/project.ts src/geo/project.test.ts
git commit -m "refactor: expose a reusable projection for backdrop and stations"
```

---

## Task 4: Backdrop geometry and rendering

**Files:**
- Create: `src/geo/boundaries.ts`, `src/render/MapBackdrop.tsx`
- Test: `src/geo/boundaries.test.ts`
- Modify: `src/render/MapCanvas.tsx`, `src/render/map.css`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { loadBoundaries, projectBoundaries } from './boundaries';
import { makeProjection } from './project';

const vp = { width: 1000, height: 800, padding: 60 };

describe('loadBoundaries', () => {
  it('loads the three Klang Valley regions', () => {
    expect(loadBoundaries().regions.map((r) => r.id).sort())
      .toEqual(['kuala-lumpur', 'putrajaya', 'selangor']);
  });

  it('gives every ring at least three points', () => {
    for (const r of loadBoundaries().regions) {
      for (const ring of r.rings) expect(ring.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('records its attribution', () => {
    expect(loadBoundaries().attribution).toMatch(/natural earth/i);
  });
});

describe('projectBoundaries', () => {
  it('projects with the same transform as the stations', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    const paths = projectBoundaries(loadBoundaries(), proj);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.d.startsWith('M')).toBe(true);
  });

  it('surrounds the network rather than sitting beside it', () => {
    const stations = loadNetworkData().stations;
    const proj = makeProjection(stations.map((s) => s.geo), vp);
    const pts = projectBoundaries(loadBoundaries(), proj).flatMap((p) => p.points);
    const sx = stations.map((s) => proj.project(s.geo).x);
    const sy = stations.map((s) => proj.project(s.geo).y);
    // Land extends past the network on every side.
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(Math.min(...sx));
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(Math.max(...sx));
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(Math.min(...sy));
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(Math.max(...sy));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- boundaries`
Expected: FAIL, cannot resolve `./boundaries`.

- [ ] **Step 3: Write `src/geo/boundaries.ts`**

```ts
import type { LatLng, Point } from '../data/types';
import type { Projection } from './project';
import raw from '../data/boundaries.json';

export interface BoundaryRegion {
  id: string;
  name: string;
  /** Outer rings, each an array of [lng, lat] pairs. */
  rings: [number, number][][];
}

export interface BoundaryData {
  attribution: string;
  regions: BoundaryRegion[];
}

export interface BoundaryPath {
  id: string;
  /** SVG path data for the ring. */
  d: string;
  points: Point[];
}

export function loadBoundaries(): BoundaryData {
  return raw as BoundaryData;
}

/** Projects every ring with the supplied projection, yielding SVG paths. */
export function projectBoundaries(data: BoundaryData, proj: Projection): BoundaryPath[] {
  const out: BoundaryPath[] = [];
  for (const region of data.regions) {
    region.rings.forEach((ring, i) => {
      const points = ring.map(([lng, lat]) => proj.project({ lat, lng } as LatLng));
      if (points.length < 3) return;
      const d = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`;
      out.push({ id: `${region.id}-${i}`, d, points });
    });
  }
  return out;
}
```

- [ ] **Step 4: Write `src/render/MapBackdrop.tsx`**

```tsx
import type { BoundaryPath } from '../geo/boundaries';

/** Land and administrative outlines, drawn beneath the tracks. */
export function MapBackdrop({ paths }: { paths: BoundaryPath[] }) {
  return (
    <g className="map-backdrop" aria-hidden="true">
      {paths.map((p) => (
        <path key={p.id} d={p.d} />
      ))}
    </g>
  );
}
```

- [ ] **Step 5: Render it in MapCanvas**

Add an optional prop `backdrop?: BoundaryPath[]`, and render `{backdrop && <MapBackdrop paths={backdrop} />}` as the **first child** inside the `<svg>`, before the line polylines, so it sits underneath.

Append to `src/render/map.css`:

```css
.map-backdrop path { fill: var(--land, #1b2029); stroke: var(--land-edge, #2c3340); stroke-width: 1; }
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS, 126 tests.

- [ ] **Step 7: Commit**

```bash
git add src/geo/boundaries.ts src/geo/boundaries.test.ts src/render/MapBackdrop.tsx src/render/MapCanvas.tsx src/render/map.css
git commit -m "feat: draw the Klang Valley backdrop beneath the tracks"
```

---

## Task 5: Design tokens and screen layout

Closes Defect 2. Until this lands, every screen puts its content below the fold.

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Understand the failure**

`.map-canvas` carries `height: 100%`. Its parent is a plain `<div>` with auto height, so `100%` resolves to `auto`, the SVG falls back to its viewBox aspect ratio, and at 1400px wide it renders 1120px tall — pushing the prompt, HUD, and buttons off-screen. Nothing else on any screen has layout at all.

- [ ] **Step 2: Write the stylesheet**

Extend `src/index.css`. Keep the existing tokens and prompt rules; add the scale, the app shell, and per-screen layout.

```css
:root {
  --bg: #12141a;
  --fg: #f2f4f8;
  --dim: #9aa3b2;
  --accent: #ffd166;
  --land: #1b2029;
  --land-edge: #2c3340;
  --panel: rgba(18, 20, 26, 0.82);
  --panel-edge: #2c3340;

  --s: 0.5rem;
  --s2: 1rem;
  --s3: 1.5rem;
  --s4: 2.5rem;

  --t-xs: 0.75rem;
  --t-sm: 0.875rem;
  --t-md: 1rem;
  --t-lg: 1.5rem;
  --t-xl: 2.25rem;
  --t-prompt: clamp(2rem, 5vw, 3.5rem);

  color-scheme: dark;
}

html, body, #root { height: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: var(--t-md)/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* The app owns the viewport; screens fill it and never scroll the page. */
.app { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

/* --- play screens: map behind, panel floating over --- */
.play { position: relative; height: 100%; }
.play .map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

.play-panel {
  position: absolute; left: 50%; bottom: var(--s3); transform: translateX(-50%);
  width: min(56rem, calc(100% - var(--s4)));
  display: flex; flex-direction: column; gap: var(--s2);
  padding: var(--s3);
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 14px;
  backdrop-filter: blur(12px);
}

.prompt { font-size: var(--t-prompt); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }

/* --- home map --- */
.home-map { position: relative; height: 100%; }
.home-map .map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.home-map header { position: absolute; top: var(--s3); left: var(--s3); z-index: 1; }
.home-map h1 { margin: 0; font-size: var(--t-xl); letter-spacing: -0.02em; }
.home-map .tagline { margin: 0; color: var(--dim); font-size: var(--t-sm); }
.home-map footer {
  position: absolute; bottom: var(--s2); left: var(--s3); right: var(--s3);
  color: var(--dim); font-size: var(--t-xs);
}

.line-picker {
  position: absolute; top: var(--s3); right: var(--s3); z-index: 1;
  display: flex; flex-direction: column; gap: var(--s);
  width: 18rem; max-height: calc(100% - var(--s4) * 2); overflow: auto;
}
.line-picker button {
  display: grid; grid-template-columns: 2.5rem 1fr auto; gap: var(--s2); align-items: center;
  padding: var(--s) var(--s2); text-align: left;
  background: var(--panel); color: var(--fg);
  border: 1px solid var(--panel-edge); border-left: 4px solid var(--line-colour, var(--dim));
  border-radius: 10px; cursor: pointer; font: inherit;
}
.line-picker button:hover, .line-picker button:focus-visible { border-color: var(--accent); }
.line-picker .code { color: var(--line-colour, var(--fg)); font-weight: 700; }
.line-picker .count { color: var(--dim); font-size: var(--t-sm); font-variant-numeric: tabular-nums; }

/* --- shared bits --- */
.line-strip { display: flex; gap: var(--s2); list-style: none; padding: 0; margin: 0;
  color: var(--dim); overflow: hidden; white-space: nowrap; }
.line-strip [data-current='true'] { color: var(--fg); font-weight: 600; }

.hud { display: flex; gap: var(--s3); font-variant-numeric: tabular-nums;
  color: var(--dim); font-size: var(--t-sm); }

.prompt [data-state='pending'] { color: var(--dim); }
.prompt [data-state='done'] { color: var(--fg); }
.prompt [data-state='current'] { color: var(--accent); border-bottom: 3px solid var(--accent); }
.prompt [data-space='true'][data-state='pending'] { border-bottom: 2px solid var(--dim); }

.junction { display: flex; flex-direction: column; gap: var(--s); }
.junction ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s); }
.junction button {
  display: flex; gap: var(--s2); align-items: baseline; width: 100%;
  padding: var(--s) var(--s2); text-align: left; font: inherit; cursor: pointer;
  background: transparent; color: var(--fg);
  border: 1px solid var(--panel-edge); border-left: 6px solid var(--line-colour, var(--dim));
  border-radius: 10px;
}
.junction kbd {
  padding: 0 0.4em; border: 1px solid var(--panel-edge); border-radius: 4px;
  color: var(--dim); font: var(--t-xs) ui-monospace, monospace;
}

.station-search input {
  width: 100%; padding: var(--s2); font: inherit; color: var(--fg);
  background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 10px;
}
.station-search ul { list-style: none; padding: 0; margin: var(--s) 0 0;
  display: flex; flex-direction: column; gap: 2px; }
.station-search button {
  width: 100%; text-align: left; padding: var(--s) var(--s2); font: inherit;
  background: transparent; color: var(--fg); border: 0; border-radius: 8px; cursor: pointer;
}
.station-search button:hover, .station-search button:focus-visible { background: var(--panel-edge); }

.summary { max-width: 40rem; margin: 0 auto; padding: var(--s4); }
.summary dl { display: grid; grid-template-columns: auto auto; gap: var(--s) var(--s3);
  justify-content: start; font-variant-numeric: tabular-nums; }
.summary dt { color: var(--dim); }
.summary dd { margin: 0; font-weight: 600; }

.hint { color: var(--dim); font-size: var(--t-xs); margin: 0; }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 3: Verify visually**

Run `npm run dev`, then screenshot the home screen:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/home.png --window-size=1400,900 --virtual-time-budget=4000 \
  http://localhost:5173/
```

Open the PNG and confirm the page fills the window with nothing below the fold. This step is not optional — skipping exactly this check is why both defects shipped.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: add design tokens and real layout for every screen"
```

---

## Task 6: Line-run routing

**Files:**
- Create: `src/engine/lineRun.ts`
- Test: `src/engine/lineRun.test.ts`
- Modify: `src/engine/run.ts`, `src/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

`src/engine/lineRun.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { lineRunRoute, terminiOf } from './lineRun';

const net = buildNetwork(loadNetworkData());

describe('terminiOf', () => {
  it('gives both ends of a line as station ids', () => {
    const [a, b] = terminiOf(net, 'MR');
    expect(a).toBe('kl-sentral');
    expect(b).toBe('titiwangsa');
  });
});

describe('lineRunRoute', () => {
  it('runs in data order from the first terminus', () => {
    const route = lineRunRoute(net, 'MR', 'kl-sentral');
    expect(route[0]).toBe('kl-sentral');
    expect(route[route.length - 1]).toBe('titiwangsa');
  });

  it('reverses from the other terminus', () => {
    const route = lineRunRoute(net, 'MR', 'titiwangsa');
    expect(route[0]).toBe('titiwangsa');
    expect(route[route.length - 1]).toBe('kl-sentral');
  });

  it('covers every station on the line exactly once', () => {
    const route = lineRunRoute(net, 'KJ', 'gombak');
    expect(route).toHaveLength(net.lines.get('KJ')!.stations.length);
    expect(new Set(route).size).toBe(route.length);
  });

  it('returns an empty route for a station that is not a terminus', () => {
    expect(lineRunRoute(net, 'MR', 'imbi')).toEqual([]);
  });
});
```

Append to `src/engine/run.test.ts` (merge `chooseTowards` into the existing import):

```ts
describe('chooseTowards', () => {
  it('takes the option leading to the named station', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    const s = chooseTowards(net, junction, 'bukit-nanas', 100);
    expect(s.at).toBe('bukit-nanas');
  });

  it('does nothing when no option leads there', () => {
    const junction = typeStation(startRun(net, 'raja-chulan', 0));
    expect(chooseTowards(net, junction, 'kajang', 100)).toEqual(junction);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lineRun`
Expected: FAIL, cannot resolve `./lineRun`.

- [ ] **Step 3: Write `src/engine/lineRun.ts`**

```ts
import type { LineCode } from '../data/types';
import type { NetworkIndex } from './network';

/** The two terminus station ids of a line, in data order. */
export function terminiOf(net: NetworkIndex, code: LineCode): [string, string] {
  const line = net.lines.get(code);
  if (!line || line.stations.length < 2) return ['', ''];
  return [line.stations[0]!, line.stations[line.stations.length - 1]!];
}

/**
 * Every station on a line, ordered from the chosen terminus.
 *
 * A Line Run has no decisions in it — the route is fixed — which is what makes
 * it the legible entry point: pick the line you know and type it.
 * Returns an empty array if `from` is not one of the line's termini.
 */
export function lineRunRoute(
  net: NetworkIndex,
  code: LineCode,
  from: string,
): string[] {
  const line = net.lines.get(code);
  if (!line) return [];
  const [head, tail] = terminiOf(net, code);
  if (from === head) return [...line.stations];
  if (from === tail) return [...line.stations].reverse();
  return [];
}
```

- [ ] **Step 4: Add `chooseTowards` to `src/engine/run.ts`**

```ts
/**
 * Takes whichever onward option leads to `next`. Used by Line Run, where the
 * route is fixed and interchanges must not prompt the player for a decision.
 */
export function chooseTowards(
  net: NetworkIndex,
  state: RunState,
  next: string,
  now: number,
): RunState {
  if (state.phase !== 'junction') return state;
  const dir = state.options.find((o) => o.next === next);
  return dir ? chooseDirection(net, state, dir, now) : state;
}
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, 132 tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine/lineRun.ts src/engine/lineRun.test.ts src/engine/run.ts src/engine/run.test.ts
git commit -m "feat: add line-run routing and directed junction choice"
```

---

## A note on Tasks 7-10 and 12

These are composition tasks: they assemble components that already exist and are
already tested. Rather than reproduce full component bodies, each specifies its
props interface, the behaviour required, and a complete test that pins the
contract. That is a deliberate step down in fidelity from the logic tasks above,
where every line is given.

If you are implementing one of these and the intended structure is unclear,
the test is the specification — make it pass without weakening it, and ask
rather than guess.

---

## Task 7: The map as home

**Files:**
- Create: `src/ui/HomeMap.tsx`
- Test: `src/ui/HomeMap.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { HomeMap } from './HomeMap';

const net = buildNetwork(loadNetworkData());
const noop = () => {};
beforeEach(() => localStorage.clear());

describe('HomeMap', () => {
  it('renders the network map', () => {
    const { container } = render(
      <HomeMap net={net} onPickLine={noop} onPickStation={noop} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('offers all seven lines to choose from', () => {
    render(<HomeMap net={net} onPickLine={noop} onPickStation={noop} />);
    expect(screen.getAllByRole('button', { name: /line|monorail/i }).length)
      .toBeGreaterThanOrEqual(7);
  });

  it('reports the line chosen by click', () => {
    let picked = '';
    render(<HomeMap net={net} onPickLine={(c) => (picked = c)} onPickStation={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /kelana jaya/i }));
    expect(picked).toBe('KJ');
  });

  it('reports the line chosen by typing its code', () => {
    let picked = '';
    render(<HomeMap net={net} onPickLine={(c) => (picked = c)} onPickStation={noop} />);
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'r' });
    expect(picked).toBe('MR');
  });

  it('states that the project is unofficial', () => {
    render(<HomeMap net={net} onPickLine={noop} onPickStation={noop} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });

  it('shows the recovery notice when a save could not be read', () => {
    localStorage.setItem('myrapid.v1', 'not json {{{');
    render(<HomeMap net={net} onPickLine={noop} onPickStation={noop} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- HomeMap`
Expected: FAIL, cannot resolve `./HomeMap`.

- [ ] **Step 3: Write the implementation**

Compose the pieces that already exist. Key points:

- Build `geo` positions via `projectStations`, and the backdrop via `makeProjection` + `projectBoundaries` — **the same projection instance for both**, or the tracks will not sit on the land.
- Render `MapCanvas` with `fitKey="home"` so it frames the whole network.
- A `.line-picker` list of seven buttons, each showing the line code as text, its name, and visited progress (`n / total`), with `--line-colour` set from the line's colour.
- Keyboard: accumulate typed letters into a short buffer and match against line codes (two keystrokes, e.g. `m` then `r`). Reset the buffer after 1s or on a match. `useKeyboard` provides the keys.
- Header with the title and tagline; footer with the unofficial-project disclaimer.
- A `role="status"` banner when `loadProfile().recovered` is true.
- `StationSearch` wired to `onPickStation`, for entering Adventure mode.
- **A resume affordance.** If `loadProfile().adventure` is set, show a button
  reading `Resume from {station name}` that calls `onPickStation` with the saved
  station id. Plan 1 saved this position after every arrival, and without a way
  back to it a player's journey is stranded. Add a test asserting the button
  appears when an adventure position is stored.

```tsx
export interface HomeMapProps {
  net: NetworkIndex;
  onPickLine: (code: LineCode) => void;
  onPickStation: (stationId: string) => void;
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, 138 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HomeMap.tsx src/ui/HomeMap.test.tsx
git commit -m "feat: make the map the home screen"
```

---

## Task 8: Direction chooser and zoom-to-line

**Files:**
- Create: `src/ui/DirectionChooser.tsx`
- Test: `src/ui/DirectionChooser.test.tsx`
- Modify: `src/ui/HomeMap.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { DirectionChooser } from './DirectionChooser';

const net = buildNetwork(loadNetworkData());

describe('DirectionChooser', () => {
  it('offers both termini of the line', () => {
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /kl sentral/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /titiwangsa/i })).toBeTruthy();
  });

  it('reports the terminus chosen by number key', () => {
    let from = '';
    render(<DirectionChooser net={net} line="MR" onChoose={(id) => (from = id)} onCancel={() => {}} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(from).toBe('kl-sentral');
  });

  it('cancels on Escape', () => {
    let cancelled = false;
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => (cancelled = true)} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

The component reads `terminiOf(net, line)`, renders one button per terminus labelled "Start at X — toward Y", binds `1`/`2` and `Escape` via `useKeyboard`, and shows the line code as text alongside its colour.

- [ ] **Step 3: Wire selection into HomeMap**

When a line is selected, `HomeMap` holds it in state and:
- passes `fitKey={`line:${code}`}` and `fitTo={positions of that line's stations}` to `MapCanvas`, so the view eases to frame the line
- passes `emphasis={code}` to `MapCanvas`, which adds `data-dim="true"` to every other line's polyline
- renders `DirectionChooser`; `Escape` clears the selection and reframes to `fitKey="home"`

Add to `map.css`:

```css
.map-canvas polyline[data-dim='true'] { opacity: 0.22; }
.map-canvas polyline { transition: opacity 220ms ease; }
```

- [ ] **Step 4: Run the suite, then commit**

Expected: PASS, 141 tests.

```bash
git add src/ui/DirectionChooser.tsx src/ui/DirectionChooser.test.tsx src/ui/HomeMap.tsx src/render/MapCanvas.tsx src/render/map.css
git commit -m "feat: choose a direction and zoom to the selected line"
```

---

## Task 9: Line Run screen

**Files:**
- Create: `src/ui/LineRunScreen.tsx`
- Test: `src/ui/LineRunScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { LineRunScreen } from './LineRunScreen';

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };
beforeEach(() => localStorage.clear());

describe('LineRunScreen', () => {
  it('starts at the chosen terminus', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('advances along the line without asking for a direction', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    type('KL Sentral');
    // Tun Sambanthan is next on the Monorail; no junction prompt appears.
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /choose a direction/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

The screen holds the route from `lineRunRoute(net, line, from)` and an index. It reuses `startRun` / `keyRun` exactly as Adventure does, but when the run enters the `junction` phase it immediately calls `chooseTowards(net, state, route[i + 1], now)` — so interchanges never prompt. When the index reaches the end of the route it calls `endRun` and shows `SummaryScreen`.

Persistence mirrors `AdventureScreen`: a counter-guarded effect calling `recordStation` and `saveProfile`. **Do not** write an adventure resume position from a Line Run.

- [ ] **Step 3: Run the suite, then commit**

Expected: PASS, 143 tests.

```bash
git add src/ui/LineRunScreen.tsx src/ui/LineRunScreen.test.tsx
git commit -m "feat: add Line Run mode"
```

---

## Task 10: Shared play layout

**Files:**
- Create: `src/ui/PlayLayout.tsx`
- Modify: `src/ui/AdventureScreen.tsx`, `src/ui/LineRunScreen.tsx`

- [ ] **Step 1: Extract the layout**

Both play screens render the same shape: map filling the viewport, a floating panel over the lower third holding the line strip, prompt, junction picker (Adventure only), HUD, and controls. Extract it so the two screens differ only in their game logic:

```tsx
export function PlayLayout({ map, panel }: { map: ReactNode; panel: ReactNode }) {
  return (
    <div className="play">
      {map}
      <div className="play-panel">{panel}</div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in both screens**

Replace the ad-hoc markup in `AdventureScreen` and `LineRunScreen`. The existing `AdventureScreen` tests must keep passing unedited — they assert on labels and roles, not structure.

- [ ] **Step 3: Verify visually**

Screenshot a play screen headlessly and confirm the panel sits over the map with the prompt legible against it.

- [ ] **Step 4: Run the suite, then commit**

```bash
git add src/ui/PlayLayout.tsx src/ui/AdventureScreen.tsx src/ui/LineRunScreen.tsx
git commit -m "feat: share one play layout between the two modes"
```

---

## Task 11: Motion

**Files:**
- Modify: `src/render/MapCanvas.tsx`, `src/render/LineStrip.tsx`, `src/ui/JunctionPicker.tsx`, `src/index.css`

- [ ] **Step 1: Add the animations**

Three additions, all CSS-driven so `prefers-reduced-motion` suppresses them via the existing rule:

- **Arrival pulse** — the active station dot scales briefly when a name completes. Drive it by keying the `<circle>` on `activeStation` so React remounts it and the CSS animation replays.
- **Line strip slide** — a transform transition on the strip as it advances.
- **Junction stagger** — each junction card fades and rises in, delayed by its index.

```css
@keyframes arrive { from { r: 8; opacity: 1; } 50% { r: 14; opacity: 0.5; } to { r: 8; opacity: 1; } }
.map-canvas circle[data-active='true'] { animation: arrive 250ms ease-out; }

.line-strip { transition: transform 300ms ease; }

@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.junction li { animation: rise 200ms ease-out backwards; }
.junction li:nth-child(1) { animation-delay: 0ms; }
.junction li:nth-child(2) { animation-delay: 40ms; }
.junction li:nth-child(3) { animation-delay: 80ms; }
.junction li:nth-child(4) { animation-delay: 120ms; }
```

- [ ] **Step 2: Verify reduced motion**

Screenshot with `--force-prefers-reduced-motion` and confirm the page still renders correctly with animations suppressed.

- [ ] **Step 3: Run the suite, then commit**

```bash
git add src/render/MapCanvas.tsx src/render/LineStrip.tsx src/ui/JunctionPicker.tsx src/index.css
git commit -m "feat: add arrival, strip, and junction motion"
```

---

## Task 12: Route the app

**Files:**
- Modify: `src/ui/App.tsx`
- Delete: `src/ui/HomeScreen.tsx`, `src/ui/HomeScreen.test.tsx`
- Test: `src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('opens on the map', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('starts a line run from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement**

`App` holds a small screen union — `{ kind: 'home' } | { kind: 'line', code, from } | { kind: 'adventure', at }` — and renders `HomeMap`, `LineRunScreen`, or `AdventureScreen`. `HomeScreen` is deleted; its disclaimer, recovery notice, and resume affordance now live in `HomeMap`.

Keep the existing dev-only `validateNetworkData` guard.

- [ ] **Step 3: Run the suite, then commit**

The four `HomeScreen` tests go away with the component; their behaviour is covered by the `HomeMap` tests.

```bash
git add -A
git commit -m "feat: route between the map, line runs, and adventures"
```

---

## Task 13: Visual verification

The step whose absence let both defects ship. This is a task, not an afterthought.

**Files:** none — this task produces screenshots and a written assessment.

- [ ] **Step 1: Capture every screen**

With `npm run dev` running, screenshot at 1400x900 and at 1024x700:

- the home map
- a line selected, with the direction chooser open
- a line run mid-typing
- an adventure at a junction
- a run summary

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/shot.png --window-size=1400,900 --virtual-time-budget=4000 http://localhost:5173/
```

Interactive screens need a click first; drive them with Chrome's remote debugging port, or temporarily deep-link via a query parameter and revert afterwards.

- [ ] **Step 2: Look at each one and write down what is wrong**

Check specifically:
- Is anything below the fold?
- Do the tracks sit on the land, in register with the backdrop?
- Is the prompt legible against whatever map is behind it?
- Is the whole network visible on load at both window sizes?
- Are the line colours distinguishable from one another?
- Does the schematic view read as a diagram?

- [ ] **Step 3: Fix what you found, then re-shoot**

Repeat until the list is empty.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: visual issues found in review"
```

---

## Definition of done

- [ ] `npm test` green with no skipped tests; `npx tsc --noEmit` clean; `npm run build` succeeds
- [ ] Every station is inside the initial view on load, at 1400x900 and 1024x700
- [ ] No screen has content the player needs below the fold
- [ ] A line can be picked, its direction chosen, and run to its terminus by keyboard alone
- [ ] Adventure mode still works, still resumes, and its Plan 1 tests pass unedited
- [ ] The backdrop sits under the tracks, in register
- [ ] All motion is suppressed under `prefers-reduced-motion`
- [ ] The unofficial-project disclaimer is visible on the home screen
- [ ] Every screen has been screenshotted and looked at
