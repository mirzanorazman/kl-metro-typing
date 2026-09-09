# Visual Revamp Implementation Plan

> **STATUS: COMPLETE.** All 20 tasks executed and reviewed; merged to `main` as
> `68a561c`. Per-task commits, the decisions taken during execution, and the
> places where the shipped code deliberately departs from this plan are
> recorded in
> **`docs/superpowers/2026-09-09-visual-revamp-execution-record.md`** — read
> that before treating anything below as current.
>
> The step checkboxes are left unticked on purpose. Several steps were
> superseded mid-execution (most of Task 12's, whose `view.w < 450` threshold
> proved to be a broken proxy), so ticking them would assert something untrue.
> The execution record's completion table is the authoritative status.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's improvised dark-slate visual system with the design pack's identity — two atmospheres behind a toggle, self-hosted signage typography, and a cartographic map — without changing any game rule.

**Architecture:** A token layer lands first, so every stylesheet stops declaring literal colours and both palettes become a `data-theme` switch on `<html>`. Map furniture lands second, once tokens exist to express it. Screen chrome lands last. Each phase leaves the app working.

**Tech Stack:** React 18, TypeScript (strict, `noUncheckedIndexedAccess`), Vite 5, Vitest + jsdom + Testing Library, plain CSS with custom properties, inline SVG.

**Spec:** `docs/superpowers/specs/2026-09-09-visual-revamp-design.md`

## Global Constraints

- **Line codes are always text.** Per `CONTEXT.md`: "Always shown as text wherever a line colour appears, because colour is never the only signal." A badge may never become a bare coloured square.
- **No literal colours outside `src/styles/tokens.css`.** Every other stylesheet and component reads tokens or the line colour from data.
- **Rail colours live in `src/data/lines.json`**, one shared set across both themes.
- **Reduced motion is honoured by the existing global block** in `src/index.css`, which zeroes `animation-duration`, `animation-delay`, `transition-duration` and `scroll-behavior`. New animated marks must be built as CSS animations so that block catches them; never as JS loops.
- **TypeScript is strict with `noUncheckedIndexedAccess`.** Every array index access yields `T | undefined` and must be narrowed.
- **`npm test` and `npm run build` must both pass before every commit.** `build` runs `tsc --noEmit` first.
- **Tests import explicitly** (`import { describe, it, expect } from 'vitest'`) even though `globals: true`, matching every existing test file.

## Spec correction adopted by this plan

Spec §1.3 says `contrastText` returns "`--ink` for light fills, `--paper` for dark ones". That is wrong: `--ink` and `--paper` invert between themes, so a yellow `PY` badge would take dark text in paper and white text in midnight — illegible in the second. Badge foregrounds must be theme-independent.

This plan instead adds two tokens that never vary by theme, `--badge-ink` and `--badge-paper`, and `contrastText` returns one of those. Task 1 defines them; Task 12 uses them. The spec has been amended to match.

---

## Phase 1 — Token layer

### Task 1: Self-hosted fonts and the token layer

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `package.json`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the custom properties every later task reads — `--paper`, `--paper-sub`, `--paper-edge`, `--panel`, `--panel-edge`, `--panel-shadow`, `--panel-blur`, `--ink`, `--ink-muted`, `--ink-faint`, `--grid-dot`, `--track-done`, `--error`, `--focus-ring`, `--badge-ink`, `--badge-paper`, `--font-sans`, `--font-mono`. Midnight is selected by `document.documentElement.dataset.theme === 'midnight'`.

- [ ] **Step 1: Install the two variable faces**

```bash
npm install @fontsource-variable/plus-jakarta-sans@5.3.0 @fontsource-variable/jetbrains-mono@5.3.0
```

- [ ] **Step 2: Create the token file**

Create `src/styles/tokens.css`:

```css
/* Both atmospheres of the design pack, as one token layer.
 *
 * Paper is defined on bare :root and midnight overrides it, so a theme is one
 * attribute on <html> rather than a class on every surface. Nothing else in
 * the app declares a literal colour — if a value is needed twice, it belongs
 * here.
 */
:root {
  --paper: #f7f5ee;
  --paper-sub: #f0ede3;
  --paper-edge: #ded8cb;

  --panel: #ffffff;
  --panel-edge: #ded8cb;
  --panel-shadow: 0 4px 16px -2px rgba(60, 52, 42, 0.1);
  --panel-blur: none;

  --ink: #14181f;
  --ink-muted: #5c6470;
  --ink-faint: #a29e94;

  --grid-dot: #d9d4c7;
  /* The already-typed stretch of rail. Ink on paper, white on midnight. */
  --track-done: #14181f;
  --error: #e53935;
  --focus-ring: #14181f;

  /* Badge foregrounds do NOT vary by theme: a yellow badge needs dark text on
     both grounds. Chosen per line colour by contrastText(). */
  --badge-ink: #14181f;
  --badge-paper: #ffffff;

  --font-sans: 'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace;

  color-scheme: light;
}

[data-theme='midnight'] {
  --paper: #0b0f17;
  --paper-sub: #101725;
  --paper-edge: #1a273c;

  --panel: rgba(17, 24, 39, 0.85);
  --panel-edge: #1f293d;
  --panel-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  --panel-blur: blur(8px);

  --ink: #f8fafc;
  --ink-muted: #94a3b8;
  --ink-faint: #475569;

  --grid-dot: #1a2438;
  --track-done: #ffffff;
  --error: #ef4444;
  --focus-ring: #f8fafc;

  color-scheme: dark;
}
```

- [ ] **Step 3: Wire fonts and tokens into the entry point**

Replace the imports in `src/main.tsx`. Tokens must come before `index.css`, which consumes them:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Verify the build still passes**

Run: `npm run build`
Expected: PASS. Nothing consumes the tokens yet, so the app still renders in the old palette — that is correct at this point.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/styles/tokens.css src/main.tsx
git commit -m "feat: add the two-atmosphere token layer and self-hosted faces"
```

---

### Task 2: Convert `index.css` to tokens

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: every token from Task 1.
- Produces: `.line-badge` is NOT defined here (Task 12 adds it). The spacing scale `--s`/`--s2`/`--s3`/`--s4` and the type scale `--t-xs`/`--t-sm`/`--t-md`/`--t-lg`/`--t-xl`/`--t-prompt` stay in this file and keep their names.

- [ ] **Step 1: Replace the `:root` block and body rule**

The old `:root` declared colours; those now come from `tokens.css`. Replace lines 1–36 of `src/index.css` with:

```css
/* Colours and faces come from styles/tokens.css. This file owns the spacing
   and type scales, and the component rules beneath them. */
:root {
  --s: 0.5rem;
  --s2: 1rem;
  --s3: 1.5rem;
  --s4: 2.5rem;

  --t-xs: 0.6875rem;
  --t-sm: 0.75rem;
  --t-md: 1rem;
  --t-lg: 1.375rem;
  --t-xl: 2rem;
  --t-prompt: clamp(1.75rem, 4vw, 2.25rem);
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: var(--t-md)/1.5 var(--font-sans);
}
```

- [ ] **Step 2: Rename every colour reference in the rest of the file**

Apply throughout `src/index.css`, top to bottom:

| Old | New |
|---|---|
| `var(--bg)` | `var(--paper)` |
| `var(--fg)` | `var(--ink)` |
| `var(--dim)` | `var(--ink-muted)` |
| `var(--land)` | `var(--paper-sub)` |
| `var(--land-edge)` | `var(--paper-edge)` |
| `var(--accent)` as a focus or border colour | `var(--focus-ring)` |
| `var(--accent)` in `.prompt` and `@keyframes miskey` | `var(--line-colour, var(--ink))` |

`--panel`, `--panel-edge` and `--error` keep their names and now resolve from `tokens.css`.

- [ ] **Step 3: Update the panel and prompt rules specifically**

These three need more than a rename. In `.play-panel`, take the shadow and blur from tokens and drop the radius to the spec's 10px:

```css
.play-panel {
  position: absolute; left: 50%; bottom: var(--s3); transform: translateX(-50%);
  width: min(56rem, calc(100% - var(--s4)));
  display: flex; flex-direction: column; gap: var(--s2);
  padding: var(--s3);
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  backdrop-filter: var(--panel-blur);
}
```

The prompt takes the run's line colour rather than a fixed accent, and the design's signage treatment. `text-transform` is safe: `applyKey` in `src/engine/typing.ts` compares with `key.toLowerCase() === expected.toLowerCase()`, so the target string is untouched and every accessible-name assertion keeps passing:

```css
.prompt {
  font: 700 var(--t-prompt)/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}
.prompt [data-state='pending'] { color: var(--ink-faint); }
.prompt [data-state='done'] { color: var(--ink); }
.prompt [data-state='current'] {
  color: var(--line-colour, var(--ink));
  border-bottom: 2px solid var(--line-colour, var(--ink));
}
.prompt [data-space='true'][data-state='pending'] { border-bottom: 2px solid var(--ink-faint); }

