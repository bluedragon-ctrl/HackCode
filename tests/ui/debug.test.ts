/** The debugger (ROADMAP step 1): breakpoints, heat map, disassembly, memory view. */
import { describe, expect, it } from 'vitest';
import { bios, biosEntry, MEMORY, type World } from '../../src/core';
import { addressNamer, disassemblyAround, lineHeat, memoryRows, parseAddress } from '../../src/ui/debug';
import { BIOS_PROGRAM, TEST_PROGRAM } from '../../src/ui/samples';
import { loaded } from './helpers';

/** Everything that makes up a world, for comparing two of them. */
function snapshot(w: World) {
  const r = w.robot;
  const m = r.machine;
  const ram: number[] = [];
  for (let a = 0; a < MEMORY.RAM_END; a += 2) ram.push(m.read(a, false));
  return {
    tick: w.tick, phase: w.phase,
    regs: Array.from(r.cpu.r), psw: r.cpu.psw, halted: r.cpu.halted, waiting: r.cpu.waiting,
    ram,
    robot: [r.x, r.y, r.heading, r.hp, r.energy, r.coins, r.cpuEnergyUsed, Array.from(r.inventory)],
    console: r.console.output,
    floor: Array.from(w.grid.floor), occupant: Array.from(w.grid.occupant),
  };
}

describe('stepping and running give identical worlds', () => {
  for (const [name, src] of [['raw registers', TEST_PROGRAM], ['BIOS calls', BIOS_PROGRAM]] as const) {
    it(name, () => {
      const run = loaded(src);
      expect(run.run(10_000).stop).toBe('won');

      const step = loaded(src);
      let n = 0;
      while (!step.over && n++ < 200_000) step.stepInstruction();
      expect(step.last).toBe('won');

      // stopping at breakpoints and continuing changes nothing either
      const brk = loaded(src);
      const addrs = [...brk.program!.lineAt.keys()];
      brk.breakpoints = new Set(addrs.filter((_, i) => i % 3 === 0));
      let stops = 0;
      let resume = false;
      while (!brk.over && stops < 10_000) {
        const r = brk.run(10_000, resume);
        if (r.stop === 'breakpoint') stops++;
        resume = true;
      }
      expect(stops).toBeGreaterThan(0);
      expect(brk.last).toBe('won');

      expect(snapshot(step.world)).toEqual(snapshot(run.world));
      expect(snapshot(brk.world)).toEqual(snapshot(run.world));
    });
  }
});

describe('breakpoints', () => {
  it('stop before the instruction; Continue passes it; a fresh Run stops on the first line', () => {
    const s = loaded(' MOV #1, R0\n MOV #2, R0\nX: MOV #3, R0\n HALT');
    s.breakpoints = new Set([s.addressOfLine(3)!]);
    expect(s.run(10).stop).toBe('breakpoint');
    expect(s.world.robot.cpu.r[0]).toBe(2);
    expect(s.world.robot.cpu.r[7]).toBe(s.program!.symbols.get('X'));
    expect(s.run(10, true).stop).toBe('halt');
    expect(s.world.robot.cpu.r[0]).toBe(3);

    s.load(' MOV #1, R0\n HALT');
    s.breakpoints = new Set([s.addressOfLine(1)!]);
    expect(s.run(10).stop).toBe('breakpoint');
    expect(s.world.robot.cpu.r[0]).toBe(0);
  });

  it('every pass of a loop stops at its breakpoint', () => {
    const s = loaded('L: INC R0\n BR L');
    s.breakpoints = new Set([s.addressOfLine(1)!]);
    expect(s.run(10).stop).toBe('breakpoint');
    for (let i = 1; i <= 5; i++) {
      expect(s.run(10, true).stop).toBe('breakpoint');
      expect(s.world.robot.cpu.r[0]).toBe(i);
    }
  });

  it('can sit in the BIOS', () => {
    const s = loaded(' MOV #1, R0\n EMT MOVE\n HALT');
    s.breakpoints = new Set([biosEntry()]);
    expect(s.run(10).stop).toBe('breakpoint');
    expect(s.world.robot.cpu.r[7]).toBe(biosEntry());
  });

  it('addressOfLine: the first instruction of a line, or null for lines without code', () => {
    const s = loaded('; comment\nA: MOV #1, R0\n\n HALT');
    expect(s.addressOfLine(1)).toBeNull();
    expect(s.addressOfLine(2)).toBe(0o1000);
    expect(s.addressOfLine(3)).toBeNull();
    expect(s.addressOfLine(4)).toBe(0o1004);
  });
});

