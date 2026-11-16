/** Smoke tests that the library works in this project's toolchain. */
import { describe, expect, it } from 'vitest';
import { assemble, disassemble, octal, SimpleMachine } from '../../src/blue11';

describe('blue11 smoke', () => {
  it('runs the README quick start', () => {
    const asm = assemble(`
        MOV #MSG, R1
1$:     MOVB (R1)+, R0
        BEQ 2$
3$:     TSTB @#177564
        BPL 3$
        MOVB R0, @#177566
        BR 1$
2$:     HALT
MSG:    .ASCIZ /HELLO/
`);
    expect(asm.errors).toEqual([]);
    const m = new SimpleMachine();
    m.boot(asm);
    const r = m.run(10_000);
    expect(r.reason).toBe('halt');
    expect(m.output).toBe('HELLO');
  });

  it('is deterministic', () => {
    const src = ' MOV #100., R0\n1$: DEC R0\n BNE 1$\n HALT';
    const once = () => { const m = new SimpleMachine(); m.boot(assemble(src)); return m.run(10_000).cycles; };
    expect(once()).toBe(once());
  });

  it('MOVB to a register sign-extends (scanner DX/DY rely on it)', () => {
    const m = new SimpleMachine();
    m.boot(assemble(' MOVB V, R0\n HALT\nV: .BYTE 377'));
    m.run(100);
    expect(m.cpu.r[0]).toBe(0xffff);
  });

  it('disassembles back to source text', () => {
    const asm = assemble(' MOV R1, (R2)+');
    const w = asm.bytes[0] | (asm.bytes[1] << 8);
    expect(octal(w)).toBe('010122');
    expect(disassemble(() => w, 0o1000).text).toBe('MOV R1, (R2)+');
  });
});
