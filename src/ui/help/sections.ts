/**
 * The help text, for the player. Numbers are octal unless written with a dot (`200.`),
 * as in the game. Facts that live in the simulation (timings, costs, sizes) come from its
 * constants, so the help follows them. Every `code` block assembles, and the `run` ones
 * run on the test map: tests/ui/help.test.ts.
 */

import { octal } from '../../blue11';
import {
  CHARGE_RATE, COST, DRAIN, ENERGY_MAX, INVENTORY_SLOTS, LASER_DAMAGE, LASER_RANGE, MEMORY, MONSTERS, REG, ROBOT_HP,
  SCAN_RADIUS, TICK_CYCLES, TICKS, VECTOR,
} from '../../core';
import { OP_GROUPS, opEntry } from './instructions';
import { code, dec, entries, h, list, note, p, table, type Entry, type Section } from './model';
import { symbolEntries } from './symbols';

const o = (n: number, digits = 6) => octal(n, digits);
const SENTRY_LASER = MONSTERS.sentry.laser!;
const START = 'Start';
const LANGUAGE = 'Language';
const MACHINE = 'The robot';
const REFERENCE = 'Reference';

const e = (anchor: string, names: string[], term: string, text: string, detail?: string): Entry =>
  ({ anchor, names, term, text, ...(detail ? { detail } : {}) });

const start: Section = {
  id: 'start', title: 'Getting started', group: START,
  blocks: [
    p('You drive the robot with a program in **Blue-11 assembly**, the language of a classic 16-bit minicomputer. '
      + 'Write it in the editor on the left, press **Run** (Ctrl+Enter), and watch the map: the goal is to reach the **exit**.'),
    p('The simplest program uses [BIOS calls](bios): put a number in R0 and call `EMT`.'),
    code(`
      MOV #3, R0      ; three cells
      EMT MOVE        ; forward
      EMT RIGHT       ; turn right
      HALT            ; stop
    `, { run: true }),
    h('Reading the code'),
    list(
      'One instruction per line: an optional `label:`, the instruction, its operands, an optional `; comment`.',
      'Operands go **source first**: `MOV #3, R0` moves 3 into R0.',
      '`#3` is the value 3; `R0` is a [register](registers).',
      '**Numbers are octal**: `10` is eight, `10.` (with a dot) is ten. See [numbers](assembler#syn-numbers).',
    ),
    h('Time and energy'),
    p(`The world moves in **ticks**. Each tick the CPU gets ${dec(TICK_CYCLES)} cycles: about one cycle per memory access, `
      + `so a short instruction costs 1–3 cycles. Devices (wheels, laser, …) take several ticks to act; `
      + `driving one cell takes ${TICKS.MOVE} ticks.`),
    p(`The robot starts with ${dec(ENERGY_MAX)} energy and ${dec(ROBOT_HP)} HP. Actions cost energy (see [devices](devices)), and so does thinking: `
      + `every ${dec(1 << DRAIN.SHIFT)} instructions executed cost 1 energy. A loop that only waits for a device burns energy; `
      + `[WAIT](interrupts) sleeps almost for free. A [charger](devices#sym-DCKCSR) refills it.`),
    note('Press **F1** in the editor to look up the word under the cursor: an instruction, a register, a device name.'),
  ],
};

