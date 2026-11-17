/** The robot machine's memory map and options (DESIGN.md §4). */
import { describe, expect, it } from 'vitest';
import { BUS_ERROR } from '../../src/blue11';
import { MEMORY, REG, TICK_CYCLES, VECTOR } from '../../src/core';
import { asm, load, world } from './helpers';

describe('robot memory map', () => {
  it('has RAM from 000000 to 137777', () => {
    const m = world().robot.machine;
    expect(m.ram.length).toBe(0o140000);
    expect(m.write(0o137776, 0o123456, false)).toBe(true);
    expect(m.read(0o137776, false)).toBe(0o123456);
  });

  it('has ROM at 140000–157777: readable, writes are bus errors', () => {
    const w = world();
    w.robot.rom.load(Uint8Array.of(0o12, 0o34, 0o56), 0);
    w.robot.rom.load(Uint8Array.of(0xff, 0xee), MEMORY.ROM_SIZE - 2);
    const m = w.robot.machine;
    expect(m.read(0o140000, false)).toBe(0o12 | (0o34 << 8));
    expect(m.read(0o140002, true)).toBe(0o56);
    expect(m.read(0o157776, false)).toBe(0xeeff);
    expect(m.write(0o140000, 1, false)).toBe(false);
    expect(m.write(0o150001, 1, true)).toBe(false);
    expect(() => w.robot.rom.load(new Uint8Array(4), MEMORY.ROM_SIZE - 2)).toThrow();
  });

  it('traps to 4 when a program writes the ROM', () => {
    const w = load(`
        MOV #HNDLR, @#4
        CLR @#140000
        HALT
HNDLR:  MOV #1, R0
        HALT`);
    expect(w.run(5).reason).toBe('halt');
    expect(w.robot.cpu.r[0]).toBe(1);
  });

  it('can run code from ROM', () => {
    const w = world();
    const bios = asm(' MOV #42, R0\n HALT');
    w.robot.rom.load(bios.bytes, 0);
    w.robot.load(asm(' JMP @#140000'));
    expect(w.run(5).reason).toBe('halt');
    expect(w.robot.cpu.r[0]).toBe(0o42);
  });

  it('answers at the robot device, line clock and console addresses', () => {
    const m = world().robot.machine;
    for (const a of [REG.WHLCSR, REG.LSRCSR, REG.SCNCSR, REG.GRBCSR, REG.STHP, REG.INV, REG.INV + 14, REG.LKS, REG.RCSR, REG.XBUF]) {
      expect(m.read(a, false), a.toString(8)).not.toBe(BUS_ERROR);
    }
    // holes
    for (const a of [0o160000, 0o176406, 0o176436, 0o176454, 0o176500, 0o176376]) {
      expect(m.read(a, false), a.toString(8)).toBe(BUS_ERROR);
    }
  });

  it('has no EIS: MUL traps to 10', () => {
    const w = load(`
        MOV #HNDLR, @#10
        MOV #3, R1
        MUL #5, R1
        HALT
HNDLR:  MOV #7, R0
        HALT`);
    w.run(5);
    expect(w.robot.cpu.r[0]).toBe(7);
  });

  it('the line clock ticks once per game tick of CPU time', () => {
    const w = load(`
        MOV #CLK, @#${VECTOR.CLOCK.toString(8)}
        MOV #340, @#${(VECTOR.CLOCK + 2).toString(8)}
        CLR R0
        MOV #100, @#LKS
1$:     WAIT
        CMP R0, #5
        BLO 1$
        HALT
CLK:    INC R0
        RTI`);
    const r = w.run(20);
    expect(r.reason).toBe('halt');
    expect(w.tick).toBe(5);
    expect(w.robot.machine.cycles).toBeGreaterThan(5 * TICK_CYCLES);
    expect(w.robot.machine.cycles).toBeLessThan(6 * TICK_CYCLES);
  });

  it('the console prints', () => {
    const w = load(`
        MOVB #'H, @#XBUF
        MOVB #'I, @#XBUF
        HALT`);
    w.run(1);
    expect(w.robot.console.output).toBe('HI');
  });

  it('load refuses an image that does not fit in RAM', () => {
    const w = world();
    expect(w.robot.load(asm('. = 137776\n .WORD 1, 2'))).toMatch(/RAM/);
    expect(w.robot.load(asm(' HALT'))).toBeNull();
  });

  it('load keeps RAM unless asked to clear it', () => {
    const w = world();
    w.robot.load(asm(' MOV #1234, @#20000\n HALT'));
    w.run(1);
    w.robot.load(asm(' HALT'));
    expect(w.robot.machine.read(0o20000, false)).toBe(0o1234);
    w.robot.load(asm(' HALT'), { clearRam: true });
    expect(w.robot.machine.read(0o20000, false)).toBe(0);
  });

  it('load resets registers and PSW, PC = start, SP = origin', () => {
    const w = world();
    w.robot.load(asm(' MOV #7, R3\n MOV #17, @#177776\n HALT'));
    w.run(1);
    w.robot.load(asm(' HALT'));
    const cpu = w.robot.cpu;
    expect(cpu.r[3]).toBe(0);
    expect(cpu.psw).toBe(0);
    expect(cpu.r[7]).toBe(0o1000);
    expect(cpu.r[6]).toBe(0o1000);
  });
});
