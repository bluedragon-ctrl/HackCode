/** The BIOS in ROM (DESIGN.md §4): EMT calls, their conventions, and the vector set on load. */
import { describe, expect, it } from 'vitest';
import { VEC } from '../../src/blue11';
import { BIOS_CALL, bios, biosEntry, ENERGY_MAX, ERR, HEADING, MEMORY, OBJECTS, SYMBOLS, TYPE, type World } from '../../src/core';
import { asm, load, loadOn, r, reg, world } from './helpers';

/** Run until HALT; the robot is at (2,2) facing east in a 12×12 world unless set up otherwise. */
function run(src: string, setup?: (w: World) => void): World {
  const w = world();
  setup?.(w);
  expect(loadOn(w, src).run(2000).reason).toBe('halt');
  return w;
}

const C = 1;

describe('BIOS image', () => {
  it('assembles into the ROM, below its end', () => {
    const b = bios();
    expect(b.ok).toBe(true);
    expect(b.origin).toBe(MEMORY.ROM_BASE);
    expect(b.bytes.length).toBeLessThan(MEMORY.ROM_SIZE);
    const w = world();
    expect(reg(w, biosEntry())).toBe(b.bytes[biosEntry() - b.origin] | (b.bytes[biosEntry() - b.origin + 1] << 8));
  });

  it('every load points the EMT vector at the BIOS; a program can replace it', () => {
    const w = load(' HALT');
    expect(reg(w, VEC.EMT)).toBe(biosEntry());
    expect(reg(w, VEC.EMT + 2)).toBe(0);
    w.robot.machine.write(VEC.EMT, 0, false);
    w.robot.load(asm(' HALT'), { clearRam: true });
    expect(reg(w, VEC.EMT)).toBe(biosEntry());

    const own = run(' MOV #5, R0\n EMT MOVE\n HALT\nMINE: MOV #123, R3\n RTI\n . = 30\n .WORD MINE, 0\n .END 1000');
    expect(r(own, 3)).toBe(0o123);
    expect(own.robot.x).toBe(2);
  });

  it('call numbers are predefined symbols', () => {
    for (const [k, v] of Object.entries(BIOS_CALL)) expect(SYMBOLS[k], k).toBe(v);
  });
});

