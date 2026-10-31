# Share a badge

**Date:** 2026-11-01
**Status:** Agreed with the user in a brainstorming session, with mockups; built on `docs/achievements-design`.
**Vocabulary** follows `CONTEXT.md`. Builds on the share result card
(`2026-10-27-share-result-card-design.md`) and achievements
(`2026-10-31-achievements-design.md`).

## Why

A badge is the most shareable thing the game makes, and it travels best as an
invitation rather than a brag. The user's words: it should read as "oh wow you
played this game" and make a friend curious about the game. So the image leads
with the badge and the rail map, and always says what the game is and where to
find it.

## Decisions (from the user)

- **One badge per share**: the one just earned, or any earned one later.
- **Two places**: the Summary where it was earned, and the achievements screen.
- **One way in on a Summary.** A Summary that shows new achievements has a
  single **"Share…"** button where "Share result" was. It opens a share sheet
  that asks what to share: **"This run"** first, then each new achievement the
  Summary shows. This replaces a second share button next to the run's, which
  the user felt would clash.
- **The image is the badge on the map**: a square dark image with the whole
  rail network drawn faint behind a large badge, then the badge's name, its
  tier in words, the game's name, its line, and its address.
- **The sheet** (mockup approved): a bottom sheet on a phone, a centred dialog on
  a desktop. Choices across the top on a phone, down the side on a desktop; the
  chosen one stands out by a bright outline and bold text, not by colour. A
  preview of the chosen image, then the same buttons as today.
- **Unearned Secrets can never be shared.** Nothing about them reaches an image,
  a file name or share text.

## Where it appears

| Place | What opens | Choices |
|---|---|---|
| Line Run and Adventure Summary (`SummaryScreen`) | "Share…" when it shows new achievements; otherwise today's buttons, unchanged | This run (when it has a card), then the new achievements shown |
| Quick Run Summary (`QuickRunSummary`) | the same; the run card image stays on the Summary above it | the same |
| Dispatcher Summary (`DispatchSummary`) | the same | the same |
| Achievements screen, an opened row of an earned achievement | **"Share badge"** under the row's detail | none: it opens on that badge |

- "The new achievements shown" means the rows the Summary displays (up to
  three). The "+n more" ones are not offered there; they can be shared from the
  achievements screen.
- A Summary with no run card (an interrupted Quick Run, an abandoned Career, a
  Line Run with nothing typed) but with new achievements still gets "Share…",
  with no "This run" choice. *(Builder's note: my call, not discussed.)*
- "This run" starts selected, so sharing the run costs one tap more than today
  and no more.
- Locked rows and unearned Secret rows get no button (the Secret row already
  has nothing to open).
- A tiered achievement shares the highest tier earned.

## The image

1080 × 1080, always dark, like the run card. Drawn on a canvas in the browser,
so no network request (invariant 5).

From the approved mockup, top to bottom:

1. The **whole rail network**, faint, filling the square, from
   `geo/networkLayout.ts` like the run card's map (one projection, invariant 1).
   A dark disc behind the badge keeps it legible.
2. The **badge**, about 480 px, exactly as the app draws it (`Badge.tsx`):
   poster frame, art, metal.
3. The **name**, large: "Jalan-Jalan".
4. The **tier in words**, upper case, monospace: "GOLD · ALL n STATIONS"
   (the tier word and its threshold label from `achievementDefs`). An earned
   Secret reads "SECRET". The tier is always written, so the frame's metal is
   never the only signal (invariant 3).
5. **"KL-METRO TYPING"**, then one line under it: "Type your way across the
   Klang Valley · kl-metro-typing.vercel.app" (the mockup's order; the run card
   has no tagline and puts the game's name in its header).

Not on the image *(my calls)*:
- The achievement's description. The friend needs the game, not the rules.
- A Secret's description. It says what the player did and would spoil it.
- A date, a player name, or a Verified stamp.

**Share text**: "I earned Jalan-Jalan (Gold) in KL-Metro Typing." plus the
address; for a Secret, "I found a secret in KL-Metro Typing: Not That Ampang."
plus the address *(wording is my call)*. **File name**:
`kl-metro-typing-jalan-jalan-gold.png`, the run card's slug style.

## The sheet

- A modal: `role="dialog"`, `aria-modal`, labelled "Share". Esc and Close shut
  it; focus moves into it on open and back to the button that opened it.
- The choices are one radio group (arrow keys move between them). Each shows a
  small badge, or a run-card mark for "This run", and the name.
- The preview is the drawn PNG with alt text, like the run card's
  ("Achievement card: Jalan-Jalan, Gold").
- Buttons and messages are the existing ones: **Share** where the browser can
  share the file, else **Copy image** where the clipboard takes images, and
  **Save image** always; "Image copied.", "Image saved." and the failure
  messages, in the same status line.
- Safari opens the system share sheet only straight from a tap, so every
  choice's PNG is drawn when the sheet opens (the run card is already drawn by
  then). While the chosen one is still drawing, its buttons show one disabled
  "Preparing image…", as `ShareButton` does today.
- The achievements screen leaves on Esc through a window listener; while the
  sheet is open, Esc closes only the sheet.
- The sheet follows the player's theme (paper and midnight); the image is
  always dark.
- Phone layout (`usePhoneLayout`) gets the bottom sheet; otherwise the dialog.

## How it is built

No new dependencies, no network requests.

- **Pure model** in `src/share/`, next to `shareCard.ts`: given the network and
  an earned achievement (id + award), the badge card's name, tier line, share
  text and file name. It refuses an achievement that is not earned. Tested like
  the engine.
- **Painter** for the badge card, sharing the run card's palette, fonts,
  `fitText` and network drawing where it can.
- **The badge on the canvas.** The badge is the SVG the app already draws. It
  reaches the canvas as an image made from its own markup (a `blob:` or `data:`
  URL, not a request). The key-line rules in `badges.css` do not apply inside an
  image, so they must travel inside the SVG. The badge's `useId` ids must stay
  unique. If the badge cannot be drawn, there is no image and the sheet says so
  in place of the preview, offering no buttons for that choice.
- **The run choice** reuses the run card exactly as it is drawn today.
- `ShareButton` keeps its job where there are no new achievements; the sheet
  reuses `shareResult.ts` for share, copy and save. On the Quick Run Summary
  the run card image stays where it is when "Share…" replaces the buttons, so
  the image has to be shown apart from the buttons.

### Left to the builder

- Exact layout numbers, the disc's size and opacity, the network's alpha.
- Whether the land backdrop is drawn behind the network.
- How the SVG is turned into markup (serialising a rendered node, or rendering
  to a string), within the constraints above.
- Component names and file split.

## Not in this version

- Sharing several badges at once, or a whole collection.
- A light image, or a story-sized (9:16) one.
- A link that opens the game on the badge.
