# Blue-11: the machine (design and rationale)

This is the design of the Blue-11 library: what the machine is, why it is built this way, and
how it departs from the original. It moves with the library to its own repository
(ROADMAP.md §1). The API reference is the library's
[`README.md`](../src/blue11/README.md), and its working rules are in
[`AGENTS.md`](../src/blue11/AGENTS.md).

This document was split from `BLUE11_CPU.md` on 2026-11-18. That document was written for the
earlier Rover project and stays in HackCode as history. Its library sections now point here.

| Document | What |
| :--- | :--- |
| this one | the CPU, the assembler, cycles, flags, traps and interrupts, the library's rules |
| [`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md) | the display: 64 × 64 and 128 × 128 pixels, a palette, vertical blank, an optional scanning beam, and the simulator's font ROM |
| [`BLUE11_KEYBOARD.md`](BLUE11_KEYBOARD.md) | the keyboard: key codes, a key map, an event queue, replays |
| [`README.md`](../src/blue11/README.md) | the API reference, recipes and pitfalls; its examples are run by the tests |

## 1. Principle

> A small, honest computer. Eight registers, one address space, memory reached through
> eight addressing modes, devices reached through memory. Every instruction is one to
> three 16-bit words whose fields you can read in octal.

The original machine (1970) is the one Unix and C grew up on: C's `*p++` is its autoincrement
mode. It is small enough to learn whole, and regular enough that the instruction set fits on
one card. The Blue-11 takes its instruction set, encoding, flags, traps and assembler syntax
as they were, and changes only what teaching needs. §8 lists every departure.

**Why this machine** and not another (this was decided for Rover in 2026-11):

- **RISC-V** is modern and open, but it is 32-bit, load/store only and has no flags. Its branch
  immediates are bit-shuffled, so it can't be read by hand.
- **MIPS** is clean, but has delay slots and `HI` / `LO`.
- **x86** has an opaque encoding, and its syntax is split between Intel and AT&T.
- **DEC's 16-bit machine** has memory operands, two-operand instructions, an encoding you can
  read in octal, flags, real traps and interrupts, and history.

**The name.** "Blue-11", with the instruction set named in descriptions, keeps clear of DEC's
old trademark (held by HP today). Emulators such as SIMH use the name freely, so this is
caution, not a blocker.

## 2. The machine

| | |
| :--- | :--- |
| Word | 16 bits, bytes addressable, **little-endian** |
| Registers | `R0`–`R5` general, `R6` = `SP`, `R7` = `PC` |
| Flags | `N Z V C` in the processor status word `PSW`, with the priority in bits 7–5 (§5, §6) |
| Address space | **64 KB**, one space for code, data, stacks and devices |
| Memory map | the host decides. `DeviceMachine`'s default: RAM from 0 to `157777`, the I/O page `160000`–`177777` for devices, and the `PSW` at `177776` inside the CPU, as on the original |
| Vectors | in low memory, two words each (new PC, new PSW), at the original addresses |
| Stacks | in memory, through `SP`, with no fixed depth (`stackLimit` is an option) |

- **Word accesses must use even addresses.** A word access to an odd address is a bus error and
  traps to 4, as on the real machine.
- **Addresses where nothing answers are bus errors** (trap 4). A host with little memory gets
  "no memory there" for free, as customers of the original did before they bought more boards.
- **Code and data share memory.** Tables in code are read with `MOV`, and a program can modify
  its own code: a real retro technique, and a real source of bugs.

## 3. Assembler: Blue-11 assembly (a subset of the original assembler)

A **subset of DEC's original assembler** (RT-11 / RSX-11), with the same syntax and meaning:
programs inside the subset assemble on the original too. The README's "Assembler
compatibility" lists what is the same, what differs on purpose, and what is missing. Every
claim there has a test.

### 3.1 Lines

```
label:  OPCODE  src, dst        ; comment
```

- **Source comes before destination**: `MOV #5, R0` puts 5 into R0. `CMP a, b` computes `a − b`
  and sets the flags, so `CMP R0, #10` followed by `BLT` means "R0 < 10".
- **Names** have **one to six** letters, digits, `.` and `$`, don't start with a digit, and are
  case-insensitive, as in the original assembler. A seventh character is an error, not
  silently dropped: on the original, two names that agree in their first six letters would be
  the same symbol. The option `names: 'long'` allows longer names and `_`, for other projects.
- **Local labels** `1$` … `99$` are valid between two ordinary labels. Loops and branches inside
  a routine use them, so routines don't compete for names like `loop`:

  ```
  MUL16:  ...
  1$:     TST  R1         ; this 1$ belongs to MUL16
  DIV16:  ...
  1$:     ...             ; a different 1$
  ```

### 3.2 Directives and symbols

| Write | Means |
| :--- | :--- |
| `NAME = 5` | a constant symbol |
| `DIR = %1` | a register symbol: `DIR` means `R1` |
| `.WORD 1, 2, X+4` | 16-bit words |
| `.BYTE 1, 2, 377` | bytes |
| `.ASCII /TEXT/`, `.ASCIZ /TEXT/` | characters (`.ASCIZ` adds a 0 byte) |
| `name: .BLKW 4` / `.BLKB 10` | reserve 4 words / 8 bytes (zero in the image) |
| `.EVEN` | align to a word boundary after bytes |
| `. = . + 20` | move the location counter |
| `.END START` | the start address, and the end of the source |

**Predefined symbols** (`options.symbols`) are the host's device registers, bits and codes,
like DEC's system macro library. For example, the simulator predefines `SCREEN`, `DSPCS` and
`KBDKEY`, and HackCode predefines its robot's registers.

**Expressions** are evaluated strictly **left to right**, with `< >` for grouping, as in the
original assembler: `2+3*4` is 20, and `2+<3*4>` is 14. The operators are `+ - * /`, `&` (and)
and `!` (or). Students meet this once and remember it, and it is part of the period charm.
The assembler warns when `*` or `/` follows `+` or `-` without `< >`.

**Not supported:** `.MACRO`, `.PSECT`, `.GLOBL`, conditional assembly, and linking. A program is
one source file, assembled into one memory image.

### 3.3 Numbers: octal

- `20` is **octal** (16 decimal), and `20.` is decimal 20. `^D20`, `^O20` and `^B10100` name the
  radix explicitly, and `'A` is the code of a character.
- Listings, dumps and debuggers show **words as six octal digits**. This is the point of octal on
  the original machine: the instruction fields are three bits wide, so every octal digit is one
  field (§3.5). The display and keyboard are laid out so that octal addresses can be read
  directly as well (a pixel at `12YYXX`, the A key at `177101`).
- Values that people think of in decimal are written with a dot: `CMP R0, #100.`

### 3.4 The eight addressing modes

Each operand is a 6-bit field: a **mode** (3 bits) and a **register** (3 bits).

| Mode | Syntax | Name | The operand is | C equivalent |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `R3` | register | R3 itself | `r3` |
| 1 | `(R3)` | register deferred | the word at address R3 | `*p` |
| 2 | `(R3)+` | autoincrement | the word at R3, then R3 += 2 (1 for bytes) | `*p++` |
| 3 | `@(R3)+` | autoincrement deferred | the word whose address is at R3, then R3 += 2 | `**pp++` |
| 4 | `-(R3)` | autodecrement | R3 −= 2 (1 for bytes), then the word at R3 | `*--p` |
| 5 | `@-(R3)` | autodecrement deferred | R3 −= 2, then the word whose address is at R3 | `**--pp` |
| 6 | `X(R3)` | index | the word at R3 + X (X is the next instruction word) | `p[x]` |
| 7 | `@X(R3)` | index deferred | the word whose address is at R3 + X | `*p[x]` |

The same modes on `PC` (R7) give the four forms everyone uses:

| Syntax | Really | Means |
| :--- | :--- | :--- |
| `#100` | `(PC)+` | **immediate**: the next word is the value |
| `@#177560` | `@(PC)+` | **absolute**: the next word is the address (device registers, fixed tables) |
| `LABEL` | `X(PC)` | **relative**: the address, as a distance from here (position-independent) |
| `@LABEL` | `@X(PC)` | relative deferred: the word at `LABEL` is a pointer |

On `SP` (R6), the same modes give the stack: `MOV R2, -(SP)` pushes and `MOV (SP)+, R2` pops.
There are no `PUSH` / `POP` instructions, because they are just addressing modes.

Rule of thumb: **`#` is a value, `@#` is an address.** `MOV #XBUF, R0` loads the *address* of
the console's output register, and `MOV @#RBUF, R0` reads the console's input register.

### 3.5 Encoding, read in octal

`MOV R1, R2` is `010102`: opcode `01` (MOV), source `01` (mode 0, R1), destination `02` (mode
0, R2). Here is a listing in the traditional style (address, words, source). `DRVCNT`, `DRVDIR`
and `DRVCS` are a host's device registers (this example comes from Rover):

```
002000  005001                  CLR  R1
002002  012737  000003  176406  MOV  #3, @#DRVCNT     ; 01 = MOV, 27 = #, 37 = @#
002010  010137  176404          MOV  R1, @#DRVDIR
002014  012737  000001  176400  MOV  #GO, @#DRVCS
002022  105737  176400  2$:     TSTB @#DRVCS          ; 1057 = TSTB, 37 = @#
002026  100402                  BMI  3$               ; 1004 = BMI, offset +2 words
002030  000001                  WAIT
002032  000773                  BR   2$               ; 0004 = BR, offset −5 (373)
```

All these formats are real:

- double operand `oSSDD`
- single operand `ooooDD`
- branch `bbbxxx`, with an 8-bit signed word offset (±127 words)
- `JSR R, DD` and `RTS R`
- `SOB R, offset`, with a 6-bit offset that only goes backwards

## 4. Cycles: one per bus access

Every trip to memory costs **1 cycle**: the instruction word, each extra word (an immediate, an
address, an index), each operand read and each operand write. Work inside the CPU is free.

| Operand | Extra cycles (source) | Extra cycles (destination) |
| :--- | :--- | :--- |
| `R` (mode 0) | 0 | 0 |
| `(R)`, `(R)+`, `-(R)` | 1 read | 1 read and/or 1 write |
| `@(R)+`, `@-(R)` | 2 (pointer + read) | 1 pointer + read / write |
| `X(R)`, `LABEL` | 2 (index word + read) | 1 index word + read / write |
| `@X(R)`, `@LABEL` | 3 | 2 + read / write |
| `#n` | 1 (the word) | – |
| `@#a` | 2 (address + read) | 1 address + read / write |

A destination is **read** if the instruction uses its old value (`ADD`, `INC`, `BIC`, `CMP`,
`TST`, …) and **written** if the instruction changes it (`MOV`, `CLR`, `ADD`, …). `MOV` only
writes, `CMP` / `TST` / `BIT` only read, and `ADD` / `INC` do both.

| Instruction | Cycles |
| :--- | :--- |
| `MOV R1, R2` | 1 |
| `MOV #5, R0` | 2 |
| `MOVB (R1)+, (R2)+` | 3 |
| `INC @#COUNT` | 4 |
| `CMP @#COUNT, #20.` | 4 |
| branches, `SOB`, `WAIT`, `HALT`, flag instructions | 1 |
| `JSR PC, X` | 3 (fetch, displacement, push) |
| `RTS PC` | 2 (fetch, pop) |
| `RTI` | 3 (fetch, pop PC, pop PSW) |
| interrupt or trap entry | 4 (push PSW, push PC, read the two vector words) |

**Why:** it teaches the real reason registers exist. A value kept in R2 is free, while the same
value in memory costs a cycle every time. It also makes costs easy to see: clearing a display
page or drawing a character has a price that a student can count.

A `WAIT` costs 1 cycle, and then nothing while asleep. The option `cycles: 'flat'` charges one
cycle per instruction instead, for hosts that want it.

**Time is cycles, never wall-clock time.** Devices count cycles too (the line clock, the
display's frames, the keyboard's events), so a run depends only on the program, the options and
the inputs with their cycles.

## 5. Flags and branches

`N` (negative), `Z` (zero), `V` (overflow) and `C` (carry) live in the low bits of `PSW`. Almost
every instruction sets them from its result, and branches test them.

```
        CMP  R0, #20.           ; computes R0 − 20, sets N Z V C, stores nothing
        BLT  SMALL              ; signed "less than": N xor V
```

| Branch | Taken if | Use |
| :--- | :--- | :--- |
| `BR` | always | |
| `BEQ` / `BNE` | Z / not Z | equal / not equal |
| `BMI` / `BPL` | N / not N | negative / positive; also bit 7 of a byte, bit 15 of a word |
| `BLT` `BGE` `BGT` `BLE` | signed | coordinates, differences |
| `BLO` `BHIS` `BHI` `BLOS` | unsigned (`BLO` = `BCS`, `BHIS` = `BCC`) | addresses, counts, cycles |
| `BVS` / `BVC`, `BCS` / `BCC` | V / C | overflow, carry |

**The gotcha (a real lesson, not a bug to fix):** the flags belong to the *last* instruction that
set them.

```
        CMP  R0, #10.
        MOV  #1, R1             ; MOV sets N and Z too: the CMP's result is gone
        BLT  LESS               ; tests "1 < 0", not "R0 < 10"
```

The fix is to put the `MOV` before the `CMP`.

**Bit 7 as a flag.** DEC devices put `DONE` in bit 7 of their status register, so `TSTB` and
`BPL` test it without a mask. The display and the keyboard keep this convention: a key that is
down reads `200`, and a release event is a negative byte.

## 6. Traps and interrupts

- **Vectors** are the original's: `004` bus error, odd address and stack limit; `010` illegal
  instruction (EIS instructions without EIS too); `014` `BPT` and trace; `020` `IOT`; `030`
  `EMT`; `034` `TRAP`. Each vector is two words: the new PC and the new PSW.
- **Taking one:** push `PSW`, push `PC`, then load `PC` and `PSW` from the vector (4 cycles). The
  handler ends with **`RTI`**, which pops them back.
- **Priority** is in `PSW` bits 7–5 (0–7). An interrupt request is taken between instructions if
  its level is above the CPU's priority. Devices request at level 4 by default, and the line
  clock at level 6. `MOV #340, @#PSW` blocks everything (level 7).
- **`WAIT`** sleeps until an interrupt is taken, then continues after the `WAIT` once the
  handler's `RTI` has run. The pattern is always "wait, then check again". A host machine skips
  the sleeping cycles straight to the next device event. If no device can wake the CPU, the run
  stops at once instead of hanging.
- **The host can take over a trap:** `onTrap` may answer `'stop'`, for example to serve system
  calls itself or to report a fault. HackCode uses this to stop on a trap whose vector is
  empty and to name the fault.
- **Two programs on one CPU** (a supervisor and a user program) are possible with two saved
  CPU states, `onModeChange` and `protectModes` (the /45 model's mode rules, without its memory
  management). This is built from general options, not as one host's special case.

## 7. Multiply and divide: routines, then the EIS option

The base CPU is the **original /40 model's instruction set without its EIS option**, so it has no
`MUL` or `DIV`. The early /20 model had none either: programs called routines like these. They
make a good first lesson in how arithmetic is done, and `tests/blue11/assembler.test.ts` runs
them.

```
; MUL16: R0 = R0 × R1 (low 16 bits; the same for signed and unsigned).
; Changes R1 (allowed by the convention: R0 and R1 are scratch). Keeps R2 on the stack.
MUL16:  MOV  R2, -(SP)          ; save R2
        CLR  R2                 ; R2 = running sum
1$:     TST  R1                 ; multiplier used up?
        BEQ  3$
        CLC                     ; shift R1 right, with a 0 coming in at the top
        ROR  R1                 ;   ...its lowest bit lands in the carry flag
        BCC  2$                 ; bit was 0: nothing to add
        ADD  R0, R2             ; bit was 1: add the shifted multiplicand
2$:     ASL  R0                 ; multiplicand × 2
        BR   1$
3$:     MOV  R2, R0             ; result in R0
        MOV  (SP)+, R2          ; restore R2
        RTS  PC
```

```
; DIV16: R0 = R0 / R1, R1 = remainder (unsigned). C = 1 if R1 was 0 (R0, R1 unchanged).
DIV16:  TST  R1
        BNE  1$
        SEC                     ; divide by zero: report it in the carry flag
        RTS  PC
1$:     MOV  R2, -(SP)
        MOV  R3, -(SP)
        MOV  R1, R2             ; R2 = divisor
        CLR  R1                 ; R1 = remainder, built up bit by bit
        MOV  #16., R3           ; 16 quotient bits
2$:     ASL  R0                 ; next dividend bit out of R0...
        ROL  R1                 ;   ...into the remainder
        BCS  4$                 ; a 17th bit: certainly >= divisor
        CMP  R1, R2             ; remainder >= divisor? (unsigned)
        BLO  3$
4$:     SUB  R2, R1             ; yes: subtract...
        INC  R0                 ;   ...and the quotient bit is 1
3$:     SOB  R3, 2$             ; 16 times
        MOV  (SP)+, R3
        MOV  (SP)+, R2
        CLC
        RTS  PC
```

- **Cost:** `MUL16` takes 7–8 cycles per bit of the multiplier, so `× 100.` (7 bits) is about 65.
  `DIV16` takes about 150. Students feel that dividing is expensive, which is the real lesson:
  it is why programmers shift instead.
- **The EIS option** (`eis: true`, a real option board) adds `MUL`, `DIV`, `ASH` (shift by n)
  and `ASHC` (shift a register pair). They cost the usual bus accesses plus a fixed internal cost
  (`MUL` +4, `DIV` +8, shifts +1), so they are not *too* fast, but still about 10× faster than
  the routines. Without the option they trap to `010`, so a supervisor could emulate them with
  `MUL16` / `DIV16`, as real systems did.

**The instruction set:**

| Group | Instructions |
| :--- | :--- |
| Double operand | `MOV(B) CMP(B) BIT(B) BIC(B) BIS(B) ADD SUB XOR` |
| Single operand | `CLR(B) COM(B) INC(B) DEC(B) NEG(B) TST(B) ASR(B) ASL(B) ROR(B) ROL(B) ADC(B) SBC(B) SWAB SXT` |
| Branches | `BR BNE BEQ BPL BMI BVC BVS BCC BCS BGE BLT BGT BLE BHI BLOS BHIS BLO` |
| Jumps, subroutines | `JMP JSR RTS SOB` |
| Traps, control | `TRAP EMT BPT IOT RTI RTT WAIT HALT RESET NOP` |
| Flags | `CLC CLV CLZ CLN CCC SEC SEV SEZ SEN SCC` |
| EIS (option) | `MUL DIV ASH ASHC` |

Left out: `MARK`, `MFPI` / `MTPI` (memory management), `MFPS` / `MTPS`, `SPL` (write `PSW`
instead), and floating point. `MOVB` into a register sign-extends, while `CLRB` / `BISB` don't
touch the high byte. Both behaviours are real, and both are lessons.

## 8. Where it departs from the original machine

The library behaves like the original machine (the /40 model, EIS optional), and every
difference is listed here and in the README:

1. **Cycles count bus accesses**, not microseconds (§4). EIS instructions add a fixed internal
   cost. `cycles: 'flat'` is the other option.
2. **Long names and `_`** only with `names: 'long'`. By default, names longer than six characters
   are an error rather than silently cut (§3.1).
3. **Values that don't fit are errors** in the assembler, where the original flagged them and
   assembled anyway.
4. **`JMP` / `JSR` to a register traps to 10**, the illegal-instruction vector (the original
   models differed).
5. **Not implemented:** macros, sections and linking, floating point, memory management, `MARK`,
   `SPL`, `MFPI` / `MTPI`, `MFPS` / `MTPS`. Using any of them is always an error, never silently
   ignored.
6. **`protectModes`** gives the /45 model's mode rules without its memory management. The host
   protects memory itself, by refusing writes on its bus.
7. **`stackLimit`** is a single register in the style of the /45 model's `STKLIM`: a push below
   it traps to 4.
8. **Teaching devices** that DEC never made: the display ([`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md))
   and the keyboard ([`BLUE11_KEYBOARD.md`](BLUE11_KEYBOARD.md)). Their vectors and register
   addresses are ours. The console (DL11) and the line clock (KW11-L) keep DEC's addresses and
   vectors.

## 9. The library

### 9.1 What goes where

| The library | A host (HackCode, the simulator, …) |
| :--- | :--- |
| The CPU: registers, `PSW`, the eight addressing modes, the instruction set (§7), flags, traps, interrupts, `WAIT` / `HALT` / `RESET` | its memory map: how much RAM, where ROM and devices are, any write protection |
| Options: EIS on or off, the cycle model, long names, `protectModes`, `stackLimit`, hooks (`onTrap`, `onInstruction`, `onAccess`, `onModeChange`) | its own devices, and its predefined symbols |
| The assembler (§3) → words, a listing, the symbol table, a source line map, errors and warnings | its ROM contents (HackCode's BIOS, the simulator's font and `DRAWCH`) |
| The disassembler and the octal listing format (§3.5) | when its own devices interrupt, and what `HALT` means to it |
| `DeviceMachine`, the `Device` interface, `SimpleMachine`. DEC's `DL11` and `KW11L`. The general devices: `Rom`, `Display`, `Keyboard` (specified, not built) | its UI: editor, debugger, lessons, help, saves |
| Saving and restoring state as plain JSON | |
| A separate, optional entry point: CodeMirror syntax highlighting | |

### 9.2 Rules

The full list, with what is enforced by tests, is in the library's
[`AGENTS.md`](../src/blue11/AGENTS.md). In short:

- **Nothing imports from outside the library**, and it has no runtime dependencies. A test fails
  if a file imports from outside the folder, so the boundary can't erode quietly.
- **Deterministic and integer-only:** no DOM, no `Math.random`, no wall-clock time, no floating
  point. Time is CPU cycles. Any host benefits from this: replays, tests and shared programs
  behave the same everywhere.
- **Errors in the program are values** (assembler errors with line and column, traps, stops).
  **Mistakes by the host throw**, at setup only.
- **Nothing host-specific.** A host that needs new behaviour gets a general option or hook that
  the original machine had, or one documented as a departure (§8).
- **Behave like the original machine, and assemble like the original assembler.** Every
  departure is listed in §8 and in the README.

### 9.3 Its own repository

The library started as the folder `src/blue11/` inside HackCode, with its own entry point
(`index.ts`) and tests (`tests/blue11/`). The plan was to move it out "when a second project
needs it", and the standalone simulator is that project. The move, the npm package and the
simulator are steps 4–8 of ROADMAP.md §1.