@keyframes miskey {
  0%   { color: var(--error); border-bottom-color: var(--error); transform: translateX(-2px); }
  60%  { color: var(--error); border-bottom-color: var(--error); transform: translateX(2px); }
  100% { color: var(--line-colour, var(--ink));
         border-bottom-color: var(--line-colour, var(--ink)); transform: none; }
}
```

And the generic button, which loses the amber hover:

```css
button {
  font: inherit; color: var(--ink); cursor: pointer;
  background: transparent; border: 1px solid var(--panel-edge);
  border-radius: 8px; padding: var(--s) var(--s2);
}
button:hover, button:focus-visible { border-color: var(--focus-ring); }
```

- [ ] **Step 4: Confirm no literal colours remain**

Run: `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' src/index.css`
Expected: no output. Any hit must move to `tokens.css` or become a token reference.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. No test asserts on a colour.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "refactor: draw index.css from the token layer"
```

---

### Task 3: Convert the remaining stylesheets to tokens

**Files:**
- Modify: `src/render/map.css`
- Modify: `src/ui/summary.css`
- Modify: `src/ui/leaderboard.css`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `.map-canvas` reads `--paper`; station marks read `--station-colour` with an `--ink-muted` fallback, which Task 8 begins setting per station.

- [ ] **Step 1: Convert `src/render/map.css`**

Replace the colour-bearing rules (lines 1–12) with:

```css
.map-canvas { width: 100%; height: 100%; touch-action: none; background: var(--paper); }
.map-canvas polyline { transition: opacity 220ms ease; }
.map-canvas polyline[data-dim='true'] { opacity: 0.18; }
/* Visiting fills the dot in: you are colouring the map as you go. */
.map-canvas circle { transition: opacity 220ms ease, fill 380ms ease, stroke 380ms ease; }
.map-canvas circle[data-dim='true'] { opacity: 0.22; }
.map-canvas circle {
  fill: var(--paper);
  stroke: var(--station-colour, var(--ink-muted));
  stroke-width: 2.5;
}
.map-canvas circle[data-visited='true'] {
  fill: var(--station-colour, var(--ink));
  stroke: var(--station-colour, var(--ink));
}
.map-canvas circle[data-next='true'] { stroke: var(--focus-ring); stroke-width: 4; }
.map-canvas circle[data-active='true'] {
  fill: var(--station-colour, var(--ink));
  stroke: var(--station-colour, var(--ink));
}
.map-backdrop path { fill: var(--paper-sub); stroke: var(--paper-edge); stroke-width: 1; }
```

Leave the `arrive`, `train-shake` and `line-sweep` keyframes untouched — Task 10 and Task 11 revisit them.

- [ ] **Step 2: Convert `src/ui/summary.css`**

Rename `var(--fg)` to `var(--ink)`, `var(--dim)` to `var(--ink-muted)`, and `var(--land)` to `var(--paper-sub)`. Add the panel treatment to `.summary-journey`:

```css
.summary-journey {
  width: 100%;
  max-width: 100%;
  margin: var(--s2) 0;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  overflow: hidden;
}
```

- [ ] **Step 3: Convert `src/ui/leaderboard.css`**

Rename `var(--fg)` to `var(--ink)` and `var(--dim)` to `var(--ink-muted)`. The conic glow's fallback changes from the deleted `--accent`:

```css
background: conic-gradient(
  from var(--leaderboard-glow-angle),
  transparent 0%,
  var(--line-colour, var(--ink)) 12%,
  transparent 26%,
  transparent 74%,
  var(--line-colour, var(--ink)) 88%,
  transparent 100%
);
```

And the selected tab, which used `--accent`:

```css
.leaderboard-tabs [aria-selected='true'] {
  border-color: var(--focus-ring);
  color: var(--ink);
}
```

- [ ] **Step 4: Confirm no literal colours remain anywhere but the token file**

Run: `grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' src --include=*.css | grep -v tokens.css`
Expected: no output.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render/map.css src/ui/summary.css src/ui/leaderboard.css
git commit -m "refactor: draw the remaining stylesheets from the token layer"
```

---

### Task 4: Persist the theme preference

**Files:**
- Modify: `src/engine/progress.ts:12-24`
- Test: `src/engine/progress.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Profile.theme?: 'paper' | 'midnight'`, and the exported type `Theme = 'paper' | 'midnight'`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/progress.test.ts`:

```ts
describe('theme preference', () => {
  it('is absent on a fresh profile, meaning "follow the OS"', () => {
    expect(emptyProfile().theme).toBeUndefined();
  });

  it('survives a save and load round trip', () => {
    saveProfile({ ...emptyProfile(), theme: 'midnight' });
    expect(loadProfile().theme).toBe('midnight');
  });

  it('carries older saves forward without a theme rather than rejecting them', () => {
    // A record written before the field existed. It must migrate, not recover.
    const old = { ...emptyProfile() } as Record<string, unknown>;
    delete old.theme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));

    const loaded = loadProfile();
    expect(loaded.recovered).toBeUndefined();
    expect(loaded.theme).toBeUndefined();
  });
});
```

Confirm the file's existing imports cover `emptyProfile`, `saveProfile`, `loadProfile` and `STORAGE_KEY`; add any that are missing, and add a `beforeEach(() => localStorage.clear())` if the file does not already have one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/progress.test.ts`
Expected: FAIL — TypeScript rejects `theme` as an unknown property on `Profile`.

- [ ] **Step 3: Add the field**

In `src/engine/progress.ts`, above the `Profile` interface:

```ts
/** Which atmosphere the app renders in. */
export type Theme = 'paper' | 'midnight';
```

And inside `Profile`, after `muted`:

```ts
  /**
   * Display preference. Absent means the player has never chosen, and the app
   * follows the OS. Optional and additive, so `migrate`'s spread carries older
   * saves forward untouched — the same way `muted` was added.
   */
  theme?: Theme;
```

