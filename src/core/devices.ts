/**
 * The robot's memory-mapped devices (DESIGN.md §5), as Blue-11 {@link Device}s.
 *
 * Action devices share one layout: CSR at +0 (GO bit 0, function bits 3–1, IE bit 6,
 * READY bit 7, ERROR bit 15), error register at +2, device registers from +4.
 *
 * Timing is in game ticks, not cycles: an action started during tick t completes at the
 * end of tick t + K − 1 (K = its {@link TICKS}), in the world's tick phase, where its effect
 * on the world is applied. So a device never changes during a CPU slice by itself, and
 * needs neither `advance` nor `nextEvent`; a CPU asleep in `WAIT` sleeps to the end of the
 * tick when a busy device with IE can wake it.
 */

import { BUS_ERROR, type Cpu, type Device } from '../blue11';
import {
  COST, CSR, DEVICE_LEVEL, DX, DY, ERR, FN, INVENTORY_SLOTS, LASER_DAMAGE, LASER_RANGE, LASER_RANGE_SQ, MEMORY, REG,
  SCAN_RADIUS, SCAN_RANGE_SQ, TICKS, VECTOR,
} from './constants';
import { FLAG, TYPE, lootAmount, type ObjectRecord } from './objects';
import type { Grid } from './grid';
import type { Robot } from './robot';
import type { World } from './world';

/** What starting or completing a step of an action leads to. */
export type Outcome = { ticks: number } | { error: number };
export const done: Outcome = { error: ERR.NONE };

/**
 * The common CSR protocol of an action device (DESIGN.md §5), with nobody behind it: the
 * robot's devices ({@link ActionDevice}) and the monsters' motors build on it.
 */
export abstract class CsrDevice implements Device {
  readonly size: number = 8;
  abstract readonly base: number;
  abstract readonly vector: number;

  protected cpu!: Cpu;
  protected csr: number = CSR.READY;
  protected err = 0;
  /** Function of the running action (bits 3–1, unshifted value 0–7). */
  protected fn = 0;
  /** Ticks until the current step completes; 0 = idle. */
  protected busy = 0;

  attach(cpu: Cpu): void { this.cpu = cpu; }

  get ready(): boolean { return (this.csr & CSR.READY) !== 0; }

  read(offset: number): number {
    if (offset === 0) return this.csr;
    if (offset === 2) return this.err;
    return this.readReg(offset);
  }

  write(offset: number, value: number, byte: boolean): boolean {
    if (offset >= 4) return this.writeReg(offset, value, byte);
    if (offset !== 0) return true; // CSR high byte, error register: read-only
    const wasIE = this.csr & CSR.IE;
    if (this.ready) this.csr = (this.csr & ~CSR.FN) | (value & CSR.FN);
    this.csr = (this.csr & ~CSR.IE) | (value & CSR.IE);
    if (!(this.csr & CSR.IE)) this.cpu.cancelInterrupt(this.vector);
    if (value & CSR.GO && this.ready) {
      this.csr &= ~(CSR.READY | CSR.ERROR);
      this.err = 0;
      this.fn = (this.csr & CSR.FN) >> 1;
      this.settle(this.start(this.fn));
    } else if (!wasIE && this.csr & CSR.IE && this.ready) {
      this.cpu.interrupt(this.vector, DEVICE_LEVEL);
    }
    return true;
  }

  reset(): void {
    this.csr = CSR.READY;
    this.err = 0;
    this.busy = 0;
    this.cpu.cancelInterrupt(this.vector);
  }

  canWake(): boolean {
    return (this.csr & CSR.IE) !== 0 && this.busy > 0;
  }

  /** End of a tick: count down, and complete the step that is due. */
  endTick(): void {
    if (this.busy === 0 || --this.busy > 0) return;
    this.settle(this.complete());
  }

  private settle(o: Outcome): void {
    if ('ticks' in o) { this.busy = o.ticks; return; }
    this.busy = 0;
    this.csr |= CSR.READY;
    if (o.error) { this.csr |= CSR.ERROR; this.err = o.error; }
    if (this.csr & CSR.IE) this.cpu.interrupt(this.vector, DEVICE_LEVEL);
  }

  /** GO: start function `fn` (0–7). */
  protected abstract start(fn: number): Outcome;
  /** The current step's time is up: apply its effect. */
  protected abstract complete(): Outcome;
  protected readReg(_offset: number): number { return BUS_ERROR; }
  protected writeReg(_offset: number, _value: number, _byte: boolean): boolean { return false; }
}

/** A robot device: actions cost the robot's energy. */
export abstract class ActionDevice extends CsrDevice {
  constructor(protected readonly robot: Robot) { super(); }

