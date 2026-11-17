import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/core';
import { registerText, robotText } from '../../src/ui/panels';

describe('robot and CPU panels', () => {
  it('robot: HP and energy in decimal, the rest octal', () => {
    const w = parseMap('#####\n#.>.#\n#####', { robot: { energy: 1234, coins: 9 } });
    expect(robotText(w)).toBe([
      'HP        100.',
      'Energy   1234.',
      'Coins  000011',
      'X Y    002 001',
      'Facing E',
      'Tick   000000',
    ].join('\n'));
  });

  it('registers, PSW flags, HALTED', () => {
    const cpu = parseMap('###\n#^#\n###').robot.cpu;
    cpu.r[0] = 0o17;
    cpu.r[6] = 0o1000;
    cpu.psw = 0o11; // N and C
    cpu.halted = true;
    const lines = registerText(cpu).split('\n');
    expect(lines[0]).toBe('R0  000017');
    expect(lines[6]).toBe('SP  001000');
    expect(lines[8]).toBe('PSW 000011 N--C');
    expect(lines[9]).toBe('HALTED');
  });
});
