/**
 * The world grid: cells with two layers, each holding one 4-byte object record
 * (DESIGN.md §2). The floor layer holds items lying on the ground; the occupant layer at
 * most one object (wall, monster, robot, …). Coordinates are absolute: X east, Y south.
 */

import { NOTHING, type ObjectRecord } from './objects';

export type Layer = 'floor' | 'occupant';

export class Grid {
  /** 4 bytes per cell, row-major, in record byte order (TYPE, HP, FLAGS, LOOT). */
  readonly floor: Uint8Array;
  readonly occupant: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= 256 && height <= 256)) {
      throw new Error('grid: width and height must be integers 1–256');
    }
    this.floor = new Uint8Array(width * height * 4);
    this.occupant = new Uint8Array(width * height * 4);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** The record at a cell; outside the grid: nothing. */
  get(layer: Layer, x: number, y: number): ObjectRecord {
    if (!this.inBounds(x, y)) return { ...NOTHING };
    const b = this[layer];
    const i = (y * this.width + x) * 4;
    return { type: b[i], hp: b[i + 1], flags: b[i + 2], loot: b[i + 3] };
  }

  set(layer: Layer, x: number, y: number, r: ObjectRecord): void {
    if (!this.inBounds(x, y)) throw new Error(`grid: ${x},${y} is outside`);
    const b = this[layer];
    const i = (y * this.width + x) * 4;
    b[i] = r.type & 0xff;
    b[i + 1] = r.hp & 0xff;
    b[i + 2] = r.flags & 0xff;
    b[i + 3] = r.loot & 0xff;
  }

  clear(layer: Layer, x: number, y: number): void {
    this.set(layer, x, y, NOTHING);
  }

  /** TYPE at a cell (0 = empty or outside). */
  typeAt(layer: Layer, x: number, y: number): number {
    return this.inBounds(x, y) ? this[layer][(y * this.width + x) * 4] : 0;
  }
}
