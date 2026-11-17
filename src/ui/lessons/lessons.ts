/**
 * The lessons (DESIGN.md §7), in order. Numbers in the text are octal unless written with
 * a dot (`12.`), as in the game. Every solution wins its map, the starters assemble, and
 * the mistakes a lesson is about lose: tests/ui/lessons.test.ts.
 */

import { CHARGE_RATE, COST, ENERGY_MAX, TICKS } from '../../core';
import { code, dec, h, list, note, p, table } from '../help/model';
import { EXIT_GOAL, exitWithCoins, exitWithEnergy, type Lesson } from './model';

// ------------------------------------------------------------------ 0 — octal

const octalLesson: Lesson = {
  id: 'octal', number: 0, title: 'Counting in octal',
  map: `
###############
#>............#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############E#
###############
`,
  goal: EXIT_GOAL,
  briefing: [
    p('Your robot runs a program in **Blue-11 assembly**. This one is almost right: it drives the robot along the corridor. '
      + 'Press **Run** (Ctrl+Enter) and watch where it stops.'),
    p('It stops short, because **numbers are octal** here: base 8, with the digits 0 to 7. '
      + 'After 7 comes `10` (eight), and `12` is one eight and two: ten.'),
    table(['decimal', '0–7', '8.', '9.', '10.', '12.', '16.', '64.'], [['octal', '0–7', '10', '11', '12', '14', '20', '100']]),
    p('Why octal? The machine has 16-bit words, and its instructions are cut into fields of **3 bits**: '
      + 'a register number (R0–R7) or an addressing mode (0–7) fits in one octal digit. `MOV R1, R2` is `010102`: '
      + 'the instruction `01`, then mode 0 and register 1, then mode 0 and register 2.'),
    p('A number with a dot is decimal: `12.` is twelve. Use whichever you like, but know which one you wrote.'),
    h('Your task'),
    list(
      'The corridor runs twelve cells east, then eight cells south to the exit.',
      'Fix the count of the first move, then add a turn to the right and the move south.',
    ),
    note('Press **F1** on any word in the editor for its help, or rest the mouse on it.'),
  ],
  starter: `; Lesson 0: drive along the corridor to the exit.
; The first leg is twelve cells east... or is it?

        MOV #12, R0     ; cells to go
        EMT MOVE        ; drive R0 cells forward
        ; then turn right (EMT RIGHT) and drive eight cells south

        HALT
`,
  hints: [
    'Count the cells on the map: the robot has to go twelve cells (decimal) east. In octal, twelve is one eight and four: `14`.',
    'Eight is `10` in octal. `8` on its own is not an octal number at all: the assembler says so.',
    'After `EMT RIGHT`, set R0 again: `MOV #10, R0`, then `EMT MOVE`.',
  ],
  solution: `; Lesson 0: drive along the corridor to the exit.

        MOV #14, R0     ; 14 octal = 12. cells east
        EMT MOVE
        EMT RIGHT
        MOV #10, R0     ; 10 octal = 8. cells south
        EMT MOVE
        HALT
`,
};

// ------------------------------------------------------------------ 1 — MOV, registers, EMT

