# Share result as an image

**Date:** 2026-10-27
**Status:** Agreed with the user in a brainstorming session; built on `claude/gifted-keller-uwm5lp`.
**Vocabulary** follows `CONTEXT.md`.

## Why

A finished Run ends on a summary screen and nowhere else. Players who want to
show a result take a screenshot of a page built for reading, not for sharing:
buttons, a name form, half a map. A card made for sharing travels further and
always carries the game's name and address.

## Decisions (from the user)

- **Square**, 1080 × 1080. Safe across WhatsApp, X, Instagram and Discord.
- **Dark** brand look always, whatever the player's theme, matching
  `assets/brand/social-card.svg`.
- **The map is on the card**: the Run's route over the faint network.
- **No keyboard shortcut.** The leaderboard name field makes typed shortcuts
  on a summary screen unsafe.

## Where it appears

| Summary | Card | Button shown when |
|---|---|---|
| Line Run (`SummaryScreen`) | Line, termini, route, WPM / Accuracy / Score / Time | Always |
| Adventure (`SummaryScreen`) | Stations explored, path, WPM / Accuracy / Stations / Unlocked | Always |
| Quick Run (`QuickRunSummary`) | Stations in 30 s, each Leg in its Line's colour, WPM / Accuracy / Score / Stations | Completed only, not interrupted |
| Dispatcher (`DispatchSummary`) | Shifts, Served network, Out of service crosses, Score / Shifts / Delivered / WPM | Not abandoned |

Rush Hour gets nothing: it is being retired.

## Integrity

- A **Verified** stamp appears only for a Run that replayed cleanly and passed
  its Verdict (a Line Run's eligibility, a Quick Run's replay, a Dispatcher
  Career's judgement). Adventure has no Keylog and never gets one.
- An ineligible Run still gets a card, just without the stamp. The Reason is
  never shown, on the card or in its text, as everywhere else.
- A leaderboard rank appears only after the player has saved their name.
- The image is not evidence and does not pretend to be. The stamp means the
  game that made the card checked the Run, nothing more.

## How it is built

No network requests, no new dependencies (invariant 5).

```
src/share/
  shareCard.ts    pure: per-mode builders -> ShareCard (text, stats, badges, map geometry)
  paintCard.ts    draws a ShareCard on a 1080x1080 2D canvas context
  shareResult.ts  canvas -> PNG blob; share sheet, copy, or download
src/ui/ShareButton.tsx   the one button every summary uses
```

- **Pure model.** Every decision about what the card says and where the route
  runs lives in `shareCard.ts`, so it is tested like the engine.
- **Canvas, not a screenshot or an SVG.** Drawing directly uses the page's own
  fonts (`document.fonts`) and the one projection from `geo/networkLayout.ts`
  (invariant 1). A DOM screenshot would copy buttons and break on CSS
  variables; an SVG drawn as an image cannot use the page's fonts.
- **Colour is never the only signal** (invariant 3). Line badges print their
  code; Out of service Stations are crosses, not red dots; the route's ends are
  a ring (start) and a filled dot (end).
- **Route colouring.** Consecutive Stations take the Line they share. Where two
  Lines share a stretch (AG and SP), a known Line wins (Line Run's line, a Quick
  Run Leg's line), then the Line already being drawn, then one that also covers
  the next hop. A Quick Run Jump and a Walk link break the path.

## Sharing

1. **Share sheet** where the browser can share files (iOS Safari, Android
   Chrome, some desktops): the PNG plus one line of text and the address.
2. **Copy image** where the clipboard takes images (desktop Chromium, Safari).
3. **Save image** always: a PNG download.

Safari only opens the share sheet straight from a tap, so the PNG is made when
the summary appears and the button waits for it. Dismissing the share sheet is
not an error.

## Not in this version

- A preview of the card on the summary screen.
- Light-theme cards, story-sized (9:16) cards.
- A link that reproduces the Run. That needs a server, which the game avoids.
