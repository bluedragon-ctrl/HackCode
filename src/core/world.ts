/**
 * The world and its tick loop (DESIGN.md §3).
 *
 * One tick = {@link TICK_CYCLES} robot CPU cycles. Within a tick:
 *   1. the robot's CPU runs to the end of the tick (overshoot is carried into the next);
 *   2. the CPU's energy drain for the tick is charged;
 *   3. the robot's busy devices count down, and those due complete (wheels, laser,
 *      scanner, grabber): their effects are applied, READY set, interrupts requested;
 *   4. the monsters act, in ID order.
 * The world only advances while the robot's CPU runs: if it stops mid-tick (HALT, a
 * breakpoint, a trap the host takes, a double fault, or a WAIT nothing can end), the tick
 * stays open and is finished by the next run.
 */

import type { RunResult, TrapInfo } from '../blue11';
import { DRAIN, TICK_CYCLES } from './constants';
import { Grid } from './grid';
import { dropFor, TYPE } from './objects';
import { Robot, type RobotOptions } from './robot';

/** A monster (or anything else) that acts once per tick, after the robot. */
export interface Actor {
  readonly id: number;
  tick(world: World): void;
}

export interface WorldOptions {
  width: number;
  height: number;
  robot: RobotOptions;
}

export type TickReason =
  /** The tick finished. */
  | 'tick'
  | 'halt' | 'trap' | 'double-fault' | 'breakpoint'
  /** Asleep in WAIT with no device that can wake it: nothing more can happen. */
  | 'wait'
  | 'destroyed';

export interface TickResult {
  reason: TickReason;
  /** Robot cycles and instructions in this call. */
  cycles: number;
  instructions: number;
  trap?: TrapInfo;
}

export class World {
  readonly grid: Grid;
  readonly robot: Robot;
  /** Completed ticks. */
  tick = 0;
  /** Robot cycles already run in the current tick. */
  phase = 0;

  private actors: Actor[] = [];
  /** Instructions executed in the current tick (for the energy drain). */
  private tickInstructions = 0;
  /** Drain not yet charged, in 1/2^SHIFT energy units. */
  private drain = 0;

  constructor(opts: WorldOptions) {
    this.grid = new Grid(opts.width, opts.height);
    this.robot = new Robot(this, opts.robot);
  }

  /** Add an actor; they act in ascending ID order. IDs must be unique. */
  addActor(a: Actor): void {
    if (this.actors.some((b) => b.id === a.id)) throw new Error(`actor ${a.id} exists`);
    this.actors.push(a);
    this.actors.sort((p, q) => p.id - q.id);
  }

  /**
   * Run the robot to the end of the current tick, then finish it. Stops early (tick left
   * open) on HALT, a breakpoint, a trap or a sleep nothing can end.
   * `resume`: a breakpoint at the current PC is passed (Continue after a breakpoint).
   */
  runTick(breakpoints?: ReadonlySet<number>, resume = true): TickResult {
    let cycles = 0, instructions = 0;
    if (this.robot.destroyed) return { reason: 'destroyed', cycles, instructions };
    const m = this.robot.machine;
    while (this.phase < TICK_CYCLES) {
      // DeviceMachine.run always passes a breakpoint at the PC; check it ourselves unless resuming.
      if (breakpoints && !resume && !m.cpu.waiting && !m.cpu.halted && breakpoints.has(m.cpu.r[7])) {
        return { reason: 'breakpoint', cycles, instructions };
      }
      const r: RunResult = m.run(TICK_CYCLES - this.phase, breakpoints);
      resume = false;
      cycles += r.cycles;
      instructions += r.instructions;
      this.phase += r.cycles;
      this.tickInstructions += r.instructions;
      if (r.reason === 'budget') continue;
      if (r.reason === 'wait') {
        if (this.phase >= TICK_CYCLES) break;
        return { reason: 'wait', cycles, instructions };
      }
      return { reason: r.reason, cycles, instructions, trap: r.trap };
    }
    this.finishTick();
    return { reason: this.robot.destroyed ? 'destroyed' : 'tick', cycles, instructions };
  }

