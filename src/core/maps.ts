/**
 * Hand-made maps as text: one character per cell, one line per row (DESIGN.md §2).
 *
 *   #  wall                 .  floor (a space too)
 *   E  exit                 $  a coin       1–9  a pile of that many coins
 *   C  math chip            ^ > v <  the robot, facing N E S W (exactly one)
 *
 * Leading and trailing blank lines are ignored; all rows must have the same length.
 */

import { HEADING } from './constants';
import { OBJECTS } from './objects';
import type { RobotOptions } from './robot';
import { World } from './world';

const ROBOT: Readonly<Record<string, number>> = { '^': HEADING.N, '>': HEADING.E, v: HEADING.S, '<': HEADING.W };

export interface MapOptions {
  /** Robot energy and HP at the start (defaults: full). */
  robot?: Pick<RobotOptions, 'energy' | 'hp'>;
}

/** Build a world from a text map; throws on a malformed map. */
export function parseMap(text: string, opts: MapOptions = {}): World {
  const rows = text.replace(/\r/g, '').split('\n');
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  if (!rows.length) throw new Error('map: empty');
  const width = rows[0].length;
  const height = rows.length;
  rows.forEach((r, y) => {
    if (r.length !== width) throw new Error(`map: row ${y} is ${r.length} wide, not ${width}`);
  });

  let robot: RobotOptions | null = null;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (!(ch in ROBOT)) return;
    if (robot) throw new Error(`map: a second robot at ${x},${y}`);
    robot = { ...opts.robot, x, y, heading: ROBOT[ch] };
  }));
  if (!robot) throw new Error('map: no robot (^ > v <)');

  const world = new World({ width, height, robot });
  const g = world.grid;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '#') g.set('occupant', x, y, OBJECTS.wall());
    else if (ch === 'E') g.set('floor', x, y, OBJECTS.exit());
    else if (ch === '$') g.set('floor', x, y, OBJECTS.coins(1));
    else if (ch >= '1' && ch <= '9') g.set('floor', x, y, OBJECTS.coins(ch.charCodeAt(0) - 48));
    else if (ch === 'C') g.set('floor', x, y, OBJECTS.chip());
    else if (ch !== '.' && ch !== ' ' && !(ch in ROBOT)) throw new Error(`map: unknown cell '${ch}' at ${x},${y}`);
  }));
  return world;
}
