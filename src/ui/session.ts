/**
 * One play session on a map: the world, the program last loaded, and the Run / Continue /
 * Step / Step tick commands (DESIGN.md §3 "Edit and continue"). No DOM, so it is tested.
 */

import { assemble, type AsmError, type AssembleResult, type TrapInfo } from '../blue11';
import { parseMap, SYMBOLS, type MapOptions, type TickReason, type World } from '../core';
import { checkRules, EXIT_GOAL, type Goal, type Rules } from './lessons/model';

/**
 * Why the last command stopped. 'tick': it ran its ticks (or step) and can go on.
 * 'won': the goal is reached; 'failed': it can no longer be ({@link Session.failure} says why).
 */
export type Stop = TickReason | 'won' | 'failed';

export interface SessionOptions extends MapOptions {
  /** What wins the map (default: the exit). */
  goal?: Goal;
  /** Rules on the program, checked by {@link Session.load}. */
  rules?: Rules;
}

export interface StepResult {
  stop: Stop;
  cycles: number;
  instructions: number;
  trap?: TrapInfo;
}

export class Session {
  world: World;
  /** The source last loaded, or null. */
  private loaded: string | null = null;
  /** Why the last command stopped, or null before any. */
  last: Stop | null = null;
  /** The assembly last loaded (for the source line of an address), or null. */
  program: AssembleResult | null = null;
  /** Addresses to stop at, before their instruction runs (Run, Continue, Step tick). */
  breakpoints: ReadonlySet<number> = new Set();
  /** Instructions executed at each word address since the last load (the heat map). */
  readonly heat = new Uint32Array(0x8000);
  /** Why the run failed, when {@link last} is 'failed'. */
  failure: string | null = null;
  readonly goal: Goal;

  constructor(readonly map: string, private readonly options: SessionOptions = {}) {
    this.goal = options.goal ?? EXIT_GOAL;
    this.world = this.newWorld();
  }

  /** A fresh world from the map; nothing loaded. */
  reset(): void {
    this.world = this.newWorld();
    this.loaded = null;
    this.program = null;
    this.last = null;
    this.failure = null;
    this.heat.fill(0);
  }

  private newWorld(): World {
    const w = parseMap(this.map, this.options);
    w.robot.cpu.onInstruction = (pc) => { this.heat[pc >> 1]++; };
    return w;
  }

  /** The address of the first instruction on source `line`, or null if it has none. */
  addressOfLine(line: number): number | null {
    if (!this.program) return null;
    for (const [addr, l] of this.program.lineAt) if (l === line) return addr;
    return null;
  }

  /**
   * Assemble and load `source` (Run's first half): registers and devices reset, PC = start.
   * The world, RAM and time persist. Returns errors (a broken rule is one, on line 0);
   * none = loaded.
   */
  load(source: string): AsmError[] {
    const asm = assemble(source, { symbols: SYMBOLS });
    if (!asm.ok) return asm.errors;
    const broken = checkRules(this.options.rules, source, asm);
    if (broken.length) return broken.map((message) => ({ line: 0, column: 0, message }));
    const err = this.world.robot.load(asm);
    if (err) return [{ line: 0, column: 0, message: err }];
    this.loaded = source;
    this.program = asm;
    this.last = null;
    this.failure = null;
    this.heat.fill(0);
    return [];
  }

  get isLoaded(): boolean { return this.loaded !== null; }

  /** The source last loaded (the program running), or null. */
  get loadedSource(): string | null { return this.loaded; }

  /** The run is over: the goal reached or missed, or the robot destroyed. */
  get over(): boolean {
    return this.last === 'won' || this.last === 'failed' || this.last === 'destroyed' || this.world.robot.destroyed;
  }

  /** Continue (and stepping) needs the loaded code unchanged and a CPU that can go on. */
  canContinue(source: string): boolean {
    return this.loaded === source && !this.over && this.last !== 'double-fault';
  }

  /**
   * Up to `maxTicks` ticks; stops at the first stop that is not 'tick', or at the exit.
   * `resume`: a breakpoint at the current PC is passed, as Continue and Step tick do. A batch
   * that carries on a run (the next animation frame) leaves it false, so it still stops there.
   */
  run(maxTicks: number, resume = false): StepResult {
    this.unhalt();
    let cycles = 0, instructions = 0;
    let res: StepResult = { stop: 'tick', cycles, instructions };
    for (let i = 0; i < maxTicks; i++) {
      const r = this.world.runTick(this.breakpoints, resume && i === 0);
      cycles += r.cycles;
      instructions += r.instructions;
      res = { stop: this.outcome(r.reason), cycles, instructions, trap: r.trap };
      if (res.stop !== 'tick') break;
    }
    this.last = res.stop;
    return res;
  }

  /** One instruction (the tick finishes if it reaches its end). */
  stepInstruction(): StepResult {
    this.unhalt();
    return this.finish(this.world.stepInstruction());
  }

  /** The rest of the current tick. */
  stepTick(): StepResult {
    return this.run(1, true);
  }

  /**
   * A destroyed robot has lost, even on the exit (a bite in the tick it got there). Then the
   * goal: won, or failed (with the reason kept), else the tick's reason.
   */
  private outcome(reason: TickReason): Stop {
    if (this.world.robot.destroyed) { this.failure = null; return 'destroyed'; }
    if (this.goal.won(this.world)) return 'won';
    this.failure = this.goal.failed?.(this.world) ?? null;
    return this.failure ? 'failed' : reason;
  }

  /** Continuing after HALT goes on with the next instruction, as on the console. */
  private unhalt(): void {
    const cpu = this.world.robot.cpu;
    if (this.last === 'halt' && cpu.halted) cpu.halted = false;
  }

  private finish(r: { reason: TickReason; cycles: number; instructions: number; trap?: TrapInfo }): StepResult {
    const stop = this.outcome(r.reason);
    this.last = stop;
    return { stop, cycles: r.cycles, instructions: r.instructions, trap: r.trap };
  }
}
