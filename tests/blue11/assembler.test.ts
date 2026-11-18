import { describe, expect, it } from 'vitest';
import { assemble, commentStart, disassemble, INSTRUCTIONS, octal } from '../../src/blue11';
import { DIV16, MUL16 } from '../../src/simulator/examples';
import { assembleOk } from '../helpers/asm';
import { boot, err, runAsm, words, wordsOf } from './helpers';

describe('blue11 assembler: encoding', () => {
  it('the listing example of BLUE11_CPU.md §3.5', () => {
    const syms = { DRVCS: 0o176400, DRVDIR: 0o176404, DRVCNT: 0o176406, GO: 1 };
    const a = assembleOk(`
        CLR  R1
        MOV  #3, @#DRVCNT
        MOV  R1, @#DRVDIR
        MOV  #GO, @#DRVCS
2$:     TSTB @#DRVCS
        BMI  3$
        WAIT
        BR   2$
3$:     HALT`, { origin: 0o2000, symbols: syms });
    expect(wordsOf(a).slice(0, 15).map((w) => octal(w))).toEqual([
      '005001', '012737', '000003', '176406', '010137', '176404', '012737', '000001', '176400',
      '105737', '176400', '100402', '000001', '000773', '000000',
    ]);
    expect(a.listing).toContain('002002  012737 000003 176406');
  });

  it('every mode encodes as documented', () => {
    expect(words('MOV R1, R2')).toEqual([0o010102]);
    expect(words('MOV (R1), (R2)+')).toEqual([0o011122]);
    expect(words('MOV @(R1)+, -(SP)')).toEqual([0o013146]);
    expect(words('MOV @-(R1), 4(R2)')).toEqual([0o015162, 4]);
    expect(words('MOV @6(R1), @(R2)')).toEqual([0o017172, 6, 0]);
    expect(words('MOV @R1, R2')).toEqual([0o011102]);
  });

  it('relative addressing is PC-relative', () => {
    // at 1000: MOV X, R0 = 016700 <off>; off = X - 1004
    expect(words(' MOV X, R0\nX: .WORD 0')).toEqual([0o016700, 0, 0]);
    expect(words(' MOV @X, R0\n HALT\nX: .WORD 0')).toEqual([0o017700, 2, 0, 0]);
  });

  it('every instruction in the table assembles and disassembles to itself', () => {
    for (const op of INSTRUCTIONS) {
      let line: string;
      switch (op.format) {
        case 'double': line = `${op.name} R1, (R2)+`; break;
        case 'single': line = op.name === 'JMP' ? 'JMP (R3)' : `${op.name} -(R3)`; break;
        case 'jsr': line = 'JSR R5, @(R4)+'; break;
        case 'rts': line = 'RTS R5'; break;
        case 'xor': line = 'XOR R1, R2'; break;
        case 'regsrc': line = `${op.name} R1, R2`; break;
        case 'branch': line = `${op.name} .`; break;
        case 'sob': line = 'SOB R1, .'; break;
        case 'trap': line = `${op.name} 7`; break;
        default: line = op.name;
      }
      const w = words(line);
      const d = disassemble((a) => w[(a - 0o1000) / 2] ?? 0, 0o1000);
      expect(d.words.length, line).toBe(w.length);
      const expected = op.name === 'BHIS' ? 'BCC' : op.name === 'BLO' ? 'BCS' : op.name;
      expect(d.text.split(' ')[0], line).toBe(expected);
      // Reassemble the disassembly: same words.
      expect(words(d.text.replace(/\b0*(\d+)\b/g, '$1')), d.text).toEqual(w);
    }
  });

  it('flag operations combine with !, as the disassembler writes them', () => {
    expect(words(' CLC!CLV')).toEqual([0o000243]);
    expect(words(' SEN ! SEZ ; comment')).toEqual([0o000274]);
    expect(err(' CLC!SEV')).toMatch(/cannot be combined/); // the original assembler would quietly make it a set
    expect(err(' CLC!HALT')).toMatch(/only flag operations/);
    expect(err('CLC!FOO')).toMatch(/only flag operations/);
    expect(err(' CLC!CLV R0')).toMatch(/no operands/);
    expect(words(' MOV #1!2, R0')).toEqual([0o012700, 3]); // ! between values is OR
  });
});

