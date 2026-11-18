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

1. **Display spec:** [`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md). Two modes in a 16 KB window:
   mode 0 is 64 × 64 at a byte per pixel (4 pages), mode 1 is 128 × 128 at 4 bits per pixel
   (2 pages). Both use a 16-colour RGB 3-3-3 palette, with a vertical-blank flag and interrupt,
   and an optional scanning beam that tears. An 8 × 8 font and the routines that draw it are in
   the simulator's ROM. *Decided (2026-11-18).*
2. **Keyboard spec:** [`BLUE11_KEYBOARD.md`](BLUE11_KEYBOARD.md). Key codes are positions on
   a US keyboard, with letters and digits as ASCII. A key map has one byte per key at `177000`
   (`200` = down). An event queue of 16 presses and releases (`KBDCS`, `KBDBUF` at `176700`)
   interrupts at vector `330`. Exact replays come from an input log of (cycle, event). The DL11
   console stays the device for typed text. *Decided (2026-11-18).*
3. ~~**Split the docs**~~ (done, 2026-11-18): [`BLUE11_MACHINE.md`](BLUE11_MACHINE.md) is the
   machine's design (principle, assembler, cycles, flags, traps and interrupts, multiply and
   divide, departures, the library's boundary). It moves with the library. `BLUE11_CPU.md` stays
   here as Rover's history, and its library sections point to the new document.
4. ~~**Its own repository**~~ (done, 2026-11-18):
   [bluedragon-ctrl/Blue11](https://github.com/bluedragon-ctrl/Blue11). The library moved there
   with its history, as npm workspaces with the package `blue11` (MIT licence, a build to ESM and
   types, CI, publishing to npm on a tag). From here on, the library's steps (publishing 0.1.0,
   the display, the keyboard, the simulator) are tracked in its own `docs/ROADMAP.md`.
   **Still to do:** the owner adds the `NPM_TOKEN` secret and pushes the tag `v0.1.0`.
5. **HackCode uses the package:** depend on `blue11` 0.1, delete `src/blue11/`,
   `tests/blue11/`, `src/simulator/` and the copies of `BLUE11_MACHINE.md`, `BLUE11_DISPLAY.md`
   and `BLUE11_KEYBOARD.md` (their home is Blue-11 now), update the imports and links, and
   update `AGENTS.md` (the layout table), `DESIGN.md`
   and `BLUE11_CPU.md` decision 19. **Done when:** HackCode's tests and build pass unchanged.
6. **Steps 6–9 moved to Blue-11's roadmap:** the display and keyboard devices, the simulator,
   and the later options.

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