const registersLesson: Lesson = {
  id: 'registers', number: 1, title: 'Registers and BIOS calls',
  map: `
###############
#>...##########
####.##########
####.##########
####....#######
#######.#######
#######.#######
#######....####
##########.####
##########.####
##########....#
#############.#
#############.#
#############E#
###############
`,
  goal: EXIT_GOAL,
  briefing: [
    p('The CPU has eight **registers**, R0 to R7: fast 16-bit stores inside the processor. R6 is the stack pointer '
      + '`SP` and R7 the program counter `PC`; R0 to R5 are yours. See [registers](registers).'),
    p('`MOV src, dst` copies a value: **source first**. `MOV #3, R0` puts the number 3 into R0; '
      + '`MOV R1, R0` copies R1 into R0.'),
    p('`EMT` calls the robot\'s [BIOS](bios), the built-in routines that drive it. '
      + 'The BIOS takes its argument in R0 and gives its **result in R0** too: after `EMT MOVE`, R0 is 0 (all went well). '
      + 'It keeps every other register as it was.'),
    table(['call', 'does'], [
      ['`EMT MOVE`', 'drive R0 cells forward'],
      ['`EMT LEFT`, `EMT RIGHT`', 'turn on the spot'],
      ['`EMT BACK`', 'drive R0 cells backwards, without turning'],
    ]),
    h('Your task'),
    p('The stairs go three cells east, three south, three east, … down to the exit. The starter program has a bug: '
      + 'run it, and look at R0 in the **CPU** panel after the first move. Then keep the 3 in R1 and copy it into R0 '
      + 'before each move.'),
  ],
  starter: `; Lesson 1: down the stairs to the exit.

        MOV #3, R0
        EMT MOVE        ; three cells east
        EMT RIGHT
        EMT MOVE        ; three cells south... or not?
        HALT
`,
  hints: [
    'After `EMT MOVE`, R0 is 0: the BIOS put its result there. A move of 0 cells is an error.',
    'Put the 3 into R1 once (`MOV #3, R1`), then `MOV R1, R0` before every `EMT MOVE`. The BIOS keeps R1.',
    'The turns alternate: right (to face south), then left (to face east again).',
  ],
  solution: `; Lesson 1: down the stairs to the exit.

        MOV #3, R1      ; every step is three cells
        MOV R1, R0
        EMT MOVE        ; east
        EMT RIGHT
        MOV R1, R0
        EMT MOVE        ; south
        EMT LEFT
        MOV R1, R0
        EMT MOVE
        EMT RIGHT
        MOV R1, R0
        EMT MOVE
        EMT LEFT
        MOV R1, R0
        EMT MOVE
        EMT RIGHT
        MOV R1, R0
        EMT MOVE
        EMT LEFT
        MOV R1, R0
        EMT MOVE
        EMT RIGHT
        MOV R1, R0
        EMT MOVE
        HALT
`,
};

// ------------------------------------------------------------------ 2 — branches and loops

const loopsLesson: Lesson = {
  id: 'loops', number: 2, title: 'Branches and loops',
  map: `
###############
#>............#
#############.#
#...........#.#
#.#########.#.#
#.#.......#.#.#
#.#.#####.#.#.#
#.#.#..E#.#.#.#
#.#.#.###.#.#.#
#.#.#.....#.#.#
#.#.#######.#.#
#.#.........#.#
#.###########.#
#.............#
###############
`,
  goal: EXIT_GOAL,
  rules: { maxWords: 10 },
  briefing: [
    p('The exit is in the middle of a spiral. Writing every move out would take a long program, and this lesson allows '
      + 'only **12** (ten) words of instructions. You need a **loop**.'),
    p('Every instruction sets the **condition codes** in the PSW: N (negative), Z (zero), V (overflow), C (carry). '
      + 'A **branch** jumps, or not, by them:'),
    table(['branch', 'jumps when'], [
      ['`BR label`', 'always'],
      ['`BEQ` / `BNE`', 'the result was zero / not zero (Z)'],
      ['`BCS` / `BCC`', 'C is set / clear: a BIOS call **failed** / succeeded'],
      ['`BMI` / `BPL`', 'the result was negative / not (N)'],
    ]),
    p('`CMP a, b` compares (it computes a − b and only keeps the flags): `CMP R1, #5` then `BEQ` jumps when R1 is 5. '
      + '`SOB R1, label` subtracts 1 from R1 and jumps back while it is not zero: a counted loop.'),
    code(`
      MOV #4, R1
      LOOP:   EMT RIGHT       ; turn four times
              SOB R1, LOOP
    `),
    p('A BIOS call that fails sets C and stops: `EMT MOVE` with a big R0 drives until something is in the way.'),
    h('Your task'),
    p('Drive into the middle of the spiral, in at most 12 words. Each instruction is one to three words; the '
      + '**Run** status tells you how many you have.'),
  ],
  starter: `; Lesson 2: into the middle of the spiral, with a loop.

LOOP:   MOV #1, R0
        EMT MOVE        ; one cell; C is set if the way is blocked
        ; ...and when it is blocked?
        BR LOOP
`,
  hints: [
    'Follow the wall: drive forward until blocked, then turn right, and do it again.',
    'After `EMT MOVE`, `BCC LOOP` jumps back when the move worked. When it fell through, the way is blocked: turn.',
    'Shorter still: `MOV #100, R0` and `EMT MOVE` drive until blocked in one call. Then `EMT RIGHT` and `BR` back.',
  ],
  solution: `; Lesson 2: into the middle of the spiral, with a loop.
; Drive until something is in the way, turn right, and again.

LOOP:   MOV #100, R0    ; far: the move stops where it is blocked
        EMT MOVE
        EMT RIGHT
        BR LOOP
`,
};

