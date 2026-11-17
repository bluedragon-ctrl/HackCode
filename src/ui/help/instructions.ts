/**
 * One help entry per instruction, grouped. Every name in the instruction table
 * (`INSTRUCTIONS`, src/blue11/isa.ts) must be in exactly one entry: tests/ui/help.test.ts.
 *
 * Flags: four characters for N Z V C. `*` set from the result, `0` / `1` cleared / set,
 * `-` unchanged. Anything longer is shown as it is.
 */

import type { Entry } from './model';

export interface OpGroup {
  title: string;
  intro: string;
  ops: OpHelp[];
}

export interface OpHelp {
  /** The mnemonics, the first one is the anchor: `['MOV', 'MOVB']`. */
  names: string[];
  syntax: string;
  flags: string;
  text: string;
}

const op = (names: string | string[], syntax: string, flags: string, text: string): OpHelp =>
  ({ names: Array.isArray(names) ? names : [names], syntax, flags, text });

/** `MOV` with its byte form `MOVB`. */
const wb = (name: string, syntax: string, flags: string, text: string): OpHelp =>
  op([name, name + 'B'], syntax.replace(name, `${name}(B)`), flags, text);

export const OP_GROUPS: OpGroup[] = [
  {
    title: 'Moving data',
    intro: 'A **(B)** in the name means the instruction has a byte form too: `MOV` copies a word, `MOVB` a byte.',
    ops: [
      wb('MOV', 'MOV src, dst', '**0-', 'Copy `src` to `dst`. `MOV #5, R0` puts 5 into R0. `MOVB` into a register **sign-extends**: the byte 377 becomes 177777 (−1).'),
      wb('CLR', 'CLR dst', '0100', 'Set `dst` to 0.'),
      op('SWAB', 'SWAB dst', '**00', 'Swap the two bytes of a word. N and Z come from the new low byte.'),
      op('SXT', 'SXT dst', '-*0-', '`dst` = 0 if N is clear, 177777 if N is set: extends a sign into a whole word.'),
    ],
  },
  {
    title: 'Arithmetic',
    intro: 'All arithmetic is 16-bit. C is the carry (unsigned overflow), V the signed overflow.',
    ops: [
      op('ADD', 'ADD src, dst', '****', '`dst` = `dst` + `src`.'),
      op('SUB', 'SUB src, dst', '****', '`dst` = `dst` − `src`. C is set on a borrow (`src` was bigger, unsigned).'),
      wb('INC', 'INC dst', '***-', 'Add 1. C is not changed, so `INC` can count inside multi-word arithmetic.'),
      wb('DEC', 'DEC dst', '***-', 'Subtract 1. C is not changed.'),
      wb('NEG', 'NEG dst', '****', '`dst` = −`dst` (two\'s complement).'),
      wb('ADC', 'ADC dst', '****', 'Add the C flag: the high word of a 32-bit add.'),
      wb('SBC', 'SBC dst', '****', 'Subtract the C flag: the high word of a 32-bit subtract.'),
      wb('CMP', 'CMP src, dst', '****', 'Compute `src` − `dst`, set the flags, store nothing. Note the order: `CMP R0, #10` then `BLT` branches if R0 < 10. See [branches](instructions#op-BLT).'),
      wb('TST', 'TST dst', '**00', 'Set N and Z from `dst`: `TST R0` then `BEQ` branches if R0 is 0. `TSTB @#WHLCSR` puts the READY bit (bit 7) into N.'),
    ],
  },
  {
    title: 'Bits and logic',
    intro: 'Masks name the bits: `BIT #F.SOLD, R0` tests the SOLID flag, `BIS #CS.GO, R0` sets GO.',
    ops: [
      wb('BIT', 'BIT src, dst', '**0-', 'AND `src` with `dst`, set the flags, store nothing. `BNE` after it: some of the bits are set.'),
      wb('BIC', 'BIC src, dst', '**0-', 'Clear in `dst` the bits that are set in `src`. `BIC #177400, R0` keeps only the low byte.'),
      wb('BIS', 'BIS src, dst', '**0-', 'Set in `dst` the bits that are set in `src` (OR).'),
      wb('COM', 'COM dst', '**01', 'Invert every bit.'),
      op('XOR', 'XOR R, dst', '**0-', '`dst` = `dst` XOR register `R`. The source must be a register; word only.'),
    ],
  },
  {
    title: 'Shifts and rotates',
    intro: 'One bit at a time; the bit shifted out goes into C. V is N xor C after the shift.',
    ops: [
      wb('ASL', 'ASL dst', '****', 'Shift left, 0 comes in: multiply by 2.'),
      wb('ASR', 'ASR dst', '****', 'Shift right, the sign bit is kept: divide a signed number by 2, rounding down.'),
      wb('ROL', 'ROL dst', '****', 'Rotate left through C: C goes into bit 0, bit 15 (7 for bytes) into C.'),
      wb('ROR', 'ROR dst', '****', 'Rotate right through C: C goes into the top bit, bit 0 into C.'),
    ],
  },
  {
    title: 'Branches',
    intro: 'A branch tests the flags left by the **last** instruction that set them, usually a `CMP`, `TST` or `BIT` just before. '
      + 'It reaches at most 127 words forward or 128 back; further away, branch around a `JMP`. Branches change no flags.',
    ops: [
      op('BR', 'BR label', '----', 'Always branch.'),
      op('BEQ', 'BEQ label', '----', 'Branch if Z: equal, or zero.'),
      op('BNE', 'BNE label', '----', 'Branch if not Z: not equal, not zero.'),
      op('BMI', 'BMI label', '----', 'Branch if N: negative. Also: the top bit was set (bit 15, or bit 7 after a byte instruction).'),
      op('BPL', 'BPL label', '----', 'Branch if not N: zero or positive.'),
      op('BLT', 'BLT label', '----', 'Signed: branch if less than (after `CMP a, b`: a < b).'),
      op('BLE', 'BLE label', '----', 'Signed: branch if less or equal.'),
      op('BGT', 'BGT label', '----', 'Signed: branch if greater than.'),
      op('BGE', 'BGE label', '----', 'Signed: branch if greater or equal.'),
      op(['BCS', 'BLO'], 'BCS / BLO label', '----', 'Branch if C. After `CMP a, b`: a < b **unsigned** (`BLO`). After an `EMT`: the call failed.'),
      op(['BCC', 'BHIS'], 'BCC / BHIS label', '----', 'Branch if not C. After `CMP a, b`: a ≥ b unsigned (`BHIS`). After an `EMT`: the call worked.'),
      op('BHI', 'BHI label', '----', 'Unsigned: branch if higher (a > b).'),
      op('BLOS', 'BLOS label', '----', 'Unsigned: branch if lower or the same (a ≤ b).'),
      op('BVS', 'BVS label', '----', 'Branch if V: signed overflow.'),
      op('BVC', 'BVC label', '----', 'Branch if not V.'),
      op('SOB', 'SOB R, label', '----', 'Subtract one and branch: R = R − 1, then branch back to `label` if R is not 0. The label must be before the `SOB`, at most 63 words back. `MOV #5, R2` … `SOB R2, 1$` loops five times.'),
    ],
  },
  {
    title: 'Jumps and subroutines',
    intro: 'See [the stack](stack) for how calls use it.',
    ops: [
      op('JMP', 'JMP dst', '----', 'Jump to the address of `dst`: `JMP LOOP`, or through a table: `JMP @TABLE(R1)`. A register as `dst` (`JMP R0`) is illegal and traps.'),
      op('JSR', 'JSR R, dst', '----', 'Call a subroutine: push `R`, put the return address in `R`, jump to `dst`. Nearly always `JSR PC, NAME`, which just pushes the return address.'),
      op('RTS', 'RTS R', '----', 'Return from a subroutine: PC = `R`, then pop `R`. `RTS PC` ends a `JSR PC` call.'),
    ],
  },
  {
    title: 'Traps and interrupts',
    intro: 'A trap pushes the PSW and the PC and loads both from a **vector**, a pair of words in low memory. See [traps](traps) and [interrupts](interrupts).',
    ops: [
      op('EMT', 'EMT n', 'set by the call', 'Trap through the vector at 30: a [BIOS call](bios). `n` (0–377) is the call number: `EMT MOVE`.'),
      op('TRAP', 'TRAP n', 'from the vector', 'Trap through the vector at 34, for your own system calls. Nothing is installed there: write a handler first.'),
      op('BPT', 'BPT', 'from the vector', 'Breakpoint trap, vector 14.'),
      op('IOT', 'IOT', 'from the vector', 'I/O trap, vector 20.'),
      op('RTI', 'RTI', 'from the stack', 'Return from an interrupt or trap: pop the PC, then the PSW.'),
      op('RTT', 'RTT', 'from the stack', 'As `RTI` (it differs only for single-stepping with the trace bit).'),
      op('WAIT', 'WAIT', '----', 'Sleep until an interrupt comes, then go on after the `WAIT` once its handler returns. Asleep, the CPU uses almost no energy. With no interrupt enabled nothing can wake it: the run stops.'),
    ],
  },
  {
    title: 'CPU control and flags',
    intro: '',
    ops: [
      op('HALT', 'HALT', '----', 'Stop the program. The status line shows where.'),
      op('RESET', 'RESET', '----', 'Reset every device: actions in progress are abandoned, interrupts are off, all are READY.'),
      op('NOP', 'NOP', '----', 'Do nothing (one cycle).'),
      op(['CLC', 'CLV', 'CLZ', 'CLN', 'CCC'], 'CLC CLV CLZ CLN CCC', 'as named', 'Clear C, V, Z or N; `CCC` clears all four.'),
      op(['SEC', 'SEV', 'SEZ', 'SEN', 'SCC'], 'SEC SEV SEZ SEN SCC', 'as named', 'Set C, V, Z or N; `SCC` sets all four.'),
    ],
  },
  {
    title: 'Multiply and divide (locked)',
    intro: 'The **EIS** instructions need the math chip, which the robot has not found yet: until then they trap to 10 ([illegal instruction](traps)). '
      + 'Multiply by shifting and adding meanwhile. `R` must be a register; an even one (R0, R2, R4) holds a 32-bit value in `R` (high word) and `R+1` (low).',
    ops: [
      op('MUL', 'MUL src, R', '**0*', '`R` × `src`, signed. With an even `R` the 32-bit product is in `R`:`R+1`, with an odd one only its low word. C: the product needs more than 16 bits.'),
      op('DIV', 'DIV src, R', '****', 'Divide the 32-bit `R`:`R+1` (`R` even) by `src`: the quotient goes into `R`, the remainder into `R+1`. V: division by 0 or overflow.'),
      op('ASH', 'ASH src, R', '****', 'Shift `R` by `src` places (−32 to 31): left if positive, right (arithmetic) if negative.'),
      op('ASHC', 'ASHC src, R', '****', 'As `ASH`, on the 32-bit `R`:`R+1`.'),
    ],
  },
];

/** `N* Z* V0 C-` for '**0-'. */
export function flagText(flags: string): string {
  if (flags.length !== 4) return flags;
  return [...flags].map((f, i) => 'NZVC'[i] + (f === '-' ? '–' : f)).join(' ');
}

export function opEntry(o: OpHelp): Entry {
  return { anchor: `op-${o.names[0]}`, names: o.names, term: `\`${o.syntax}\``, detail: flagText(o.flags), text: o.text };
}
