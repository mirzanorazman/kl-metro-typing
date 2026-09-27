# Wrong-key Feedback Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the normal typing prompt's `Wrong key` status directly beneath the mistyped current character without moving the station name.

**Architecture:** `Prompt` will group the mistyped current character and its accessible status in a dedicated inline anchor. CSS will keep the anchor in the text flow while absolutely positioning the status beneath and centred on the character.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Testing Library

---

### Task 1: Anchor wrong-key feedback to the current character

**Files:**
- Modify: `src/render/Prompt.test.tsx`
- Modify: `src/render/Prompt.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write the failing component regression test**

Add a test that renders a mistyped prompt, finds the current character and status, and requires both to share the positioning anchor:

```tsx
it('anchors wrong-key feedback to the current character', () => {
  const mistyped = applyKey(beginTyping('Imbi'), 'x');
  const { container } = render(<Prompt state={mistyped} />);
  const current = container.querySelector('[data-state="current"]');
  const status = screen.getByRole('status');
  const anchor = status.closest('.prompt-miskey-anchor');

  expect(anchor).not.toBeNull();
  expect(anchor?.contains(current)).toBe(true);
});
```

Add a CSS regression test that requires the anchor and status positioning rules:

```tsx
it('positions wrong-key feedback below its character anchor', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const anchorRule = css.match(/\.prompt-miskey-anchor\s*\{([^}]+)\}/)?.[1];
  const feedbackRule = css.match(/\.prompt-miskey-anchor \.prompt-feedback\s*\{([^}]+)\}/)?.[1];

  expect(anchorRule).toMatch(/position:\s*relative/);
  expect(anchorRule).toMatch(/display:\s*inline-block/);
  expect(feedbackRule).toMatch(/position:\s*absolute/);
  expect(feedbackRule).toMatch(/inset-block-start:\s*calc\(100% \+ 0\.35em\)/);
  expect(feedbackRule).toMatch(/inset-inline-start:\s*50%/);
  expect(feedbackRule).toMatch(/transform:\s*translateX\(-50%\)/);
  expect(feedbackRule).toMatch(/white-space:\s*nowrap/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/render/Prompt.test.tsx`

Expected: FAIL because `.prompt-miskey-anchor` and its positioning rules do not exist.

- [ ] **Step 3: Add the current-character anchor in `Prompt`**

Change the character loop to return the following wrapper only for a mistyped normal prompt:

```tsx
const content = [...state.target].map((ch, i) => {
  const character = (
    <span
      key={i === state.cursor ? `cur-${errorTick}` : i}
      data-char
      data-space={ch === ' ' ? 'true' : undefined}
      data-state={i < state.cursor ? 'done' : i === state.cursor ? 'current' : 'pending'}
      data-miskey={i === state.cursor && state.mistyped ? 'true' : undefined}
    >
      {ch}
    </span>
  );

  if (!onActivate && i === state.cursor && state.mistyped) {
    return (
      <span key={`miskey-${errorTick}`} className="prompt-miskey-anchor">
        {character}
        <span className="prompt-feedback" role="status">Wrong key</span>
      </span>
    );
  }

  return character;
});
```

Leave the recovery-button status outside its button.

- [ ] **Step 4: Position the status beneath the anchor in `src/index.css`**

Replace the feedback's side margin with the anchor rules:

```css
.prompt-miskey-anchor {
  position: relative;
  display: inline-block;
}
.prompt-feedback {
  display: inline-block;
  color: var(--error);
  font: 600 var(--t-sm)/1.2 var(--font-sans);
  letter-spacing: normal;
  text-transform: none;
  vertical-align: middle;
}
.prompt-miskey-anchor .prompt-feedback {
  position: absolute;
  inset-block-start: calc(100% + 0.35em);
  inset-inline-start: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `npm test -- src/render/Prompt.test.tsx`

Expected: PASS with all `Prompt` tests green.

- [ ] **Step 6: Run the full automated verification**

Run: `npm test`

Expected: PASS with no failing tests.

Run: `npm run build`

Expected: TypeScript and Vite build exit successfully.

- [ ] **Step 7: Verify the reported layout in a browser**

Start the Vite development server, open the game at the reported viewport, enter a wrong key on a station prompt, and confirm:

- `Wrong key` is centred directly beneath the current red character.
- The remaining station name does not move sideways.
- The browser console contains no new errors.

- [ ] **Step 8: Commit the implementation**

```bash
git add src/render/Prompt.test.tsx src/render/Prompt.tsx src/index.css docs/superpowers/plans/2026-09-27-wrong-key-feedback-position.md
git commit -m "fix: place wrong-key feedback under character"
```