// ------------------------------------------------------------------ 3 — bit tests on flags

const bitsLesson: Lesson = {
  id: 'bits', number: 3, title: 'Bits and flags',
  map: `
#####
##E##
##$##
##.##
##S##
##.##
##.##
##2##
##.##
##S##
##.##
##$##
##.##
##^##
#####
`,
  goal: exitWithCoins(10),
  briefing: [
    p('Coins lie in the corridor, and two **sentries** guard it. A sentry shoots along its row and column; '
      + 'one laser shot destroys it, and it leaves coins behind.'),
    p('`EMT SCAN` writes what the robot sees into memory, nearest first. In this corridor the first record is '
      + 'always what is **right in front** of the robot (or the side wall, if nothing is). Each record is 6 bytes:'),
    table(['byte', 'what'], [
      ['0', 'TYPE (`T.WALL`, `T.COIN`, `T.SNTR`, …)'],
      ['1', 'HP'],
      ['2', '**FLAGS**: one bit for each property'],
      ['3', 'LOOT'],
      ['4, 5', 'DX, DY: where it is, from the robot'],
    ]),
    p('The flag bits have names: `F.SOLD` (solid: blocks the way), `F.HOST` (hostile), `F.COLL` (collectible: '
      + '`EMT GRAB` can take it), `F.OPAQ`, `F.MOB`, `F.INTR`. See [the world](world).'),
    p('`BITB #F.HOST, BUF+2` tests one bit of the flags byte: it **ands** the two and keeps only the flags, so '
      + '`BNE` jumps when the bit is set. `BIS` sets bits, `BIC` clears them: `BIC #177400, R0` keeps the low byte.'),
    h('Your task'),
    p('Go up the corridor: in front of something hostile, `EMT FIRE`; in front of something collectible, '
      + '`EMT GRAB`; else one cell forward. Collect all 12 (ten) coins, the sentries\' too, then reach the exit.'),
  ],
  starter: `; Lesson 3: up the corridor. Shoot what is hostile, take what you can.

LOOP:   MOV #BUF, R0    ; where SCAN writes
        MOV #10, R1     ; 10 bytes: one record and the end mark
        EMT SCAN
        ; BUF+2 is the FLAGS byte of what is in front: test it here

        MOV #1, R0
        EMT MOVE
        BR LOOP

BUF:    .BLKW 4
`,
  hints: [
    '`BITB #F.HOST, BUF+2` and then `BNE SHOOT` jumps when what is in front is hostile.',
    'Test `F.COLL` the same way and jump to an `EMT GRAB`. After shooting or grabbing, scan again: `BR LOOP`.',
    'A destroyed sentry leaves its coins on the floor in front: the next scan sees them.',
  ],
  solution: `; Lesson 3: up the corridor. Shoot what is hostile, take what you can.

LOOP:   MOV #BUF, R0
        MOV #10, R1     ; one record and the end mark
        EMT SCAN
        BITB #F.HOST, BUF+2
        BNE SHOOT       ; hostile: shoot it
        BITB #F.COLL, BUF+2
        BNE TAKE        ; collectible: take it
        MOV #1, R0      ; else one cell forward
        EMT MOVE
        BR LOOP
SHOOT:  EMT FIRE
        BR LOOP
TAKE:   EMT GRAB
        BR LOOP

BUF:    .BLKW 4
`,
};

