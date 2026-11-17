/** A trap with no handler stops the robot's CPU instead of jumping to address 0 (DESIGN.md §4 "Traps"). */
import { describe, expect, it } from 'vitest';
import { load, runUntilStop } from './helpers';

describe('traps with no handler', () => {
  const cases: Array<[string, string, string, number]> = [
    ['odd address', 'MOV @#1, R0', 'odd-address', 0o4],
    ['bus error', 'MOV @#160000, R0', 'bus-error', 0o4],
    ['write to ROM', 'MOV R0, @#140000', 'bus-error', 0o4],
    ['MUL without EIS', 'MUL #3, R0', 'illegal', 0o10],
    ['JMP to a register', '.WORD 100', 'illegal', 0o10],
    ['BPT', 'BPT', 'bpt', 0o14],
    ['IOT', 'IOT', 'iot', 0o20],
    ['TRAP', 'TRAP 5', 'trap', 0o34],
  ];
  for (const [what, insn, cause, vector] of cases) {
    it(`${what} stops with cause ${cause}`, () => {
      const w = load(`START: NOP\n        ${insn}\n        HALT`);
      const r = runUntilStop(w);
      expect(r.reason).toBe('trap');
      expect(r.trap).toMatchObject({ cause, vector, pc: 0o1002 });
    });
  }

  it('a fault leaves the PC at the instruction, BPT after it, and Continue goes on', () => {
    let w = load('START: MOV @#1, R0\n HALT');
    runUntilStop(w);
    expect(w.robot.cpu.r[7]).toBe(0o1000);
    w = load('START: BPT\n MOV #7, R0\n HALT');
    runUntilStop(w);
    expect(w.robot.cpu.r[7]).toBe(0o1002);
    expect(runUntilStop(w).reason).toBe('halt');
    expect(w.robot.cpu.r[0]).toBe(7);
  });

  it('an interrupt with an empty vector stops', () => {
    const w = load('START: MOV #CS.IE, @#LKS\n1$: BR 1$');
    const r = runUntilStop(w);
    expect(r.trap).toMatchObject({ cause: 'interrupt', vector: 0o100 });
  });

  it('a handler the program installed is used', () => {
    const w = load(`
START:  MOV #OOPS, @#4
        MOV #340, @#6
        MOV @#1, R0
        HALT
OOPS:   MOV #42, R1
        HALT`);
    expect(runUntilStop(w).reason).toBe('halt');
    expect(w.robot.cpu.r[1]).toBe(0o42);
  });
});
