/** The device prelude given to assemble({ symbols }) (DESIGN.md §9). */
import { describe, expect, it } from 'vitest';
import { assemble } from 'blue11';
import { CSR, ERR, FN, REG, SYMBOLS, VECTOR } from '../../src/core';

describe('device symbols', () => {
  it('are names of at most 6 characters the assembler accepts', () => {
    for (const name of Object.keys(SYMBOLS)) {
      expect(name, name).toMatch(/^[A-Z.$][A-Z0-9.$]{0,5}$/);
      const a = assemble(` .WORD ${name}`, { symbols: SYMBOLS });
      expect(a.errors, name).toEqual([]);
      expect(a.warnings, name).toEqual([]);
      expect(a.bytes[0] | (a.bytes[1] << 8), name).toBe(SYMBOLS[name] & 0xffff);
    }
  });

  it('cover every register, vector, function, CSR bit and error code', () => {
    for (const [k, v] of Object.entries(REG)) expect(SYMBOLS[k], k).toBe(v);
    const values = new Set(Object.values(SYMBOLS));
    for (const v of [...Object.values(VECTOR), ...Object.values(CSR), ...Object.values(FN), ...Object.values(ERR)]) {
      expect(values.has(v), v.toString(8)).toBe(true);
    }
    expect(SYMBOLS['WH.LFT']).toBe(FN.WHEELS_LEFT);
    expect(SYMBOLS['CS.GO']).toBe(CSR.GO);
    expect(SYMBOLS.WHLVEC).toBe(VECTOR.WHEELS);
  });

  it('combine in instructions', () => {
    const a = assemble(' MOV #WH.RGT!CS.GO!CS.IE, @#WHLCSR\n BIT #F.SOLD, R0', { symbols: SYMBOLS });
    expect(a.errors).toEqual([]);
    expect(a.bytes[2] | (a.bytes[3] << 8)).toBe(0o105);
    expect(a.bytes[4] | (a.bytes[5] << 8)).toBe(0o176400);
  });

  it('a label with a device name is an error, as the assembler promises', () => {
    expect(assemble('WHLCSR: HALT', { symbols: SYMBOLS }).ok).toBe(false);
  });
});