// ------------------------------------------------------------------ 4 — the scanner buffer

const scanLesson: Lesson = {
  id: 'scan', number: 4, title: 'Reading the scanner',
  map: `
###############
#.............#
#.##.......##.#
#.#.........#.#
#......$......#
#.............#
#..#.......#..#
#.......E.....#
#.............#
#.$...........#
#.............#
#....^........#
#.#.........#.#
#.............#
###############
`,
  goal: EXIT_GOAL,
  briefing: [
    p('A real robot does not get a map. Find the exit with the **scanner**, and drive there.'),
    p('`EMT SCAN` (R0 = a buffer, R1 = its length in bytes) writes a 6-byte record for everything in sight, '
      + 'nearest first, and a TYPE of 0 after the last. Bytes 4 and 5 of a record are **DX** and **DY**: how far the '
      + 'thing is east and south of the robot (negative: west, north).'),
    h('Walking through memory'),
    p('Keep the address of the current record in a register and read through it: [addressing modes](addressing).'),
    table(['mode', 'means'], [
      ['`(R1)`', 'the word or byte at the address in R1'],
      ['`(R1)+`', 'the same, then R1 moves on (by 1 for a byte, 2 for a word)'],
      ['`4(R1)`', 'at the address R1 + 4: byte 4 of the record'],
    ]),
    p('`MOVB` moves a byte and extends its sign: a DY of −4 (byte `374`) becomes the word `177774`, '
      + 'so `BMI` and `NEG` work on it. `CMPB R2, #T.EXIT` compares a byte.'),
    code(`
      MOV #BUF, R1
      NEXT:   MOVB (R1), R2       ; TYPE of this record
              BEQ DONE            ; 0: the end of the list
              ADD #6, R1          ; on to the next record
              BR NEXT
      DONE:   BR DONE
      BUF:    .BLKW 10
    `),
    h('Your task'),
    p('Scan, find the record whose TYPE is `T.EXIT`, then drive DY cells north or south and DX cells east or west. '
      + 'The robot faces north: `EMT BACK` drives south without turning. Do not count the cells on the map: '
      + 'the program should find the exit wherever it is.'),
  ],
  starter: `; Lesson 4: find the exit with the scanner, and drive there.

        MOV #BUF, R0
        MOV #BUFLEN, R1
        EMT SCAN        ; one 6-byte record per thing in sight

        MOV #BUF, R1    ; R1 = the first record
        ; look for the record with TYPE = T.EXIT ...

STUCK:  BR STUCK

BUFLEN = 400            ; bytes: room for 52. records
BUF:    .BLKB BUFLEN
`,
  hints: [
    'Loop: `MOVB (R1), R2`, `CMPB R2, #T.EXIT`, `BEQ FOUND`, `ADD #6, R1`, `BR` back. Stop at a TYPE of 0 too.',
    'At FOUND, `MOVB 5(R1), R0` is DY. Negative (`BMI`): `NEG R0` and `EMT MOVE` (north). Positive: `EMT BACK` (south).',
    'Keep DX in R2 (`MOVB 4(R1), R2`): the BIOS keeps it while you drive. Then turn right (east) or left (west) and drive |DX|.',
  ],
  solution: `; Lesson 4: find the exit with the scanner, and drive there.

        MOV #BUF, R0
        MOV #BUFLEN, R1
        EMT SCAN

        MOV #BUF, R1
FIND:   MOVB (R1), R2   ; TYPE
        BEQ STUCK       ; the end: no exit in sight
        CMPB R2, #T.EXIT
        BEQ FOUND
        ADD #6, R1      ; the next record
        BR FIND

FOUND:  MOVB 4(R1), R2  ; DX: east is positive
        MOVB 5(R1), R0  ; DY: south is positive
        BEQ 2$
        BPL 1$
        NEG R0
        EMT MOVE        ; north
        BR 2$
1$:     EMT BACK        ; south, still facing north

2$:     TST R2
        BEQ STUCK
        BPL 3$
        EMT LEFT        ; face west
        NEG R2
        BR 4$
3$:     EMT RIGHT       ; face east
4$:     MOV R2, R0
        EMT MOVE

STUCK:  BR STUCK

BUFLEN = 400
BUF:    .BLKB BUFLEN
`,
};