describe('blue11 assembler: numbers, expressions, symbols', () => {
  it('symbols, register symbols, the location counter', () => {
    const a = assemble(`
N = 5
DIR = %1
        MOV #N, DIR
HERE:   .WORD .
        . = . + 10
END:    .WORD END-HERE`);
    expect(a.errors).toEqual([]);
    expect(a.symbols.get('N')).toBe(5);
    expect(a.symbols.has('DIR')).toBe(false);
    const w = words('N = 5\nDIR = %1\n MOV #N, DIR');
    expect(w).toEqual([0o012701, 5]);
    expect(a.symbols.get('END')! - a.symbols.get('HERE')!).toBe(0o12);
  });

  it('forward references', () => {
    expect(words(' MOV #LATER, R0\nLATER = 7')).toEqual([0o012700, 7]);
  });

  it('predefined symbols, case-insensitive', () => {
    expect(words('mov @#bat, r0', { symbols: { BAT: 0o177000 } })).toEqual([0o013700, 0o177000]);
  });
});

describe('blue11 assembler: directives', () => {
  it('.BYTE, .ASCII, .ASCIZ, .EVEN, .BLKW, .BLKB', () => {
    const a = assemble(`
        .BYTE 1, 377, -1
        .ASCII /AB;C/<15><12>  ; a comment
        .ASCIZ "x"
        .EVEN
        .BLKW 2
        .BLKB 3
        .EVEN
W:      .WORD 1`);
    expect(a.errors).toEqual([]);
    expect([...a.bytes.slice(0, 12)]).toEqual([1, 255, 255, 65, 66, 59, 67, 13, 10, 120, 0, 0]);
    expect(a.symbols.get('W')).toBe(0o1000 + 12 + 4 + 4);
  });

  it('a comment may mention .ASCII / .ASCIZ / .BYTE', () => {
    const a = assemble(`; R0 = text (.ASCIZ), "quoted" / slashed
        CLR R0          ; ends with .ASCII /x
        .ASCIZ /A;B/    ; .ASCIZ in a comment after .ASCIZ`);
    expect(a.errors).toEqual([]);
    expect([...a.bytes]).toEqual([0o000, 0o012, 65, 59, 66, 0]);
  });

  it('the source line map', () => {
    const a = assemble('; comment\n CLR R0\n\n MOV #1, R1\n HALT');
    expect([...a.lineAt]).toEqual([[0o1000, 2], [0o1002, 4], [0o1006, 5]]);
  });

  it('a program filling nearly all of memory assembles', () => {
    const a = assemble('. = 0\n.BLKW 77777\n.WORD 1');
    expect(a.ok).toBe(true);
    expect(a.bytes.length).toBe(0o177776 + 2);
  });
});

describe('blue11 assembler: errors are values with line and column', () => {
  it('reports them', () => {
    const a = assemble(' CLR R0\n FOO R1\n MOV R1\n BR NOWHR');
    expect(a.errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'unknown instruction FOO'],
      [3, 'MOV takes two operands: src, dst'],
      [4, 'undefined symbol NOWHR'],
    ]);
    expect(a.errors[2].column).toBe(5);
  });

  it('branch range, odd addresses, duplicates, registers as values', () => {
    const far = assemble(' BR X\n .BLKW 200\nX: HALT');
    expect(far.errors.map((e) => e.message)).toEqual(['branch target too far (128 words; the limit is −128…127, use JMP)']);
    expect(err(' .BYTE 1\n CLR R0')).toMatch(/odd address/);
    expect(err('A: HALT\nA: HALT')).toMatch(/defined twice/);
    expect(err(' MOV #R1, R0')).toMatch(/register/);
    expect(err(' JMP R1')).toMatch(/not a register/);
    expect(err(' SOB R1, X\n HALT\nX: HALT')).toMatch(/backwards/);
    expect(err(' SOB R1, X\nX: HALT')).toMatch(/backwards/); // offset 0: a jump to the next instruction
    expect(words(' SOB R1, .')).toEqual([0o077101]);
    expect(err('.BYTE 400')).toMatch(/byte/);
  });
});

