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
src/render/   top-down 2D renderer (vector/neon look) behind a small interface: Canvas 2D now, PixiJS later
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

| TYPE | object | layer | notes |
|---|---|---|---|
| 1 | wall | occupant | HP 255, solid, opaque |
| 2 | robot | occupant | HP 100, mobile, solid, opaque |
| 3 | exit | floor | |
| 4 | charger | occupant | interactive (*later*) |
| 10 | coin pile | floor | collectible; worth LOOT bits 3–0 coins |
| 11 | math chip | floor | collectible |
| 40 | patrol | occupant | monster (§6) |
| 41 | chaser | occupant | monster (§6) |
| 42 | sentry | occupant | monster (§6) |
| 43–77 | monsters | occupant | reserved |

LOOT types: 0 none, 1 coins (amount = bits 3–0), 2 math chip. A destroyed object leaves
its loot on the floor if the floor is free (coins on coins add up, at most 15).

Monsters have additional **private state** (facing, cooldowns, AI state) in their own
machine's RAM; the 4-byte record is the public view returned by the scanner.

Coordinates are **absolute** (X east, Y south).

**Map size: 15×15 cells** (`MAP_SIZE`), outer walls included, so X and Y run 0–16 (octal).
Lesson maps are at most this size and the expedition starts at it (deeper levels may grow
*later*, with a camera that follows the robot). The whole map fits on one screen beside the
editor; the odd size gives a centre cell, (7, 7). The grid itself allows up to 256×256.

Hand-made maps are text, one character per cell (`src/core/maps.ts`): `#` wall, `.` floor,
`E` exit, `$` one coin, `1`–`9` a coin pile, `C` math chip, `^ > v <` the robot and its
heading, `P` a patrol, `H` a chaser, `S` a sentry (monsters start facing north and get their IDs in reading
order). A plain map is won when the robot stands on the exit.

Randomness: the world has one seeded `Rng` (`WorldOptions.seed`, `MapOptions.seed`, default
0); each monster seeds its own from it as it is added, so a map and a seed give the same
monsters' behaviour every time.

## 3. Execution model — deterministic ticks

- One game tick = **200 CPU cycles** (`TICK_CYCLES`, Blue-11 `per-bus-access` cycle model).
- Order within a tick: **robot first, then monsters in ID order**, each executed sequentially:
  1. the robot's CPU runs to the end of the tick (an overshoot of one instruction is
     carried into the next tick);
  2. the CPU's energy drain for the tick is charged;
  3. the robot's busy devices count down; those due complete, in the order wheels, laser,
     scanner, grabber: effect applied, READY set, interrupt requested if IE;
  4. the monsters act, in ID order.
- Physical actions take time: a device stays busy for K ticks (CSR READY clear) and
  **takes effect on completion**; collisions etc. are checked then. An action started
  during tick t completes in step 3 of tick t + K − 1, however late in tick t it started.
  Device state therefore only changes between CPU slices, so the devices need no
  cycle-level `advance` / `nextEvent`; a CPU in `WAIT` with a busy, interrupt-enabled device
  sleeps to the end of the tick.
- Actions cost energy, charged when the action (or each cell of a move) starts.
- CPU drain, in 1/64 energy units: 1 per instruction executed plus 1 per tick. A busy loop
  (~65–200 instructions a tick) costs 1–3 energy a tick; a tick asleep in `WAIT` 1/64 —
  the reward for interrupt-driven code. Energy stops at 0.
- **The world only advances while the robot's CPU runs.** If the CPU stops mid-tick (HALT,
  breakpoint, a trap the host takes, double fault, or a `WAIT` no device can end), the tick
  stays open — the dungeon is frozen — and the next run finishes it.
- Debugger *step instruction* finishes the tick when it reaches the tick's end (asleep in
  `WAIT`, it sleeps to the end of the tick); stepping and running give the same world.

### Edit and continue

The player works console-style: short snippets first, automating more over time.

- **Run** — assemble, load, reset registers/PSW, PC = start, run. World, robot HP/energy/position
  and RAM persist between runs (a "clear RAM" option exists).