describe('BIOS calls', () => {
  it('lesson-1 style: MOV, then EMT, drives the robot', () => {
    const w = run(' MOV #3, R0\n EMT MOVE\n EMT RIGHT\n MOV #2, R0\n EMT MOVE\n EMT LEFT\n EMT LEFT\n MOV #1, R0\n EMT BACK\n HALT');
    expect([w.robot.x, w.robot.y, w.robot.heading]).toEqual([5, 5, HEADING.N]);
  });

  it('success clears C and returns R0 = 0; other registers are kept', () => {
    const w = run(' SEC\n MOV #1, R0\n MOV #11, R1\n MOV #22, R2\n MOV #33, R5\n EMT MOVE\n MOV @#PSW, R4\n HALT');
    expect(r(w, 0)).toBe(0);
    expect(r(w, 4) & C).toBe(0);
    expect([r(w, 1), r(w, 2), r(w, 5)]).toEqual([0o11, 0o22, 0o33]);
    expect(r(w, 6)).toBe(0o1000); // stack balanced
  });

  it('failure sets C and returns the error code in R0', () => {
    const w = run(' MOV #5, R0\n EMT MOVE\n MOV @#PSW, R4\n HALT', (w) => w.grid.set('occupant', 4, 2, OBJECTS.wall()));
    expect(r(w, 0)).toBe(ERR.BLOCKED);
    expect(r(w, 4) & C).toBe(C);
    expect(w.robot.x).toBe(3);
    expect(r(w, 6)).toBe(0o1000);
    // BCS right after the call catches it
    const v = run(' MOV #0, R0\n EMT MOVE\n BCS 1$\n HALT\n1$: MOV #7, R3\n HALT');
    expect(r(v, 3)).toBe(7);
    expect(r(v, 0)).toBe(ERR.ARGUMENT);
  });

  it('an unknown call fails with ER.FN', () => {
    const w = run(' EMT 77\n MOV @#PSW, R4\n HALT');
    expect(r(w, 0)).toBe(ERR.FUNCTION);
    expect(r(w, 4) & C).toBe(C);
  });

  it('FIRE returns the distance of the hit', () => {
    const w = run(' EMT FIRE\n MOV R0, R3\n EMT RIGHT\n EMT FIRE\n HALT', (w) => w.grid.set('occupant', 4, 2, OBJECTS.wall()));
    expect(r(w, 3)).toBe(2);
    expect(r(w, 0)).toBe(0);
  });

  it('AIM fires at R0 = DX | DY<<8 and returns the steps to the hit; out of the arc fails with ER.ARG', () => {
    const w = run(' MOV #177002, R0\n EMT AIM\n MOV R0, R3\n HALT',
      (w) => w.grid.set('occupant', 4, 0, OBJECTS.wall()));
    expect(r(w, 3)).toBe(2);
    expect(w.grid.get('occupant', 4, 0).hp).toBe(255 - 40);
    const v = run(' MOV #001001, R0\n EMT AIM\n MOV @#PSW, R4\n HALT');
    expect(r(v, 0)).toBe(ERR.ARGUMENT);
    expect(r(v, 4) & C).toBe(C);
  });

  it('SCAN fills the buffer and returns its address', () => {
    const w = run(' MOV #BUF, R0\n MOV #20., R1\n EMT SCAN\n HALT\nBUF: .BLKW 10.', (w) => w.grid.set('floor', 3, 2, OBJECTS.coins(4)));
    const buf = r(w, 0);
    expect(buf).toBeGreaterThan(0o1000);
    expect(r(w, 1)).toBe(20);
    expect(reg(w, buf) & 0xff).toBe(TYPE.COIN);
  });

  it('GRAB returns the slot of an item, or -1 for coins', () => {
    const w = run(' EMT GRAB\n MOV R0, R3\n EMT RIGHT\n EMT GRAB\n HALT', (w) => {
      w.grid.set('floor', 3, 2, OBJECTS.coins(4));
      w.grid.set('floor', 2, 3, OBJECTS.chip());
    });
    expect(r(w, 3)).toBe(0xffff);
    expect(w.robot.coins).toBe(4);
    expect(r(w, 0)).toBe(0);
    expect(w.robot.inventory[0]).toBe(TYPE.CHIP);
  });

  it('DROP puts slot R0 in front', () => {
    const w = run(' EMT GRAB\n EMT LEFT\n CLR R0\n EMT DROP\n HALT', (w) => w.grid.set('floor', 3, 2, OBJECTS.chip()));
    expect(w.grid.typeAt('floor', 2, 1)).toBe(TYPE.CHIP);
    expect(w.robot.inventory[0]).toBe(0);
  });

  it('PRINT writes text on the console', () => {
    const w = run(' MOV #MSG, R0\n EMT PRINT\n HALT\nMSG: .ASCIZ /HELLO/');
    expect(w.robot.console.output).toBe('HELLO');
    expect(r(w, 0)).toBe(0);
  });

  it('CHARGE takes R0 energy (0 = until full) from the charger in front and returns what it gained', () => {
    const charger = (w: World) => w.grid.set('occupant', 3, 2, OBJECTS.charger());
    const full = world({ robot: { energy: 1000 } });
    charger(full);
    full.robot.load(asm(' CLR R0\n EMT CHARGE\n HALT'));
    expect(full.run(2000).reason).toBe('halt');
    expect(full.robot.energy).toBe(ENERGY_MAX);
    expect(r(full, 0)).toBe(ENERGY_MAX - 1000);

    const some = world({ robot: { energy: 1000 } });
    charger(some);
    some.robot.load(asm(' MOV #200., R0\n EMT CHARGE\n HALT'));
    some.run(2000);
    expect(some.robot.energy + some.robot.cpuEnergyUsed).toBe(1200);
    expect(r(some, 0)).toBe(some.robot.energy - 1000);

    const none = run(' CLR R0\n EMT CHARGE\n MOV @#PSW, R4\n HALT');
    expect(r(none, 0)).toBe(ERR.NOTHING);
    expect(r(none, 4) & C).toBe(C);
  });

  it('waits for a device the program left busy before using it', () => {
    const w = run(' MOV #WH.LFT!CS.GO, @#WHLCSR\n MOV #1, R0\n EMT MOVE\n HALT');
    expect([w.robot.x, w.robot.y]).toEqual([2, 1]);
  });

  it('is deterministic: same program, same ticks', () => {
    const src = ' MOV #4, R0\n EMT MOVE\n EMT RIGHT\n EMT FIRE\n HALT';
    expect(run(src).tick).toBe(run(src).tick);
  });
});
