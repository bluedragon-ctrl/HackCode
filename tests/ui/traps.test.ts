/** The status line for a trap with no handler. */
import { describe, expect, it } from 'vitest';
import { describeTrap } from '../../src/ui/traps';
import { load, runUntilStop } from '../core/helpers';

function message(insn: string): string {
  const w = load(`START: ${insn}\n HALT\n .END START`);
  const r = runUntilStop(w);
  expect(r.reason).toBe('trap');
  return describeTrap(r.trap!, w.robot);
}

describe('describeTrap', () => {
  it('names the cause and the place', () => {
    expect(message('MOV @#1, R0')).toBe('Odd address 000001 at 001000: a word needs an even address (a missing .EVEN?).');
    expect(message('MOV @#160000, R0')).toBe('Bus error at 001000: nothing answers at 160000.');
    expect(message('MOV R0, @#140000')).toBe('Bus error at 001000: the ROM at 140000 is read-only.');
    expect(message('MUL #3, R0')).toBe('MUL at 001000 needs the math chip (EIS): it is not installed yet.');
    expect(message('.WORD 100')).toBe('JMP to a register at 001000 is illegal: jump to an address.');
    expect(message('.WORD 7')).toBe('Illegal instruction 000007 at 001000: is the CPU running into data?');
    expect(message('BPT')).toBe('BPT at 001000. Continue goes on after it.');
    expect(message('TRAP 5')).toBe('TRAP 005 at 001000, with no handler at 034.');
    expect(message('IOT')).toBe('IOT at 001000, with no handler at 020.');
  });
});