- **Continue** — resume a paused CPU; only allowed when code is unchanged since the last load.
- Debugger: step instruction, step tick, breakpoints, registers / PSW / memory views,
  disassembly with symbolic device names, execution heat map (`onInstruction`).
  Breakpoints are set in the editor gutter (or F9) and stop *before* their instruction;
  Continue and Step tick pass a breakpoint at the PC, a fresh Run stops on one. Clicking a
  disassembly row sets one there too, which is how to stop inside the BIOS. The heat map
  counts instructions per address since the last load and shows per source line. The
  memory view takes an octal address, a label, a device name or a register (default SP).
  Assembler errors are shown on their lines.

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
| `176400–176477` | robot devices (§5) |
| `177546` | KW11-L line clock, vector 100: ticks once per game tick of CPU time (200 cycles) |
| `177560–177566` | DL11 console (debug printing), vectors 60 / 64 |

Everything else in `160000–177777` is a hole (bus error, trap to 4).

**Run** (load) copies the program into RAM (it must fit below `140000`), resets registers,
PSW and devices (as `RESET`: actions in progress are abandoned), sets PC = start and
SP = origin. RAM, the world and time persist; "clear RAM" zeroes RAM first.

### Options

- EIS (`MUL DIV ASH ASHC`) **off at start**; unlocked by finding a math chip (*later*: more upgrades).
- `protectModes` off in v1 (*later*: kernel/user modes for hacking mechanics).

### BIOS

`EMT n` calls give beginners high-level actions. The BIOS is itself Blue-11 code using only
the raw device registers, in ROM from `140000`; its source (`src/core/bios.ts`) is shown to
the player (the BIOS button) for later lessons.

| call | `EMT` | in | out on success |
|---|---|---|---|
| `MOVE` | 0 | R0 = cells forward | R0 = 0 |
| `BACK` | 1 | R0 = cells back | R0 = 0 |
| `LEFT` / `RIGHT` | 2 / 3 | – | R0 = 0 |
| `FIRE` | 4 | – | R0 = distance of the hit, 0 = none |
| `SCAN` | 5 | R0 = buffer, R1 = length (all objects) | R0 = buffer |
| `GRAB` | 6 | – | R0 = inventory slot, or −1 for coins |
| `DROP` | 7 | R0 = slot | R0 = 0 |
| `PRINT` | 10 | R0 = `.ASCIZ` text | R0 = 0 (on the console) |
| `AIM` | 11 | R0 = DX \| DY<<8 (as in a scan record) | R0 = steps to the hit, 0 = none |