describe('heat map', () => {
  it('counts instructions per address, BIOS included; a load clears it', () => {
    const s = loaded(' MOV #3, R1\nL: DEC R1\n BNE L\n HALT');
    s.run(10);
    expect(s.heat[0o1000 >> 1]).toBe(1);
    expect(s.heat[0o1004 >> 1]).toBe(3);
    expect(s.heat[0o1006 >> 1]).toBe(3);
    expect(lineHeat(s.heat, s.program!.lineAt)).toEqual(new Map([[1, 1], [2, 3], [3, 3], [4, 1]]));
    s.load(' MOV #1, R0\n EMT MOVE\n HALT');
    expect(s.heat[0o1004 >> 1]).toBe(0);
    s.run(100);
    expect(s.heat[biosEntry() >> 1]).toBe(1);
  });

  it('keeps counting after a map reset', () => {
    const s = loaded(' HALT');
    s.reset();
    s.load(' NOP\n HALT');
    s.run(1);
    expect(s.heat[0o1000 >> 1]).toBe(1);
  });
});

describe('disassembly', () => {
  const s = loaded(' MOV #2, R0\nLOOP: TSTB @#WHLCSR\n BPL LOOP\n MOV R0, @#WHLCNT\n HALT');
  const read = (a: number) => s.world.robot.machine.read(a, false);
  const nameOf = addressNamer(s.program!.symbols, s.program!.labels);

  it('names device registers and labels', () => {
    expect(nameOf(0o176400)).toBe('WHLCSR');
    expect(nameOf(0o1004)).toBe('LOOP');
    expect(nameOf(biosEntry())).toBe('ENTRY');
    expect(nameOf(0o1002)).toBeUndefined();
    const rows = disassemblyAround(read, 0o1004, [...s.program!.lineAt.keys()], { before: 1, count: 4, nameOf });
    expect(rows.map((r) => [r.address, r.label, r.text])).toEqual([
      [0o1000, undefined, 'MOV #000002, R0'],
      [0o1004, 'LOOP', 'TSTB @#WHLCSR'],
      [0o1010, undefined, 'BPL LOOP'],
      [0o1012, undefined, 'MOV R0, @#WHLCNT'],
    ]);
  });

  it('names BIOS calls', () => {
    const b = loaded(' EMT MOVE\n EMT RIGHT\n EMT 77\n HALT');
    const rows = disassemblyAround((a) => b.world.robot.machine.read(a, false), 0o1000, [], { count: 3 });
    expect(rows.map((r) => r.text)).toEqual(['EMT MOVE', 'EMT RIGHT', 'EMT 077']);
  });

  it('starts at the PC when it is not a known instruction start', () => {
    const rows = disassemblyAround(read, 0o1002, [0o1000], { before: 3, count: 1, nameOf });
    expect(rows[0].address).toBe(0o1002);
  });

  it('inside the BIOS it uses the BIOS listing', () => {
    const rows = disassemblyAround(read, biosEntry() + 2, [...bios().lineAt.keys()], { before: 1, count: 2, nameOf });
    expect(rows[0]).toMatchObject({ address: biosEntry(), label: 'ENTRY' });
  });
});

describe('memory view', () => {
  it('rows of words from an even address', () => {
    const s = loaded(' MOV #2, R0\n HALT');
    const rows = memoryRows((a) => s.world.robot.machine.read(a, false), 0o1001, 2, 4);
    expect(rows).toEqual([
      { address: 0o1000, words: [0o012700, 2, 0, 0] },
      { address: 0o1010, words: [0, 0, 0, 0] },
    ]);
  });

  it('parses octal addresses and names', () => {
    const symbols = new Map([['LOOP', 0o1004]]);
    expect(parseAddress('1000', symbols)).toBe(0o1000);
    expect(parseAddress(' loop ', symbols)).toBe(0o1004);
    expect(parseAddress('whlcsr', symbols)).toBe(0o176400);
    expect(parseAddress('sp', symbols, [0, 0, 0, 0, 0, 0, 0o776, 0])).toBe(0o776);
    expect(parseAddress('9', symbols)).toBeNull();
    expect(parseAddress('200000', symbols)).toBeNull();
    expect(parseAddress('nowhere', symbols)).toBeNull();
  });
});
