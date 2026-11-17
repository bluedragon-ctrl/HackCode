/**
 * Implicit .WORD (an expression where the instruction goes, as in the original assembler) and
 * the warnings for things that assemble but are probably not meant.
 */
import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/blue11';
import { errors, runAsm, warns, word, words } from './helpers';

describe('blue11 assembler: implicit .WORD', () => {
  it('an expression where the instruction goes is a word', () => {
    expect(words(' 1234')).toEqual([0o1234]);
    expect(words(" 'A, -1, <2+3>*2")).toEqual([0o101, 0o177777, 10]);
    expect(words('X = 7\n X, X+1')).toEqual([7, 8]);
    expect(words('T: .\n HALT')).toEqual([0o1000, 0]);
    expect(words('A = 1\nB = 4\n A!B')).toEqual([5]); // NAME!NAME: not a flag combination
  });

  it('instruction names have their opcode as value', () => {
    expect(words(' MOV #NOP, R0')).toEqual([0o012700, 0o240]);
    expect(words('TBL: HALT\n WAIT\n CLC!CLV\n .WORD MOV+27')).toEqual([0, 1, 0o243, 0o10027]);
    // An instruction name first on the line is always the instruction.
    expect(errors(' WAIT, 1')).toEqual(['WAIT takes no operands']);
    expect(words(' .WORD BR+2')).toEqual([0o000402]);
  });

  it('forward references and labels work as data lines', () => {
    const { cpu } = runAsm(`
        MOV PTR, R0
        MOV (R0), R1
        HALT
PTR:    DATA
DATA:   777`);
    expect(cpu.r[1]).toBe(0o777);
  });

  it('a typo stays an unknown instruction, data errors say what is wrong', () => {
    expect(errors(' MOVV R0, R1')).toEqual(['unknown instruction MOVV']);
    expect(errors(' FOO')).toEqual(['unknown instruction FOO (for data, use .WORD)']);
    expect(errors(' FOO ; comment')).toEqual(['unknown instruction FOO (for data, use .WORD)']);
    expect(errors(' FOO+1')).toEqual(['undefined symbol FOO']);
    expect(errors(' 1, FOO')).toEqual(['undefined symbol FOO']);
    expect(errors(' .BYTE 1\n 2')).toEqual([expect.stringMatching(/odd address/)]);
  });
});

describe('blue11 assembler warnings', () => {
  it('are separate from errors and do not stop the program', () => {
    const a = assemble('X = 200000\n MOV #X, R0\n HALT');
    expect(a.ok).toBe(true);
    expect(a.warnings.map((w) => [w.line, w.message])).toEqual([[1, "200000 doesn't fit 16 bits: X = 000000"]]);
  });

  it('a name alone on a line is data, with a warning', () => {
    expect(word('MOVE = 0\nX:  MOVE\n    HALT')).toBe(0);
    expect(warns('MOVE = 0\nX:  MOVE\n    HALT')).toEqual([
      '2:5 MOVE alone is stored as data (.WORD MOVE): a missing instruction, or a label without its colon?',
    ]);
  });

  it('a table of names and a number alone give no warning', () => {
    expect(warns('A = 1\nB = 2\nT:  A, B\n    1234\n    .WORD A')).toEqual([]);
  });

  it('* or / after + or - warns: there is no precedence', () => {
    expect(word(' .WORD 1+2*3')).toBe(9);
    expect(warns(' .WORD 1+2*3')).toEqual(['1:11 * after + or - is evaluated left to right, not first: group with < > (1+<2*3>)']);
    expect(warns(' MOV #10-4/2, R0')).toHaveLength(1);
  });

  it('no warning with < >, or with * first', () => {
    expect(warns(' .WORD 1+<2*3>\n .WORD 2*3+1\n .WORD <1+2>*3')).toEqual([]);
  });

  it('a symbol named like an instruction', () => {
    expect(warns('HALT: BR HALT')).toEqual(['1:1 HALT is also an instruction; as a value it now means this label']);
    expect(warns('NOP = 5')).toEqual(['1:1 NOP is also an instruction; as a value it now means this symbol']);
    expect(words('NOP = 5\n MOV #NOP, R0\n NOP')).toEqual([0o012700, 5, 0o240]);
    expect(warns('1$: BR 1$\nLOOP: BR LOOP')).toEqual([]);
  });
});