  /** Spend energy, or fail with "no power". */
  protected charge(cost: number, then: Outcome): Outcome {
    if (this.robot.energy < cost) return { error: ERR.POWER };
    this.robot.energy -= cost;
    return then;
  }
}

/** A 16-bit register written by words or bytes. */
function put(old: number, offset: number, value: number, byte: boolean): number {
  if (!byte) return value & 0xffff;
  return offset & 1 ? (old & 0xff) | (value << 8) : (old & 0xff00) | value;
}

// ---------------------------------------------------------------- wheels

/** Wheels: forward / back WHLCNT cells (counts down per cell), turn left / right. */
export class Wheels extends ActionDevice {
  readonly base = REG.WHLCSR;
  readonly vector = VECTOR.WHEELS;
  count = 0;

  protected start(fn: number): Outcome {
    switch (fn << 1) {
      case FN.WHEELS_LEFT:
      case FN.WHEELS_RIGHT: return this.charge(COST.TURN, { ticks: TICKS.TURN });
      case FN.WHEELS_FORWARD:
      case FN.WHEELS_BACK:
        if (this.count === 0) return { error: ERR.ARGUMENT };
        return this.charge(COST.MOVE, { ticks: TICKS.MOVE });
      default: return { error: ERR.FUNCTION };
    }
  }

  protected complete(): Outcome {
    const r = this.robot;
    switch (this.fn << 1) {
      case FN.WHEELS_LEFT: r.heading = (r.heading + 3) & 3; return done;
      case FN.WHEELS_RIGHT: r.heading = (r.heading + 1) & 3; return done;
    }
    const dir = this.fn << 1 === FN.WHEELS_BACK ? (r.heading + 2) & 3 : r.heading;
    if (!r.world.moveRobot(r.x + DX[dir], r.y + DY[dir])) return { error: ERR.BLOCKED };
    if (--this.count === 0) return done;
    return this.charge(COST.MOVE, { ticks: TICKS.MOVE });
  }

  protected readReg(offset: number): number { return offset === 4 ? this.count : BUS_ERROR; }

  protected writeReg(offset: number, value: number, byte: boolean): boolean {
    if (offset >> 1 !== 2) return false;
    if (this.ready) this.count = put(this.count, offset, value, byte);
    return true;
  }

  reset(): void { super.reset(); this.count = 0; }
}

// ---------------------------------------------------------------- laser

/**
 * Laser. Fire: a beam up to {@link LASER_RANGE} cells ahead. Aim: a beam along the
 * Bresenham line to the cell LSRTGT = DX | DY<<8 (signed bytes, absolute axes, as the
 * scanner reports them), which must lie in the 90° arc ahead and within
 * dx² + dy² ≤ {@link LASER_RANGE_SQ}; the beam ends at that cell. Either way the first solid
 * or opaque occupant on the way takes the hit; LSRDST = steps to it, 0 = nothing hit.
 */
export class Laser extends ActionDevice {
  readonly base = REG.LSRCSR;
  readonly vector = VECTOR.LASER;
  distance = 0;
  target = 0;
  /** An aimed beam's cells, relative to the robot, fixed at GO (the arc is checked then). */
  private path: Array<[number, number]> = [];

  protected start(fn: number): Outcome {
    const h = this.robot.heading;
    if (fn << 1 === FN.LASER_AIM) {
      const dx = (this.target << 24) >> 24, dy = (this.target << 16) >> 24;
      const ahead = dx * DX[h] + dy * DY[h];
      const side = Math.abs(dx * DY[h] - dy * DX[h]);
      if (ahead <= 0 || side > ahead || dx * dx + dy * dy > LASER_RANGE_SQ) return { error: ERR.ARGUMENT };
      this.path = line(dx, dy);
    } else if (fn << 1 !== FN.LASER_FIRE) {
      return { error: ERR.FUNCTION };
    }
    return this.charge(COST.LASER, { ticks: TICKS.LASER });
  }

  protected complete(): Outcome {
    const { x, y, heading, world } = this.robot;
    this.distance = this.fn << 1 === FN.LASER_FIRE
      ? beam(world, x, y, heading, LASER_RANGE, LASER_DAMAGE)
      : hit(world, x, y, this.path, LASER_DAMAGE);
    return done;
  }

  protected readReg(offset: number): number {
    return offset === 4 ? this.distance : offset === 6 ? this.target : BUS_ERROR;
  }

  protected writeReg(offset: number, value: number, byte: boolean): boolean {
    if (offset >> 1 === 3) { if (this.ready) this.target = put(this.target, offset, value, byte); }
    else if (offset >> 1 !== 2) return false; // LSRDST: read-only
    return true;
  }