// ------------------------------------------------------------------ 5 — subroutines and the stack

const subroutinesLesson: Lesson = {
  id: 'subroutines', number: 5, title: 'Subroutines and the stack',
  map: `
###############
####$##$##$####
#>...........E#
####$##$##$####
###############
`,
  goal: exitWithCoins(6),
  rules: { uses: ['JSR', 'RTS'] },
  briefing: [
    p('Six coins lie in alcoves on both sides of the corridor. Taking a pair is always the same: turn left, grab, '
      + 'turn round, grab, turn left again. Write it once, as a **subroutine**, and call it three times.'),
    p('`JSR PC, PICK` jumps to PICK and remembers where it came from; `RTS PC` at the end of PICK goes back there. '
      + 'The return address is kept on the **stack**: memory that SP (R6) points into. See [the stack](stack).'),
    table(['instruction', 'does'], [
      ['`MOV R1, -(SP)`', '**push**: SP goes down by 2, then R1 is written there'],
      ['`MOV (SP)+, R1`', '**pop**: R1 is read from there, then SP goes up by 2'],
      ['`JSR PC, sub`', 'push the address of the next instruction, jump to sub'],
      ['`RTS PC`', 'pop it into PC: back after the JSR'],
    ]),
    p('A subroutine may call another one: each JSR pushes, each RTS pops, in the right order. '
      + 'Look at the **Memory** panel (it shows SP) while you step through.'),
    h('Your task'),
    p('Collect all six coins and reach the exit, with a subroutine (`JSR` and `RTS`).'),
  ],
  starter: `; Lesson 5: three pairs of coins, one subroutine.

        MOV #3, R0
        EMT MOVE        ; to the first pair of alcoves
        JSR PC, PICK
        ; ...on to the next pairs, and the exit
        HALT

; PICK: take the coins on the left and on the right.
PICK:   EMT LEFT
        EMT GRAB
        ; ...
        RTS PC
`,
  hints: [
    'In PICK: `EMT LEFT`, `EMT GRAB`, `EMT RIGHT`, `EMT RIGHT`, `EMT GRAB`, `EMT LEFT`, `RTS PC`.',
    'The pairs are three cells apart, and the exit is three cells after the last pair.',
    'A loop around the call: `MOV #3, R4` before it, `SOB R4, label` after. The BIOS keeps R4.',
  ],
  solution: `; Lesson 5: three pairs of coins, one subroutine.

        MOV #3, R4      ; three pairs
1$:     MOV #3, R0
        EMT MOVE
        JSR PC, PICK
        SOB R4, 1$
        MOV #3, R0
        EMT MOVE        ; to the exit
        HALT

; PICK: take the coins on the left and on the right.
PICK:   EMT LEFT
        JSR PC, TAKE
        EMT RIGHT
        EMT RIGHT
        JSR PC, TAKE
        EMT LEFT
        RTS PC

; TAKE: grab what is in front; a subroutine called by a subroutine.
TAKE:   EMT GRAB
        RTS PC
`,
};