const controls: Section = {
  id: 'controls', title: 'Running and debugging', group: START,
  blocks: [
    table(['Button', 'What it does'], [
      ['**Run** (Ctrl+Enter)', 'Assemble the editor\'s program, load it, start it. The map stays as it is: press **Reset map** for a fresh start.'],
      ['**Continue**', 'Go on after a pause, breakpoint or step. Only while the program in the editor is the one loaded.'],
      ['**Pause**', 'Stop at the end of the tick.'],
      ['**Step**', 'Run one instruction. If the code changed, this loads it first.'],
      ['**Step tick**', 'Run to the end of this tick.'],
      ['**Reset map**', 'Rebuild the map; the program stays in the editor.'],
      ['**Examples**', 'Replace the editor\'s program with an example.'],
      ['**BIOS**', 'Show the source of the [BIOS](bios) in ROM: it is ordinary Blue-11 code.'],
    ]),
    h('Run loads, it does not wipe'),
    p(`**Run** copies the program into RAM, resets the registers, the PSW and the devices (actions in progress are abandoned), `
      + `and sets PC to the start and SP to the program's first address. The rest of RAM, the robot's position and the time are kept.`),
    h('Breakpoints'),
    list(
      'Click left of a line number, or press **F9** on the line: a red dot. Run and Continue stop **before** that instruction runs.',
      'Click a row in **Disassembly** to set one by address, also inside the BIOS.',
      'The current instruction is highlighted in the editor and marked ▶ in the disassembly.',
    ),
    h('Panels'),
    list(
      '**Robot**: HP, energy, coins, position, heading and the tick.',
      '**CPU**: the [registers](registers) and the PSW with its flags; `-` means a flag is clear.',
      '**Console**: what the program printed (`EMT PRINT`, or the console [registers](devices#sym-XBUF)).',
      '**Disassembly**: the instructions in memory around the PC, with labels. The number on the right is how often that instruction ran.',
      '**Memory**: eight words per row from an address. Type an octal address, a label, a device name (`WHLCSR`) or a register (`SP`).',
      'The orange bar left of the code is a **heat map**: the brighter, the more often that line ran.',
    ),
    h('Status messages'),
    table(['Message', 'Meaning'], [
      ['HALT at …', 'A `HALT` ran.'],
      ['Odd address, Bus error, Illegal instruction …', 'A [trap](traps) with no handler: the run stopped at the instruction that caused it. Fix it and Run again.'],
      ['BPT at …', 'A `BPT` in the code: Continue goes on after it.'],
      ['WAIT with nothing to wake the CPU', 'A `WAIT` while no interrupt is enabled: it would sleep forever.'],
      ['Double fault', 'A trap failed (its stack was not usable). Run again.'],
      ['N errors: line …', 'The assembler found mistakes; they are marked on their lines.'],
    ]),
  ],
};

const assembler: Section = {
  id: 'assembler', title: 'Writing assembly', group: LANGUAGE,
  blocks: [
    code(`
      LOOP:   MOV  #5, R0        ; label, instruction, operands, comment
              EMT  MOVE
    `),
    entries(
      e('syn-names', [], 'Names', 'Labels and symbols have **1 to 6** letters, digits, `.` or `$`, and do not start with a digit. '
        + 'Case does not matter. A seventh character is an error. The [predefined symbols](symbols) and the instruction names cannot be used as labels.'),
      e('syn-local', [], 'Local labels `1$`', '`1$` to `99$` are labels that only live between two ordinary labels, so every routine can have its own `1$:` loop.'),
      e('syn-numbers', [], 'Numbers', '`17` is **octal** (fifteen). `15.` is decimal. `^D15`, `^O17` and `^B1111` name the base. `\'A` is the code of the character A. Negative numbers: `-1` is 177777.'),
      e('syn-expr', [], 'Expressions', 'Operators `+ - * /`, `&` (and), `!` (or), evaluated strictly **left to right**: `2+3*4` is 24 (octal), `2+<3*4>` is 16. Use `< >` to group. '
        + '`#WH.RGT!CS.GO` ORs two symbols.'),
      e('syn-equ', ['='], '`NAME = value`', 'Define a constant: `STEPS = 4`, then `MOV #STEPS, R0`.'),
      e('syn-dot', ['.'], '`.`', 'The location counter: the address being assembled. `. = 2000` moves it.'),
    ),
    h('Directives'),
    entries(
      e('dir-.WORD', ['.WORD'], '`.WORD a, b, …`', 'Words of data: `.WORD 1, 2, LOOP`. A line with just a value is a `.WORD` too.'),
      e('dir-.BYTE', ['.BYTE'], '`.BYTE a, b, …`', 'Bytes of data: `.BYTE 1, 377`.'),
      e('dir-.ASCII', ['.ASCII'], '`.ASCII /text/`', 'The characters of the text, one byte each. Any character can be the delimiter.'),
      e('dir-.ASCIZ', ['.ASCIZ'], '`.ASCIZ /text/`', 'As `.ASCII`, with a 0 byte at the end: the format `EMT PRINT` wants.'),
      e('dir-.BLKW', ['.BLKW'], '`.BLKW n`', 'Reserve `n` words (zero): `BUF: .BLKW 20.`'),
      e('dir-.BLKB', ['.BLKB'], '`.BLKB n`', 'Reserve `n` bytes (zero).'),
      e('dir-.EVEN', ['.EVEN'], '`.EVEN`', 'Move to an even address. Put it after bytes or text and before words or code: words must be at even addresses.'),
      e('dir-.ODD', ['.ODD'], '`.ODD`', 'Move to an odd address.'),
      e('dir-.END', ['.END'], '`.END label`', 'The end of the program; the label, if any, is where it starts. Without it the program starts at its first instruction.'),
    ),
    p('The program is assembled from address 1000 unless you move `.` first. There are no macros or include files.'),
  ],
};