Conventions (as RT-11's system calls):

- **Success clears C; failure sets C and R0 = the device's error code** (`ER.BLK`, …), so
  `BCS` right after the `EMT` catches it. An unknown call number fails with `ER.FN`.
- **Every register except R0 is kept**, and the stack is balanced (the caller's PSW comes
  back by `RTI`, with only C changed).
- A call **waits for its device**: first until it is idle (a program may have left it busy),
  then until the action is done, by polling READY. It writes the CSR without IE, so that
  device's interrupts are off afterwards. Polling costs energy like any loop; interrupts and
  `WAIT` are the cheaper, advanced way (lesson 7).
- The **EMT vector** (`030`) is set on every load to the BIOS entry with PSW 0 (priority 0),
  before the program is copied in, so a program may install its own EMT handler.
- The call names are predefined symbols, so they cannot be used as labels.

## 5. Devices (memory-mapped)

Common CSR layout:

| bit | meaning |
|---|---|
| 0 | GO (write 1 to start) |
| 3–1 | function |
| 6 | IE — interrupt enable |
| 7 | READY |
| 15 | ERROR (code in the device's error register) |

Writable CSR bits are GO, function and IE; READY and ERROR are read-only, the high byte
takes no writes. GO while READY starts the function (clears READY, ERROR and the error
register); GO while busy is ignored, and so are function changes. Setting IE while READY
requests an interrupt at once, clearing IE withdraws a pending one. Invalid requests (bad
function, bad argument, not enough energy) fail at once: READY and ERROR set, no time
taken. Interrupts are at bus level 4. Power-up and `RESET`: READY, no error, idle.

Every action device has its CSR at +0 and its **error register** at +2:

| code | name | meaning |
|---|---|---|
| 1 | `ER.PWR` | not enough energy ("no power") |
| 2 | `ER.FN` | no such function |
| 3 | `ER.BLK` | way blocked (wheels), no room to drop (grabber) |
| 4 | `ER.ADR` | scanner buffer odd, shorter than 2 bytes, or not entirely in RAM |
| 5 | `ER.NON` | nothing to take |
| 6 | `ER.FUL` | inventory full |
| 7 | `ER.ARG` | bad argument (wheel count 0, drop slot out of range or empty, laser target outside the arc or range) |

| device | registers | vector | functions | ticks | energy |
|---|---|---|---|---|---|
| Wheels | `176400 WHLCSR`, `176402 WHLERR`, `176404 WHLCNT` | 300 | 0 forward, 1 left, 2 right, 3 back | 4 per cell, turn 2 | 5 per cell, turn 2 |
| Laser | `176410 LSRCSR`, `176412 LSRERR`, `176414 LSRDST`, `176416 LSRTGT` | 304 | 0 fire, 1 aim | 3 | 20 |
| Scanner | `176420 SCNCSR`, `176422 SCNERR`, `176424 SCNBUF`, `176426 SCNLEN` | 310 | 0 all, 1 no walls | 2 | 3 |
| Grabber | `176430 GRBCSR`, `176432 GRBERR`, `176434 GRBSLT` | 314 | 0 grab, 1 drop | 2 | 2 |
| Status | `176440 STHP`, `STNRG`, `STX`, `STY`, `STHDG`, `176452 STCOIN` | – | read-only | | |
| Inventory | `176460 INV`: 4 slots × 4 bytes, to `176477` | – | read-only | | |

- **Wheels** — forward / back `WHLCNT` cells without turning (one cell per 4 ticks,
  `WHLCNT` counts down; count 0 → `ER.ARG`), rotate left/right. Robot has a heading
  (0 N, 1 E, 2 S, 3 W). Any occupant or the edge of the map blocks: the move stops with
  `ER.BLK` and `WHLCNT` keeps the cells left. Floor items don't block. Energy is charged
  per cell as it starts; running out mid-move stops with `ER.PWR`.
- **Laser** — straight beam up to 3 cells in heading direction; stops at the first solid
  or opaque occupant (walls included) and does 40 damage. `LSRDST` = distance of the hit,
  0 = nothing hit. At 0 HP the object is destroyed and drops its loot.
  **Aim** fires at the cell `LSRTGT = DX | DY<<8` (signed bytes, absolute axes — the
  scanner record's `word2`, so it can be copied straight in; latched at GO). The target
  must lie in the 90° arc ahead (forward distance > 0 and ≥ the sideways distance) and
  within dx² + dy² ≤ 9, else `ER.ARG` at once, with no energy spent. The beam follows the
  scanner's Bresenham line and ends at the target cell; the first solid or opaque occupant
  on the way takes the hit. `LSRDST` = steps along the line to it (compare with
  max(|DX|, |DY|) to tell whether the target itself was hit), 0 = nothing hit.
- **Scanner** — needs line of sight (Bresenham line; opaque occupants in between block;
  the target itself may be opaque). Range: dx² + dy² ≤ 25. Writes results into RAM at
  `SCNBUF` (`SCNLEN` bytes; both latched at GO; bounds-checked, `ER.ADR`). Nearest first
  (by dx² + dy², then DY, DX; an occupant before the floor item of its cell; the robot
  itself is left out, the floor under it is not). Each result is 6 bytes: the object
  record + `word2 = DX | DY<<8` (signed bytes, absolute axes; `MOVB` sign-extends).
  A TYPE of 0 terminates the list. At most `(SCNLEN − 2) / 6` records are written, then
  the terminator word; nothing beyond is touched.
- **Grabber** — grab: takes the occupant in front if it is collectible, else the floor
  item in front if collectible (`ER.NON` otherwise). Coins add to the coin counter;
  anything else goes into the first free inventory slot (`ER.FUL` if none), whose number
  is then in `GRBSLT`. Drop: puts slot `GRBSLT` (0–3) on the floor in front (`ER.ARG` if
  empty or out of range, `ER.BLK` if the floor there is taken or outside).
- **Status** — read-only: HP, energy (max 10000.), X, Y, heading, coins. Writes ignored.
- **Inventory** — 4 slots, memory-mapped, each a 4-byte object record. Writes ignored.

The player gets all these names (and `CS.GO CS.FN CS.IE CS.RDY CS.ERR`, the function
codes pre-shifted to bits 3–1 — `WH.FWD WH.LFT WH.RGT WH.BAK LS.FIR LS.AIM SC.ALL SC.NWL GR.GRB
GR.DRP` —, the vectors `WHLVEC LSRVEC SCNVEC GRBVEC LKSVEC RCVVEC XMTVEC`, the error codes,
headings `H.N H.E H.S H.W`, types `T.WALL T.ROBO T.EXIT T.CHRG T.COIN T.CHIP`, flags
`F.MOB F.HOST F.SOLD F.OPAQ F.COLL F.INTR`, monster types `T.PTRL T.CHSR T.SNTR`, and `LKS RCSR RBUF XCSR XBUF PSW`) as
predefined symbols: `src/core/symbols.ts`. Example: `MOV #WH.RGT!CS.GO!CS.IE, @#WHLCSR`.

## 6. Monsters

Each monster is an `Actor` (`src/core/monster.ts`) running its own small `DeviceMachine`
with a behaviour script in Blue-11 assembly, shared per TYPE, and its own sensor and motor.
The scripts are assembled with their own prelude (`MONSTER_SYMBOLS`), the way the BIOS is,
and written to be read: players will hack them later.

| range | use |
|---|---|
| `000000–007777` | 4 KB RAM: script from `1000`, stack below it |
| `176400 MOTCSR`, `176402 MOTERR` | motor, vector 300 (`MOTVEC`): the common CSR layout (§5) |
| `176410 LSRCSR`, `LSRERR`, `LSRDST` | laser, only for kinds that have one, vector 304 (`LSRVEC`): as the robot's |
| `176440 MYX`, `MYY`, `MYHDG`, `MYHP` | sensor, read-only: its own position, heading, HP |
| `176450 SEE`, `RBTDX`, `RBTDY` | 1 when the robot is in sight; then the robot's offset (signed) |
| `176456 AHEAD` | TYPE of the occupant in front (`T.WALL` at the edge) |
| `176460 RANDOM` | a new random number at each read, from the monster's seeded `Rng` |

- **Motor** functions `MO.FWD` (one cell), `MO.LFT`, `MO.RGT`, `MO.BAK`; ticks per cell and
  per turn depend on the kind. Effects on completion, as the robot's wheels: a blocked move
  fails with `ER.BLK`. Monsters use no energy.
- **Sight** is the robot scanner's: dx² + dy² ≤ 25 and a line of sight.
- **Tick:** after the robot's devices, in ID order, each monster's CPU runs 200 cycles (an
  overshoot is carried over), then its motor and laser count down and complete. A monster
  that halts, crashes or sleeps with nothing to wake it stands still; the world goes on.
- **Contact damage** is the close-up attack: a monster moving into the robot bites it for
  the kind's contact damage (the move fails with `ER.BLK`). The robot walking into a monster
  is just blocked.
- **Monster laser** is the ranged attack: `LS.FIR` fires along the heading when it completes
  (after the kind's fire ticks), with the robot's beam rules (the first solid or opaque
  occupant is hit, walls and other monsters too; `LSRDST` = distance). Then it stays busy
  reloading; READY comes back after the kind's reload ticks.
- **Laser damage:** the robot's laser (40) damages monsters like any object; at 0 HP the
  monster is destroyed (`World.damage` destroys the actor in that cell, which stops acting)
  and drops its loot.

| kind | `TYPE` | map | HP | contact | ticks per cell / turn | loot | script |
|---|---|---|---|---|---|---|---|
| patrol | 40 `T.PTRL` | `P` | 40 | 10 | 4 / 1 | 2 coins | walk ahead until blocked, then turn right |
| chaser | 41 `T.CHSR` | `H` | 80 | 20 | 6 / 1 | 5 coins | step towards the robot in sight along the longer axis; else wander at random |
| sentry | 42 `T.SNTR` | `S` | 40 | – | – / 1 | 3 coins | stand still; when the robot is in its row or column within laser reach, face it and fire |

The sentry's laser: 15 damage, 3 cells, 3 ticks to fire, 6 to reload (one shot per 9 ticks).
The chaser is slower than the robot (4 ticks per cell), so the robot can get away; walls
give cover from a sentry, and one robot shot (40) destroys it.
*Later:* more kinds with other behaviours.
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

## 9. Assembler notes (from `src/blue11/README.md`)

- Octal by default, `10.` decimal, `'A` characters, local labels `1$`, expressions.
- **No macros, no includes.** Device register names and BIOS call numbers are given to
  the player through `assemble(..., { symbols })` — a predefined "prelude" (`WHLCSR`,
  `SCNBUF`, …), shown in the lesson help.
- Names are limited to 6 characters (`names: 'dec'`), as on the original — keep it for
  authenticity; device names must fit.
- Errors come back with line and column: shown inline in the CodeMirror editor.

## 10. Open items

- Chargers,
  unlocking EIS with the math chip. Timings and energy costs are first guesses, to be
  tuned in play.
