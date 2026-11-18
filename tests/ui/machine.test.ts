/** The machine view: a step told as fetch → execute, the memory map, the stack, the listing. */
import { describe, expect, it } from 'vitest';
import { addressNamer } from '../../src/ui/debug';
import { explainStep, extentOf, listingRows, memoryMap, stackRows, where } from '../../src/ui/machine';
import type { Session } from '../../src/ui/session';
import { loaded } from './helpers';

function explain(s: Session) {
  const read = (a: number) => s.world.robot.machine.read(a, false);
  const nameOf = addressNamer(s.program?.symbols, s.program?.labels);
  return explainStep(s.lastStep!, read, nameOf, extentOf(s.program));
}

describe('explainStep', () => {
  it('tells the fetch of each word, then the registers that changed', () => {
    const s = loaded(' MOV #5, R0\n HALT');
    s.stepInstruction();
    const e = explain(s);
    expect(e.title).toBe('001000  MOV #000005, R0');
    expect(e.lines.map((l) => l.kind)).toEqual(['fetch', 'fetch', 'reg', 'reg']);
    expect(e.lines[0].text).toMatch(/^Fetch  001000 program +→ 012700  the instruction word/);
    expect(e.lines[1].text).toMatch(/^Fetch  001002 program +→ 000005  an extra word/);
    expect(e.lines[2].text).toBe('R0     000000 → 000005');
    expect(e.lines[3].text).toMatch(/PC     001000 → 001004  the next instruction/);
  });

  it('names device registers and the stack, and shows the flags', () => {
    const s = loaded(' MOV #1, -(SP)\n TST @#STHP\n CMP R0, R0\n BEQ 1$\n NOP\n1$: HALT');
    s.stepInstruction();
    const push = explain(s);
    expect(push.lines.find((l) => l.kind === 'write')!.text).toMatch(/^Write  000776 stack +← 000001$/);
    s.stepInstruction();
    expect(explain(s).lines.find((l) => l.kind === 'read')!.text).toMatch(/^Read   176440 STHP +→ 000144$/);
    s.stepInstruction();
    expect(explain(s).lines.find((l) => l.kind === 'flags')!.text).toMatch(/flags ---- → -Z--/);
    s.stepInstruction();
    expect(explain(s).lines.at(-1)!.text).toMatch(/a jump/);
  });

  it('notes a trap: EMT pushes PSW and PC and jumps through vector 030', () => {
    const s = loaded(' MOV #1, R0\n EMT MOVE\n HALT');
    s.stepInstruction();
    s.stepInstruction();
    const e = explain(s);
    expect(e.title).toBe('001004  EMT MOVE');
    const note = e.lines.find((l) => l.kind === 'note')!;
    expect(note.text).toMatch(/vector 030 \(EMT \(the BIOS\)\)/);
    expect(e.lines.filter((l) => l.kind === 'write')).toHaveLength(2);
    expect(e.lines.at(-1)!.text).toMatch(/^PC     001004 → 14\d{4}  the handler, from the vector$/);
  });

  it('is cleared by Run, and absent for a step asleep in WAIT', () => {
    const s = loaded(' WAIT\n HALT');
    s.stepInstruction();
    expect(s.lastStep).not.toBeNull();
    s.stepInstruction();
    expect(s.lastStep).toBeNull();
    s.stepInstruction();
    s.run(1);
    expect(s.lastStep).toBeNull();
  });
});

describe('memoryMap', () => {
  it('lists the regions high to low, with the program, the stack and the PC and SP in them', () => {
    const m = memoryMap({ origin: 0o1000, end: 0o1040 }, 0o774, 0o1004);
    expect(m.map((r) => r.kind)).toEqual(['io', 'rom', 'free', 'program', 'stack', 'free', 'vectors']);
    expect(m.find((r) => r.pc)!.kind).toBe('program');
    expect(m.find((r) => r.sp)!.kind).toBe('stack');
    expect(m.find((r) => r.kind === 'stack')).toMatchObject({ from: 0o774, to: 0o777 });
  });

  it('leaves out an empty stack, and has one RAM region without a program', () => {
    expect(memoryMap({ origin: 0o1000, end: 0o1002 }, 0o1000, 0o1000).some((r) => r.kind === 'stack')).toBe(false);
    expect(memoryMap(null, 0, 0).map((r) => r.kind)).toEqual(['io', 'rom', 'free', 'vectors']);
  });
});

describe('stackRows, where, listingRows', () => {
  it('reads the stack from SP up to its base', () => {
    const mem = new Map([[0o774, 7], [0o776, 3]]);
    expect(stackRows((a) => mem.get(a) ?? 0, 0o774, 0o1000)).toEqual([
      { address: 0o774, value: 7, top: true }, { address: 0o776, value: 3, top: false }]);
    expect(stackRows(() => 0, 0o1000, 0o1000)).toEqual([]);
  });

  it('names a part of memory', () => {
    const none = () => undefined;
    const p = { origin: 0o1000, end: 0o1010 };
    expect(where(0o30, none, p, 0o776)).toBe('vector 030 EMT (the BIOS)');
    expect(where(0o1002, none, p, 0o776)).toBe('program');
    expect(where(0o776, none, p, 0o776)).toBe('stack');
    expect(where(0o2000, none, p, 0o776)).toBe('RAM');
    expect(where(0o140000, none, p, 0o776)).toBe('BIOS ROM');
  });

  it('gives each listing row its address and whether it is code', () => {
    const s = loaded('START: MOV #5, R0\n HALT\nMSG: .ASCIZ /HI/\n .EVEN\n .END START');
    const rows = listingRows(s.program!);
    expect(rows.map((r) => [r.address, r.code])).toEqual([[0o1000, true], [0o1004, true], [0o1006, false], [null, false], [null, false]]);
    expect(rows[0]).toMatchObject({ words: '001000  012700 000005', source: 'START: MOV #5, R0' });
    expect(rows[1]).toMatchObject({ words: '001004  000000', source: '  HALT' });
  });
});