// ------------------------------------------------------------------ 6 — raw device registers

const devicesLesson: Lesson = {
  id: 'devices', number: 6, title: 'Device registers',
  map: `
###############
#>...........##
############.##
############.##
############.##
###E.........##
###############
`,
  goal: EXIT_GOAL,
  rules: { forbids: ['EMT'] },
  briefing: [
    p('The BIOS is only a program: it drives the robot by writing to **device registers**, memory addresses that '
      + 'are wired to the hardware. This time you do it yourself: no `EMT`. Read the BIOS with the **BIOS** button.'),
    p('The wheels have three registers. See [device registers](devices).'),
    table(['register', 'what'], [
      ['`WHLCSR`', 'control and status: write a function and `CS.GO` to start; bit 7 `CS.RDY` is set when done, bit 15 `CS.ERR` on an error'],
      ['`WHLERR`', 'the error code, after an error'],
      ['`WHLCNT`', 'cells to drive; counts down while driving'],
    ]),
    p('Functions: `WH.FWD`, `WH.LFT`, `WH.RGT`, `WH.BAK`. Start, then **poll** (read again and again) until READY:'),
    code(`
              MOV #5, @#WHLCNT            ; five cells
              MOV #WH.FWD!CS.GO, @#WHLCSR ; start forward
      1$:     TSTB @#WHLCSR               ; READY is bit 7: the sign of the low byte
              BPL 1$                      ; not yet: read it again
              HALT
    `),
    p(`\`@#WHLCSR\` is the absolute address. A device works in ticks: driving one cell takes ${TICKS.MOVE} ticks, a turn `
      + `${TICKS.TURN}. \`!\` is "or" in an expression: \`WH.RGT!CS.GO\`.`),
    h('Your task'),
    p('Reach the exit with the wheel registers only: eleven cells (decimal) east, four south, nine west.'),
  ],
  starter: `; Lesson 6: no BIOS. Drive with the wheel registers.

        MOV #13, @#WHLCNT           ; 13 octal = 11. cells
        MOV #WH.FWD!CS.GO, @#WHLCSR ; start
1$:     TSTB @#WHLCSR               ; READY yet?
        BPL 1$
        ; now turn right, and so on
        HALT
`,
  hints: [
    'A turn is the same: `MOV #WH.RGT!CS.GO, @#WHLCSR`, then poll READY. WHLCNT does not matter for turns.',
    'Four cells south: `MOV #4, @#WHLCNT` before starting forward. Nine is `11` in octal.',
    'With a subroutine `GO` (start function R0, poll, `RTS PC`) or a table of (cells, function) pairs the program gets short.',
  ],
  solution: `; Lesson 6: no BIOS. Drive with the wheel registers.
; PATH is a list of (cells, function) pairs; cells = 0 ends it.

        MOV #PATH, R1
NEXT:   MOV (R1)+, R0       ; cells to go (turns ignore it)
        BEQ DONE
        MOV R0, @#WHLCNT
        MOV (R1)+, R0       ; function
        BIS #CS.GO, R0
        MOV R0, @#WHLCSR    ; start the wheels
POLL:   TSTB @#WHLCSR       ; READY is bit 7, the sign of the low byte
        BPL POLL
        TST @#WHLCSR        ; ERROR is bit 15
        BMI DONE            ; blocked: give up
        BR NEXT
DONE:   HALT

PATH:   .WORD 13, WH.FWD, 1, WH.RGT, 4, WH.FWD, 1, WH.RGT, 11, WH.FWD, 0
`,
};

// ------------------------------------------------------------------ 7 — interrupts and WAIT

/** Lesson 7's goal: only a program that sleeps while it drives keeps this much (tested). */
export const WAIT_ENERGY = 9750;

