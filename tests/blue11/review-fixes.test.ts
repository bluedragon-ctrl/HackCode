import { describe, expect, it } from 'vitest';
import { assemble, disassemble, DL11, SimpleMachine } from '../../src/blue11';
import { o, runAsm, words } from './helpers';

const err = (src: string): string => assemble(src).errors.map((e) => e.message).join('\n');

describe('blue11 library: review fixes', () => {
  it('a byte write to the high byte of a device register leaves its low byte alone', () => {
    const m = new SimpleMachine();
    const csrs = { RCSR: o('177560'), XCSR: o('177564'), LKS: o('177546') };
    for (const a of Object.values(csrs)) {
      expect(m.write(a, 0o300, false)).toBe(true); // interrupts on (LKS keeps DONE)
      expect(m.write(a + 1, 0o377, true)).toBe(true); // MOVB to the high byte
    }
    expect(m.read(csrs.RCSR, false) & 0o100).toBe(0o100);
    expect(m.read(csrs.XCSR, false) & 0o100).toBe(0o100);
    expect(m.read(csrs.LKS, false) & 0o300).toBe(0o300);
    expect(m.write(o('177567'), 0o101, true)).toBe(true); // XBUF high byte: prints nothing
    expect(m.output).toBe('');
    // Odd bytes of addresses nobody answers still fault.
    expect(m.write(o('177571'), 0, true)).toBe(false);
  });

  it('host word access at the top of RAM stays inside it', () => {
    const m = new SimpleMachine({ memory: 0o1001 });
    m.write(0o1000, 0o177777, false);
    expect(m.read(0o1000, true)).toBe(0o377);
    expect(Number.isNaN(m.read(0o1000, false))).toBe(false);
    expect(m.read(0o777, false)).toBe(m.read(0o776, false));
  });

  it('SOB refuses offset 0 (a jump to the next instruction)', () => {
    expect(err(' SOB R1, X\nX: HALT')).toMatch(/backwards/);
    expect(words(' SOB R1, .')).toEqual([0o077101]);
  });

  it('WAIT with only keyboard interrupts sleeps out the budget in one go', () => {
    const src = ` MOV #2000, SP\n MOV #100, @#177560\n WAIT\n HALT`;
    const { m, result } = runAsm(src, { budget: 50000 });
    expect(result.reason).toBe('wait');
    expect(result.cycles).toBe(50000);
    expect(m.cycles).toBe(50000);
  });

  it('CLC!CLV-style combinations assemble and round-trip through the disassembler', () => {
    expect(words(' CLC!CLV')).toEqual([0o000243]);
    expect(words(' SEN ! SEZ ; comment')).toEqual([0o000274]);
    for (let w = 0o000241; w < 0o000300; w++) {
      if (w === 0o000260) continue;
      const text = disassemble(() => w, 0).text;
      expect(words(` ${text}`), text).toEqual([w]);
    }
    expect(err(' CLC!SEV')).toMatch(/cannot be combined/);
    expect(err(' CLC!HALT')).toMatch(/only flag operations/);
    expect(err(' CLC!CLV R0')).toMatch(/no operands/);
    expect(words(' MOV #1!2, R0')).toEqual([0o012700, 3]);
  });
});

describe('blue11 library: second review', () => {
  it('a DL11 receive request goes away when IE is cleared or RBUF is read', () => {
    // IE cleared while the request waits behind priority 7: no interrupt once unmasked.
    const masked = assemble(`
        MOV #H, @#60
        CLR @#62
        MOV #340, @#177776
        MOV #100, @#177560
        CLR @#177560
        CLR @#177776
        NOP
        HALT
H:      MOV #1, R5
        HALT`);
    let m = new SimpleMachine();
    m.boot(masked);
    m.type('x');
    m.run(1000);
    expect(m.cpu.r[5]).toBe(0);
    // RBUF read while masked: DONE and the request are gone.
    const read = assemble(`
        MOV #H, @#60
        CLR @#62
        MOV #340, @#177776
        MOV #100, @#177560
        MOV @#177562, R0
        CLR @#177776
        NOP
        HALT
H:      MOV #1, R5
        HALT`);
    m = new SimpleMachine();
    m.boot(read);
    m.type('x');
    m.run(1000);
    expect(m.cpu.r[0]).toBe('x'.charCodeAt(0));
    expect(m.cpu.r[5]).toBe(0);
  });

  it('DL11 maxOutput keeps the end of the output', () => {
    const m = new SimpleMachine();
    const d = new DL11({ base: 0o176500, vector: 0o70, maxOutput: 3 });
    m.add(d);
    m.boot(assemble(`
        MOV #M, R1
1$:     MOVB (R1)+, @#176506
        BNE 1$
        HALT
M:      .ASCIZ /abcdef/`));
    m.run(10_000);
    expect(d.output).toBe('ef\0');
    expect(() => new DL11({ maxOutput: 0 })).toThrow();
  });

  it('an interrupt the host withdraws or replaces in onTrap is not brought back', () => {
    const m = new SimpleMachine();
    m.boot(assemble('1$: BR 1$'));
    m.cpu.interrupt(0o300, 5);
    m.cpu.onTrap = (t) => { m.cpu.cancelInterrupt(t.vector); return 'stop'; };
    expect(m.run(100).reason).toBe('trap');
    expect(m.cpu.save().pending).toEqual([]);
    expect(m.run(100).reason).toBe('budget');
    m.cpu.interrupt(0o300, 5);
    m.cpu.onTrap = (t) => { m.cpu.interrupt(t.vector, 6); return 'stop'; };
    expect(m.run(100).reason).toBe('trap');
    expect(m.cpu.save().pending).toEqual([{ vector: 0o300, level: 6 }]);
  });

  it('continue stops at a breakpoint on the handler of an interrupt taken first', () => {
    const a = assemble(`
1$:     BR 1$
H:      RTI`);
    const m = new SimpleMachine();
    m.boot(a);
    const h = a.symbols.get('H')!;
    m.write(0o300, h, false);
    m.write(0o302, 0o340, false);
    m.cpu.interrupt(0o300, 5);
    const r = m.run(1000, new Set([h]));
    expect(r.reason).toBe('breakpoint');
    expect(m.cpu.r[7]).toBe(h);
  });

  it('.END stops the assembly even when its start address is undefined', () => {
    const a = assemble('HALT\n.END FOO\nMOV R0, R1\n');
    expect(a.errors.map((e) => e.message)).toEqual(['undefined symbol FOO']);
    expect(a.bytes.length).toBe(2);
  });

  it('NAME!NAME alone is an implicit .WORD; flag operations still combine', () => {
    expect(words('A = 1\nB = 4\n A!B')).toEqual([5]);
    expect(words('CLC!CLV')).toEqual([0o243]);
    expect(err('CLC!FOO')).toMatch(/only flag operations/);
  });

  it('a program filling nearly all of memory assembles', () => {
    const a = assemble('. = 0\n.BLKW 77777\n.WORD 1');
    expect(a.ok).toBe(true);
    expect(a.bytes.length).toBe(0o177776 + 2);
  });
});
