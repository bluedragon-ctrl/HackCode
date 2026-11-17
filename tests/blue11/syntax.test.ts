/**
 * README "Assembler compatibility": every claim there is checked here. Implicit .WORD and
 * the warnings for likely mistakes are in syntax-warnings.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/blue11';
import { assembleOk } from '../helpers/asm';
import { err, word, words } from './helpers';

describe('assembler compatibility', () => {
  it('statement format, case, operand spacing', () => {
    expect(words('start: mov r0,r1 ; comment')).toEqual(words('START:  MOV  R0, R1'));
  });

  it('numbers: octal, a trailing dot for decimal, ^D ^O ^B, characters, complement', () => {
    expect(words('.WORD 20, 20., ^D20, ^O20, ^B101, \'A, "AB, ^C0')).toEqual([16, 20, 20, 16, 5, 65, 0x4241, 0xffff]);
    expect(err('.WORD 19')).toMatch(/not octal.*19\./);
  });

  it('strict left-to-right evaluation, < > grouping, & and !', () => {
    expect(words('.WORD 1+2*3, 1+<2*3>, 17&5!40, 10-1&6, 1!2, -1')).toEqual([9, 7, 0o45, 6, 3, 0xffff]);
  });

  it('assignment, register symbols, the location counter, global forms', () => {
    expect(assembleOk('N = 5\nN2 == 6\nX = %2\nA:: CLR X\n. = . + 10\nB: BR .+4').symbols.get('B')).toBe(0o1000 + 2 + 8);
  });

  it('local labels live between two ordinary labels', () => {
    expect(words('A: BR 1$\n1$: BR A\nB: BR 1$\n1$: HALT')).toEqual([0o000400, 0o000776, 0o000400, 0]);
    expect(err('L: HALT\n1$: BR L\nM: BR 1$')).toMatch(/undefined symbol 1\$/);
  });

  it('.END expr sets the start and ends the source, even with a bad start address', () => {
    const r = assembleOk('S: HALT\nT: HALT\n.END T\n THIS IS NOT ASSEMBLED');
    expect(r.start).toBe(r.symbols.get('T'));
    const bad = assemble('HALT\n.END FOO\nMOV R0, R1\n');
    expect(bad.errors.map((e) => e.message)).toEqual(['undefined symbol FOO']);
    expect(bad.bytes.length).toBe(2);
  });

  it('differences: names of at most 6 characters without "_" (long ones on request), values that do not fit', () => {
    expect(err('COUNTER1: HALT')).toMatch(/at most 6 characters/);
    expect(err('A_B = 1')).toMatch(/"_"/);
    expect(err(' MOV #ERR_BLOCKED, R0', { symbols: { ERR_BLOCKED: 1 } })).toMatch(/"_"/);
    expect(assemble('ERR_BLOCKED = 1\nCOUNTER_1: MOV #ERR_BLOCKED, R0', { names: 'long' }).ok).toBe(true);
    expect(err(' .BYTE 400')).toMatch(/doesn't fit in a byte/);
    expect(err(' TRAP 400')).toMatch(/0–377/);
  });

  it('predefined symbols: not as a label; a direct assignment may reassign one', () => {
    expect(err('XCSR: HALT', { symbols: { XCSR: 0o177564 } })).toMatch(/predefined symbol/);
    expect(word('XCSR = 1\n .WORD XCSR', { symbols: { XCSR: 0o177564 } })).toBe(1);
  });

  it('not supported: an error, never silently ignored', () => {
    for (const d of ['.MACRO FOO', '.MCALL X', '.IRP', '.REPT 3', '.NARG', '.IF EQ 0', '.IIF EQ 0, HALT', '.PSECT', '.CSECT', '.ASECT', '.GLOBL X', '.LIMIT', '.RADIX 10', '.RAD50 /ABC/', '.REM', '.PRINT', '.FLT2 1.0'])
      expect(assemble(' ' + d).ok, d).toBe(false);
    expect(err(' .WORD ^RABC')).toMatch(/unknown \^R/);
  });

  it('listing control directives are accepted and ignored', () => {
    expect(words(' .TITLE T\n .SBTTL S\n .IDENT /1/\n .ENABL LC\n .DSABL GBL\n .LIST\n .NLIST\n .PAGE\n HALT')).toEqual([0]);
  });
});
