/** The tick loop (DESIGN.md §3): ticks of N cycles, ordering, freezing, energy drain, debugger stepping. */
import { describe, expect, it } from 'vitest';
import { COST, DRAIN, ENERGY_MAX, OBJECTS, TICK_CYCLES, TICKS, type Actor, type World } from '../../src/core';
import { asm, load, world } from './helpers';

const LOOP = '1$: BR 1$';

describe('ticks', () => {
  it('one tick is TICK_CYCLES robot cycles; overshoot is carried into the next tick', () => {
    const w = load(LOOP);
    expect(w.runTick().reason).toBe('tick');
    expect(w.tick).toBe(1);
    w.run(9);
    expect(w.tick).toBe(10);
    // BR is 1 cycle: no overshoot possible, so exactly 10 ticks of cycles.
    expect(w.robot.machine.cycles).toBe(10 * TICK_CYCLES);

    const v = load('1$: MOV @#STX, @#20000\n BR 1$'); // 4 + 1 cycles: overshoots
    v.run(7);
    expect(v.robot.machine.cycles - 7 * TICK_CYCLES).toBe(v.phase);
    expect(v.phase).toBeGreaterThanOrEqual(0);
    expect(v.phase).toBeLessThan(5);
  });

  it('runs the robot first, then the monsters in ID order', () => {
    const w = load(LOOP);
    const log: string[] = [];
    const actor = (id: number): Actor => ({ id, tick: (world: World) => log.push(`${id}@${world.tick}:${world.robot.machine.cycles}`) });
    w.addActor(actor(3));
    w.addActor(actor(1));
    w.addActor(actor(2));
    w.run(2);
    expect(log).toEqual([
      `1@0:${TICK_CYCLES}`, `2@0:${TICK_CYCLES}`, `3@0:${TICK_CYCLES}`,
      `1@1:${2 * TICK_CYCLES}`, `2@1:${2 * TICK_CYCLES}`, `3@1:${2 * TICK_CYCLES}`,
    ]);
    expect(() => w.addActor(actor(2))).toThrow();
  });

  it('robot device actions take effect before the monsters move', () => {
    const w = load(` MOV #WH.LFT!CS.GO, @#WHLCSR\n${LOOP}`);
    const seen: number[] = [];
    w.addActor({ id: 1, tick: (world) => seen.push(world.robot.heading) });
    w.run(TICKS.TURN);
    expect(seen).toEqual([1, 0]);
  });

  it('the world is frozen while the robot is halted', () => {
    const w = load(' HALT');
    let calls = 0;
    w.addActor({ id: 1, tick: () => calls++ });
    expect(w.run(10).reason).toBe('halt');
    expect(w.run(10).reason).toBe('halt');
    expect(w.tick).toBe(0);
    expect(calls).toBe(0);
  });

  it('a HALT mid-tick leaves the tick open; the next run finishes it', () => {
    const w = load(' MOV #10., R0\n1$: SOB R0, 1$\n HALT\n BR .');
    expect(w.run(5).reason).toBe('halt');
    expect(w.tick).toBe(0);
    const at = w.phase;
    expect(at).toBeGreaterThan(0);
    w.robot.cpu.halted = false;
    expect(w.runTick().reason).toBe('tick');
    expect(w.tick).toBe(1);
    expect(w.robot.machine.cycles).toBe(TICK_CYCLES);
  });

  it('a program in WAIT drains almost nothing; a busy loop drains per instruction', () => {
    const busy = load(LOOP);
    busy.run(100);
    const busyUsed = ENERGY_MAX - busy.robot.energy;
    // BR = 1 cycle, so TICK_CYCLES instructions a tick.
    expect(busyUsed).toBe((100 * (TICK_CYCLES * DRAIN.PER_INSTRUCTION + DRAIN.PER_TICK)) >> DRAIN.SHIFT);
    expect(busy.robot.cpuEnergyUsed).toBe(busyUsed);

    const idle = load(`
        MOV #100, @#LKS     ; the clock's interrupts wake the robot every tick…
        MOV #IDLE, @#100
        MOV #340, @#102
1$:     WAIT
        BR 1$
IDLE:   RTI`);
    idle.run(100);
    const idleUsed = ENERGY_MAX - idle.robot.energy;
    expect(idleUsed).toBeLessThan(busyUsed / 20);
    expect(idleUsed).toBeGreaterThan(0);
  });

  it('energy never goes below 0; the CPU keeps running', () => {
    const w = load(LOOP, { robot: { x: 2, y: 2, heading: 1, energy: 3 } });
    expect(w.run(50).reason).toBe('tick');
    expect(w.robot.energy).toBe(0);
    expect(w.tick).toBe(50);
  });

  it('a long WAIT skips whole ticks at once (large jumps)', () => {
    const w = load(`
        MOV #1, @#WHLCNT
        MOV #DONE, @#WHLVEC
        MOV #340, @#WHLVEC+2
        MOV #WH.FWD!CS.GO!CS.IE, @#WHLCSR
        WAIT
        HALT
DONE:   RTI`);
    w.run(100);
    expect(w.tick).toBe(TICKS.MOVE);
    expect(w.robot.x).toBe(3);
    expect(w.robot.energy).toBe(ENERGY_MAX - COST.MOVE - w.robot.cpuEnergyUsed);
  });

  it('device nextEvent is never <= 0', () => {
    const w = load(`
        MOV #3, @#WHLCNT
        MOV #WH.FWD!CS.GO, @#WHLCSR
        MOV #LS.FIR!CS.GO, @#LSRCSR
        MOV #2000, @#SCNBUF
        MOV #100, @#SCNLEN
        MOV #SC.ALL!CS.GO, @#SCNCSR
        MOV #100, @#LKS
1$:     BR 1$`);
    for (let i = 0; i < 30; i++) {
      w.runTick();
      for (const d of w.robot.devices) {
        const n = d.nextEvent?.() ?? Infinity;
        expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('the robot is destroyed at HP 0: the run is over', () => {
    const w = load(LOOP);
    w.addActor({ id: 1, tick: (world) => { world.damage(world.robot.x, world.robot.y, 60); } });
    expect(w.runTick().reason).toBe('tick');
    expect(w.robot.hp).toBe(40);
    expect(w.runTick().reason).toBe('destroyed');
    expect(w.robot.destroyed).toBe(true);
    expect(w.runTick().reason).toBe('destroyed');
    expect(w.tick).toBe(2);
  });

  it('is reproducible: same map and program, same world', () => {
    const src = `
        MOV #2, @#WHLCNT
        MOV #WH.FWD!CS.GO, @#WHLCSR
1$:     TSTB @#WHLCSR
        BPL 1$
        MOV #LS.FIR!CS.GO, @#LSRCSR
2$:     TSTB @#LSRCSR
        BPL 2$
        BR .-30`;
    const once = () => {
      const w = load(src);
      w.grid.set('occupant', 7, 2, OBJECTS.wall());
      w.run(300);
      return JSON.stringify([w.robot.x, w.robot.energy, w.robot.machine.cycles, [...w.grid.occupant], [...w.grid.floor]]);
    };
    expect(once()).toBe(once());
  });
});

describe('debugger stepping', () => {
  it('stepInstruction advances the world when it crosses a tick boundary', () => {
    const w = load(LOOP);
    for (let i = 0; i < TICK_CYCLES - 1; i++) w.stepInstruction();
    expect(w.tick).toBe(0);
    w.stepInstruction();
    expect(w.tick).toBe(1);
    expect(w.phase).toBe(0);
  });

  it('stepping and running give the same world', () => {
    const src = ` MOV #1, @#WHLCNT\n MOV #WH.FWD!CS.GO, @#WHLCSR\n1$: TSTB @#WHLCSR\n BPL 1$\n HALT`;
    const a = load(src);
    a.run(50);
    const b = load(src);
    while (!b.robot.cpu.halted) b.stepInstruction();
    expect([b.tick, b.phase, b.robot.x, b.robot.machine.cycles]).toEqual([a.tick, a.phase, a.robot.x, a.robot.machine.cycles]);
  });

  it('a step while asleep sleeps to the end of the tick', () => {
    const w = load(` MOV #WH.LFT!CS.GO!CS.IE, @#WHLCSR\n MOV #D, @#WHLVEC\n WAIT\n HALT\nD: RTI`);
    w.robot.machine.write(0o302, 0o340, false);
    w.stepInstruction();
    w.stepInstruction();
    w.stepInstruction(); // WAIT
    expect(w.tick).toBe(0);
    w.stepInstruction(); // asleep: to the end of the tick
    expect(w.tick).toBe(1);
  });

  it('breakpoints stop the robot mid-tick, also right at a tick boundary', () => {
    const w = world();
    const a = asm(`
BP:     NOP
        NOP
        NOP
        NOP
        BR BP`);
    w.robot.load(a);
    const bp = new Set([a.symbols.get('BP')!]);
    // Each pass is 5 cycles and TICK_CYCLES a multiple of 5: some stops fall on a tick boundary.
    expect(TICK_CYCLES % 5).toBe(0);
    for (let i = 1; i <= 2 * TICK_CYCLES / 5; i++) {
      const r = w.run(10, bp);
      expect(r.reason).toBe('breakpoint');
      expect(w.robot.cpu.r[7]).toBe(a.symbols.get('BP'));
      expect(w.robot.machine.cycles).toBe(5 * i);
    }
    expect(w.tick).toBe(2);
  });
});