  reset(): void { super.reset(); this.distance = 0; this.target = 0; this.path = []; }
}

/**
 * A laser beam from (x, y) up to `range` cells along `heading`: the first solid or opaque
 * occupant takes `damage`. Returns the distance of the hit, 0 = nothing hit.
 */
export function beam(world: World, x: number, y: number, heading: number, range: number, damage: number): number {
  const path: Array<[number, number]> = [];
  for (let d = 1; d <= range; d++) path.push([DX[heading] * d, DY[heading] * d]);
  return hit(world, x, y, path, damage);
}

/**
 * A laser beam from (x, y) through the cells `path` (relative to it), stopped by the edge
 * of the map: the first solid or opaque occupant takes `damage`. Returns its step number
 * (1 = the first cell), 0 = nothing hit.
 */
export function hit(world: World, x: number, y: number, path: ReadonlyArray<readonly [number, number]>, damage: number): number {
  for (let i = 0; i < path.length; i++) {
    const cx = x + path[i][0], cy = y + path[i][1];
    if (!world.grid.inBounds(cx, cy)) return 0;
    const o = world.grid.get('occupant', cx, cy);
    if (o.type && o.flags & (FLAG.SOLID | FLAG.OPAQUE)) {
      world.damage(cx, cy, damage);
      return i + 1;
    }
  }
  return 0;
}

// ---------------------------------------------------------------- scanner

/**
 * Scanner: writes what the robot can see into RAM at SCNBUF (SCNLEN bytes), nearest first,
 * 6 bytes per object (the record, then DX | DY<<8 as signed bytes), then a TYPE 0 word.
 */
export class Scanner extends ActionDevice {
  readonly base = REG.SCNCSR;
  readonly vector = VECTOR.SCANNER;
  buffer = 0;
  length = 0;
  private at = 0;
  private len = 0;

  protected start(fn: number): Outcome {
    if (fn << 1 !== FN.SCAN_ALL && fn << 1 !== FN.SCAN_NO_WALLS) return { error: ERR.FUNCTION };
    if (this.buffer & 1 || this.length < 2 || this.buffer + this.length > MEMORY.RAM_END) return { error: ERR.ADDRESS };
    this.at = this.buffer;
    this.len = this.length;
    return this.charge(COST.SCAN, { ticks: TICKS.SCAN });
  }

  protected complete(): Outcome {
    const found = scan(this.robot, this.fn << 1 === FN.SCAN_NO_WALLS);
    const ram = this.robot.machine.ram;
    const n = Math.min(found.length, Math.floor((this.len - 2) / 6));
    let a = this.at;
    for (let i = 0; i < n; i++) {
      const { r, dx, dy } = found[i];
      ram.set([r.type, r.hp, r.flags, r.loot, dx & 0xff, dy & 0xff], a);
      a += 6;
    }
    ram[a] = 0;
    ram[a + 1] = 0;
    return done;
  }

  protected readReg(offset: number): number {
    return offset === 4 ? this.buffer : offset === 6 ? this.length : BUS_ERROR;
  }

  protected writeReg(offset: number, value: number, byte: boolean): boolean {
    if (offset >> 1 === 2) this.buffer = put(this.buffer, offset, value, byte);
    else if (offset >> 1 === 3) this.length = put(this.length, offset, value, byte);
    else return false;
    return true;
  }

  reset(): void { super.reset(); this.buffer = 0; this.length = 0; }
}

export interface Seen { r: ObjectRecord; dx: number; dy: number }

/**
 * What the robot sees: every object within {@link SCAN_RANGE_SQ} with line of sight,
 * nearest first (then by DY, DX; the occupant before the floor item of the same cell).
 * The robot itself is left out; the floor under it is not.
 */
export function scan(robot: Robot, noWalls: boolean): Seen[] {
  const { grid } = robot.world;
  const out: Array<Seen & { d: number }> = [];
  const R = SCAN_RADIUS;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = dx * dx + dy * dy;
      const x = robot.x + dx, y = robot.y + dy;
      if (d > SCAN_RANGE_SQ || !grid.inBounds(x, y) || !lineOfSight(grid, robot.x, robot.y, dx, dy)) continue;
      const occ = grid.get('occupant', x, y);
      if (occ.type && d > 0 && !(noWalls && occ.type === TYPE.WALL)) out.push({ r: occ, dx, dy, d });
      const fl = grid.get('floor', x, y);
      if (fl.type && !(noWalls && fl.type === TYPE.WALL)) out.push({ r: fl, dx, dy, d });
    }
  }
  // Stable sort: equal distances keep the row-major, occupant-first order of the loop.
  out.sort((a, b) => a.d - b.d);
  return out.map(({ r, dx, dy }) => ({ r, dx, dy }));
}

