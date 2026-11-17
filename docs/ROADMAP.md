# HackCode — Roadmap

Next steps toward v1, in order. Each step is one PR with tests first. Design: [`DESIGN.md`](DESIGN.md).

**Done:** the Blue-11 library with its tests; `src/core/`: grid, robot machine, devices,
tick loop, symbols, text maps; and the first playable page (`src/ui/`, `src/render/`: editor,
Canvas 2D map, Run / Continue / Pause / Step / Step tick, robot / CPU / console panels, a test
map whose raw-register solution is checked in `tests/ui/session.test.ts`); and the BIOS in ROM
(`EMT MOVE`, `LEFT`, `FIRE`, `SCAN`, `GRAB`, `DROP`, `PRINT`; DESIGN.md §4); and the
debugger (breakpoints, heat map, disassembly, memory view, inline assembler errors; the
step-equals-run world check is in `tests/ui/debug.test.ts`); and monsters (a patrol, a
chaser and a sentry, each an `Actor` with a 4 KB machine, a motor, a sensor (a laser for the
sentry) and a behaviour script in
Blue-11; contact and laser damage, loot; DESIGN.md §6; seeded behaviour checked in
`tests/core/monsters.test.ts`); and the in-game help (Help / F1, sections, search,
F1 on the word under the cursor, hover tooltips; DESIGN.md §7 "Help"); and chargers (a charger
object, the dock device and `EMT CHARGE`; DESIGN.md §5); and lessons 0–7 (map, briefing
with links into the help, starter, goal, rules, hints and reference solution; progress in
`localStorage`; DESIGN.md §7; every solution wins in `tests/ui/lessons.test.ts`).

## 2. Expedition

- A seeded BSP dungeon generator, a reachability check, difficulty that rises with depth,
  and chargers placed in the generated maps.
- The math chip, which unlocks EIS.
- **Done when:** 1000 seeds all generate solvable maps (this has a test).

## Later

Scoring (ticks, energy, coins), a probe device for hacking monsters, kernel/user modes,
more monster kinds with other behaviours, cyberpunk effects (a glitch burst on damage, a
reticle when the sentry fires, scanlines over the map), more upgrades, and tuning of timings and costs
from play.
