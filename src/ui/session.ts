/**
 * One play session on a map: the world, the program last loaded, and the Run / Continue /
 * Step / Step tick commands (DESIGN.md §3 "Edit and continue"). No DOM, so it is tested.
 */

import { assemble, type AsmError, type AssembleResult, type TrapInfo } from '../blue11';
import { parseMap, SYMBOLS, type MapOptions, type TickReason, type TickResult, type World } from '../core';
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

/** One bus access of the CPU (Blue-11 `Cpu.onAccess`). */
export interface Access {
  addr: number;
  value: number;
  write: boolean;
  byte: boolean;
}

/** At most this many accesses are kept for one step (a step can run to the end of the tick). */
const MAX_ACCESSES = 64;

/** What the last Step did, for the machine view: the registers before and after, and the bus. */
export interface StepTrace {
  /** The address of the instruction. */
  pc: number;
  before: { r: number[]; psw: number };
  after: { r: number[]; psw: number };
  accesses: Access[];
  /** More accesses happened than were kept. */
  truncated: boolean;
  /** 1, or 0 when the step took a pending interrupt instead of running an instruction. */
  instructions: number;
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
  /** The last Step, or null if the last command was not a step of one instruction. */
  lastStep: StepTrace | null = null;
  readonly goal: Goal;

  constructor(readonly map: string, private readonly options: SessionOptions = {}) {
    this.goal = options.goal ?? EXIT_GOAL;
    this.world = this.newWorld();
  }

  /** A fresh world from the map; nothing loaded. */
  reset(): void {
    this.world = this.newWorld();
    this.setLoaded(null, null);
  }

  /** A program is loaded (or none): the run's state starts afresh. */
  private setLoaded(source: string | null, program: AssembleResult | null): void {
    this.loaded = source;
    this.program = program;
    this.last = null;
    this.failure = null;
    this.lastStep = null;
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
    this.setLoaded(source, asm);
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
    this.lastStep = null;
    let stop: Stop = 'tick';
    const r = this.world.run(maxTicks, this.breakpoints, resume, (t) => (stop = this.outcome(t.reason)) !== 'tick');
    return this.finish(stop, r);
  }

  /** One instruction (the tick finishes if it reaches its end). */
  stepInstruction(): StepResult {
    this.unhalt();
    const cpu = this.world.robot.cpu;
    // Asleep in WAIT, a step sleeps to the end of the tick: no one instruction to show.
    const traced = !cpu.waiting && !cpu.halted;
    const trace: StepTrace = {
      pc: cpu.r[7], before: { r: Array.from(cpu.r), psw: cpu.psw },
      after: { r: [], psw: 0 }, accesses: [], truncated: false, instructions: 0,
    };
    if (traced) {
      cpu.onAccess = (addr, value, write, byte) => {
        if (trace.accesses.length < MAX_ACCESSES) trace.accesses.push({ addr, value, write, byte });
        else trace.truncated = true;
      };
    }
    let r: TickResult;
    try {
      r = this.world.stepInstruction();
    } finally {
      cpu.onAccess = null;
    }
    trace.after = { r: Array.from(cpu.r), psw: cpu.psw };
    trace.instructions = r.instructions;
    this.lastStep = traced ? trace : null;
    return this.finish(this.outcome(r.reason), r);
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

  private finish(stop: Stop, r: TickResult): StepResult {
    this.last = stop;
    return { stop, cycles: r.cycles, instructions: r.instructions, trap: r.trap };
  }
}