describe('blue11 disassembler', () => {
  it('shows targets as absolute addresses or names', () => {
    const w = words(' BR X\n MOV @#X, R0\n JSR PC, X\nX: HALT');
    const read = (a: number): number => w[(a - 0o1000) / 2] ?? 0;
    expect(disassemble(read, 0o1000).text).toBe('BR 001012');
    expect(disassemble(read, 0o1002).text).toBe('MOV @#001012, R0');
    expect(disassemble(read, 0o1006, { nameOf: (a) => (a === 0o1012 ? 'X' : undefined) }).text).toBe('JSR PC, X');
    expect(disassemble(() => 0o000007, 0).text).toBe('.WORD 000007');
  });

  it('writes every flag-operation combination so that it assembles back', () => {
    expect(disassemble(() => 0o000243, 0).text).toBe('CLC!CLV');
    for (let w = 0o000241; w < 0o000300; w++) {
      if (w === 0o000260) continue;
      const text = disassemble(() => w, 0).text;
      expect(words(` ${text}`), text).toEqual([w]);
    }
  });
});

describe('blue11 programs from the design (BLUE11_CPU.md §9; src/simulator/examples.ts)', () => {
  it.each([[7, 9], [123, 100], [0, 55], [255, 255], [1000, 65]])('MUL16 %i × %i', (a, b) => {
    const { cpu } = runAsm(` MOV #${a}., R0\n MOV #${b}., R1\n MOV #77, R2\n JSR PC, MUL16\n HALT\n${MUL16}`);
    expect(cpu.r[0]).toBe((a * b) & 0xffff);
    expect(cpu.r[2]).toBe(0o77);
  });

  it.each([[100, 7], [65535, 10], [5, 9], [40000, 1], [65535, 65535]])('DIV16 %i / %i', (a, b) => {
    const { cpu } = runAsm(` MOV #${a}., R0\n MOV #${b}., R1\n JSR PC, DIV16\n HALT\n${DIV16}`);
    expect(cpu.r[0]).toBe(Math.floor(a / b));
    expect(cpu.r[1]).toBe(a % b);
    expect(cpu.c).toBe(false);
  });

  it('DIV16 by zero sets C', () => {
    const { cpu } = runAsm(` MOV #5, R0\n CLR R1\n JSR PC, DIV16\n HALT\n${DIV16}`);
    expect(cpu.c).toBe(true);
    expect(cpu.r[0]).toBe(5);
  });

  it('MUL16 × 100. costs about 65 cycles (§9.1)', () => {
    const a = runAsm(` MOV #3, R0\n MOV #100., R1\n JSR PC, MUL16\n HALT\n${MUL16}`);
    const cycles = a.result.cycles - 2 - 2 - 1; // the two MOVs and HALT
    expect(cycles).toBeGreaterThan(50);
    expect(cycles).toBeLessThan(90);
  });

  it('echoes keyboard input with interrupts', () => {
    const { m } = boot(`
        MOV #RX, @#60
        MOV #200, @#62
        MOV #100, @#177560    ; receiver interrupts on
1$:     WAIT
        BR 1$
RX:     MOVB @#177562, @#177566
        RTI`);
    m.run(100);
    m.type('h'); m.type('i');
    m.run(1000);
    expect(m.output).toBe('hi');
  });
});

describe('commentStart', () => {
  it('finds the comment as the assembler does', () => {
    expect(commentStart(' MOV R0, R1 ; copy')).toBe(12);
    expect(commentStart(' MOV R0, R1')).toBe(-1);
    expect(commentStart(" CMPB R0, #'; ; x")).toBe(14);
    expect(commentStart(' CMP R0, #";A ; x')).toBe(14);
    expect(commentStart(' .ASCIZ /a;b/ ; x')).toBe(14);
    expect(commentStart(' .ASCII <15>/;/<12>;x')).toBe(19);
    expect(commentStart(' .ASCII /unclosed;')).toBe(-1);
  });
});
