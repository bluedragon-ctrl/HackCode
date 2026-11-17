/**
 * The expedition (DESIGN.md §8): one seed, level after level, each deeper than the last.
 * The same program runs every level; reaching the exit descends, and the robot's HP,
 * energy and coins come along. A run that fails retries the level as it was entered.
 * No DOM, so it is tested.
 */

import { ENERGY_MAX, generateLevel, type Level, type World } from '../core';
import { Session } from './session';

/** What the robot brings into a level. */
export interface Carried {
  hp?: number;
  energy?: number;
  coins: number;
}

/** An expedition as it is kept between visits. */
export interface ExpeditionState {
  seed: number;
  depth: number;
  carried: Carried;
  /** Ticks spent on the levels already cleared. */
  ticks: number;
}

/**
 * The least energy the robot enters a level with: a robot that reaches an exit nearly empty
 * is topped up to this, so a retry of the next level is never hopeless from the start.
 */
export const ENERGY_FLOOR = ENERGY_MAX / 4;

/** What the robot brings in, with energy raised to {@link ENERGY_FLOOR}. */
function floored(c: Carried): Carried {
  return c.energy !== undefined && c.energy < ENERGY_FLOOR ? { ...c, energy: ENERGY_FLOOR } : { ...c };
}

/** Seeds the page makes and accepts: six octal digits. */
export const SEED_MAX = 0o777777;

export class Expedition {
  readonly seed: number;
  /** The level being played, 1 first. */
  depth: number;
  /** HP, energy (absent: full; at least {@link ENERGY_FLOOR}) and coins at the start of this level. */
  carried: Carried;
  /** Ticks spent on the levels already cleared. */
  ticks: number;
  private cached: Level | null = null;

  constructor(seed: number, state?: Partial<Omit<ExpeditionState, 'seed'>>) {
    if (!(Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX)) throw new Error('expedition: seed out of range');
    this.seed = seed;
    this.depth = state?.depth ?? 1;
    this.carried = floored(state?.carried ?? { coins: 0 });
    this.ticks = state?.ticks ?? 0;
  }

  /** The level at the current depth. */
  get level(): Level {
    if (this.cached?.depth !== this.depth) this.cached = generateLevel(this.seed, this.depth);
    return this.cached;
  }

  /** A fresh session on the current level, the robot as it entered. */
  session(): Session {
    const l = this.level;
    return new Session(l.text, { seed: l.worldSeed, robot: { ...this.carried } });
  }

  /** The exit of `world` (the current level) is reached: go one level deeper. */
  descend(world: World): void {
    const r = world.robot;
    this.carried = floored({ hp: r.hp, energy: r.energy, coins: r.coins });
    this.ticks += world.tick;
    this.depth++;
  }

  get state(): ExpeditionState {
    return { seed: this.seed, depth: this.depth, carried: { ...this.carried }, ticks: this.ticks };
  }

  /** An expedition from kept state, or null if it is not one. */
  static restore(v: unknown): Expedition | null {
    if (!v || typeof v !== 'object') return null;
    const s = v as Partial<ExpeditionState>;
    const int = (n: unknown, lo: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo;
    const c = s.carried;
    if (!int(s.seed, 0) || (s.seed as number) > SEED_MAX || !int(s.depth, 1) || !int(s.ticks, 0)) return null;
    if (!c || typeof c !== 'object' || !int(c.coins, 0)
      || (c.hp !== undefined && !int(c.hp, 1)) || (c.energy !== undefined && !int(c.energy, 0))) return null;
    return new Expedition(s.seed as number, { depth: s.depth, ticks: s.ticks,
      carried: { coins: c.coins, ...(c.hp !== undefined && { hp: c.hp }), ...(c.energy !== undefined && { energy: c.energy }) } });
  }
}

/** The editor's program for a new expedition: a right-hand wall follower to build on. */
export const EXPEDITION_STARTER = `; Expedition: the same program runs on every level.
; Reach the exit and the robot goes one level deeper, with its
; HP, energy and coins. Each level is new, so plan nothing by hand:
; look (SCAN, AIM), decide, move.
;
; A start: drive to a wall, then keep it on the right. Turn
; right; if the way is blocked, turn left until it is not.

GO:     MOV #1, R0
        EMT MOVE            ; straight on until something is in the way
        BCC GO
        EMT LEFT            ; the wall is on the right now
        BR TRY
LOOK:   EMT RIGHT           ; the wall may have turned away: follow it
TRY:    MOV #1, R0
        EMT MOVE            ; one cell forward
        BCC LOOK            ; moved: look right again
        EMT LEFT            ; blocked: try the next way
        BR TRY
`;