const registers: Section = {
  id: 'registers', title: 'Registers and flags', group: LANGUAGE,
  blocks: [
    p('The CPU has eight 16-bit registers. Working in registers is free; every trip to memory costs a cycle.'),
    entries(
      e('reg-R0', ['R0'], '`R0`', 'General purpose. [BIOS calls](bios) take their argument and give their result in R0.'),
      e('reg-R1', ['R1', 'R2', 'R3', 'R4', 'R5'], '`R1` – `R5`', 'General purpose: counters, pointers, values. The BIOS keeps them.'),
      e('reg-SP', ['SP', 'R6'], '`SP` (R6)', 'The [stack](stack) pointer. Run sets it to the program\'s first address; the stack grows down from there.'),
      e('reg-PC', ['PC', 'R7'], '`PC` (R7)', 'The program counter: the address of the next instruction. `#`, `@#` and labels are [addressing modes](addressing) on the PC.'),
      e('reg-%', ['%0', '%1', '%2', '%3', '%4', '%5', '%6', '%7'], '`%n`', 'Register n by number: `PTR = %3` makes `PTR` another name for R3.'),
    ),
    entries(...symbolEntries('PSW')),
    h('The flags'),
    p('Most instructions set four flags in the PSW from their result. Branches test them.'),
    table(['Flag', 'Set when the result…'], [
      ['**N** negative', 'has its top bit set (bit 15, or bit 7 for a byte)'],
      ['**Z** zero', 'is 0'],
      ['**V** overflow', 'is wrong as a signed number (e.g. 77777 + 1)'],
      ['**C** carry', 'carried out of the top bit, or borrowed (unsigned overflow)'],
    ]),
    note('The flags belong to the **last** instruction that set them. In `CMP R0, #5` / `MOV #1, R1` / `BLT …` the branch tests the `MOV`. Compare just before you branch.'),
  ],
};

const addressing: Section = {
  id: 'addressing', title: 'Addressing modes', group: LANGUAGE,
  blocks: [
    p('Every operand is a register with one of eight modes. In the table, R is any register.'),
    table(['Write', 'Mode', 'The operand is'], [
      ['`R`', '0 register', 'the register itself'],
      ['`(R)`', '1 deferred', 'the word at the address in R'],
      ['`(R)+`', '2 autoincrement', 'the word at R; then R goes up by 2 (by 1 for a byte instruction)'],
      ['`@(R)+`', '3 autoincrement deferred', 'the word whose address is at R; then R goes up by 2'],
      ['`-(R)`', '4 autodecrement', 'R goes down by 2 (1 for bytes) first, then the word at R'],
      ['`@-(R)`', '5 autodecrement deferred', 'R goes down by 2, then the word whose address is at R'],
      ['`X(R)`', '6 index', 'the word at R + X; X is stored after the instruction'],
      ['`@X(R)`', '7 index deferred', 'the word whose address is at R + X'],
    ]),
    h('On the PC: values, addresses, labels'),
    table(['Write', 'Means', 'Example'], [
      ['`#n`', '**immediate**: the value n', '`MOV #5, R0`: R0 = 5'],
      ['`@#a`', '**absolute**: the word at address a', '`MOV @#STHP, R0`: R0 = the robot\'s HP'],
      ['`LABEL`', '**relative**: the word at LABEL', '`INC COUNT`: add 1 to the variable COUNT'],
      ['`@LABEL`', 'the word whose address is at LABEL', '`MOV @PTR, R0`'],
    ]),
    note('**`#` is a value, `@#` is an address.** `MOV #STHP, R0` puts the *address* 176440 into R0; `MOV @#STHP, R0` reads the HP. Device registers always need `@#`.'),
    h('Walking through memory'),
    code(`
              MOV  #LIST, R1     ; R1 points at the list
              CLR  R0
      1$:     ADD  (R1)+, R0     ; add a word, step to the next
              CMP  R1, #END
              BLO  1$
              HALT               ; R0 = 1+2+3 = 6
      LIST:   .WORD 1, 2, 3
      END:
    `, { run: true }),
    p('The [stack](stack) uses `-(SP)` to push and `(SP)+` to pop. A byte instruction steps by 1, except on SP and PC, which always step by 2.'),
  ],
};