/** The cells of a Bresenham line from (0, 0) to (dx, dy): the start left out, the end included. */
function line(dx: number, dy: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let x = 0, y = 0, e = ax - ay;
  while (x !== dx || y !== dy) {
    const e2 = 2 * e;
    if (e2 > -ay) { e -= ay; x += sx; }
    if (e2 < ax) { e += ax; y += sy; }
    out.push([x, y]);
  }
  return out;
}

/** No opaque occupant strictly between (x0, y0) and (x0 + dx, y0 + dy) on a Bresenham line. */
export function lineOfSight(grid: Grid, x0: number, y0: number, dx: number, dy: number): boolean {
  const cells = line(dx, dy);
  for (let i = 0; i < cells.length - 1; i++) {
    if (grid.get('occupant', x0 + cells[i][0], y0 + cells[i][1]).flags & FLAG.OPAQUE) return false;
  }
  return true;
}

// ---------------------------------------------------------------- grabber

/** Grabber: take a collectible from the cell in front, or drop slot GRBSLT there. */
export class Grabber extends ActionDevice {
  readonly base = REG.GRBCSR;
  readonly vector = VECTOR.GRABBER;
  slot = 0;

  protected start(fn: number): Outcome {
    if (fn << 1 !== FN.GRAB && fn << 1 !== FN.DROP) return { error: ERR.FUNCTION };
    return this.charge(COST.GRAB, { ticks: TICKS.GRAB });
  }

  protected complete(): Outcome {
    const r = this.robot;
    const { grid } = r.world;
    const x = r.x + DX[r.heading], y = r.y + DY[r.heading];
    if (this.fn << 1 === FN.DROP) {
      if (this.slot >= INVENTORY_SLOTS || r.inventory[this.slot * 4] === 0) return { error: ERR.ARGUMENT };
      if (!grid.inBounds(x, y) || grid.typeAt('floor', x, y)) return { error: ERR.BLOCKED };
      const i = this.slot * 4;
      const inv = r.inventory;
      grid.set('floor', x, y, { type: inv[i], hp: inv[i + 1], flags: inv[i + 2], loot: inv[i + 3] });
      inv.fill(0, i, i + 4);
      return done;
    }
    const layer = grid.get('occupant', x, y).flags & FLAG.COLLECTIBLE ? 'occupant'
      : grid.get('floor', x, y).flags & FLAG.COLLECTIBLE ? 'floor' : null;
    if (!layer) return { error: ERR.NOTHING };
    const item = grid.get(layer, x, y);
    if (item.type === TYPE.COIN) {
      r.coins = (r.coins + lootAmount(item.loot)) & 0xffff;
    } else {
      let s = 0;
      while (s < INVENTORY_SLOTS && r.inventory[s * 4]) s++;
      if (s === INVENTORY_SLOTS) return { error: ERR.FULL };
      r.inventory.set([item.type, item.hp, item.flags, item.loot], s * 4);
      this.slot = s;
    }
    grid.clear(layer, x, y);
    return done;
  }

  protected readReg(offset: number): number { return offset === 4 ? this.slot : BUS_ERROR; }

  protected writeReg(offset: number, value: number, byte: boolean): boolean {
    if (offset >> 1 !== 2) return false;
    if (this.ready) this.slot = put(this.slot, offset, value, byte);
    return true;
  }

  reset(): void { super.reset(); this.slot = 0; }
}

// ---------------------------------------------------------------- status, inventory

/** Status (read-only): HP, energy, X, Y, heading, coins. Writes are ignored. */
export class Status implements Device {
  readonly base = REG.STHP;
  readonly size = 12;
  constructor(private readonly robot: Robot) {}

  read(offset: number): number {
    const r = this.robot;
    switch (offset) {
      case 0: return r.hp;
      case 2: return r.energy;
      case 4: return r.x;
      case 6: return r.y;
      case 8: return r.heading;
      case 10: return r.coins;
      default: return BUS_ERROR;
    }
  }

  write(): boolean { return true; }
}

/** Inventory (read-only): {@link INVENTORY_SLOTS} 4-byte object records. */
export class Inventory implements Device {
  readonly base = REG.INV;
  readonly size = INVENTORY_SLOTS * 4;
  constructor(private readonly robot: Robot) {}

  read(offset: number): number {
    const b = this.robot.inventory;
    return b[offset] | (b[offset + 1] << 8);
  }

  write(): boolean { return true; }
}