`emptyProfile()` needs no change: absent is the correct initial value.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/progress.ts src/engine/progress.test.ts
git commit -m "feat: persist the theme preference on the profile"
```

---

### Task 5: The theme toggle

**Files:**
- Create: `src/ui/ThemeToggle.tsx`
- Test: `src/ui/ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: `Theme` from `src/engine/progress.ts`.
- Produces: `<ThemeToggle theme={Theme} onToggle={() => void} />`, rendering a `button.theme-toggle` with `aria-pressed={theme === 'midnight'}`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('names the atmosphere it will switch to', () => {
    render(<ThemeToggle theme="paper" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /midnight/i })).toBeTruthy();
  });

  it('reports which atmosphere is active', () => {
    render(<ThemeToggle theme="midnight" onToggle={() => {}} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls back on click', () => {
    const onToggle = vi.fn();
    render(<ThemeToggle theme="paper" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `./ThemeToggle`.

- [ ] **Step 3: Write the component**

Create `src/ui/ThemeToggle.tsx`. It mirrors `SoundToggle` deliberately: same button shape, same `aria-pressed` pattern, so the two sit together as a pair.

```tsx
import type { Theme } from '../engine/progress';

export interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  // The label names the destination, not the current state: a control that
  // says "Midnight" while showing paper tells you what pressing it does.
  const label = theme === 'midnight' ? 'Switch to paper' : 'Switch to midnight';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={theme === 'midnight'}
      title={label}
    >
      {theme === 'midnight' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/ThemeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ThemeToggle.tsx src/ui/ThemeToggle.test.tsx
git commit -m "feat: add the atmosphere toggle control"
```

---

### Task 6: Apply the theme, and mount the toggle

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/HomeMap.tsx:93-156`
- Modify: `src/index.css`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `Theme`, `Profile.theme` (Task 4); `ThemeToggle` (Task 5).
- Produces: `document.documentElement.dataset.theme` is always `'paper'` or `'midnight'` once `App` has mounted.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/App.test.tsx`:

```tsx
describe('atmosphere', () => {
  it('follows the OS when the player has never chosen', () => {
    // jsdom's matchMedia always reports no match, so this is the light branch.
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('paper');
  });

  it('honours a stored choice over the OS', () => {
    saveProfile({ ...emptyProfile(), theme: 'midnight' });
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });
});
```

Add `import { emptyProfile, saveProfile } from '../engine/progress';` to the file if it is not already imported, and ensure a `beforeEach(() => localStorage.clear())` exists.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — `dataset.theme` is `undefined`.

- [ ] **Step 3: Apply the theme in `App`**

Add to `src/ui/App.tsx` — the import list gains `useEffect` and the progress types:

```tsx
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
```

Add a resolver above the component:

```tsx
/**
 * The atmosphere to render in. A stored choice always wins; with none, the OS
 * decides and nothing is written — a player who never touches the toggle keeps
 * following their system for as long as they never touch it.
 */
function resolveTheme(stored: Theme | undefined): Theme {
  if (stored) return stored;
  const dark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'midnight' : 'paper';
}
```

Inside `App`, alongside the existing state:

```tsx
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadProfile().theme));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'midnight' ? 'paper' : 'midnight';
    setTheme(next);
    saveProfile({ ...loadProfile(), theme: next });
  };
```

Pass both down to `HomeMap` in the final `return`:

```tsx
    <HomeMap
      net={net}
      theme={theme}
      onToggleTheme={toggleTheme}
      onStartLine={(code, from) => setScreen({ kind: 'line', code, from })}
      onPickStation={(at) => setScreen({ kind: 'adventure', at })}
      onOpenLeaderboard={() => setScreen({ kind: 'leaderboard' })}
    />
```

- [ ] **Step 4: Accept and mount the toggle in `HomeMap`**

Extend `HomeMapProps` in `src/ui/HomeMap.tsx`:

```tsx
export interface HomeMapProps {
  net: NetworkIndex;
  theme: Theme;
  onToggleTheme: () => void;
  onStartLine: (code: LineCode, from: string) => void;
  onPickStation: (stationId: string) => void;
  onOpenLeaderboard: () => void;
}
```

Import `ThemeToggle` and `type Theme`, destructure the two new props, and replace the bare `<SoundToggle .../>` line with the pair in a cluster:

```tsx
            <div className="control-cluster">
              <SoundToggle muted={muted} onToggle={toggleSound} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
```

- [ ] **Step 5: Style the cluster**

Replace the `.line-picker .sound-toggle` rule in `src/index.css` with a rule that dresses both controls:

```css
.control-cluster {
  display: flex; gap: var(--s); align-self: flex-end;
}
.control-cluster button {
  width: 2.75rem; display: flex; justify-content: center;
  padding: var(--s);
}
.control-cluster svg { width: 1.25rem; height: 1.25rem; display: block; }
```

- [ ] **Step 6: Fix every other `HomeMap` render site**

`HomeMap` now has two required props, so `tsc` will reject existing test renders. In `src/ui/HomeMap.test.tsx`, add `theme="paper" onToggleTheme={noop}` to every `<HomeMap ... />`.

Run: `npm run build`
Expected: PASS. If `tsc` names another call site, add the two props there too.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/App.tsx src/ui/App.test.tsx src/ui/HomeMap.tsx src/ui/HomeMap.test.tsx src/index.css
git commit -m "feat: apply and toggle the atmosphere"
```

**Phase 1 is complete here.** Manually confirm with `npm run dev`: the app renders as warm paper in Plus Jakarta Sans, the toggle flips it to midnight, and the choice survives a reload.

---

## Phase 2 — Map furniture

### Task 7: District anchors and map scale

**Files:**
- Create: `src/data/districts.json`
- Modify: `src/geo/networkLayout.ts`
- Test: `src/geo/networkLayout.test.ts`

**Interfaces:**
- Consumes: `makeProjection` from `src/geo/project.ts`.
- Produces: on `NetworkLayout`, `districts: District[]` where `District = { name: string; at: Point }`, and `pxPerKm: number`. Both are exported from `src/geo/networkLayout.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/geo/networkLayout.test.ts`:

```ts
describe('district watermarks', () => {
  it('projects every district into the same space as the stations', () => {
    const { districts, geo } = networkLayout();
    expect(districts).toHaveLength(8);

    const xs = [...geo.values()].map((p) => p.x);
    const kl = districts.find((d) => d.name === 'Kuala Lumpur');
    // KL sits inside the network's horizontal span, not off in another
    // coordinate system — the failure this guards against.
    expect(kl!.at.x).toBeGreaterThan(Math.min(...xs) - 200);
    expect(kl!.at.x).toBeLessThan(Math.max(...xs) + 200);
  });
});

describe('map scale', () => {
  it('reports a positive number of user units per kilometre', () => {
    expect(networkLayout().pxPerKm).toBeGreaterThan(0);
  });

  it('scales linearly, so a scale bar can trust it', () => {
    const { pxPerKm } = networkLayout();
    expect(pxPerKm * 10).toBeCloseTo(networkLayout().pxPerKm * 10, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/geo/networkLayout.test.ts`
Expected: FAIL — `districts` and `pxPerKm` do not exist on `NetworkLayout`.

- [ ] **Step 3: Add the district data**

Create `src/data/districts.json`. These are approximate district centroids used only as label anchors; nothing is measured from them:

```json
{
  "note": "Approximate district centroids. Label anchors only — nothing is measured from these.",
  "districts": [
    { "name": "Batu Caves", "geo": { "lat": 3.2379, "lng": 101.684 } },
    { "name": "Kuala Lumpur", "geo": { "lat": 3.139, "lng": 101.6869 } },
    { "name": "Petaling Jaya", "geo": { "lat": 3.1073, "lng": 101.6067 } },
    { "name": "Subang Jaya", "geo": { "lat": 3.0567, "lng": 101.5851 } },
    { "name": "Shah Alam", "geo": { "lat": 3.0733, "lng": 101.5185 } },
    { "name": "Klang", "geo": { "lat": 3.0449, "lng": 101.4455 } },
    { "name": "Kajang", "geo": { "lat": 2.9931, "lng": 101.7898 } },
    { "name": "Putrajaya", "geo": { "lat": 2.9264, "lng": 101.6964 } }
  ]
}
```

- [ ] **Step 4: Project them, and measure the scale**

In `src/geo/networkLayout.ts`, add the import and types:

```ts
import type { LatLng, Point } from '../data/types';
import districtData from '../data/districts.json';

/** A named place on the map, used only as a watermark anchor. */
export interface District {
  name: string;
  at: Point;
}
```

Extend `NetworkLayout`:

```ts
export interface NetworkLayout {
  /** Geographic positions, keyed by station id. */
  geo: Map<string, Point>;
  /** Octolinear diagram positions, keyed by station id. */
  schematic: Map<string, Point>;
  /** Land outlines, projected with the same transform as `geo`. */
  backdrop: BoundaryPath[];
  /** District names, projected with the same transform as `geo`. */
  districts: District[];
  /** Projected user units per kilometre, for the map's scale bar. */
  pxPerKm: number;
}
```

Above `networkLayout()`:

```ts
/**
 * Kilometres per degree of longitude shrinks with latitude. Measuring at the
 * middle of the network keeps a scale bar honest across the Klang Valley,
 * which spans too little latitude for the error to matter.
 */
const KL_LAT = 3.139;
const KL_LNG = 101.6869;
const KM_PER_DEGREE_LNG = 111.32 * Math.cos((KL_LAT * Math.PI) / 180);
```

Then inside `networkLayout()`, after `proj` is built and before `cached` is assigned:

```ts
  const origin: LatLng = { lat: KL_LAT, lng: KL_LNG };
  const oneKmEast: LatLng = { lat: KL_LAT, lng: KL_LNG + 1 / KM_PER_DEGREE_LNG };
  const a = proj.project(origin);
  const b = proj.project(oneKmEast);
```

And extend the cached object:

```ts
  cached = {
    geo: new Map(data.stations.map((s) => [s.id, proj.project(s.geo)])),
    schematic: buildSchematic(data.lines).points,
    backdrop: projectBoundaries(loadBoundaries(), proj),
    districts: districtData.districts.map((d) => ({
      name: d.name,
      at: proj.project(d.geo),
    })),
    pxPerKm: Math.hypot(b.x - a.x, b.y - a.y),
  };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/geo/networkLayout.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/districts.json src/geo/networkLayout.ts src/geo/networkLayout.test.ts
git commit -m "feat: project district anchors and map scale"
```

---

### Task 8: Drafting grid, and station nodes in line colour

**Files:**
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/render/map.css`
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `markScale` and `view`, both already computed inside `MapCanvas`.
- Produces: a `pointsOf(ids)` helper inside `MapCanvas` that later tasks reuse; `circle[data-station]` carries `--station-colour`; interchanges additionally render `circle[data-core]`.

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
describe('MapCanvas cartography', () => {
  it('lays a drafting grid beneath the network', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelector('pattern#drafting-grid')).not.toBeNull();
    expect(container.querySelector('rect[data-grid]')).not.toBeNull();
  });

  it('colours each station mark by its line', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const mark = container.querySelector('circle[data-station="imbi"]') as SVGCircleElement;
    // Imbi is on the Monorail alone, so the mark takes the Monorail's colour.
    expect(mark.style.getPropertyValue('--station-colour').toUpperCase()).toBe('#80CC28');
  });

  it('gives interchanges a distinct core', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    // KL Sentral serves several lines.
    expect(container.querySelector('circle[data-core="kl-sentral"]')).not.toBeNull();
    expect(container.querySelector('circle[data-core="imbi"]')).toBeNull();
  });
});
```

Note: the expected Monorail colour is the **current** `lines.json` value. Task 15 changes the palette and this assertion with it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx`
Expected: FAIL — no `pattern#drafting-grid`.

- [ ] **Step 3: Extract the shared points helper**

Three places in `MapCanvas` build the same `id[] -> "x,y x,y"` string, and later tasks add two more. In `src/render/MapCanvas.tsx`, add above the `return`:

```tsx
  // Every polyline in this canvas is the same transformation of a station
  // list; later marks (the glow, the travelled stretch) reuse it.
  const pointsOf = useCallback(
    (ids: readonly string[]) =>
      ids
        .map((id) => layout.get(id))
        .filter((p): p is Point => p !== undefined)
        .map((p) => `${p.x},${p.y}`)
        .join(' '),
    [layout],
  );
```

Add `useCallback` to the React import. Then replace the line and celebrate polyline bodies to call `pointsOf(line.stations)`.

- [ ] **Step 4: Add the grid to `<defs>`**

Immediately inside the `<svg>`, before `{backdrop && ...}`:

```tsx
      <defs>
        {/* Anchored in user space, so the grid pans with the map for free; the
            tile scales with the view, so its density on screen never changes. */}
        <pattern
          id="drafting-grid"
          width={28 * markScale}
          height={28 * markScale}
          patternUnits="userSpaceOnUse"
        >
          <circle
            className="grid-dot"
            cx={2 * markScale}
            cy={2 * markScale}
            r={0.95 * markScale}
          />
        </pattern>
      </defs>

      <rect
        data-grid
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="url(#drafting-grid)"
      />
```

- [ ] **Step 5: Colour the station marks**

Replace the station `map` body in `src/render/MapCanvas.tsx` so each mark carries its line's colour and interchanges gain a core:

```tsx
      {[...net.stations.values()].map((station) => {
        const p = layout.get(station.id);
        if (!p) return null;
        const codes = linesOf(station);
        const isInterchange = codes.length > 1;
        const isActive = station.id === activeStation;
        const isNext = highlight?.has(station.id) ?? false;
        // A multi-line station takes its first line's colour for the ring; its
        // core is what actually marks it as an interchange.
        const first = codes[0];
        const colour = first ? net.lines.get(first)?.colour : undefined;
        const r = (isActive ? 8 : isInterchange ? 6 : 4) * markScale;
        const dim = emphasis && !codes.includes(emphasis) ? 'true' : undefined;

        return (
          <g key={station.id === activeStation ? `${station.id}-active` : station.id}>
            <circle
              data-station={station.id}
              data-active={isActive ? 'true' : undefined}
              data-next={isNext ? 'true' : undefined}
              data-visited={visited.has(station.id) ? 'true' : undefined}
              data-interchange={isInterchange ? 'true' : undefined}
              data-dim={dim}
              style={{ '--station-colour': colour } as React.CSSProperties}
              cx={p.x}
              cy={p.y}
              r={r}
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {station.name} — {codes.join(', ')}
              </title>
            </circle>
            {isInterchange && (
              <circle
                data-core={station.id}
                data-dim={dim}
                cx={p.x}
                cy={p.y}
                r={r * 0.45}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
```

- [ ] **Step 6: Style the new marks**

Append to `src/render/map.css`:

```css
.map-canvas .grid-dot { fill: var(--grid-dot); stroke: none; }
/* The core is what says "interchange"; it holds ink in both atmospheres
   rather than taking a line's colour, because it belongs to no one line. */
.map-canvas circle[data-core] { fill: var(--ink); stroke: none; }
.map-canvas circle[data-core][data-dim='true'] { opacity: 0.22; }
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — including the existing "draws a mark for every station" count, since cores use `data-core` and are not counted.

- [ ] **Step 8: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css
git commit -m "feat: draft grid and line-coloured station nodes"
```

---

### Task 9: Rail glow and the travelled stretch

**Files:**
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/render/map.css`
- Modify: `src/ui/LineRunScreen.tsx:139-168`
- Modify: `src/ui/AdventureScreen.tsx`
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `pointsOf` (Task 8).
- Produces: two new optional `MapCanvasProps` — `travelled?: readonly string[]` (station ids already typed, in order) and nothing else. Both play screens pass it.

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
describe('MapCanvas track states', () => {
  it('lays a glow beneath the emphasised line only', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} emphasis="KJ" />,
    );
    expect(container.querySelectorAll('polyline.track-glow')).toHaveLength(1);
  });

  it('draws no glow when no line is emphasised', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('polyline.track-glow')).toHaveLength(0);
  });

  it('inks the stretch already travelled', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="kl-sentral"
        travelled={['gombak', 'taman-melati', 'wangsa-maju']}
      />,
    );
    const done = container.querySelector('polyline.track-done');
    expect(done).not.toBeNull();
    expect(done!.getAttribute('points')!.split(' ')).toHaveLength(3);
  });

  it('draws nothing for a stretch too short to be a line', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="gombak"
        travelled={['gombak']}
      />,
    );
    expect(container.querySelector('polyline.track-done')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx`
Expected: FAIL — `travelled` is not a prop, and `.track-glow` does not exist.

- [ ] **Step 3: Accept the new prop**

In `MapCanvasProps`, after `celebrate`:

```tsx
  /** Stations already typed this run, in order. Inks the stretch behind you. */
  travelled?: readonly string[];
```

Destructure `travelled` in the parameter list.

- [ ] **Step 4: Add the filter and the two polylines**

Inside `<defs>`, after the grid pattern:

```tsx
        {/* The glow is a blurred copy of the rail beneath the crisp one. Only
            the emphasised line gets it: the filter repaints on every pan and
            zoom, and seven of them is not affordable. */}
        <filter id="track-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
```

Immediately before the line `map` that draws the rails:

```tsx
      {emphasis &&
        (() => {
          const line = net.lines.get(emphasis);
          if (!line) return null;
          return (
            <polyline
              className="track-glow"
              points={pointsOf(line.stations)}
              fill="none"
              stroke={line.colour}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })()}
```

And immediately after that same `map`, so the travelled stretch sits above the rail but below the stations:

```tsx
      {travelled && travelled.length > 1 && (
        <polyline
          className="track-done"
          points={pointsOf(travelled)}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
```

- [ ] **Step 5: Style both**

Append to `src/render/map.css`:

```css
/* Paper rejects blur — the design pack is explicit that a blurred halo on
   linen reads as a smudge — so it gets an unblurred bed instead, and only
   midnight lights the rail. One element, switched by the theme. */
.map-canvas .track-glow {
  filter: none;
  opacity: 0.16;
  stroke-width: 12;
}
[data-theme='midnight'] .map-canvas .track-glow {
  filter: url(#track-glow);
  opacity: 0.4;
  stroke-width: 14;
}

/* Typing inks the rail behind you. */
.map-canvas .track-done {
  stroke: var(--track-done);
  stroke-width: 2.5;
}
```

- [ ] **Step 6: Feed the travelled stretch from `LineRunScreen`**

`run.stationTimes` holds one entry per arrival, so the route prefix of that length is the stretch already typed. In `src/ui/LineRunScreen.tsx`, inside the `<MapCanvas ... />` in the `map` prop, add:

```tsx
          travelled={route.slice(0, run.stationTimes.length + 1)}
```

- [ ] **Step 7: Feed it from `AdventureScreen`**

Adventure has no fixed route, so its travelled stretch is the order it actually visited. `startRun` initialises `visited: []` — the origin is deliberately not in it — so the origin has to be prepended, and `AdventureScreen` already holds it as its `startAt` prop. In `src/ui/AdventureScreen.tsx`, on the `<MapCanvas ... />`:

```tsx
          travelled={[startAt, ...run.visited]}
```

- [ ] **Step 8: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css src/ui/LineRunScreen.tsx src/ui/AdventureScreen.tsx
git commit -m "feat: light the active rail and ink the stretch travelled"
```

- [ ] **Step 10: Check the glow's frame cost**

Run `npm run dev`, start a line run in midnight, and pan and zoom while typing. If the map visibly stutters, apply the spec's fallback — delete the `filter` line from the `[data-theme='midnight']` rule and raise `opacity` to `0.5`, keeping the wide stroke. A wide low-opacity stroke still reads as a glow on a dark ground. Note in the commit message if you take the fallback.

---

### Task 10: The active-station beacon

**Files:**
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/render/map.css`
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `emphasis`, `activeStation`, `markScale`, all already in `MapCanvas`.
- Produces: `g[data-beacon]`, rendered only when there is both an active station and an emphasised line.

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
describe('MapCanvas beacon', () => {
  it('marks the active station with a beacon', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="kl-sentral"
        emphasis="KJ"
      />,
    );
    expect(container.querySelector('g[data-beacon]')).not.toBeNull();
  });

  it('shows no beacon when nothing is active', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} emphasis="KJ" />,
    );
    expect(container.querySelector('g[data-beacon]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx`
Expected: FAIL — no `g[data-beacon]`.

- [ ] **Step 3: Render the beacon**

In `src/render/MapCanvas.tsx`, after the station `map` and before the `celebrate` block:

```tsx
      {activeStation &&
        emphasis &&
        (() => {
          const p = layout.get(activeStation);
          const colour = net.lines.get(emphasis)?.colour;
          if (!p || !colour) return null;
          return (
            <g data-beacon aria-hidden="true">
              <defs>
                <radialGradient id="beacon-bloom">
                  <stop offset="0%" stopColor={colour} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={colour} stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle
                className="beacon-bloom"
                cx={p.x}
                cy={p.y}
                r={30 * markScale}
                fill="url(#beacon-bloom)"
              />
              <circle
                className="beacon-ring"
                cx={p.x}
                cy={p.y}
                r={22 * markScale}
                fill="none"
                stroke={colour}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })()}
```

- [ ] **Step 4: Animate it in CSS, not JavaScript**

Append to `src/render/map.css`. Written as a CSS animation so the global reduced-motion block in `index.css` stops it without any extra rule here:

```css
@keyframes beacon-pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50%      { transform: scale(1.35); opacity: 0.2; }
}
.map-canvas .beacon-ring,
.map-canvas .beacon-bloom {
  transform-box: fill-box;
  transform-origin: center;
  animation: beacon-pulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.map-canvas .beacon-ring { stroke-width: 2; }
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css
git commit -m "feat: beacon the station being typed"
```

---

### Task 11: The train carriage

**Files:**
- Modify: `src/render/TrainMarker.tsx`
- Modify: `src/render/map.css`
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/AdventureScreen.tsx`
- Test: `src/render/TrainMarker.test.tsx`

**Interfaces:**
- Consumes: `tweenPoint` (unchanged, still exported).
- Produces: `TrainMarkerProps` gains `colour?: string | null`. The marker is now `g[data-train]`, not `circle[data-train]`. `MapCanvasProps` gains `trainColour?: string | null`, forwarded to the marker.

- [ ] **Step 1: Update the failing tests**

The existing tests query `circle[data-train]`, which this task deliberately removes. Replace the `TrainMarker` describe block in `src/render/TrainMarker.test.tsx` with:

```tsx
describe('TrainMarker', () => {
  it('sits at the destination when there is no previous station', () => {
    const { container } = render(<svg><TrainMarker from={null} to={b} /></svg>);
    const g = container.querySelector('[data-train]')!;
    expect(g.getAttribute('transform')).toContain('translate(100 40)');
  });

  it('renders nothing when the destination is unknown', () => {
    const { container } = render(<svg><TrainMarker from={a} to={null} /></svg>);
    expect(container.querySelector('[data-train]')).toBeNull();
  });

  it('points along the direction of travel', () => {
    // Travelling due east, so the carriage — drawn nose-up — turns 90deg.
    const { container } = render(
      <svg><TrainMarker from={{ x: 0, y: 0 }} to={{ x: 100, y: 0 }} /></svg>,
    );
    expect(container.querySelector('[data-train]')!.getAttribute('transform'))
      .toContain('rotate(90)');
  });

  it('wears the colour of its line on its nose', () => {
    const { container } = render(
      <svg><TrainMarker from={a} to={b} colour="#ED254E" /></svg>,
    );
    expect(container.querySelector('.train-nose')!.getAttribute('fill')).toBe('#ED254E');
  });
});
```

`tweenPoint`'s describe block is unchanged — leave it alone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/TrainMarker.test.tsx`
Expected: FAIL — the marker is still a circle with no transform.

- [ ] **Step 3: Rewrite the marker**

Replace the component in `src/render/TrainMarker.tsx`, keeping `tweenPoint` and the file's existing doc comment intact:

```tsx
export interface TrainMarkerProps {
  /** Station departed from. Null at the very start of a run. */
  from: Point | null;
  /** Station being typed towards. */
  to: Point | null;
  /** How far through the current station's name, 0..1. */
  progress?: number;
  /** Increments on every mistyped key; a change replays the shake. */
  errorTick?: number;
  /** Zoom compensation, so the marker keeps a constant on-screen size. */
  scale?: number;
  /** The current line's colour, worn on the nose cap. */
  colour?: string | null;
}

export function TrainMarker({
  from,
  to,
  progress = 1,
  errorTick = 0,
  scale = 1,
  colour = null,
}: TrainMarkerProps) {
  if (!to) return null;
  const pos = from ? tweenPoint(from, to, progress) : to;
  // The carriage is drawn nose-up, so a heading of due east is a quarter turn.
  const angle = from
    ? (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90
    : 0;

  return (
    <g
      // Remounting on each mistake is what replays the shake animation.
      key={`train-${errorTick}`}
      data-train
      data-shake={errorTick > 0 ? 'true' : undefined}
      className="train"
      transform={`translate(${pos.x} ${pos.y}) rotate(${angle}) scale(${scale})`}
    >
      <polygon className="train-beam" points="-5,-14 5,-14 22,-70 -22,-70" />
      <rect
        className="train-body"
        x={-6}
        y={-14}
        width={12}
        height={28}
        rx={3}
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="train-nose"
        d="M -6,-9 L -6,-11 C -6,-13 -3.5,-14 0,-14 C 3.5,-14 6,-13 6,-11 L 6,-9 Z"
        fill={colour ?? undefined}
      />
      <circle className="train-window" cx={-3} cy={-10.5} r={1.1} />
      <circle className="train-window" cx={3} cy={-10.5} r={1.1} />
    </g>
  );
}
```

- [ ] **Step 4: Style the carriage**

In `src/render/map.css`, replace the two `.train` rules (the `fill`/`stroke` rule and the `transition` rule) with:

```css
.map-canvas .train-body {
  fill: var(--panel);
  stroke: var(--ink);
  stroke-width: 1;
}
.map-canvas .train-window { fill: var(--ink); }
.map-canvas .train-nose { stroke: none; }
/* Only midnight throws a headlight; on paper it would be a smudge. */
.map-canvas .train-beam { fill: none; }
[data-theme='midnight'] .map-canvas .train-beam {
  fill: var(--ink);
  opacity: 0.07;
}
/* Between keystrokes the train glides; CSS so reduced-motion zeroes it. */
.map-canvas .train { transition: transform 140ms linear; }
```

The old rule transitioned `cx`/`cy`, which the group no longer has — `transform` is what moves now.

- [ ] **Step 5: Forward the colour through `MapCanvas`**

Add to `MapCanvasProps`:

```tsx
  /** The current line's colour, worn by the train. */
  trainColour?: string | null;
```

Destructure `trainColour = null`, and pass it in the existing `<TrainMarker ... />`:

```tsx
      <TrainMarker
        from={previousStation ? layout.get(previousStation) ?? null : null}
        to={activeStation ? layout.get(activeStation) ?? null : null}
        scale={markScale}
        progress={trainProgress}
        errorTick={trainErrorTick}
        colour={trainColour}
      />
```

- [ ] **Step 6: Pass it from both play screens**

In `src/ui/LineRunScreen.tsx`, on the `<MapCanvas ... />`:

```tsx
          trainColour={net.lines.get(line)?.colour ?? null}
```

In `src/ui/AdventureScreen.tsx`, the current line changes as the run does, so read it from the run:

```tsx
          trainColour={run.line ? net.lines.get(run.line)?.colour ?? null : null}
```

- [ ] **Step 7: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/render/TrainMarker.tsx src/render/TrainMarker.test.tsx src/render/map.css src/render/MapCanvas.tsx src/ui/LineRunScreen.tsx src/ui/AdventureScreen.tsx
git commit -m "feat: replace the train dot with a carriage"
```

---

### Task 12: Station labels and district watermarks

**Files:**
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/render/map.css`
- Modify: `src/ui/HomeMap.tsx`
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/AdventureScreen.tsx`
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `District` from `src/geo/networkLayout.ts` (Task 7).
- Produces: `MapCanvasProps` gains `districts?: readonly District[]`. Labels render as `text[data-label]`, watermarks as `text[data-watermark]`.

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
describe('MapCanvas labels', () => {
  it('labels the significant stations, not all 154', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const labels = container.querySelectorAll('text[data-label]');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(data.stations.length / 2);
  });

  it('always labels the station being typed', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation="imbi" />,
    );
    expect(container.querySelector('text[data-label="imbi"]')).not.toBeNull();
  });

  it('watermarks the districts it is given', () => {
    const districts = [{ name: 'Kuala Lumpur', at: { x: 500, y: 400 } }];
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        districts={districts}
      />,
    );
    expect(container.querySelector('text[data-watermark]')?.textContent).toBe('Kuala Lumpur');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx`
Expected: FAIL — no `text[data-label]`.

- [ ] **Step 3: Accept districts and decide the label tier**

Add to `MapCanvasProps`:

```tsx
  /** District names to watermark beneath the network. */
  districts?: readonly District[];
```

Import the type (`import { type District } from '../geo/networkLayout';`), destructure `districts`, and add above the `return`:

```tsx
  // Labelling all 154 at once is noise, so labels come in tiers: the stations
  // that orient you always, everything else only once you have zoomed in far
  // enough for it to fit.
  const alwaysLabelled = useMemo(() => {
    const ids = new Set<string>();
    for (const line of net.lines.values()) {
      const first = line.stations[0];
      const last = line.stations[line.stations.length - 1];
      if (first) ids.add(first);
      if (last) ids.add(last);
    }
    for (const station of net.stations.values()) {
      if (linesOf(station).length >= 3) ids.add(station.id);
    }
    return ids;
  }, [net]);

  const showEveryLabel = view.w < 450;
```

- [ ] **Step 4: Render the labels**

Inside the station `map` from Task 8, within the `<g>` and after the interchange core:

```tsx
            {(showEveryLabel || alwaysLabelled.has(station.id) || isActive) && (() => {
              // Flip to the left near the right edge of the *live* viewport, so
              // a label never runs off the screen the player has panned to.
              const flip = p.x > view.x + view.w * 0.75;
              return (
                <text
                  data-label={station.id}
                  data-dim={dim}
                  className="station-label"
                  x={p.x + (flip ? -9 : 9) * markScale}
                  y={p.y - 7 * markScale}
                  textAnchor={flip ? 'end' : 'start'}
                  fontSize={11 * markScale}
                  aria-hidden="true"
                >
                  {station.name}
                </text>
              );
            })()}
```

The label is `aria-hidden` because each station's `<title>` already names it for assistive technology; two names per station would be noise.

- [ ] **Step 5: Render the watermarks**

Immediately after the `{backdrop && <MapBackdrop .../>}` line, so they sit under the rails:

```tsx
      {!showEveryLabel &&
        districts?.map((d) => (
          <text
            key={d.name}
            data-watermark
            className="district-watermark"
            x={d.at.x}
            y={d.at.y}
            fontSize={13 * markScale}
            textAnchor="middle"
            aria-hidden="true"
          >
            {d.name}
          </text>
        ))}
```

- [ ] **Step 6: Style both**

Append to `src/render/map.css`:

```css
.map-canvas .station-label {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}
.map-canvas .station-label[data-dim='true'] { opacity: 0.22; }

/* Regional context, useless at street zoom and faded out there. */
.map-canvas .district-watermark {
  fill: var(--ink-faint);
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.35em;
  opacity: 0.45;
  text-transform: uppercase;
  pointer-events: none;
}
```

- [ ] **Step 7: Pass districts from all three screens**

`networkLayout()` already returns them. In `src/ui/HomeMap.tsx`, change the destructure to `const { geo: layout, backdrop, districts } = networkLayout();` and add `districts={districts}` to the `<MapCanvas ... />`. Do the same in `src/ui/LineRunScreen.tsx` and `src/ui/AdventureScreen.tsx`.

- [ ] **Step 8: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css src/ui/HomeMap.tsx src/ui/LineRunScreen.tsx src/ui/AdventureScreen.tsx
git commit -m "feat: label the map and watermark its districts"
```

---

### Task 13: Compass and scale bar

**Files:**
- Modify: `src/render/MapCanvas.tsx`
- Modify: `src/render/map.css`
- Modify: `src/ui/HomeMap.tsx`
- Test: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `pxPerKm` from `networkLayout()` (Task 7).
- Produces: `MapCanvasProps` gains `pxPerKm?: number`. Renders `g[data-compass]` when given.

- [ ] **Step 1: Write the failing test**

Append to `src/render/MapCanvas.test.tsx`:

```tsx
describe('MapCanvas cartographic furniture', () => {
  it('draws a compass and a scale bar when given a scale', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        pxPerKm={12}
      />,
    );
    expect(container.querySelector('g[data-compass]')).not.toBeNull();
    expect(container.querySelector('[data-scale-bar]')?.textContent).toMatch(/\d+ km/);
  });

  it('omits them when there is no scale to draw', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelector('g[data-compass]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/MapCanvas.test.tsx`
Expected: FAIL — `pxPerKm` is not a prop.

- [ ] **Step 3: Render the furniture**

Add to `MapCanvasProps`:

```tsx
  /** Projected units per kilometre. Draws the scale bar when supplied. */
  pxPerKm?: number;
```

Destructure it, then add before the closing `</svg>`:

```tsx
      {pxPerKm !== undefined &&
        (() => {
          // Positioned from the live view rather than the layout, so the
          // furniture stays pinned to the corner while the map pans beneath it.
          const margin = 24 * markScale;
          const x = view.x + margin;
          const y = view.y + view.h - margin;
          // The longest round distance that still fits comfortably on screen.
          const km = [50, 20, 10, 5, 2, 1].find((k) => k * pxPerKm < view.w * 0.18) ?? 1;
          const len = km * pxPerKm;
          const tick = 4 * markScale;

          return (
            <g data-compass className="map-furniture" aria-hidden="true">
              <path
                d={`M ${x} ${y - 34 * markScale} l ${3 * markScale} ${9 * markScale}
                    l ${-3 * markScale} ${-3 * markScale} l ${-3 * markScale} ${3 * markScale} Z`}
              />
              <text x={x} y={y - 38 * markScale} fontSize={9 * markScale} textAnchor="middle">
                N
              </text>
              <path
                d={`M ${x} ${y - tick} L ${x} ${y} L ${x + len} ${y} L ${x + len} ${y - tick}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              <text
                data-scale-bar
                x={x + len / 2}
                y={y - 6 * markScale}
                fontSize={9 * markScale}
                textAnchor="middle"
              >
                {km} km
              </text>
            </g>
          );
        })()}
```

- [ ] **Step 4: Style it**

Append to `src/render/map.css`:

```css
.map-canvas .map-furniture {
  fill: var(--ink-muted);
  stroke: var(--ink-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  pointer-events: none;
}
.map-canvas .map-furniture text { stroke: none; }
```

- [ ] **Step 5: Supply the scale on the home map only**

The furniture belongs to the map you read, not the map you play over. In `src/ui/HomeMap.tsx`, change the destructure to include `pxPerKm` and pass `pxPerKm={pxPerKm}` to `<MapCanvas ... />`. Leave both play screens without it.

- [ ] **Step 6: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/MapCanvas.tsx src/render/MapCanvas.test.tsx src/render/map.css src/ui/HomeMap.tsx
git commit -m "feat: orient the home map with a compass and scale"
```

**Phase 2 is complete here.** Manually confirm with `npm run dev`, in both atmospheres: the grid, coloured nodes, labels, watermarks, compass, carriage, beacon, rail glow and inked stretch all render, and a run still plays.

---

## Phase 3 — Screen chrome

### Task 14: Badge contrast, and the badge itself

**Files:**
- Create: `src/render/contrast.ts`
- Create: `src/render/contrast.test.ts`
- Create: `src/ui/LineBadge.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `--badge-ink` and `--badge-paper` (Task 1).
- Produces: `luminance(hex: string): number`, `contrastText(hex: string): string` returning a `var(--badge-*)` string, and `<LineBadge code={LineCode} colour={string} />` rendering `span.line-badge`.

- [ ] **Step 1: Write the failing test**

Create `src/render/contrast.test.ts`. The expectations below were computed from WCAG relative luminance against all seven current line colours:

```ts
import { describe, it, expect } from 'vitest';
import { luminance, contrastText } from './contrast';

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('accepts shorthand hex', () => {
    expect(luminance('#fff')).toBeCloseTo(1, 5);
  });
});

describe('contrastText', () => {
  it('puts white on the dark rail colours', () => {
    expect(contrastText('#ED254E')).toBe('var(--badge-paper)'); // KJ
    expect(contrastText('#98002E')).toBe('var(--badge-paper)'); // SP
  });

  it('puts ink on the light rail colours', () => {
    expect(contrastText('#F78F1E')).toBe('var(--badge-ink)'); // AG
    expect(contrastText('#0099FF')).toBe('var(--badge-ink)'); // SA
    expect(contrastText('#84BD00')).toBe('var(--badge-ink)'); // MR
    expect(contrastText('#00A859')).toBe('var(--badge-ink)'); // KG
    expect(contrastText('#FFC72C')).toBe('var(--badge-ink)'); // PY
  });

  it('never picks the worse of the two', () => {
    // A mid grey is the hardest case; whichever it picks must beat the other.
    const mid = '#808080';
    expect(['var(--badge-ink)', 'var(--badge-paper)']).toContain(contrastText(mid));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/contrast.test.ts`
Expected: FAIL — cannot resolve `./contrast`.

- [ ] **Step 3: Write the helper**

Create `src/render/contrast.ts`:

```ts
/**
 * Relative luminance per WCAG 2.1, from an sRGB hex string.
 *
 * Line badges fill with the line's own colour, and the seven Rapid KL colours
 * span nearly the whole luminance range — the Putrajaya yellow needs dark text
 * where the Sri Petaling maroon needs white. Deriving the foreground from the
 * fill means a retuned palette can never silently drop a badge below
 * legibility, which storing it as a data field would allow.
 */
export function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;

  const channel = (at: number): number => {
    const srgb = parseInt(full.slice(at, at + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two relative luminances. */
function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INK = luminance('#14181f');
const PAPER = luminance('#ffffff');

/**
 * The readable foreground for a badge filled with `hex`, as a token reference.
 *
 * These two tokens deliberately do NOT vary by theme: a yellow badge needs
 * dark text on paper and on midnight alike, so resolving them through `--ink`
 * would make half the badges illegible in one atmosphere.
 */
export function contrastText(hex: string): string {
  const fill = luminance(hex);
  return ratio(fill, PAPER) >= ratio(fill, INK) ? 'var(--badge-paper)' : 'var(--badge-ink)';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/render/contrast.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the badge**

Create `src/ui/LineBadge.tsx`:

```tsx
import type { LineCode } from '../data/types';
import { contrastText } from '../render/contrast';

/**
 * A line's code, on a tablet in the line's colour.
 *
 * The code stays real text, never a bare coloured square: colour is never the
 * only signal in this app.
 */
export function LineBadge({ code, colour }: { code: LineCode; colour: string }) {
  return (
    <span className="line-badge" style={{ background: colour, color: contrastText(colour) }}>
      {code}
    </span>
  );
}
```

- [ ] **Step 6: Style it**

Append to `src/index.css`:

```css
.line-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 0.35em;
  border-radius: 4px;
  font: 700 var(--t-xs)/1 var(--font-mono);
  letter-spacing: 0.06em;
}
```

- [ ] **Step 7: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/render/contrast.ts src/render/contrast.test.ts src/ui/LineBadge.tsx src/index.css
git commit -m "feat: add line badges with derived foreground contrast"
```

---

### Task 15: Adopt the calibrated rail palette

**Files:**
- Modify: `src/data/lines.json`
- Modify: `src/render/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the seven `colour` values every other task reads from data.

- [ ] **Step 1: Change the seven colours**

In `src/data/lines.json`, update each line's `colour` field:

| Line | From | To |
|---|---|---|
| KJ | `#ED114C` | `#ED254E` |
| AG | `#F48412` | `#F78F1E` |
| SP | `#881211` | `#98002E` |
| SA | `#1EA6E6` | `#0099FF` |
| MR | `#80CC28` | `#84BD00` |
| KG | `#0A8137` | `#00A859` |
| PY | `#FCD006` | `#FFC72C` |

- [ ] **Step 2: Update the one test that names a colour**

Task 8 asserted the Monorail's colour on a station mark. In `src/render/MapCanvas.test.tsx`, change that expectation from `'#80CC28'` to `'#84BD00'`.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS. If another assertion names an old colour, update it to the new value.

- [ ] **Step 4: Check the maroon against midnight**

Run `npm run dev`, switch to midnight, and look at the Sri Petaling line. `#98002E` is the darkest of the seven and the one at risk of vanishing into `#0b0f17`. If it is not clearly readable, lighten the shared value toward `#B01238` — per the spec, the palette does not fork per theme.

- [ ] **Step 5: Commit**

```bash
git add src/data/lines.json src/render/MapCanvas.test.tsx
git commit -m "feat: adopt the calibrated Rapid KL rail palette"
```

---

### Task 16: The play panel wears its line

**Files:**
- Modify: `src/ui/PlayLayout.tsx`
- Modify: `src/ui/LineRunScreen.tsx`
- Modify: `src/ui/AdventureScreen.tsx`
- Modify: `src/index.css`
- Test: `src/ui/PlayLayout.test.tsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `PlayLayout` gains `lineColour?: string | null`, which it sets as `--line-colour` on `.play-panel`. The prompt's current-character underline (styled in Task 2) resolves from it.

- [ ] **Step 1: Write the failing test**

Create `src/ui/PlayLayout.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlayLayout } from './PlayLayout';

describe('PlayLayout', () => {
  it('dresses the panel in the colour of the current line', () => {
    const { container } = render(
      <PlayLayout map={<div />} panel={<div />} lineColour="#ED254E" />,
    );
    const panel = container.querySelector('.play-panel') as HTMLElement;
    expect(panel.style.getPropertyValue('--line-colour')).toBe('#ED254E');
  });

  it('renders without a line, before one is chosen', () => {
    const { container } = render(<PlayLayout map={<div />} panel={<div />} />);
    expect(container.querySelector('.play-panel')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/PlayLayout.test.tsx`
Expected: FAIL — `lineColour` is not a prop.

- [ ] **Step 3: Accept the colour**

Replace `src/ui/PlayLayout.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react';

/**
 * The shared shape of both play modes: map filling the viewport, with a
 * floating panel over the lower third. The map stays visible so the journey
 * is felt; the text being read never moves.
 *
 * The panel carries the current line's colour as `--line-colour`, which the
 * typing prompt's cursor and the panel's own edge both resolve from — so the
 * chrome recolours itself as the run changes line.
 */
export function PlayLayout({
  map,
  panel,
  lineColour = null,
}: {
  map: ReactNode;
  panel: ReactNode;
  lineColour?: string | null;
}) {
  return (
    <div className="play">
      {map}
      <div
        className="play-panel"
        style={lineColour ? ({ '--line-colour': lineColour } as CSSProperties) : undefined}
      >
        {panel}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pass it from both play screens**

In `src/ui/LineRunScreen.tsx`, on the `<PlayLayout ... >` opening tag:

```tsx
    <PlayLayout
      lineColour={net.lines.get(line)?.colour ?? null}
```

In `src/ui/AdventureScreen.tsx`:

```tsx
    <PlayLayout
      lineColour={run.line ? net.lines.get(run.line)?.colour ?? null : null}
```

- [ ] **Step 5: Give the panel a line-coloured edge**

Append to `src/index.css`:

```css
/* The in-game mockup rings the typing card in the line's colour. On paper
   that is the border alone; midnight adds the soft bloom around it. */
.play-panel { border-color: var(--line-colour, var(--panel-edge)); }
[data-theme='midnight'] .play-panel {
  box-shadow: var(--panel-shadow), 0 0 24px -6px var(--line-colour, transparent);
}
```

- [ ] **Step 6: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/PlayLayout.tsx src/ui/PlayLayout.test.tsx src/ui/LineRunScreen.tsx src/ui/AdventureScreen.tsx src/index.css
git commit -m "feat: dress the play panel in the current line"
```

---

### Task 17: Telemetry typography

**Files:**
- Modify: `src/index.css`
- Modify: `src/render/HUD.tsx`
- Test: `src/render/HUD.test.tsx` (create)

**Interfaces:**
- Consumes: `--font-mono`, `--t-xs`.
- Produces: HUD figures wrapped in `span.hud-figure`, labels in `span.hud-label`.

- [ ] **Step 1: Write the failing test**

Create `src/render/HUD.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HUD } from './HUD';

import type { Metrics } from '../engine/metrics';

const metrics: Metrics = { wpm: 62, accuracy: 0.98, score: 59.5 };

describe('HUD', () => {
  it('labels every figure it shows', () => {
    const { container } = render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    expect(container.querySelectorAll('.hud-label').length).toBe(3);
    expect(container.querySelectorAll('.hud-figure').length).toBe(3);
  });

  it('still names the line and destination', () => {
    render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    expect(screen.getByText(/Kelana Jaya Line/)).toBeTruthy();
    expect(screen.getByText(/KLCC/)).toBeTruthy();
  });
});
```

`Metrics` is exactly `{ wpm, accuracy, score }` — verified in `src/engine/metrics.ts:1-8` — so no cast is needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/HUD.test.tsx`
Expected: FAIL — no `.hud-label` elements.

- [ ] **Step 3: Split labels from figures**

Replace the returned JSX in `src/render/HUD.tsx`. The rolling-number logic above it is untouched:

```tsx
  return (
    <div className="hud">
      <span className="hud-line">{lineName ?? 'Choose a direction'}</span>
      {toward && <span className="hud-toward">toward {toward}</span>}
      <span>
        <span className="hud-label">WPM</span>{' '}
        <span className="hud-figure">{Math.round(wpm)}</span>
      </span>
      <span>
        <span className="hud-label">ACC</span>{' '}
        <span className="hud-figure">{Math.round(accuracy)}%</span>
      </span>
      <span>
        <span className="hud-label">Stations</span>{' '}
        <span className="hud-figure">{Math.round(stations)}</span>
      </span>
    </div>
  );
```

- [ ] **Step 4: Style the telemetry surfaces**

Replace the `.hud` and `.line-strip` colour rules in `src/index.css`:

```css
.hud {
  display: flex; gap: var(--s3); align-items: baseline;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.hud-figure { color: var(--ink); font-weight: 600; }
.hud-line { color: var(--line-colour, var(--ink)); font-weight: 700; }

.line-strip {
  display: flex; gap: var(--s2); list-style: none; padding: 0; margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
  white-space: nowrap;
  /* The whole line is rendered and scrolled, rather than re-sliced around the
     current station — a stable list slides, a re-sliced one jumps. */
  overflow-x: auto; scroll-behavior: smooth; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}
.line-strip [data-current='true'] { color: var(--ink); font-weight: 700; }
```

The mask gradient's `#000` values are opacity stops, not colours, and stay as they are.

- [ ] **Step 5: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/render/HUD.tsx src/render/HUD.test.tsx
git commit -m "feat: set telemetry in signage mono"
```

---

### Task 18: Badges across the screens

**Files:**
- Modify: `src/ui/HomeMap.tsx`
- Modify: `src/ui/DirectionChooser.tsx`
- Modify: `src/ui/JunctionPicker.tsx`
- Modify: `src/ui/LeaderboardScreen.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `LineBadge` (Task 14).
- Produces: nothing new.

- [ ] **Step 1: Swap the home map's line codes for badges**

In `src/ui/HomeMap.tsx`, import `LineBadge` and replace the code span inside the line button:

```tsx
                  <LineBadge code={line.code} colour={line.colour} />
```

Delete the now-unused `.line-picker .code` rule from `src/index.css`.

- [ ] **Step 2: Dress the wordmark**

Replace the `.home-map h1` and `.home-map .tagline` rules in `src/index.css`:

```css
.home-map h1 {
  margin: 0;
  font-size: var(--t-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.home-map .tagline { margin: 0; color: var(--ink-muted); font-size: var(--t-sm); }
.home-map .progress {
  margin: var(--s) 0 0;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Badge the direction chooser's heading**

`src/ui/DirectionChooser.tsx:38-40` currently colours the bare code with an inline `color`. Import `LineBadge` and replace the heading:

```tsx
      <h2>
        {def && <LineBadge code={line} colour={def.colour} />} {def?.name} — which way?
      </h2>
```

- [ ] **Step 4: Badge the junction picker's options**

`src/ui/JunctionPicker.tsx:47` renders `<strong>{dir.line}</strong>`. Import `LineBadge` and replace that one element, leaving the `<kbd>`, line name, `toward` and `next` labels exactly as they are:

```tsx
                {line && <LineBadge code={dir.line} colour={line.colour} />}
```

- [ ] **Step 5: Badge the leaderboard's line column**

`src/ui/LeaderboardScreen.tsx:55` prints the line's name in the overall tab. Import `LineBadge` and `lineAt` is already imported; put the badge beside the name rather than replacing it:

```tsx
                {tab === 'overall' && (
                  <td>
                    {(() => {
                      const def = lineAt(net, entry.lineCode);
                      return def ? (
                        <>
                          <LineBadge code={entry.lineCode} colour={def.colour} /> {def.name}
                        </>
                      ) : (
                        entry.lineCode
                      );
                    })()}
                  </td>
                )}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS. Any test asserting on a code as text still passes — `LineBadge` renders the code as its text content.

If a test fails on an exact-text query such as `getByText('KJ')`, that is a real signal the badge dropped the text; fix the component, not the test.

- [ ] **Step 7: Build and commit**

```bash
npm run build
git add src/ui/HomeMap.tsx src/ui/DirectionChooser.tsx src/ui/JunctionPicker.tsx src/ui/LeaderboardScreen.tsx src/index.css
git commit -m "feat: badge line codes across the screens"
```

---

### Task 19: Panels, tables and the last surfaces

**Files:**
- Modify: `src/index.css`
- Modify: `src/ui/leaderboard.css`
- Modify: `src/ui/summary.css`

**Interfaces:**
- Consumes: every token.
- Produces: nothing new.

- [ ] **Step 1: Give every floating surface the same treatment**

Replace the `.line-picker button`, `.junction button`, `.station-search input` and `.leaderboard-panel` surface rules so they share one language. In `src/index.css`:

```css
.line-picker button {
  display: flex; gap: var(--s2); align-items: center; justify-content: center;
  padding: var(--s) var(--s2); text-align: left;
  background: var(--panel); color: var(--ink);
  border: 1px solid var(--panel-edge); border-left: 4px solid var(--line-colour, var(--ink-faint));
  border-radius: 8px; cursor: pointer; font: inherit;
  box-shadow: var(--panel-shadow);
  backdrop-filter: var(--panel-blur);
}
.line-picker button:hover, .line-picker button:focus-visible { border-color: var(--focus-ring); }

.junction button {
  display: grid; grid-template-columns: auto 1fr auto; gap: var(--s2);
  align-items: baseline; width: 100%;
  padding: var(--s) var(--s2); text-align: left; font: inherit; cursor: pointer;
  background: var(--panel); color: var(--ink);
  border: 1px solid var(--panel-edge); border-left: 6px solid var(--line-colour, var(--ink-faint));
  border-radius: 8px;
}
.junction button:hover, .junction button:focus-visible { border-color: var(--focus-ring); }
.junction kbd {
  padding: 0 0.4em; border: 1px solid var(--panel-edge); border-radius: 4px;
  color: var(--ink-muted); font: var(--t-xs) var(--font-mono);
}

.station-search input {
  width: 100%; padding: var(--s2); font: inherit; color: var(--ink);
  background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 8px;
}
.station-search button:hover, .station-search button:focus-visible {
  background: var(--paper-sub);
}
.station-search .codes {
  color: var(--ink-muted); font-family: var(--font-mono); font-size: var(--t-xs);
}
```

- [ ] **Step 2: Set the leaderboard and summary figures in mono**

In `src/ui/leaderboard.css`:

```css
.leaderboard-screen table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-variant-numeric: tabular-nums;
}
.leaderboard-screen th {
  color: var(--ink-muted);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.leaderboard-panel {
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  backdrop-filter: var(--panel-blur);
}
.leaderboard-panel input {
  width: 100%; padding: var(--s); font: inherit; color: var(--ink);
  background: transparent; border: 1px solid var(--panel-edge); border-radius: 8px;
}
```

In `src/ui/summary.css`:

```css
.summary-stat-number {
  font-family: var(--font-mono);
  font-size: var(--t-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.summary-stat-label {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 3: Confirm the token discipline held**

Run: `grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' src --include=*.css | grep -v tokens.css | grep -v 'mask-image'`
Expected: no output.

- [ ] **Step 4: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/ui/leaderboard.css src/ui/summary.css
git commit -m "feat: unify panel, table and figure treatments"
```

---

### Task 20: Responsive and accessibility pass

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: every token.
- Produces: nothing new.

- [ ] **Step 1: Hold the map's share of the screen on small viewports**

The design requires the map to keep 60–70% of vertical space on mobile, with the panel as a bottom dock. Append to `src/index.css`:

```css
@media (max-width: 700px) {
  .play-panel {
    left: 0; right: 0; bottom: 0;
    width: 100%;
    max-height: 40vh;
    overflow-y: auto;
    transform: none;
    border-radius: 10px 10px 0 0;
    padding: var(--s2);
  }

  /* The picker was a fixed 22rem column overlaying a phone-width map. */
  .line-picker {
    top: auto; bottom: 0; left: 0; right: 0;
    width: 100%;
    max-height: 45vh;
    padding: var(--s2);
    background: var(--panel);
    border-top: 1px solid var(--panel-edge);
  }

  .home-map header { position: static; padding: var(--s2) var(--s2) 0; }
}
```

- [ ] **Step 2: Make focus visible in both atmospheres**

The old amber border was the only focus signal. Append:

```css
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Verify touch targets**

The design requires a 44px minimum touch target. Confirm `.control-cluster button` and `.line-picker button` both reach it at mobile width; if either falls short, raise its `min-height` to `44px` in the media query above.

- [ ] **Step 4: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Manual QA — the full matrix**

Run `npm run dev` and confirm, in **both** atmospheres:

- Home map, line run, adventure, summary and leaderboard all render with no unstyled or invisible text.
- Switching theme mid-run recolours everything and interrupts nothing.
- At 375px, 768px and 1440px wide, the map keeps its share and no panel overflows.
- With `prefers-reduced-motion: reduce` set in the OS, the beacon stops pulsing, the carriage does not glide, and the junction stagger does not pop.
- Tab through the home map: every control shows a visible focus ring.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "feat: hold the map's share on small screens, and ring focus"
```

---

## Self-review notes

**Spec coverage.** Every numbered spec section maps to at least one task: §1.1 tokens → Tasks 1–3; §1.2 typography → Tasks 1, 2, 17; §1.3 badges → Task 14; §1.4 persistence → Tasks 4–6; §2.1 grid → Task 8; §2.2 nodes → Task 8; §2.3 glow and travelled → Task 9; §2.4 beacon → Task 10; §2.5 carriage → Task 11; §2.6 labels → Task 12; §2.7 watermarks → Tasks 7, 12; §2.8 compass and scale → Tasks 7, 13; §3.1 shared components → Tasks 2, 16, 19; §3.2 per screen → Tasks 18, 19; §6 verification → every task, plus Task 20; the rail palette of §1.1 → Task 15.

**Ordering constraint.** Task 15 changes `lines.json` after Task 8 asserts a colour from it, and updates that assertion in the same commit. Executing Task 15 before Task 8 will leave a failing test; keep the order.

**Deliberate deviation from the spec.** `contrastText` returns `--badge-ink` / `--badge-paper` rather than the spec's `--ink` / `--paper`, for the reason given at the top of this plan. The spec has been amended to match.
