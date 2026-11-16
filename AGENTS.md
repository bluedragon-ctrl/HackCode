# Working on HackCode (for AI coding agents and people)

An educational browser game: the player programs a robot in Blue-11 assembly (a PDP-11 /
Macro-11 dialect) through a dungeon. Design: [`docs/DESIGN.md`](docs/DESIGN.md).

## Layout

| Folder | What | Rules |
| :--- | :--- | :--- |
| `src/blue11/` | CPU, assembler, disassembler, devices — a standalone library | Its own rules: [`src/blue11/AGENTS.md`](src/blue11/AGENTS.md). Imports nothing from the game. |
| `src/core/` | Simulation: world, robot devices, ticks, dungeon generation | Deterministic, integer-only, no DOM; seeded RNG only |
| `src/render/` | Top-down 2D renderer | Reads simulation state, never changes it |
| `src/ui/` | Editor, debugger, lessons | |
| `tests/` | Vitest | `tests/blue11/` for the library |

## Commands

- `npm run dev` — local dev server
- `npm test` — all tests
- `npm run build` — typecheck and build to `dist/`

CI (`.github/workflows/ci.yml`) runs tests and the build on every PR, and deploys `main`
to GitHub Pages.

## Conventions

- Numbers shown to the player are octal, as on the original machine.
- The simulation must be reproducible from (seed, map, program, inputs): no `Math.random`,
  `Date` or wall-clock time in `src/core/`.
- Update `docs/DESIGN.md` when a design decision changes.
