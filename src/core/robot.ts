/**
 * The robot: its body (position, heading, energy, coins, inventory; HP lives in its
 * object record on the grid) and its Blue-11 machine (DESIGN.md §4):
 *
 *   000000–137777  RAM (vectors from 0, program from 1000 by default)
 *   140000–157777  ROM: the BIOS (src/core/bios.ts); writes are bus errors
 *   1764xx–1765xx  robot devices
 *   177546         KW11-L line clock, one tick per game tick of CPU time
 *   177560         DL11 console
 *
 * EIS is off. A trap or interrupt whose vector is empty (new PC 0) stops the CPU instead
 * of jumping to address 0, so the host can say what happened (DESIGN.md §4 "Traps").
 */

import { BUS_ERROR, DeviceMachine, DL11, KW11L, VEC, type AssembleResult, type Cpu, type Device } from '../blue11';
import { bios, biosEntry } from './bios';
import { ENERGY_MAX, MEMORY, ROBOT_HP, TICK_CYCLES } from './constants';
import { Dock, Grabber, Inventory, Laser, Scanner, Status, Wheels, type ActionDevice } from './devices';
import { FLAG, record, TYPE } from './objects';
import type { World } from './world';

/** Read-only memory at 140000–157777. Its contents are set by the host with {@link load}. */
export class Rom implements Device {
  readonly base = MEMORY.ROM_BASE;
  readonly size = MEMORY.ROM_SIZE;
  readonly bytes = new Uint8Array(MEMORY.ROM_SIZE);

  load(bytes: Uint8Array, offset = 0): void {
    if (offset < 0 || offset + bytes.length > this.size) throw new Error('rom: image does not fit');
    this.bytes.set(bytes, offset);
  }

  read(offset: number): number {
    return offset < this.size ? this.bytes[offset] | (this.bytes[offset + 1] << 8) : BUS_ERROR;
  }

  write(): boolean { return false; }
}

export interface RobotOptions {
  x: number;
  y: number;
  /** 0 N, 1 E, 2 S, 3 W. */
  heading?: number;
  energy?: number;
  hp?: number;
  /** Coins carried (default 0): an expedition brings them from level to level. */
  coins?: number;
}

export interface LoadOptions {
  /** Zero all of RAM first (otherwise RAM persists between runs). */
  clearRam?: boolean;
}

export class Robot {
  x: number;
  y: number;
  heading: number;
  energy: number;
  coins = 0;
  /** {@link INVENTORY_SLOTS} 4-byte object records. */
  readonly inventory = new Uint8Array(16);
  /** Energy drained by the CPU so far (the rest went to actions). */
  cpuEnergyUsed = 0;
  /** HP reached 0. */
  destroyed = false;
  /** Symbols of the last program loaded (for the debugger). */
  symbols: ReadonlyMap<string, number> = new Map();

  readonly machine: DeviceMachine;
  readonly rom = new Rom();
  readonly console = new DL11();
  readonly clock = new KW11L(TICK_CYCLES);
  readonly wheels: Wheels;
  readonly laser: Laser;
  readonly scanner: Scanner;
  readonly grabber: Grabber;
  readonly dock: Dock;
  /** Action devices in the order they complete within a tick. */
  readonly actions: readonly ActionDevice[];
  /** Everything on the bus. */
  readonly devices: readonly Device[];

  constructor(readonly world: World, opts: RobotOptions) {
    this.x = opts.x;
    this.y = opts.y;
    this.heading = (opts.heading ?? 0) & 3;
    this.energy = opts.energy ?? ENERGY_MAX;
    this.coins = (opts.coins ?? 0) & 0xffff;
    this.machine = new DeviceMachine({ memory: MEMORY.RAM_END, eis: false });
    this.wheels = new Wheels(this);
    this.laser = new Laser(this);
    this.scanner = new Scanner(this);
    this.grabber = new Grabber(this);
    this.dock = new Dock(this);
    this.actions = [this.wheels, this.laser, this.scanner, this.grabber, this.dock];
    this.devices = [this.rom, ...this.actions, new Status(this), new Inventory(this), this.clock, this.console];
    for (const d of this.devices) this.machine.add(d);
    this.machine.cpu.onTrap = (t) => (this.vectorEmpty(t.vector) ? 'stop' : 'vector');
    const b = bios();
    this.rom.load(b.bytes, b.origin - MEMORY.ROM_BASE);
    world.grid.set('occupant', this.x, this.y,
      record(TYPE.ROBOT, opts.hp ?? ROBOT_HP, FLAG.MOBILE | FLAG.SOLID | FLAG.OPAQUE));
  }

  get cpu(): Cpu { return this.machine.cpu; }

  /** No handler at `vector`: its new-PC word is 0. */
  vectorEmpty(vector: number): boolean {
    const ram = this.machine.ram;
    return (ram[vector] | (ram[vector + 1] << 8)) === 0;
  }

  /** HP, from the robot's record on the grid. */
  get hp(): number { return this.world.grid.get('occupant', this.x, this.y).hp; }

  /**
   * Load a program (DESIGN.md §3 "Run"): point the EMT vector at the BIOS, copy the
   * program into RAM (it may replace the vector), reset the registers and PSW and the
   * devices (as `RESET`), PC = start, SP = origin. RAM, the world and time persist.
   * Returns an error message, or null.
   */
  load(asm: Pick<AssembleResult, 'origin' | 'bytes' | 'start'> & { symbols?: ReadonlyMap<string, number> },
    opts: LoadOptions = {}): string | null {
    if (asm.origin + asm.bytes.length > MEMORY.RAM_END) return 'program does not fit in RAM (000000–137777)';
    const m = this.machine;
    if (opts.clearRam) m.ram.fill(0);
    // EMT vector: new PC = the BIOS entry, new PSW = 0.
    const e = biosEntry();
    m.ram.set([e & 0xff, e >> 8, 0, 0], VEC.EMT);
    m.ram.set(asm.bytes, asm.origin);
    m.cpu.reset();
    m.reset();
    m.cpu.r[7] = asm.start;
    m.cpu.r[6] = asm.origin >= 0o400 ? asm.origin & 0xfffe : 0o1000;
    this.symbols = asm.symbols ?? new Map();
    return null;
  }
}
