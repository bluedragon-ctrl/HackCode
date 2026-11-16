# HackCode — Game Design

An educational browser game teaching assembly language. The player programs a robot in
Blue-11 assembly (a Macro-11 dialect, library in `src/blue11/`) and guides it through a
dungeon: fighting monsters, collecting loot, reaching the exit.

- **Audience:** young people interested in IT, with some prior IT knowledge.
- **Platform:** browser, TypeScript, built with Vite, hosted on GitHub Pages.
- **Modes:** (1) Lessons — hand-made maps teaching the language step by step;
  (2) Expedition — procedurally generated dungeon. Scoring: later.

Status: agreed design, v1 scope. Items marked *later* are out of scope for v1.

---

## 1. Architecture

```
src/blue11/   CPU, assembler, disassembler, device bus   (library: imports nothing from the game)
src/core/     simulation: world, entities, robot devices, ticks, dungeon generator, seeded RNG
              pure TypeScript, deterministic, no DOM — unit-tested
src/render/   PixiJS renderer (top-down 2D vector/neon look), behind a small interface
src/ui/       editor (CodeMirror 6), debugger panels, lesson flow
```

Determinism: all randomness from a seeded RNG; time is counted only in CPU cycles.
A run is reproducible from (seed, map, program, inputs).

## 2. World

Grid of cells. Each cell has two layers:

- **floor layer** — items lying on the ground (coins, pickups)
- **occupant layer** — at most one object (wall, monster, charger, robot, …)

### Object record — 4 bytes (2 words, little-endian)

| byte | field | notes |
|---|---|---|
| 0 | TYPE | 0 = nothing |
| 1 | HP | 0–255 |
| 2 | FLAGS | see below |
| 3 | LOOT | bits 7–4 loot type, bits 3–0 amount |

In memory: `word0 = TYPE | HP<<8`, `word1 = FLAGS | LOOT<<8`.

| FLAGS bit | meaning |
|---|---|
| 0 | mobile |
| 1 | hostile |
| 2 | solid (blocks movement) |
| 3 | opaque (blocks laser and scanner) |
| 4 | collectible (grabber can take it) |
| 5 | interactive (charger, repair station, door) |
| 6–7 | reserved |

Walls are destructible (e.g. `TYPE=1, HP=255, FLAGS=00001100`).

Monsters have additional **private state** (facing, cooldowns, AI state) in their own
machine's RAM; the 4-byte record is the public view returned by the scanner.

Coordinates are **absolute** (X east, Y south).

## 3. Execution model — deterministic ticks

- One game tick = N CPU cycles (Blue-11 `per-bus-access` cycle model).
- Order within a tick: **robot first, then monsters in ID order**, each executed sequentially.
- Physical actions take time: a device stays busy for K ticks (CSR READY clear) and
  **takes effect on completion**; collisions etc. are checked then.
- Actions cost energy. CPU time costs a small drain per tick while running, almost nothing
  while in `WAIT` (reward for interrupt-driven code).
- **The world only advances while the robot's CPU runs.** On HALT / pause the dungeon is frozen.

### Edit and continue

The player works console-style: short snippets first, automating more over time.

- **Run** — assemble, load, reset registers/PSW, PC = start, run. World, robot HP/energy/position
  and RAM persist between runs (a "clear RAM" option exists).
- **Continue** — resume a paused CPU; only allowed when code is unchanged since the last load.
- Debugger: step instruction, step tick, breakpoints, registers / PSW / memory views,
  disassembly with symbolic device names, execution heat map (`onInstruction`).

### Failure states

- Energy 0: devices refuse with ERROR "no power"; CPU keeps running.
- HALT: program ends, world pauses.
- Crash (odd address, bus error, double fault): run ends with register dump; reboot offered.
- HP 0: robot destroyed — run over.

## 4. Robot machine

### Memory map

| range | use |
|---|---|
| `000000–000377` | trap and interrupt vectors (not protected in v1) |
| `000400–137777` | RAM — user program and stack |
| `140000–157777` | ROM BIOS, written in Blue-11 assembly; writes → bus error |
| `1764xx` | robot devices (§5) |
| `177546` | KW11-L line clock |
| `177560` | DL11 console (debug printing) |

### Options

- EIS (`MUL DIV ASH ASHC`) **off at start**; unlocked by finding a math chip (*later*: more upgrades).
- `protectModes` off in v1 (*later*: kernel/user modes for hacking mechanics).

### BIOS

`EMT n` calls give beginners high-level actions (move, turn, fire, scan, grab). The BIOS is
itself Blue-11 code using only the raw device registers, so students can later read its source.

## 5. Devices (memory-mapped)

Common CSR layout:

| bit | meaning |
|---|---|
| 0 | GO (write 1 to start) |
| 3–1 | function |
| 6 | IE — interrupt enable |
| 7 | READY |
| 15 | ERROR (code in the device's error register) |

Devices (exact addresses and vectors to be fixed during implementation; vectors from `300`):

- **Wheels** — forward N cells, rotate left/right. Robot has a heading (N/E/S/W).
- **Laser** — straight beam up to 3 cells in heading direction, hits the first solid object,
  blocked by walls.
- **Scanner** — needs line of sight. Writes results into a buffer at a program-supplied
  address (bounds-checked; ERROR if invalid). Nearest first. Each result is 6 bytes:
  the object record + `word2 = DX | DY<<8` (signed bytes, absolute axes; `MOVB` sign-extends).
  A TYPE of 0 terminates the list.
- **Grabber** — picks up a collectible from the cell in front into an inventory slot.
- **Status** — read-only: HP, energy, X, Y, heading, coins.
- **Inventory** — 4 slots, memory-mapped, each a 4-byte object record.

## 6. Monsters

Each monster runs its own small `DeviceMachine` (2–4 KB RAM) with a behaviour script in
Blue-11 assembly, shared per TYPE, and its own sensor/actuator devices.
*Later:* a probe device to read and patch monster code ("hacking").

## 7. Lessons (mode 1)

Lessons start with octal. Decimal literals (`10.`) are used for "human" quantities.

0. Octal — 3-bit groups, why it fits PDP-11 instruction fields
1. `MOV`, registers; drive with `EMT`
2. Branches and loops — drive until blocked (`CMP`, `BEQ`, `BR`, `SOB`)
3. Bit tests on object flags (`BIT`, `BIC`, `BIS`)
4. Scanner buffer — iterate records (autoincrement, indexed modes)
5. Subroutines and the stack (`JSR`, `RTS`)
6. Raw device registers and polling
7. Interrupts, `WAIT` (advanced)

Each lesson: hand-made map, win condition checked by the simulation, hints, reference solution.

## 8. Expedition (mode 2)

Seeded procedural generation (BSP rooms + corridors), reachability check to the exit,
difficulty rising with depth. Scoring *later* (ticks, energy, coins).

## 9. Open items

- Assembler capabilities (decimal literals, macros, includes, error reporting) — pending
  review of `assembler.ts`.
- Relationship to the earlier "Rover" project referenced in the library.
- Exact device addresses, vectors, timings and energy costs.