const instructions: Section = {
  id: 'instructions', title: 'Instructions', group: LANGUAGE,
  blocks: [
    p('`src` and `dst` are operands in any [addressing mode](addressing); `R` must be a register. '
      + 'Beside each instruction: how it leaves the flags N Z V C. `*` from the result, `0` / `1` cleared / set, `–` unchanged.'),
    ...OP_GROUPS.flatMap((g) => [h(g.title), ...(g.intro ? [p(g.intro)] : []),
      ...(g.title === 'Branches' ? [table(['After `CMP a, b`', 'signed', 'unsigned (addresses, counts)'], [
        ['a = b', '`BEQ`', '`BEQ`'], ['a ≠ b', '`BNE`', '`BNE`'],
        ['a < b', '`BLT`', '`BLO`'], ['a ≤ b', '`BLE`', '`BLOS`'],
        ['a > b', '`BGT`', '`BHI`'], ['a ≥ b', '`BGE`', '`BHIS`'],
      ])] : []),
      entries(...g.ops.map(opEntry))]),
  ],
};

const memory: Section = {
  id: 'memory', title: 'Memory', group: MACHINE,
  blocks: [
    p('Memory is 64 KB of bytes, numbered by 16-bit addresses. A **word** is two bytes, low byte first, at an **even** address.'),
    table(['Addresses', 'What'], [
      [`000000–000377`, 'trap and interrupt **vectors** (two words each: new PC, new PSW)'],
      [`000400–${o(MEMORY.RAM_END - 1)}`, 'RAM: your program, its data and the stack. Programs start at 001000.'],
      [`${o(MEMORY.ROM_BASE)}–${o(MEMORY.ROM_BASE + MEMORY.ROM_SIZE - 1)}`, 'ROM: the [BIOS](bios). Read it freely; writing is a bus error.'],
      [`${o(REG.WHLCSR)}–${o(REG.INV + INVENTORY_SLOTS * 4 - 1)}`, 'the robot\'s [devices](devices)'],
      [`${o(REG.LKS)}`, 'the line clock'],
      [`${o(REG.RCSR)}–${o(REG.XBUF)}`, 'the console'],
      ['everything else above 160000', 'nothing: a bus error ([trap](traps) to 4)'],
    ]),
    h('Variables and tables'),
    p('Code and data share memory. Reserve a word with a label and `.WORD` (or `.BLKW`), and use the label as the operand:'),
    code(`
              INC  COUNT          ; COUNT = COUNT + 1
              MOV  COUNT, R0      ; read it
              MOV  #TABLE, R1
              MOV  4(R1), R2      ; the third word of TABLE: 30
              MOVB NAME+1, R3     ; one byte: 'I
              HALT
      COUNT:  .WORD 0
      TABLE:  .WORD 10, 20, 30
      NAME:   .ASCIZ /HI/
    `, { run: true }),
    list(
      'Run copies the program in again, so `COUNT` starts at 0 each time. Memory outside the program keeps its values between runs.',
      'Words are at even addresses: a word access at an odd address is a bus error. After `.BYTE` or `.ASCIZ`, add `.EVEN` before more words.',
      'Byte instructions (`MOVB`, `CMPB`, `TSTB` …) reach any address. `MOVB` into a register sign-extends: byte 200–377 becomes negative.',
      'A word in memory costs a cycle every time it is read or written; a register costs nothing. Keep hot values in registers.',
    ),
  ],
};

const stack: Section = {
  id: 'stack', title: 'The stack and subroutines', group: MACHINE,
  blocks: [
    p('The stack is memory that SP points at. It grows **down**, below the program: Run sets SP to the program\'s first address (001000).'),
    table(['Write', 'Does'], [
      ['`MOV R2, -(SP)`', 'push R2'],
      ['`MOV (SP)+, R2`', 'pop into R2'],
      ['`MOV 2(SP), R0`', 'read the second word on the stack without popping'],
      ['`TST (SP)+`', 'drop the top word'],
    ]),
    h('Subroutines'),
    p('`JSR PC, NAME` pushes the return address and jumps; `RTS PC` pops it and goes back. A subroutine that uses a register keeps the caller\'s value by pushing it first and popping it before it returns, in the opposite order.'),
    code(`
              MOV  #3, R0
              JSR  PC, TWICE      ; R0 = 6
              HALT

      ; TWICE: R0 = R0 * 2. Keeps R1.
      TWICE:  MOV  R1, -(SP)      ; save R1
              MOV  R0, R1
              ADD  R1, R0
              MOV  (SP)+, R1      ; restore R1
              RTS  PC
    `, { run: true }),
    list(
      'Pass arguments and results in registers (as the BIOS does with R0), or push them before the call.',
      'Every push needs its pop. If the stack is not balanced when `RTS PC` runs, it returns to the wrong place.',
      'Traps and interrupts push two words (PSW and PC); `RTI` pops them.',
    ),
  ],
};

