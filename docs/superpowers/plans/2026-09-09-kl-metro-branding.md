# KL-Metro Typing Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the active product to KL-Metro Typing and add a station-roundel favicon, install icons, manifest, and social-sharing thumbnail.

**Architecture:** Keep brand presentation declarative in `index.html`, `public/site.webmanifest`, and SVG source assets. Protect the contract with one focused Vitest file that reads active source/config files and validates raster dimensions; generate committed PNG derivatives with a small Sharp-based repository script.

**Tech Stack:** Vite 5, React 18, TypeScript, Vitest, Sharp, SVG, PNG, Web App Manifest, Open Graph, Twitter Cards.

---

## File Map

- Create `src/branding.test.ts`: verifies active naming, persistence keys, metadata, manifest declarations, asset existence, and PNG dimensions.
- Modify `src/ui/HomeMap.tsx`: changes the visible product heading.
- Modify `src/engine/progress.ts`: changes the profile/progress storage namespace.
- Modify `src/data/leaderboardStore.ts`: changes the leaderboard storage namespace.
- Modify `package.json` and `package-lock.json`: changes the package slug.
- Create `scripts/generate-brand-assets.mjs`: converts the SVG masters into committed PNG assets.
- Modify `README.md`, `CONTEXT.md`, and `docs/STATUS.md`: changes current documentation headings.
- Modify `index.html`: declares title, description, favicon/install assets, canonical URL, Open Graph metadata, and Twitter Card metadata.
- Create `public/favicon.svg`: station-roundel master used directly by modern browsers.
- Create `public/favicon-32x32.png`: small raster fallback.
- Create `public/apple-touch-icon.png`: 180-pixel Apple home-screen icon.
- Create `public/icon-192.png` and `public/icon-512.png`: installable-app icons.
- Create `public/site.webmanifest`: install metadata and icon declarations.
- Create `assets/brand/social-card.svg`: editable 1200-by-630 source for the sharing thumbnail.
- Create `public/og-image.png`: raster Open Graph/Twitter sharing thumbnail.

### Task 1: Rename the active product and persistence namespaces

**Files:**
- Create: `src/branding.test.ts`
- Modify: `src/ui/HomeMap.tsx`
- Modify: `src/engine/progress.ts`
- Modify: `src/data/leaderboardStore.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Write the failing active-brand contract tests**

Create `src/branding.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(new URL(path, `file://${root}`), 'utf8');

