# MyRapid Typing

> **Picking this up fresh?** Start with [`docs/STATUS.md`](docs/STATUS.md) —
> current state, architecture invariants, known debt, and what is next.
> Note that all source lives on the `feat/foundation-and-adventure` branch.

A typing game on the Kuala Lumpur Rapid KL rail network. Drive a train across
the Klang Valley by typing station names.

**Adventure mode** — free-roam the network with no clock and no fail state.
Choose a direction at every junction; stations unlock permanently as you visit them.

## Development

    npm install
    npm run dev
    npm test

## Data

`src/data/` holds the network as three JSON files: 7 lines, 154 stations, and
the walk-transfer links between differently-named stations.

Adjacency, screen positions, and the schematic layout are all derived at load
rather than stored — see the design spec in `docs/superpowers/specs/`.

Run `npm test` after any data change: `validateNetworkData` fails the build on
broken line sequences, mismatched station codes, out-of-range coordinates,
schematic conflicts, and two stations landing on the same grid point.

## Unofficial

Not affiliated with Prasarana Malaysia or Rapid KL. Station names, codes, and
line colours are public information.

## Map data

`src/data/boundaries.json` holds simplified outlines of Selangor, Kuala Lumpur,
and Putrajaya, derived from [Natural Earth](https://www.naturalearthdata.com/)
(public domain) and reduced to 271 points with Douglas-Peucker. It is committed
rather than fetched, so the app still makes no network requests at runtime.
