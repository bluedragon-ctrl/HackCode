# HackCode — Roadmap

Next steps toward v1, in order. Each step is one PR with tests first. Design: [`DESIGN.md`](DESIGN.md).

**Owner, 2026-11-18:** §1 (Blue-11 on its own) is finished before any more work on HackCode
(§2 onwards).

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
`localStorage`; DESIGN.md §7; every solution wins in `tests/ui/lessons.test.ts`); and the
expedition in the page (DESIGN.md §8).

## 1. Blue-11 on its own (first: HackCode waits for it)

The library becomes a project of its own: a repository shared by several projects, with a
standalone simulator where students write programs that draw graphics and read the keyboard.
`docs/BLUE11_CPU.md` §14.3 planned this "when a second project needs it". The simulator is
that second project. Every new device follows `src/blue11/AGENTS.md`: tests first, and listed
in the README as a departure from the original machine.

1. **Display spec:** [`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md), 64 × 64 pixels, a byte per
   pixel, two pages, a 16-colour RGB 3-3-3 palette, and a vertical-blank flag and interrupt.
   *Draft: the owner reviews it and answers its §9.*
2. **Keyboard spec** (`docs/BLUE11_KEYBOARD.md`): which keys are down (for games), and key
   presses and releases as scan codes queued with an interrupt, at `176700`. The console
   (DL11) stays the device for typed text. Input is recorded as (cycle, event), so a run can be
   replayed. Keyboard focus: the editor or the running program.
3. **Split the docs:** the library's parts of `BLUE11_CPU.md` (§1, §3–§5, §9, §11, §14.1–§14.3)
   become the machine spec that moves with the library. Rover's history and HackCode's notes
   stay here.
4. **Its own repository** (the owner creates `blue11`; this session can't): extract
   `src/blue11/`, `tests/blue11/`, `src/simulator/` and the new docs with their history
   (`git filter-repo`). Layout: npm workspaces `packages/blue11` (the library) and
   `apps/simulator`. Also: a license, `AGENTS.md`, CI (tests, build, Pages for the simulator,
   npm publish on a tag), an ESM build with types, the `blue11/codemirror` subpath with
   `@codemirror/*` as peer dependencies (the core keeps no dependencies), semver, and a
   CHANGELOG. The JSON form of the states counts as public API.
   **Done when:** version 0.1.0 is published and its tests pass in the new repository.
5. **HackCode uses the package:** depend on `blue11` 0.1, delete `src/blue11/` and
   `tests/blue11/`, update the imports, and update `AGENTS.md` (the layout table), `DESIGN.md`
   and `BLUE11_CPU.md` decision 19. **Done when:** HackCode's tests and build pass unchanged.
6. **The display in the library** (in the new repository): the `Display` device as in the spec,
   its tests (spec §10), a README section, and the departure listed.
7. **The keyboard in the library:** the same steps, from the step-2 spec.
8. **The simulator page:** editor (CodeMirror with the library's highlighting), assembler
   errors inline, registers and flags, memory and disassembly, breakpoints,
   step / run / pause, the console, the display on a canvas, the keyboard, and a speed slider
   (frames per second of wall time, never cycles per frame). It also has examples, programs
   saved in `localStorage` and shared by URL, and an input log for replays.
   **Done when:** every example program runs in the page, and the tests check the frames it
   draws.
9. **Later, if wanted:** display mode 1 (128 × 128 at 4 bpp), a shared UI package for the
   debugger panels HackCode and the simulator have in common (extracted only once both exist),
   and the display or keyboard in HackCode.

## 2. Blue-11 for players

Trim what has no job in the game and would only confuse (the library stays complete; this
is the game's side: `src/core/robot.ts`, help, lessons).

- ~~**Faults are reported, not a HALT at 0**~~ (done: a trap or interrupt with an empty
  vector stops the CPU, `src/ui/traps.ts` names the cause; DESIGN.md §4 "Traps").
- ~~**`BPT` is a breakpoint**~~ (done, by the same rule).
- ~~**Help:** `IOT`, `RTT`, `RESET`, `ADC`, `SBC` and the flag operations other than
  `CLC` / `SEC` moved to a last group, "Rarely needed"~~ (done).
- ~~**Branch names:**~~ kept as the code already used them: `BCS` / `BCC` to test C (after
  an `EMT`), `BLO` / `BHIS` after `CMP`. The help says they are one instruction (done).
- ~~**Assembler warnings:** a name alone on a line, and `*` or `/` after `+` or `-`
  without `< >`~~ (done, in the library).
- ~~`docs/BLUE11_CPU.md` banner~~ (it already had one).
- ~~`TRAP` in the interrupts lesson (lesson 7): writing a handler at 34~~ (done: the starter's
  `DRIVE` system call is a `TRAP` with nothing at 34, and it polls; the rules ask for `TRAP`).
- Kept on purpose: the console's keyboard side (`RCSR RBUF RCVVEC`), for later use.

## 3. Expedition

- ~~A seeded BSP dungeon generator, a reachability check, difficulty that rises with depth,
  and chargers placed in the generated maps~~ (done: `src/core/dungeon.ts`, DESIGN.md §8).
- ~~The expedition mode in the page: a seed, level after level, deeper each time~~ (done:
  `src/ui/expedition.ts`, "Expedition" in the picker; HP, energy and coins carried; a failed
  level is retried as entered; DESIGN.md §8 "In the page").
- The math chip, which unlocks EIS.
- **Done when:** 1000 seeds all generate solvable maps (this has a test).

## 4. Upgrades and the shop

- A shop after each exit: modules bought with coins, built in for the rest of the
  expedition; a module's registers are a bus hole until it is bought (DESIGN.md §8
  "Upgrades").
- The math chip in the shop as well as in the maps.
- Rangefinder, shield (all sides, no firing while up), repair (as the dock; a charger pays
  for it), overclock (more CPU cycles a tick, more drain), fast wheels.
- Help topics and symbols for each module, hidden until it is owned.
- **Done when:** a test expedition buys each module and a reference program uses it (the
  shield survives a sentry, repair at a charger restores full HP, overclock finishes a path
  search in fewer ticks).

## 5. More modules

Decoy beacon (chasers follow it for a while), cloak (monsters don't see the robot, heavy
drain), battery cell (more maximum energy), cartographer (the explored map into RAM by DMA).

## Later

Scoring (ticks, energy, coins), keyboard input on the console (`RCSR`, `RBUF`), a probe device for hacking monsters, kernel/user modes,
more monster kinds with other behaviours, cyberpunk effects (a glitch burst on damage, a
reticle when the sentry fires, scanlines over the map), more upgrades, and tuning of timings and costs
from play.