describe('KL-Metro Typing branding', () => {
  test('uses the new display name and package slug on active surfaces', () => {
    const activeFiles = [
      read('index.html'),
      read('src/ui/HomeMap.tsx'),
      read('README.md'),
      read('CONTEXT.md'),
      read('docs/STATUS.md'),
    ];
    const packageJson = JSON.parse(read('package.json')) as { name: string };
    const packageLock = JSON.parse(read('package-lock.json')) as {
      name: string;
      packages: Record<string, { name?: string }>;
    };

    expect(activeFiles.join('\n')).not.toContain('MyRapid Typing');
    expect(read('index.html')).toContain('<title>KL-Metro Typing</title>');
    expect(read('src/ui/HomeMap.tsx')).toContain('<h1>KL-Metro Typing</h1>');
    expect(packageJson.name).toBe('kl-metro-typing');
    expect(packageLock.name).toBe('kl-metro-typing');
    expect(packageLock.packages[''].name).toBe('kl-metro-typing');
  });

  test('uses clean KL-Metro persistence namespaces', () => {
    expect(read('src/engine/progress.ts')).toContain(
      "export const STORAGE_KEY = 'klmetro.v1';",
    );
    expect(read('src/data/leaderboardStore.ts')).toContain(
      "export const LEADERBOARD_STORAGE_KEY = 'klmetro.leaderboard.v1';",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: both tests fail because `MyRapid Typing`, `myrapid-typing`, and the
old `myrapid.*` storage keys are still present.

- [ ] **Step 3: Apply the active rename**

Apply these exact replacements:

```diff
-<h1>MyRapid Typing</h1>
+<h1>KL-Metro Typing</h1>
```

```diff
-export const STORAGE_KEY = 'myrapid.v1';
+export const STORAGE_KEY = 'klmetro.v1';
```

```diff
-export const LEADERBOARD_STORAGE_KEY = 'myrapid.leaderboard.v1';
+export const LEADERBOARD_STORAGE_KEY = 'klmetro.leaderboard.v1';
```

Change the first heading in each current document:

```diff
-# MyRapid Typing
+# KL-Metro Typing
```

```diff
-# MyRapid Typing — status and handoff
+# KL-Metro Typing — status and handoff
```

Update package metadata mechanically:

```bash
npm pkg set name=kl-metro-typing
npm install --package-lock-only --ignore-scripts
```

Change the existing `index.html` title:

```diff
-    <title>MyRapid Typing</title>
+    <title>KL-Metro Typing</title>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: 1 test file passes with 2 passing tests.

- [ ] **Step 5: Commit the active rename**

```bash
git add src/branding.test.ts src/ui/HomeMap.tsx src/engine/progress.ts src/data/leaderboardStore.ts package.json package-lock.json README.md CONTEXT.md docs/STATUS.md index.html
git commit -m "refactor: rename app to KL-Metro Typing"
```

### Task 2: Add browser and install icons

**Files:**
- Modify: `src/branding.test.ts`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/generate-brand-assets.mjs`
- Create: `public/favicon.svg`
- Create: `public/favicon-32x32.png`
- Create: `public/apple-touch-icon.png`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/site.webmanifest`

- [ ] **Step 1: Extend the test with asset helpers and browser-icon assertions**

Replace `src/branding.test.ts` with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fileUrl = (path: string) => new URL(path, `file://${root}`);
const read = (path: string) => readFileSync(fileUrl(path), 'utf8');

function pngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(fileUrl(path));
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('KL-Metro Typing branding', () => {
  test('uses the new display name and package slug on active surfaces', () => {
    const activeFiles = [
      read('index.html'),
      read('src/ui/HomeMap.tsx'),
      read('README.md'),
      read('CONTEXT.md'),
      read('docs/STATUS.md'),
    ];
    const packageJson = JSON.parse(read('package.json')) as { name: string };
    const packageLock = JSON.parse(read('package-lock.json')) as {
      name: string;
      packages: Record<string, { name?: string }>;
    };

    expect(activeFiles.join('\n')).not.toContain('MyRapid Typing');
    expect(read('index.html')).toContain('<title>KL-Metro Typing</title>');
    expect(read('src/ui/HomeMap.tsx')).toContain('<h1>KL-Metro Typing</h1>');
    expect(packageJson.name).toBe('kl-metro-typing');
    expect(packageLock.name).toBe('kl-metro-typing');
    expect(packageLock.packages[''].name).toBe('kl-metro-typing');
  });

  test('uses clean KL-Metro persistence namespaces', () => {
    expect(read('src/engine/progress.ts')).toContain(
      "export const STORAGE_KEY = 'klmetro.v1';",
    );
    expect(read('src/data/leaderboardStore.ts')).toContain(
      "export const LEADERBOARD_STORAGE_KEY = 'klmetro.leaderboard.v1';",
    );
  });

  test('declares the browser and install identity', () => {
    const html = read('index.html');
    const manifest = JSON.parse(read('public/site.webmanifest')) as {
      name: string;
      short_name: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };

    expect(html).toContain('<meta name="theme-color" content="#0b0f17" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(manifest).toMatchObject({
      name: 'KL-Metro Typing',
      short_name: 'KL-Metro',
      theme_color: '#0b0f17',
      background_color: '#0b0f17',
    });
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]);
  });

  test('ships correctly sized station-roundel raster icons', () => {
    expect(existsSync(fileUrl('public/favicon.svg'))).toBe(true);
    expect(pngDimensions('public/favicon-32x32.png')).toEqual({ width: 32, height: 32 });
    expect(pngDimensions('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngDimensions('public/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngDimensions('public/icon-512.png')).toEqual({ width: 512, height: 512 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: the browser/install tests fail because the manifest and icon files do
not exist and `index.html` still references `/vite.svg`.

- [ ] **Step 3: Create the station-roundel SVG favicon**

Create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b0f17"/>
  <circle cx="32" cy="32" r="21" fill="#ed254e"/>
  <path d="M7 32h12M45 32h12" stroke="#f78f1e" stroke-width="6" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="11" fill="#f8fafc"/>
</svg>
```

- [ ] **Step 4: Add the portable brand-asset generator**

Run:

```bash
npm install --save-dev sharp
npm pkg set scripts.assets:brand="node scripts/generate-brand-assets.mjs"
```

Create `scripts/generate-brand-assets.mjs`:

```js
import sharp from 'sharp';

const iconSource = 'public/favicon.svg';
const iconOutputs = [
  { file: 'public/favicon-32x32.png', size: 32 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
];

await Promise.all(
  iconOutputs.map(({ file, size }) =>
    sharp(iconSource)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(file),
  ),
);
```

Run:

```bash
npm run assets:brand
```

Expected: all four PNG files are created with the requested square dimensions.

- [ ] **Step 5: Create the web app manifest**

Create `public/site.webmanifest`:

```json
{
  "name": "KL-Metro Typing",
  "short_name": "KL-Metro",
  "description": "Type your way across the Klang Valley on the Rapid KL rail network.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b0f17",
  "theme_color": "#0b0f17",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 6: Replace the Vite favicon and add browser metadata**

Make the start of the `index.html` head exactly:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b0f17" />
    <meta
      name="description"
      content="Type your way across the Klang Valley on the Rapid KL rail network."
    />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <title>KL-Metro Typing</title>
  </head>
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: 1 test file passes with 4 passing tests.

- [ ] **Step 8: Commit browser and install identity**

```bash
git add src/branding.test.ts index.html package.json package-lock.json scripts/generate-brand-assets.mjs public/favicon.svg public/favicon-32x32.png public/apple-touch-icon.png public/icon-192.png public/icon-512.png public/site.webmanifest
git commit -m "feat: add KL-Metro browser identity"
```

### Task 3: Add the social-sharing thumbnail

**Files:**
- Modify: `src/branding.test.ts`
- Modify: `index.html`
- Modify: `scripts/generate-brand-assets.mjs`
- Create: `assets/brand/social-card.svg`
- Create: `public/og-image.png`

- [ ] **Step 1: Add a failing sharing-preview contract test**

Add this test before the closing `});` of `src/branding.test.ts`:

```ts
  test('declares a complete social-sharing preview', () => {
    const html = read('index.html');

    expect(html).toContain('<link rel="canonical" href="https://kl-metro-typing.vercel.app/" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:title" content="KL-Metro Typing" />');
    expect(html).toContain('<meta property="og:url" content="https://kl-metro-typing.vercel.app/" />');
    expect(html).toContain('<meta property="og:image" content="https://kl-metro-typing.vercel.app/og-image.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:title" content="KL-Metro Typing" />');
    expect(html).toContain('<meta name="twitter:image" content="https://kl-metro-typing.vercel.app/og-image.png" />');
    expect(pngDimensions('public/og-image.png')).toEqual({ width: 1200, height: 630 });
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: the sharing-preview test fails because the social metadata and PNG
do not exist.

- [ ] **Step 3: Create the editable social-card source**

Create `assets/brand/social-card.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0f17"/>
  <g opacity="0.2" fill="none" stroke-linecap="round">
    <path d="M760 690 1190 260" stroke="#ed254e" stroke-width="26"/>
    <path d="M700 470h560" stroke="#f78f1e" stroke-width="26"/>
    <path d="m850 650 330-330" stroke="#38bdf8" stroke-width="26"/>
    <circle cx="980" cy="470" r="38" fill="#f8fafc" stroke="#0b0f17" stroke-width="18"/>
  </g>
  <g transform="translate(78 70)">
    <rect width="88" height="88" rx="19" fill="#101725"/>
    <circle cx="44" cy="44" r="29" fill="#ed254e"/>
    <path d="M10 44h15M63 44h15" stroke="#f78f1e" stroke-width="9" stroke-linecap="round"/>
    <circle cx="44" cy="44" r="15" fill="#f8fafc"/>
  </g>
  <text x="188" y="126" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="1">KL-METRO TYPING</text>
  <text x="78" y="350" fill="#f8fafc" font-family="Arial, sans-serif" font-size="70" font-weight="700">Type your way across</text>
  <text x="78" y="430" fill="#f8fafc" font-family="Arial, sans-serif" font-size="70" font-weight="700">the Klang Valley.</text>
  <text x="82" y="510" fill="#94a3b8" font-family="Arial, sans-serif" font-size="27">154 stations · 7 lines · one keyboard</text>
</svg>
```

- [ ] **Step 4: Extend the generator and render the social-card PNG**

Replace `scripts/generate-brand-assets.mjs` with:

```js
import sharp from 'sharp';

const iconSource = 'public/favicon.svg';
const iconOutputs = [
  { file: 'public/favicon-32x32.png', size: 32 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
];

await Promise.all([
  ...iconOutputs.map(({ file, size }) =>
    sharp(iconSource)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(file),
  ),
  sharp('assets/brand/social-card.svg')
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile('public/og-image.png'),
]);
```

Run:

```bash
npm run assets:brand
```

Expected: `public/og-image.png` is a 1200-by-630 PNG.

- [ ] **Step 5: Add canonical, Open Graph, and Twitter metadata**

Insert the following immediately before `<title>KL-Metro Typing</title>` in
`index.html`:

```html
    <link rel="canonical" href="https://kl-metro-typing.vercel.app/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="KL-Metro Typing" />
    <meta
      property="og:description"
      content="Type your way across the Klang Valley on the Rapid KL rail network."
    />
    <meta property="og:url" content="https://kl-metro-typing.vercel.app/" />
    <meta
      property="og:image"
      content="https://kl-metro-typing.vercel.app/og-image.png"
    />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="KL-Metro Typing station roundel and tagline" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="KL-Metro Typing" />
    <meta
      name="twitter:description"
      content="Type your way across the Klang Valley on the Rapid KL rail network."
    />
    <meta
      name="twitter:image"
      content="https://kl-metro-typing.vercel.app/og-image.png"
    />
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/branding.test.ts
```

Expected: 1 test file passes with 5 passing tests.

- [ ] **Step 7: Commit the sharing preview**

```bash
git add src/branding.test.ts index.html scripts/generate-brand-assets.mjs assets/brand/social-card.svg public/og-image.png
git commit -m "feat: add KL-Metro sharing preview"
```

### Task 4: Verify the complete branding change

**Files:**
- Verify: all files changed by Tasks 1 through 3
- Verify: `dist/`

- [ ] **Step 1: Confirm the old display brand is absent from active files**

Run:

```bash
grep -n "MyRapid Typing" index.html package.json package-lock.json README.md CONTEXT.md docs/STATUS.md src/ui/HomeMap.tsx src/engine/progress.ts src/data/leaderboardStore.ts
```

Expected: no output and exit status 1. Historical design and plan documents are
deliberately excluded.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm test
```

Expected: 34 test files pass with 219 passing tests and no failures.

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite finish with exit status 0.

- [ ] **Step 4: Verify every public asset reached the build output**

Run:

```bash
test -f dist/favicon.svg
test -f dist/favicon-32x32.png
test -f dist/apple-touch-icon.png
test -f dist/icon-192.png
test -f dist/icon-512.png
test -f dist/site.webmanifest
test -f dist/og-image.png
```

Expected: every command exits with status 0.

- [ ] **Step 5: Inspect the final repository state**

Run:

```bash
git status --short --branch
git log -4 --oneline --decorate
```

Expected: a clean working tree on the implementation branch with the design,
rename, browser-identity, and sharing-preview commits at the tip.
