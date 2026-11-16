import { assemble } from '../../src/blue11';
import { SYMBOLS, World, type WorldOptions } from '../../src/core';

/** A world with the robot at (2,2) facing east, unless given otherwise. */
export function world(opts: Partial<WorldOptions> = {}): World {
  return new World({ width: 12, height: 12, robot: { x: 2, y: 2, heading: 1 }, ...opts });
}

/** Assemble with the device prelude; throws on errors. */
export function asm(src: string) {
  const a = assemble(src, { symbols: SYMBOLS });
  if (!a.ok) throw new Error(a.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('\n'));
  return a;
}

/** A world running `src`. */
export function load(src: string, opts: Partial<WorldOptions> = {}): World {
  const w = world(opts);
  const err = w.robot.load(asm(src));
  if (err) throw new Error(err);
  return w;
}

/** Run until the robot stops (not 'tick'), at most `ticks`. */
export function runUntilStop(w: World, ticks = 1000) {
  return w.run(ticks);
}
