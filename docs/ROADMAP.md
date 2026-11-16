# HackCode — Roadmap

Next steps toward v1, in order. Each step is one PR with tests first. Design: [`DESIGN.md`](DESIGN.md).

**Done:** the Blue-11 library with its tests; `src/core/`: grid, robot machine, devices,
tick loop, symbols, text maps; and the first playable page (`src/ui/`, `src/render/`: editor,
Canvas 2D map, Run / Continue / Pause / Step / Step tick, robot / CPU / console panels, a test
map whose raw-register solution is checked in `tests/ui/session.test.ts`); and the BIOS in ROM
(`EMT MOVE`, `LEFT`, `FIRE`, `SCAN`, `GRAB`, `DROP`, `PRINT`; DESIGN.md §4); and the
debugger (breakpoints, heat map, disassembly, memory view, inline assembler errors; the
step-equals-run world check is in `tests/ui/debug.test.ts`).

## 1. Monsters

- Each monster gets a small `DeviceMachine` (2–4 KB) running one behaviour script per
  type, with its own sensor and motor devices, as an `Actor`.
- Contact and laser damage, and loot drops.
- **Done when:** a patrol monster and a chaser behave deterministically from a seed.

## 2. Lessons 0–7

- Lesson data: map, briefing, hints, win condition, reference solution, and the help
  text for the symbols.
- Progress saved in `localStorage`.
- **Done when:** every reference solution passes its lesson in CI.

## 3. Expedition

- A seeded BSP dungeon generator, a reachability check, difficulty that rises with depth,
  and chargers.
- The math chip, which unlocks EIS.
- **Done when:** 1000 seeds all generate solvable maps (this has a test).

## Later

Scoring (ticks, energy, coins), a probe device for hacking monsters, kernel/user modes,
more upgrades, and tuning of timings and costs from play.
