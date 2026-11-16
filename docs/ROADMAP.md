# HackCode — Roadmap

Next steps toward v1, in order. Each step is one PR with tests first. Design: [`DESIGN.md`](DESIGN.md).

**Done:** the Blue-11 library with its tests, and `src/core/`: grid, robot machine, devices,
tick loop, symbols.

## 1. First playable page

- Replace the pre-alpha console in `src/main.ts` with a game page: the editor, a top-down
  map (`src/render/`, plain Canvas 2D first, PixiJS later behind the same interface),
  Run / Continue / Step / Step tick, and register and energy panels.
- A hand-made test map (walls, coins, exit) and a win check for reaching the exit.
- **Done when:** a program that drives the robot through raw registers reaches the exit
  in the browser.

## 2. BIOS in ROM

- `EMT n` calls for move, turn, fire, scan and grab, written in Blue-11 using only the
  device registers and assembled into the ROM at 140000. Its call numbers go into `SYMBOLS`.
- Its source is shipped readable for later lessons.
- **Done when:** lesson-1 style code (`MOV`, then `EMT`) drives the robot, and the
  call/return conventions are recorded in DESIGN.md §4.

## 3. Debugger

- Breakpoints in the editor gutter, a memory view, disassembly with symbolic device
  names, and an execution heat map.
- Assembler errors shown inline.
- **Done when:** stepping and running give identical worlds (this has a test).

## 4. Monsters

- Each monster gets a small `DeviceMachine` (2–4 KB) running one behaviour script per
  type, with its own sensor and motor devices, as an `Actor`.
- Contact and laser damage, and loot drops.
- **Done when:** a patrol monster and a chaser behave deterministically from a seed.

## 5. Lessons 0–7

- Lesson data: map, briefing, hints, win condition, reference solution, and the help
  text for the symbols.
- Progress saved in `localStorage`.
- **Done when:** every reference solution passes its lesson in CI.

## 6. Expedition

- A seeded BSP dungeon generator, a reachability check, difficulty that rises with depth,
  and chargers.
- The math chip, which unlocks EIS.
- **Done when:** 1000 seeds all generate solvable maps (this has a test).

## Later

Scoring (ticks, energy, coins), a probe device for hacking monsters, kernel/user modes,
more upgrades, and tuning of timings and costs from play.