const bios: Section = {
  id: 'bios', title: 'BIOS calls (EMT)', group: MACHINE,
  blocks: [
    p('The BIOS is a small library in ROM that drives the devices for you. Put the argument in R0 (and R1 for `SCAN`) and write `EMT` with the call\'s name.'),
    entries(...symbolEntries('MOVE', 'BACK', 'LEFT', 'RIGHT', 'FIRE', 'SCAN', 'GRAB', 'DROP', 'PRINT', 'AIM', 'CHARGE')),
    h('The rules'),
    list(
      'A call **waits** until its device has finished, so the next line runs after the move, turn or shot.',
      '**Success clears C; failure sets C** and puts the [error code](devices#sym-ER.BLK) in R0. Test it with `BCS` right after the `EMT`.',
      'Every register except R0 is kept.',
      'The BIOS turns that device\'s interrupts off (it writes the CSR without IE).',
      'Waiting is done by polling, which costs energy like any loop. Driving the [devices](devices) yourself with [interrupts](interrupts) is cheaper.',
    ),
    code(`
      AGAIN:  MOV  #1, R0
              EMT  MOVE           ; one cell forward
              BCC  AGAIN          ; worked: once more
              CMP  R0, #ER.BLK    ; why did it fail?
              BNE  DONE
              MOV  #MSG, R0
              EMT  PRINT          ; "WALL" on the console
      DONE:   HALT
      MSG:    .ASCIZ /WALL/
    `, { run: true }),
    p('`EMT` is a [trap](traps) through the vector at 30. Run points it at the BIOS each time; a program may install its own handler there. Press **BIOS** to read how it is done.'),
  ],
};

