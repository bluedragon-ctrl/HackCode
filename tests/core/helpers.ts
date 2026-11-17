import { SYMBOLS, World, type RobotOptions, type WorldOptions } from '../../src/core';
import { assembleOk } from '../helpers/asm';

export type TestWorldOptions = Partial<Omit<WorldOptions, 'robot'>> & { robot?: Partial<RobotOptions> };

/** A 12×12 world with the robot at (2,2) facing east; `robot` changes only what it names. */
export function world(opts: TestWorldOptions = {}): World {
  return new World({ width: 12, height: 12, ...opts, robot: { x: 2, y: 2, heading: 1, ...opts.robot } });
}

/** Assemble with the device prelude; throws on errors. */
export const asm = (src: string) => assembleOk(src, { symbols: SYMBOLS });

/** Load `src` into the robot of `w`; throws if it does not load. */
export function loadOn<W extends World>(w: W, src: string): W {
  const err = w.robot.load(asm(src));
  if (err) throw new Error(err);
  return w;
}

/** A {@link world} running `src`. */
export const load = (src: string, opts: TestWorldOptions = {}): World => loadOn(world(opts), src);

/** A word on the robot's bus (a device register, RAM). */
export const reg = (w: World, addr: number): number => w.robot.machine.read(addr, false);

/** Robot CPU register `n`. */
export const r = (w: World, n: number): number => w.robot.cpu.r[n];
