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