const devices: Section = {
  id: 'devices', title: 'Device registers', group: MACHINE,
  blocks: [
    p('Every device is a few words of memory. A program talks to it with ordinary instructions on those addresses, '
      + 'always with `@#`: `MOV #3, @#WHLCNT`. This is what the BIOS does underneath.'),
    h('The control and status register (CSR)'),
    p('Each action device has a CSR at its first address and an error register after it, with the same bits:'),
    entries(...symbolEntries('CS.GO', 'CS.FN', 'CS.IE', 'CS.RDY', 'CS.ERR')),
    list(
      'Write the function and GO together: `MOV #WH.RGT!CS.GO, @#WHLCSR`. GO while the device is busy is ignored.',
      'Then READY goes off until the action is done. Wait for it by polling (`TSTB` puts READY in N), or with [an interrupt](interrupts).',
      'A request that cannot start (bad function or argument, not enough energy) fails at once: READY and ERROR set, no time taken.',
    ),
    code(`
              MOV  #2, @#WHLCNT             ; two cells
              MOV  #WH.FWD!CS.GO, @#WHLCSR  ; forward: go
      1$:     TSTB @#WHLCSR                 ; READY (bit 7) into N
              BPL  1$                       ; not yet
              TST  @#WHLCSR                 ; ERROR (bit 15) into N
              BMI  FAIL
              HALT
      FAIL:   MOV  @#WHLERR, R0             ; why
              HALT
    `, { run: true }),
    h('Error codes'),
    entries(...symbolEntries('ER.PWR', 'ER.FN', 'ER.BLK', 'ER.ADR', 'ER.NON', 'ER.FUL', 'ER.ARG')),
    h('Timings and costs'),
    table(['Device', 'Ticks', 'Energy'], [
      ['Wheels: a cell', dec(TICKS.MOVE), dec(COST.MOVE)],
      ['Wheels: a turn', dec(TICKS.TURN), dec(COST.TURN)],
      ['Laser', dec(TICKS.LASER), dec(COST.LASER)],
      ['Scanner', dec(TICKS.SCAN), dec(COST.SCAN)],
      ['Grabber', dec(TICKS.GRAB), dec(COST.GRAB)],
      ['Dock', 'until done', `gives ${dec(CHARGE_RATE)} a tick`],
    ]),
    h('Wheels'),
    p('Drive `WHLCNT` cells forward or back without turning, or turn 90°. Anything in the way (a wall, a monster, the edge) stops the move with `ER.BLK`; `WHLCNT` then holds the cells left. Items on the floor do not block. Energy is charged per cell as it starts.'),
    entries(...symbolEntries('WHLCSR', 'WHLERR', 'WHLCNT', 'WH.FWD', 'WH.LFT', 'WH.RGT', 'WH.BAK', 'WHLVEC')),
    h('Laser'),
    p(`Fires up to ${LASER_RANGE} cells along the heading and does ${dec(LASER_DAMAGE)} damage to the first solid or opaque thing on the way (walls too). `
      + `At 0 HP a thing is destroyed and drops its loot. **Aimed fire** (\`LS.AIM\`) shoots at the cell \`LSRTGT\`: it must be in the 90° arc ahead and within dx² + dy² ≤ ${dec(LASER_RANGE * LASER_RANGE)}, `
      + 'else `ER.ARG` and no energy is spent. Then `LSRDST` is the steps along the line to the hit; compare it with the larger of |DX| and |DY| to know whether the target itself was hit.'),
    entries(...symbolEntries('LSRCSR', 'LSRERR', 'LSRDST', 'LSRTGT', 'LS.FIR', 'LS.AIM', 'LSRVEC')),
    h('Scanner'),
    p(`Reports what the robot can see within dx² + dy² ≤ ${dec(SCAN_RADIUS * SCAN_RADIUS)} (a line of sight is needed; opaque things hide what is behind them). `
      + 'It writes **6-byte records** into the buffer at `SCNBUF`, nearest first, and ends the list with a word 0. '
      + 'A record is the thing\'s [object record](world) (4 bytes) and a word `DX | DY<<8`: the offset from the robot as two signed bytes, x to the right, y down. '
      + 'At most (`SCNLEN` − 2) / 6 records fit.'),
    entries(...symbolEntries('SCNCSR', 'SCNERR', 'SCNBUF', 'SCNLEN', 'SC.ALL', 'SC.NWL', 'SCNVEC')),
    code(`
      ; Scan and find the nearest coins.
              MOV  #BUF, R0
              MOV  #62., R1       ; room for 10. records
              EMT  SCAN
              BCS  DONE
              MOV  #BUF, R2
      1$:     MOVB (R2), R3       ; TYPE
              BEQ  DONE           ; 0: end of the list
              CMPB R3, #T.COIN
              BEQ  FOUND
              ADD  #6, R2         ; the next record
              BR   1$
      FOUND:  MOVB 4(R2), R4      ; DX
              MOVB 5(R2), R5      ; DY
      DONE:   HALT
      BUF:    .BLKW 31.
    `, { run: true }),
    h('Grabber'),
    p(`**Grab** takes what is in front, if it is collectible: coins add to the coin count, anything else goes into the first free of ${INVENTORY_SLOTS} inventory slots (its number is then in \`GRBSLT\`). **Drop** puts slot \`GRBSLT\` (0–3) on the floor in front.`),
    entries(...symbolEntries('GRBCSR', 'GRBERR', 'GRBSLT', 'GR.GRB', 'GR.DRP', 'GRBVEC')),
    h('Dock'),
    p(`Plugs into the **charger** in front (\`T.CHRG\`) and refills energy, ${dec(CHARGE_RATE)} a tick: `
      + `${dec(Math.ceil(ENERGY_MAX / CHARGE_RATE))} ticks from empty to full. \`DCKCNT\` is how much to take (0 = until full); it counts down. `
      + 'The dock stops with `ER.NON` if the robot turns or moves away, or the charger is destroyed; it refuses with `ER.FUL` when the energy is full. '
      + 'The CPU still uses energy meanwhile: sleep in [WAIT](interrupts) until the dock interrupts, and the robot keeps almost all of it. '
      + 'Other devices work while it charges, and monsters keep moving.'),
    entries(...symbolEntries('DCKCSR', 'DCKERR', 'DCKCNT', 'DK.CHG', 'DCKVEC')),
    code(`
      ; Face a charger, then sleep until full.
              MOV  #FULL, @#DCKVEC
              MOV  #340, @#DCKVEC+2
              CLR  @#DCKCNT                 ; until full
              MOV  #DK.CHG!CS.GO!CS.IE, @#DCKCSR
              WAIT                          ; asleep while charging
              HALT
      FULL:   MOV  @#DCKERR, R0             ; 0, ER.NON or ER.FUL
              RTI
    `),
    h('Status and inventory'),
    p('Read-only words about the robot itself. Writes are ignored.'),
    entries(...symbolEntries('STHP', 'STNRG', 'STX', 'STY', 'STHDG', 'STCOIN', 'INV')),
    h('Console'),
    p('A printer for messages: wait until bit 7 of `XCSR` is set, then write a character to `XBUF`. `EMT PRINT` does this for a whole text.'),
    entries(...symbolEntries('XCSR', 'XBUF', 'XMTVEC', 'RCSR', 'RBUF', 'RCVVEC')),
    code(`
              MOV  #MSG, R1
      1$:     MOVB (R1)+, R0      ; next character
              BEQ  3$             ; 0: done
      2$:     TSTB @#XCSR         ; printer ready?
              BPL  2$
              MOVB R0, @#XBUF     ; print it
              BR   1$
      3$:     HALT
      MSG:    .ASCIZ /HELLO/
    `, { run: true }),
  ],
};

