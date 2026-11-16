/** The play session behind the page: Run / Continue / Step / Step tick, and the first map. */
import { describe, expect, it } from 'vitest';
import { Session } from '../../src/ui/session';
import { TEST_MAP, TEST_PROGRAM } from '../../src/ui/samples';

describe('session', () => {
  it('the sample program drives the robot to the exit of the test map with raw registers', () => {
    const s = new Session(TEST_MAP);
    expect(s.load(TEST_PROGRAM)).toEqual([]);
    const r = s.run(10_000);
    expect(r.stop).toBe('won');
    expect(s.world.atExit).toBe(true);
    expect(s.over).toBe(true);
    expect(s.canContinue(TEST_PROGRAM)).toBe(false);
  });

  it('reports assembler errors and loads nothing', () => {
    const s = new Session(TEST_MAP);
    const errs = s.load(' MOV R9, R0');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].line).toBe(1);
    expect(s.isLoaded).toBe(false);
  });

  it('continues only with the loaded code unchanged', () => {
    const s = new Session(TEST_MAP);
    s.load(TEST_PROGRAM);
    s.run(3);
    expect(s.canContinue(TEST_PROGRAM)).toBe(true);
    expect(s.canContinue(TEST_PROGRAM + '\n')).toBe(false);
  });

  it('continues after HALT with the next instruction', () => {
    const s = new Session('>..');
    s.load(' HALT\n MOV #5, R0\n HALT');
    expect(s.run(10).stop).toBe('halt');
    expect(s.world.robot.cpu.r[0]).toBe(0);
    expect(s.run(10).stop).toBe('halt');
    expect(s.world.robot.cpu.r[0]).toBe(5);
  });

  it('runs in pieces, stepping or ticking, to the same world as one run', () => {
    const a = new Session(TEST_MAP);
    a.load(TEST_PROGRAM);
    a.run(10_000);

    const b = new Session(TEST_MAP);
    b.load(TEST_PROGRAM);
    let n = 0;
    while (!b.over && n++ < 100_000) {
      if (n % 3 === 0) b.stepTick(); else b.stepInstruction();
    }
    expect(b.last).toBe('won');
    expect(b.world.tick).toBe(a.world.tick);
    expect([b.world.robot.x, b.world.robot.y, b.world.robot.energy]).toEqual([a.world.robot.x, a.world.robot.y, a.world.robot.energy]);
  });

  it('reset rebuilds the map and unloads the program', () => {
    const s = new Session(TEST_MAP);
    s.load(TEST_PROGRAM);
    s.run(50);
    s.reset();
    expect(s.world.tick).toBe(0);
    expect([s.world.robot.x, s.world.robot.y]).toEqual([1, 1]);
    expect(s.isLoaded).toBe(false);
  });
});
