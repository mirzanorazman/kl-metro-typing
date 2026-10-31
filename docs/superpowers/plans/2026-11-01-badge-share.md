# Share a Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player share one earned badge as a 1080 × 1080 "badge on the map" PNG, from a Summary's "Share…" sheet or from an opened row on the achievements screen.

**Architecture:** A pure badge card model sits beside `shareCard.ts`. A painter draws it on a canvas, with the app's own badge SVG turned into a `data:` image. The UI splits today's `ShareButton` into a PNG-drawing hook and a row of actions, so a new `ShareSheet` and a `SummaryShare` wrapper can reuse both.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library (jsdom), 2D canvas.

**Spec:** `docs/superpowers/specs/2026-11-01-badge-share-design.md`

## Global Constraints

- No runtime network requests and no new dependencies (STATUS invariant 5). The badge reaches the canvas as a `data:image/svg+xml` URL.
- Colour is never the only signal (invariant 3). The tier is always written on the image, and the chosen sheet option stands out by outline and weight.
- An unearned Secret is never offered, drawn, named in a file name, or put in share text.
- Image: 1080 × 1080 (`CARD_SIZE`), always dark, using the run card's palette and fonts.
- Share text: `I earned {name} ({Tier}) in KL-Metro Typing.`; for a Secret, `I found a secret in KL-Metro Typing: {name}.`. `shareText` appends `SHARE_URL`.
- File name: `kl-metro-typing-{slug(name)}-{award}.png`, e.g. `kl-metro-typing-jalan-jalan-gold.png`.
- Alt text: `Achievement card: {name}, {Tier word or Secret}`.
- Copy in the UI: "Share…" (the Summary button), "Share" (the sheet's heading and its share-sheet button), "Share badge" (the achievements row), "This run", "Close", plus the existing "Copy image", "Save image", "Preparing image…" and status messages.

## Review Focus

1. **An unearned Secret on the achievements screen**: no "Share badge" button, and `shareableBadge` returns null. Tested in Tasks 1 and 6.
2. **Esc with the sheet open on the achievements screen** closes the sheet only; the screen stays. Tested in Task 6.
3. **A Summary with new achievements but no run card** (abandoned Career, nothing-typed Line Run) gets "Share…" with no "This run" option. Tested in Task 5.
4. **A badge image that fails to draw** shows "This image couldn't be drawn." and no buttons for that option, while other options still work. Tested in Task 4.
5. **A long achievement name** is fitted or cut with an ellipsis, never drawn past the edge. Tested in Task 3.

---

### Task 1: Pure badge card model

**Files:**
- Create: `src/share/badgeCard.ts`, `src/share/badgeCard.test.ts`
- Modify: `src/ui/NewAchievements.tsx` (move `tierLabel` out, import `tierLine`)
- Modify: `src/share/shareCard.ts` (export `slug` and `networkPaths`)

**Interfaces:**
- Produces:
  - `interface BadgeCard { id: string; award: Award; name: string; tier: string; alt: string; text: string; fileName: string }`
  - `tierLine(net: NetworkIndex, item: Pick<EarnedTier, 'id' | 'award'>): string`: "Gold · all n stations", or "Secret". Moved unchanged from `NewAchievements.tierLabel`.
  - `badgeCard(net: NetworkIndex, item: Pick<EarnedTier, 'id' | 'award'>): BadgeCard`. Throws on an unknown id, or on an award that doesn't match the def's kind (a tier on a Secret, or 'secret' on a tiered def).
  - `shareableBadge(state: AchievementState, id: string): Pick<EarnedTier, 'id' | 'award'> | null`: the earned award, or null when not earned.
  - From `shareCard.ts`: `export function slug`, `export function networkPaths`.

- [ ] **Step 1: Write the failing tests** in `badgeCard.test.ts` (use `buildNetwork(loadNetworkData())` and `emptyAchievements()`):
  - `badgeCard(net, { id: 'explorer.unlocked', award: 'gold' })` has `name: 'Jalan-Jalan'`, `tier` starting `'Gold · '`, `text: 'I earned Jalan-Jalan (Gold) in KL-Metro Typing.'`, `fileName: 'kl-metro-typing-jalan-jalan-gold.png'`, `alt: 'Achievement card: Jalan-Jalan, Gold'`.
  - A Secret, `{ id: 'secret.ampang', award: 'secret' }`, gives `tier: 'Secret'`, `text: 'I found a secret in KL-Metro Typing: Not That Ampang.'`, `fileName: 'kl-metro-typing-not-that-ampang-secret.png'`.
  - Throws for `{ id: 'nope', award: 'gold' }`, `{ id: 'secret.ampang', award: 'gold' }` and `{ id: 'explorer.unlocked', award: 'secret' }`.
  - `shareableBadge(emptyAchievements(), 'secret.ampang')` and `(…, 'explorer.unlocked')` are null. With `earned['explorer.unlocked'] = { award: 'silver', at: { bronze: 1, silver: 2 } }` it returns `{ id: 'explorer.unlocked', award: 'silver' }`.
- [ ] **Step 2:** Run `npx vitest run src/share/badgeCard.test.ts`. Expect FAIL (module missing).
- [ ] **Step 3:** Implement `badgeCard.ts`, move `tierLabel` there as `tierLine`, and switch `NewAchievements` to import it.
- [ ] **Step 4:** Run `npx vitest run src/share src/ui/NewAchievements.test.tsx`. Expect PASS.
- [ ] **Step 5:** Commit: `feat: a pure model for a shared achievement badge`.

### Task 2: The badge as an image

**Files:**
- Create: `src/render/badges/badgeSvg.ts`, `src/render/badges/badgeSvg.test.ts`

**Interfaces:**
- Consumes: `Badge` from `./Badge`.
- Produces:
  - `badgeSvgMarkup(id: string, award: Award, size: number): string`: standalone SVG markup with an `xmlns`, `width`/`height` = size, and a `<style>` holding the contents of `badges.css` (imported with `?raw`), so the key line survives outside the page.
  - `loadBadgeImage(id: string, award: Award, size: number): Promise<HTMLImageElement | null>`: loads that markup from a `data:image/svg+xml;charset=utf-8,` URL. Null on `onerror`.

- [ ] **Step 1: Write the failing tests:**
  - The markup for `('explorer.unlocked', 'gold', 480)` starts `<svg`, contains `xmlns="http://www.w3.org/2000/svg"`, `width="480"`, `.badge__key` inside a `<style>`, and no `badge--locked`.
  - Two calls give the same ids within each string, with every `url(#…)` reference resolving to an `id="…"` in the same string. Assert this with a regex over the string.
  - `loadBadgeImage` resolves null when `Image` fires `onerror`. Stub the global `Image` with a class whose `src` setter calls `onerror`.
- [ ] **Step 2:** Run `npx vitest run src/render/badges/badgeSvg.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement. Render `<Badge id award size />` into a detached `div` with `createRoot` and `flushSync`, serialise `div.firstElementChild` with `XMLSerializer`, unmount, then insert `<style>{css}</style>` after the opening tag.
- [ ] **Step 4:** Run the test again. Expect PASS.
- [ ] **Step 5:** Commit: `feat: a badge can be drawn outside the page`.

### Task 3: Painting and encoding the badge card

**Files:**
- Create: `src/share/paintBadgeCard.ts`, `src/share/paintBadgeCard.test.ts`
- Modify: `src/share/paintCard.ts` (export `C`, `SANS`, `MONO`, `font`, `fitText`, `trace`)
- Modify: `src/share/shareResult.ts`

**Interfaces:**
- Consumes: `BadgeCard`, `networkPaths`, `loadBadgeImage`, `fitViewBox`/`coverAspect`, `networkLayout().backdrop`.
- Produces:
  - `BADGE_SIZE = 480`
  - `paintBadgeCard(ctx: CanvasRenderingContext2D, card: BadgeCard, badge: CanvasImageSource, net: NetworkIndex): void`
  - `renderBadgePng(net: NetworkIndex, card: BadgeCard): Promise<Blob | null>` in `shareResult.ts`. Null when the badge image or the canvas is unavailable.
  - `type Shareable = Pick<ShareCard, 'text' | 'fileName'>`. `shareText`, `cardFile`, `shareFile` and `downloadImage` take `Shareable`, so they serve both cards.

Layout, top to bottom (from the approved mockup C; the exact numbers are the builder's):
- Background `C.paper`. Land backdrop in `C.land`, then every Line at about 0.3 alpha, about 10 px wide, framed with `coverAspect(fitViewBox(allPoints, 0.06), 1)`.
- A disc in `C.paper` at about 0.75 alpha, centred behind the badge.
- The badge at `BADGE_SIZE`, centred horizontally, top about 180.
- The name: `fitText`, 800 weight, 80 down to 48, white, centred, around y 790.
- `card.tier.toUpperCase()` in MONO, 700, 32, `#e2a72a` for Gold, `C.ink` otherwise. Contrast on the dark ground carries the brightness; the words carry the tier.
- `'KL-METRO TYPING'`, 700, 30, centred, around y 960.
- `` `Type your way across the Klang Valley · ${address}` ``, 500, 24, `C.muted`, centred, around y 1004. `address` is `SHARE_URL` without its scheme or trailing slash.

- [ ] **Step 1: Write the failing tests** with a canvas recorder (copy the Proxy recorder from `paintCard.test.ts`, also recording `drawImage` calls):
  - Draws `'Jalan-Jalan'`, the upper-cased tier, `'KL-METRO TYPING'` and `'Type your way across the Klang Valley · kl-metro-typing.vercel.app'`.
  - Calls `drawImage` with the badge source and width/height `BADGE_SIZE`.
  - A name 60 characters long comes out ending in `'…'`.
  - A Secret's card draws `'SECRET'` and none of the def's description words.
- [ ] **Step 2:** Run `npx vitest run src/share/paintBadgeCard.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement `paintBadgeCard`. Generalise `renderCardPng`'s font-loading and canvas body into a private `renderPng(paint)`, then add `renderBadgePng`, which awaits `loadBadgeImage(card.id, card.award, BADGE_SIZE)` first.
- [ ] **Step 4:** Run `npx vitest run src/share`. Expect PASS, with the existing share tests still green.
- [ ] **Step 5:** Commit: `feat: paint an achievement badge on the map`.

### Task 4: A drawing hook, shared actions, and the share sheet

**Files:**
- Create: `src/ui/usePng.ts`, `src/ui/ShareActions.tsx`, `src/ui/ShareSheet.tsx`, `src/ui/ShareSheet.test.tsx`
- Modify: `src/ui/ShareButton.tsx` (rebuilt on the two new pieces, same behaviour), `src/ui/share.css`

**Interfaces:**
- Consumes: `renderCardPng`, `renderBadgePng`, `Shareable`, `badgeCard`, `Badge`, `usePhoneLayout`.
- Produces:
  - `type PngState = { status: 'drawing' } | { status: 'ready'; blob: Blob; file: File } | { status: 'none' }`
  - `usePng(item: Shareable, key: string, draw: () => Promise<Blob | null>): PngState`. Redraws only when `key` changes. This is the effect lifted out of `ShareButton`.
  - `ShareActions({ item, image, shareLabel }: { item: Shareable; image: PngState; shareLabel: string })`: today's button row and status line, including "Preparing image…" while drawing. It renders nothing for `'none'`.
  - `ShareButton` keeps its props and tests unchanged, and gains `actions?: boolean` (default true). When false it shows only the preview, for Task 5.
  - `type ShareChoice = { kind: 'run'; card: ShareCard; image: PngState } | { kind: 'badge'; item: Pick<EarnedTier, 'id' | 'award'> }`
  - `ShareSheet({ net, choices, onClose }: { net: NetworkIndex; choices: readonly ShareChoice[]; onClose: () => void })`

Behaviour (from the spec's "The sheet"):
- `role="dialog"`, `aria-modal="true"`, labelled by its "Share" heading. A "Close" button. Esc closes it, and its keydown calls `stopPropagation()` so window listeners never see that Esc. Tab wraps within the sheet. On close, focus returns to the element that had it on open.
- With two or more choices: native radios named after each choice ("This run", or the achievement's name), each tile showing a 40 px `Badge`, or a run mark for the run. The first choice starts checked. With one choice there is no radio group.
- Every choice's panel mounts on open, so all PNGs start drawing at once. Only the checked one is visible (`hidden` on the others). Each panel shows its preview `<img>` with alt text (`cardAlt` for the run; `BadgeCard.alt` for a badge), then `ShareActions` with `shareLabel="Share"`. A badge panel whose PNG is `'none'` says "This image couldn't be drawn." in place of the preview, with no buttons.
- `share-sheet--phone` (bottom sheet) when `usePhoneLayout()`, else a centred dialog. A backdrop dims the page. Colours come from theme tokens (`--panel`, `--panel-edge`, `--ink`, `--ink-muted`). The checked tile has a 2 px `--ink` outline and bold text.

- [ ] **Step 1:** Run `npx vitest run src/ui/ShareButton.test.tsx` and record that it passes before the refactor.
- [ ] **Step 2:** Refactor `ShareButton` onto `usePng` and `ShareActions`, then re-run its tests. Expect PASS, unchanged.
- [ ] **Step 3: Write the failing `ShareSheet` tests.** Mock `../share/shareResult` the way `ShareButton.test.tsx` does, with both `renderCardPng` and `renderBadgePng`:
  - Run plus two badges: a radio group with "This run", "Jalan-Jalan" and "Express Service". "This run" is checked, and the visible image's alt starts `Result card:`.
  - Choosing "Jalan-Jalan" shows alt `Achievement card: Jalan-Jalan, Gold`. Clicking "Save image" downloads `kl-metro-typing-jalan-jalan-gold.png`. Stub `URL.createObjectURL` and spy on `HTMLAnchorElement.prototype.click`.
  - With one badge choice there are no radios.
  - When `renderBadgePng` resolves null for a choice, that panel shows "This image couldn't be drawn." and no "Save image", while the run choice still offers it.
  - Esc calls `onClose`, and a `keydown` listener on `window` does not receive it. "Close" calls `onClose`.
  - The dialog has `aria-modal="true"` and its name is "Share".
- [ ] **Step 4:** Run `npx vitest run src/ui/ShareSheet.test.tsx`. Expect FAIL.
- [ ] **Step 5:** Implement `ShareSheet` and its CSS.
- [ ] **Step 6:** Run `npx vitest run src/ui`. Expect PASS.
- [ ] **Step 7:** Commit: `feat: a share sheet that asks what to share`.

### Task 5: "Share…" on the Summaries

**Files:**
- Create: `src/ui/SummaryShare.tsx`, `src/ui/SummaryShare.test.tsx`
- Modify: `src/ui/SummaryScreen.tsx:261`, `src/ui/QuickRunSummary.tsx:82`, `src/ui/DispatchSummary.tsx:183-185`

**Interfaces:**
- Consumes: `ShareButton`, `usePng`, `renderCardPng`, `ShareSheet`, `ShareChoice`, `EarnedTier`.
- Produces: `SummaryShare({ net, card, items, showImage, fallback }: { net: NetworkIndex; card: ShareCard | null; items: readonly EarnedTier[]; showImage?: boolean; fallback?: ReactNode })`

Behaviour:
- `items` empty: exactly today's output. `card ? <ShareButton card showImage fallback /> : null`, and `showImage && !card` renders nothing (QuickRunSummary already shows its stats then).
- `items` not empty: the run PNG is drawn once with `usePng`. With `showImage`, it shows the run preview (or `fallback` if it can't be drawn) with no buttons. Then one "Share…" button opens `ShareSheet` with choices `[run (only when card), ...items as badges]`, the run choice given the already-drawn `image`. Closing the sheet focuses "Share…" again.
- The callers pass the same `items` that `NewAchievements` shows (the claimed rows, never "+n more").

- [ ] **Step 1: Write the failing tests:**
  - No items with a card: "Share result" or "Save image" appears and there is no "Share…".
  - Items with a card: there is no "Share result" button. "Share…" opens a dialog with radios "This run" and the item's name.
  - Items with `card: null`: "Share…" opens a dialog with no "This run" and no radios (one badge), showing that badge's preview.
  - Closing returns focus to "Share…".
- [ ] **Step 2:** Run `npx vitest run src/ui/SummaryShare.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement `SummaryShare`, then swap it in. In `SummaryScreen`, use `card={count > 0 ? card : null}` and `items={achievements.items}`. In `QuickRunSummary`, use `card={share}`, `showImage` and `fallback={stats}`. In `DispatchSummary`, use `card={abandoned ? null : careerCard(…)}`.
- [ ] **Step 4:** Run `npx vitest run src/ui`. Expect PASS, with the existing Summary tests updated only where they asserted "Share result" alongside new achievements.
- [ ] **Step 5:** Commit: `feat: a Summary's Share… offers the run or a new badge`.

### Task 6: "Share badge" on the achievements screen

**Files:**
- Modify: `src/ui/AchievementsScreen.tsx` (the `Row` detail, the screen's Esc handling), `src/ui/achievements.css`
- Test: `src/ui/AchievementsScreen.test.tsx`

**Interfaces:**
- Consumes: `shareableBadge`, `ShareSheet`.

Behaviour: an opened row whose `shareableBadge(state, def.id)` is non-null ends its detail with a "Share badge" button. The button opens `ShareSheet` with that one badge choice, and closing it focuses "Share badge" again. Unearned Secret rows and locked tiered rows have no button.

- [ ] **Step 1: Write the failing tests:**
  - An earned tiered row, opened, has "Share badge". Clicking it shows a dialog whose image alt names that achievement and its highest tier.
  - A locked tiered row, opened, has no "Share badge". An unearned Secret has no button at all, and nothing named "Share badge" exists on the page.
  - An earned Secret, opened, has "Share badge".
  - With the sheet open, Esc closes the sheet and `onExit` is not called. A second Esc calls `onExit`.
- [ ] **Step 2:** Run `npx vitest run src/ui/AchievementsScreen.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expect the whole suite to pass, then run `npm run build`. Expect a clean `tsc` and build.
- [ ] **Step 5:** Commit: `feat: share any earned badge from the achievements screen`.

### Task 7: Check in the browser and record it

**Files:**
- Modify: `docs/STATUS.md` (add a paragraph after **Share result**), and the spec's Status line ("built")

- [ ] **Step 1:** In the dev server (`.claude/launch.json` "dev"), earn a badge, using a seeded Profile in localStorage if quicker. Check "Share…", the sheet, the preview, Save image, Esc and focus return. Do this on the desktop and phone (375 × 812) layouts, in the paper and midnight themes. Open a saved PNG and confirm the network, badge (with key line), name, tier and footer.
- [ ] **Step 2:** Confirm in the network panel that opening the sheet makes no requests.
- [ ] **Step 3:** Update `STATUS.md` and the spec's Status line.
- [ ] **Step 4:** Commit: `docs: badge share recorded in STATUS`.