const world: Section = {
  id: 'world', title: 'The world and its objects', group: MACHINE,
  blocks: [
    p('The map is a grid of cells; x grows to the right, y downwards, and (0, 0) is the top left. A cell holds at most one **occupant** (a wall, the robot, a monster, a charger) and one **floor item** (coins, the exit).'),
    h('Object records'),
    p('Everything is described to the program by a 4-byte record: in the [scanner](devices#sym-SCNBUF)\'s results and in the [inventory](devices#sym-INV).'),
    table(['Byte', 'Field', 'Read it with'], [
      ['0', 'TYPE: what it is (0 = nothing)', '`MOVB (R2), R0`'],
      ['1', 'HP', '`MOVB 1(R2), R0` (sign-extends: `BIC #177400, R0` after)'],
      ['2', 'FLAGS: the bits below', '`BITB #F.SOLD, 2(R2)`'],
      ['3', 'LOOT: what it drops (bits 7–4 the kind, 3–0 the amount)', '`MOVB 3(R2), R0`'],
    ]),
    h('Types'),
    entries(...symbolEntries('T.WALL', 'T.ROBO', 'T.EXIT', 'T.CHRG', 'T.COIN', 'T.CHIP', 'T.PTRL', 'T.CHSR', 'T.SNTR')),
    h('Flags'),
    entries(...symbolEntries('F.MOB', 'F.HOST', 'F.SOLD', 'F.OPAQ', 'F.COLL', 'F.INTR')),
    h('Headings'),
    p('The robot faces one of four ways; `STHDG` tells which. `LEFT` and `RIGHT` turn it.'),
    entries(...symbolEntries('H.N', 'H.E', 'H.S', 'H.W')),
    h('Monsters'),
    table(['Monster', 'HP', 'Does'], [
      ['Patrol', dec(MONSTERS.patrol.hp), `walks ahead until blocked, then turns right; bites for ${dec(MONSTERS.patrol.contact)} when it runs into the robot`],
      ['Chaser', dec(MONSTERS.chaser.hp), `steps towards the robot when it sees it, else wanders; bites for ${dec(MONSTERS.chaser.contact)}, `
        + `but takes ${MONSTERS.chaser.moveTicks} ticks a cell to the robot's ${TICKS.MOVE}`],
      ['Sentry', dec(MONSTERS.sentry.hp), `stands still and shoots (${dec(SENTRY_LASER.damage)} damage) when the robot is in its row or column within ${SENTRY_LASER.range} cells; walls give cover`],
    ]),
    p(`One laser shot does ${dec(LASER_DAMAGE)} damage. A destroyed monster drops coins. Monsters run Blue-11 programs of their own.`),
  ],
};