const interruptsLesson: Lesson = {
  id: 'interrupts', number: 7, title: 'Interrupts and WAIT',
  map: `
###############
#>............#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#############.#
#E............#
###############
`,
  goal: exitWithEnergy(WAIT_ENERGY),
  briefing: [
    p(`Thinking costs energy: every instruction the CPU executes uses a little, and a polling loop executes about a `
      + `hundred of them every tick, doing nothing. Driving costs ${COST.MOVE} a cell. The robot starts with `
      + `${dec(ENERGY_MAX)} energy; this time it must reach the exit with at least **${dec(WAIT_ENERGY)}**. `
      + `(A charger gives ${dec(CHARGE_RATE)} a tick, but there is none here.)`),
    p('The cure: start the device with **IE** (interrupt enable, `CS.IE`) set, and **WAIT**. The CPU sleeps, almost '
      + 'for free, until a device interrupts. When the wheels are done they interrupt: the CPU pushes PSW and PC, and '
      + 'jumps to the address in the wheels\' **vector** `WHLVEC`. The handler ends with `RTI`, which pops them: '
      + 'the program goes on after its `WAIT`. See [interrupts](interrupts).'),
    code(`
              MOV #DONE, @#WHLVEC         ; where the interrupt goes
              MOV #340, @#WHLVEC+2        ; the handler's PSW: priority 7
              MOV #WH.LFT!CS.GO!CS.IE, @#WHLCSR
              WAIT                        ; sleep until the wheels interrupt
              HALT
      DONE:   RTI                         ; back after the WAIT
    `),
    note('A WAIT with no device busy and IE set would sleep forever: the game stops it and tells you.'),
    h('Your task'),
    p('The starter program polls, as in lesson 6. Make it sleep instead, and reach the exit with the energy to spare.'),
  ],
  starter: `; Lesson 7: drive to the exit without wasting energy.
; This program polls: it works, but it burns energy while it waits.

        MOV #PATH, R1
NEXT:   MOV (R1)+, R0       ; cells to go
        BEQ DONE
        MOV R0, @#WHLCNT
        MOV (R1)+, R0       ; function
        BIS #CS.GO, R0
        MOV R0, @#WHLCSR    ; start the wheels
POLL:   TSTB @#WHLCSR       ; READY yet?
        BPL POLL
        BR NEXT
DONE:   HALT

PATH:   .WORD 14, WH.FWD, 1, WH.RGT, 14, WH.FWD, 1, WH.RGT, 14, WH.FWD, 0
`,
  hints: [
    'First set the vector: `MOV #ISR, @#WHLVEC` and `MOV #340, @#WHLVEC+2`, with `ISR: RTI` at the end.',
    'Start the wheels with `CS.GO!CS.IE`: `BIS #CS.GO!CS.IE, R0`.',
    'Replace the polling loop by a single `WAIT`.',
  ],
  solution: `; Lesson 7: drive to the exit without wasting energy.
; Start the wheels with IE, and sleep in WAIT until they interrupt.

        MOV #ISR, @#WHLVEC
        MOV #340, @#WHLVEC+2 ; the handler runs at priority 7
        MOV #PATH, R1
NEXT:   MOV (R1)+, R0       ; cells to go
        BEQ DONE
        MOV R0, @#WHLCNT
        MOV (R1)+, R0       ; function
        BIS #CS.GO!CS.IE, R0
        MOV R0, @#WHLCSR    ; start the wheels, interrupt when done
        WAIT                ; sleep until then
        TST @#WHLCSR
        BMI DONE            ; blocked: give up
        BR NEXT
DONE:   HALT

ISR:    RTI                 ; nothing to do: WAIT is over

PATH:   .WORD 14, WH.FWD, 1, WH.RGT, 14, WH.FWD, 1, WH.RGT, 14, WH.FWD, 0
`,
};

export const LESSONS: readonly Lesson[] = [
  octalLesson, registersLesson, loopsLesson, bitsLesson, scanLesson, subroutinesLesson, devicesLesson, interruptsLesson,
];
