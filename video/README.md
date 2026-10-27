# KL-Metro Typing — promo reel

A 40-second vertical (1080 × 1920, 30 fps) reel built with
[Remotion](https://www.remotion.dev). Each Era of KL rail history introduces
one Mode: the 1990s teach the core loop, 2003 is Line Run on the Monorail,
2015–17 is Adventure at Putra Heights, 2022–23 is Quick Run on the Putrajaya
Line, and the finished network becomes Dispatcher.

The map is drawn from the game's own data and projection
(`src/geo/networkLayout.ts`), and the Era order comes from Dispatcher's
`ERAS` list, so the reel stays in step with the app.

## Commands

    npm install
    npm run dev          # Remotion Studio
    npm run render       # out/kl-metro-typing-reel.mp4

Both commands first run `npm run soundtrack`, which synthesises
`public/soundtrack.wav`. The music and sound effects are generated in code,
so there is no third-party audio to license.

If Remotion cannot download its browser, point it at one already installed:

    REMOTION_BROWSER=/path/to/chrome-headless-shell npm run render

## Where things live

| File | What it holds |
|---|---|
| `src/timeline.ts` | Every timing: scenes, typed names, reveals, sound cues |
| `src/camera.ts` | The camera's shots and blends |
| `src/MapLayer.tsx` | The continuous map: Lines, Stations, labels, the player's train |
| `src/DispatchLayer.tsx` | Dispatcher's Trains, Signals, Green wave and Incident |
| `src/Overlay.tsx` | Era timeline, headlines, typing panel, junction, end card |
| `scripts/soundtrack.ts` | The synthesised score and sound effects |

To retime a scene, change it in `src/timeline.ts`. The soundtrack reads the
same module, so key clicks follow the letters on screen.

Remotion is free for individuals and companies of up to three people; larger
companies need a [company licence](https://www.remotion.pro/license).