const interrupts: Section = {
  id: 'interrupts', title: 'Interrupts and WAIT', group: MACHINE,
  blocks: [
    p('Instead of polling a device, let it **interrupt**: set IE when you start it, and when it becomes READY the CPU stops what it is doing and runs your handler. '
      + 'Together with `WAIT`, which sleeps until an interrupt, this costs almost no energy.'),
    list(
      'Each device has a **vector**: two words in low memory, the handler\'s address and the PSW to run it with. `MOV #DONE, @#WHLVEC` installs one.',
      'The CPU pushes the PSW and PC, and loads both from the vector. The handler ends with `RTI`, which pops them back.',
      'The PSW\'s bits 7–5 are the CPU\'s **priority**. A device interrupts only above it: the robot\'s devices at level 4, the line clock at 6. Handler PSW 340 (level 7) blocks every other interrupt while it runs.',
      'Interrupts arrive at the start of a tick, between instructions.',
      'A handler must keep every register it uses (push and pop), since it can break in anywhere.',
    ),
    code(`
              MOV  #DONE, @#WHLVEC    ; the handler
              MOV  #340, @#WHLVEC+2   ; its PSW: priority 7
              MOV  #3, @#WHLCNT
              MOV  #WH.FWD!CS.GO!CS.IE, @#WHLCSR
      1$:     WAIT                    ; sleep until an interrupt
              TST  FLAG
              BEQ  1$                 ; woken, but not by the wheels
              HALT

      DONE:   INC  FLAG               ; the wheels are READY
              RTI
      FLAG:   .WORD 0
    `, { run: true }),
    h('The line clock'),
    entries(...symbolEntries('LKS', 'LKSVEC')),
    p('With `LKS` bit 6 set the clock interrupts once a tick: a heartbeat that wakes a `WAIT` even when nothing else will. Install a handler first: '
      + '`MOV #TICK, @#LKSVEC`, `CLR @#LKSVEC+2`, `MOV #100, @#LKS`, with `TICK: RTI`.'),
    note('`WAIT` with no interrupt enabled can never wake: the run stops with *WAIT with nothing to wake the CPU*. The `BIOS` turns interrupts of its devices off.'),
  ],
};

const traps: Section = {
  id: 'traps', title: 'Traps and errors', group: MACHINE,
  blocks: [
    p('A **trap** is an interrupt caused by the program itself: a mistake, or a trap instruction. The CPU pushes the PSW and PC and continues at the address in the vector.'),
    table(['Vector', 'Cause'], [
      ['004', '**bus error**: a word at an odd address, an address with nothing there, a write to ROM'],
      ['010', '**illegal instruction**: a word that is no instruction (or `MUL` / `DIV` before the math chip)'],
      ['014', '`BPT`: a breakpoint in the code'],
      ['020', '`IOT`'],
      [o(VECTOR.CLOCK, 3), 'the line clock (an interrupt)'],
      ['030', '`EMT`: the [BIOS](bios)'],
      ['034', '`TRAP`'],
      [`${o(VECTOR.WHEELS, 3)}–${o(VECTOR.GRABBER, 3)}`, 'the devices (interrupts)'],
    ]),
    h('A trap with no handler'),
    p('Most vectors are 0 until you set them. A trap or interrupt whose vector is 0 does not jump: the run **stops**, and the status line says what happened and where, '
      + 'for example *Odd address 000001 at 001004* or *MUL at 001010 needs the math chip*. A fault stops **at** the instruction that caused it; `BPT`, `TRAP` and `IOT` stop just after theirs.'),
    h('Catching a trap'),
    code(`
              MOV  #OOPS, @#4     ; bus errors come to OOPS
              MOV  #340, @#6
              MOV  @#1, R0        ; a word at an odd address: trap
              HALT
      OOPS:   MOV  (SP), R1       ; R1 = the address after the bad instruction
              HALT
    `, { run: true }),
    h('Common mistakes'),
    list(
      '`MOV STHP, R0` without `@#`: that reads a variable called STHP relative to the PC, not the device. Use `MOV @#STHP, R0`.',
      '`MOV #BUF, R0` vs `MOV BUF, R0`: the first is the address of BUF, the second the word stored there.',
      'Data after code without a `HALT` or `BR` in between: the CPU runs into the data as if it were instructions.',
      'Words after `.ASCIZ` or `.BYTE` without `.EVEN`: they land on an odd address.',
      'Branching on old flags: an instruction between the `CMP` and the branch changed them.',
    ),
  ],
};

const SECTIONS_NO_INDEX: Section[] = [start, controls, assembler, registers, addressing, instructions, memory, stack, bios, devices, world, interrupts, traps];

/** Every predefined symbol with its value and where it is described. */
function symbolIndex(): Section {
  const rows: string[][] = [];
  for (const s of SECTIONS_NO_INDEX) {
    for (const b of s.blocks) {
      if (b.kind !== 'entries') continue;
      for (const en of b.entries) {
        if (!en.anchor.startsWith('sym-')) continue;
        rows.push([`[${en.names[0]}](${s.id}#${en.anchor})`, `\`${(en.detail ?? '').replace('= ', '')}\``, en.text]);
      }
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return {
    id: 'symbols', title: 'Symbol index', group: REFERENCE,
    blocks: [
      p('The names every program can use without defining them. Click one for its section.'),
      table(['Name', 'Value', 'Meaning'], rows),
    ],
  };
}

export const SECTIONS: readonly Section[] = [...SECTIONS_NO_INDEX, symbolIndex()];