  /** Up to `maxTicks` ticks; stops at the first result that is not 'tick'. */
  run(maxTicks: number, breakpoints?: ReadonlySet<number>): TickResult {
    let cycles = 0, instructions = 0;
    let last: TickResult = { reason: 'tick', cycles, instructions };
    for (let i = 0; i < maxTicks; i++) {
      last = this.runTick(breakpoints, i === 0);
      cycles += last.cycles;
      instructions += last.instructions;
      if (last.reason !== 'tick') break;
    }
    return { ...last, cycles, instructions };
  }

  /**
   * One robot instruction (debugger "step"); finishes the tick if it reached its end.
   * Asleep in WAIT, the step sleeps to the end of the tick instead.
   */
  stepInstruction(): TickResult {
    if (this.robot.destroyed) return { reason: 'destroyed', cycles: 0, instructions: 0 };
    const cpu = this.robot.machine.cpu;
    if (cpu.waiting) return this.runTick();
    const r = this.robot.machine.step();
    this.phase += r.cycles;
    this.tickInstructions += r.instructions;
    const base = { cycles: r.cycles, instructions: r.instructions, trap: r.trap };
    if (r.reason !== 'budget' && r.reason !== 'wait') return { reason: r.reason, ...base };
    if (this.phase < TICK_CYCLES) return { reason: 'tick', ...base };
    this.finishTick();
    return { reason: this.robot.destroyed ? 'destroyed' : 'tick', ...base };
  }

  private finishTick(): void {
    const robot = this.robot;
    // CPU drain
    this.drain += this.tickInstructions * DRAIN.PER_INSTRUCTION + DRAIN.PER_TICK;
    const units = this.drain >> DRAIN.SHIFT;
    this.drain &= (1 << DRAIN.SHIFT) - 1;
    const charged = Math.min(units, robot.energy);
    robot.energy -= charged;
    robot.cpuEnergyUsed += charged;
    this.tickInstructions = 0;
    // Robot devices, then monsters
    for (const d of robot.actions) d.endTick();
    for (const a of this.actors) a.tick(this);
    if (robot.hp === 0) robot.destroyed = true;
    this.tick++;
    this.phase -= TICK_CYCLES;
  }

  // ---------------------------------------------------------------- world rules

  /** The robot stands on the exit (the win condition of a plain map). */
  get atExit(): boolean {
    return this.grid.typeAt('floor', this.robot.x, this.robot.y) === TYPE.EXIT;
  }

  /** Move the robot to (x, y) if the cell is inside and has no occupant. */
  moveRobot(x: number, y: number): boolean {
    const r = this.robot;
    if (!this.grid.inBounds(x, y) || this.grid.typeAt('occupant', x, y)) return false;
    this.grid.set('occupant', x, y, this.grid.get('occupant', r.x, r.y));
    this.grid.clear('occupant', r.x, r.y);
    r.x = x;
    r.y = y;
    return true;
  }

  /**
   * Damage the occupant at (x, y). At 0 HP it is destroyed and its loot dropped on the
   * floor (if the floor is free; coins add to coins). The robot's record stays, at 0 HP.
   * Returns true if destroyed.
   */
  damage(x: number, y: number, amount: number): boolean {
    const o = this.grid.get('occupant', x, y);
    if (!o.type || o.hp === 0) return false;
    o.hp = Math.max(0, o.hp - amount);
    if (o.hp > 0) { this.grid.set('occupant', x, y, o); return false; }
    if (o.type === TYPE.ROBOT) {
      this.grid.set('occupant', x, y, o);
      this.robot.destroyed = true;
      return true;
    }
    this.grid.clear('occupant', x, y);
    const drop = dropFor(o.loot);
    if (drop) {
      const floor = this.grid.get('floor', x, y);
      if (!floor.type) this.grid.set('floor', x, y, drop);
      else if (floor.type === TYPE.COIN && drop.type === TYPE.COIN) {
        const sum = Math.min(15, (floor.loot & 0xf) + (drop.loot & 0xf));
        this.grid.set('floor', x, y, { ...floor, loot: (floor.loot & 0xf0) | sum });
      }
    }
    return true;
  }
}
