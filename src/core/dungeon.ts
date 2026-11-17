/**
 * The expedition's dungeon generator (DESIGN.md §8): seeded BSP rooms joined by corridors,
 * then the robot, the exit, coins, chargers and monsters, more of them the deeper the level.
 *
 * A level comes out as a text map (the same format as hand-made maps, src/core/maps.ts), so
 * it can be printed, compared in tests and built with `parseMap`. The same (seed, depth)
 * always gives the same level. `checkLevel` is the reachability check a level must pass;
 * `generateLevel` makes sure it does.
 */

import { DX, DY, MAP_SIZE } from './constants';
import { FLAG, TYPE } from './objects';
import { parseMap, type MapOptions } from './maps';
import { Rng } from './rng';
import type { World } from './world';

/** A room: its floor cells are x..x+w-1, y..y+h-1. */
export interface Room { x: number; y: number; w: number; h: number }

/** How much a level holds at a given depth. */
export interface Difficulty {
  /** Number of monsters. */
  monsters: number;
  /** Monster map characters that may appear (P patrol, H chaser, S sentry). */
  kinds: string;
  /** Number of coin piles, and the largest pile. */
  coinPiles: number;
  maxPile: number;
  chargers: number;
}

export interface Level {
  seed: number;
  depth: number;
  /** The map as text (src/core/maps.ts format). */
  text: string;
  rooms: Room[];
  /** The world's seed: monsters' random numbers come from it. */
  worldSeed: number;
}

/** Smallest distance between two wall lines of a BSP leaf: rooms are at least 3 wide inside. */
const MIN_LEAF = 4;
/** Monsters start at least this far (Manhattan) from the robot. */
const MONSTER_DISTANCE = 6;

/**
 * Steps from (sx, sy) to every cell of a width × height area over cells where `open` is
 * true (−1: not reached), breadth first, N E S W.
 */
function distances(width: number, height: number, sx: number, sy: number,
  open: (x: number, y: number) => boolean): Int32Array {
  const d = new Int32Array(width * height).fill(-1);
  d[sy * width + sx] = 0;
  const queue = [sx, sy];
  for (let i = 0; i < queue.length; i += 2) {
    const x = queue[i], y = queue[i + 1];
    for (let h = 0; h < 4; h++) {
      const nx = x + DX[h], ny = y + DY[h];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || d[ny * width + nx] >= 0 || !open(nx, ny)) continue;
      d[ny * width + nx] = d[y * width + x] + 1;
      queue.push(nx, ny);
    }
  }
  return d;
}

/** What depth (1 = the first level) brings. */
export function difficulty(depth: number): Difficulty {
  if (!(Number.isInteger(depth) && depth >= 1)) throw new Error('dungeon: depth must be an integer ≥ 1');
  return {
    monsters: Math.min(depth, 6),
    kinds: depth >= 3 ? 'PHS' : depth >= 2 ? 'PH' : 'P',
    coinPiles: Math.min(2 + (depth >> 1), 6),
    maxPile: Math.min(depth + 2, 9),
    chargers: depth >= 5 ? 2 : depth >= 2 ? 1 : 0,
  };
}

/** Mix the depth into the seed, so each depth of one expedition gets its own level. */
function levelSeed(seed: number, depth: number): number {
  return (seed + Math.imul(depth, 0x9e3779b9)) >>> 0;
}

/** Levels tried for one (seed, depth) before giving up: in practice the first passes. */
const ATTEMPTS = 8;

/**
 * Generate the level for (seed, depth). It must pass {@link checkLevel}; one that does not is
 * made again from a seed mixed with the attempt number (still the same for the same inputs).
 */
export function generateLevel(seed: number, depth: number): Level {
  const problems: string[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const l = generateOnce(seed, depth, (levelSeed(seed, depth) + Math.imul(attempt, 0x85ebca6b)) >>> 0);
    const found = checkLevel(buildLevel(l));
    if (!found.length) return l;
    problems.push(...found);
  }
  throw new Error(`dungeon: no solvable level for seed ${seed}, depth ${depth}: ${problems.join('; ')}`);
}

function generateOnce(seed: number, depth: number, worldSeed: number): Level {
  const diff = difficulty(depth);
  const rng = new Rng(worldSeed);
  const size = MAP_SIZE;
  const cells: string[][] = Array.from({ length: size }, () => Array<string>(size).fill('#'));
  const at = (x: number, y: number) => cells[y][x];
  const put = (x: number, y: number, c: string) => { cells[y][x] = c; };
  const range = (lo: number, hi: number) => lo + rng.int(hi - lo + 1); // inclusive
  /** A random floor cell of a room. */
  const cellIn = (r: Room): [number, number] => [range(r.x, r.x + r.w - 1), range(r.y, r.y + r.h - 1)];

  // BSP: a leaf is the area between wall lines x0..x1, y0..y1 (both inclusive).
  const rooms: Room[] = [];
  const split = (x0: number, y0: number, x1: number, y1: number, level: number): Room[] => {
    const canX = x1 - x0 >= 2 * MIN_LEAF;
    const canY = y1 - y0 >= 2 * MIN_LEAF;
    // Always split the full map; deeper leaves stop now and then, for rooms of mixed sizes.
    if ((canX || canY) && (level < 2 || rng.int(4) !== 0)) {
      const vertical = canX && canY ? (x1 - x0 === y1 - y0 ? rng.int(2) === 0 : x1 - x0 > y1 - y0) : canX;
      let a: Room[];
      let b: Room[];
      if (vertical) {
        const s = range(x0 + MIN_LEAF, x1 - MIN_LEAF);
        a = split(x0, y0, s, y1, level + 1);
        b = split(s, y0, x1, y1, level + 1);
      } else {
        const s = range(y0 + MIN_LEAF, y1 - MIN_LEAF);
        a = split(x0, y0, x1, s, level + 1);
        b = split(x0, s, x1, y1, level + 1);
      }
      corridor(a[rng.int(a.length)], b[rng.int(b.length)]);
      return [...a, ...b];
    }
    // A leaf: one room somewhere inside it, at least 2×2 (3×3 when it fits).
    const iw = x1 - x0 - 1;
    const ih = y1 - y0 - 1;
    const w = range(Math.min(3, iw), iw);
    const h = range(Math.min(3, ih), ih);
    const room = { x: range(x0 + 1, x1 - w), y: range(y0 + 1, y1 - h), w, h };
    for (let y = room.y; y < room.y + h; y++) for (let x = room.x; x < room.x + w; x++) put(x, y, '.');
    rooms.push(room);
    return [room];
  };

  /** An L-shaped corridor between random cells of two rooms. */
  const corridor = (a: Room, b: Room) => {
    let [x, y] = cellIn(a);
    const [tx, ty] = cellIn(b);
    const xFirst = rng.int(2) === 0;
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); put(x, y, '.'); } };
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); put(x, y, '.'); } };
    if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };

  split(0, 0, size - 1, size - 1, 0);

  // Floor cells, in reading order, and distances from a cell over the floor.
  const floor = (): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (at(x, y) === '.') out.push([x, y]);
    return out;
  };
  const passable = (x: number, y: number) => at(x, y) !== '#' && at(x, y) !== '+';
  const fromCell = (x: number, y: number) => distances(size, size, x, y, passable);

  // The robot in a random room; the exit on the floor cell farthest from it.
  const [rx, ry] = cellIn(rooms[rng.int(rooms.length)]);
  const fromRobot = fromCell(rx, ry);
  let exit: [number, number] = [rx, ry];
  for (const [x, y] of floor()) if (fromRobot[y * size + x] > fromRobot[exit[1] * size + exit[0]]) exit = [x, y];
  put(exit[0], exit[1], 'E');
  put(rx, ry, '^>v<'[rng.int(4)]);

  // The free floor cells, in reading order; each one used is taken out (`use`).
  const free = floor();
  const use = (c: [number, number]) => { free.splice(free.indexOf(c), 1); };
  /** A random free floor cell that passes the test, or null. */
  const pick = (ok: (x: number, y: number) => boolean): [number, number] | null => {
    const fit = free.filter(([x, y]) => ok(x, y));
    return fit.length ? fit[rng.int(fit.length)] : null;
  };

  // Chargers: in a room, not on a corridor, and only where every floor cell stays connected.
  const inRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const connected = () => {
    const d = fromCell(rx, ry);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (passable(x, y) && d[y * size + x] < 0) return false;
    return true;
  };
  for (let i = 0; i < diff.chargers; i++) {
    const tried = new Set<number>();
    for (;;) {
      const c = pick((x, y) => inRoom(x, y) && !tried.has(y * size + x));
      if (!c) break;
      tried.add(c[1] * size + c[0]);
      put(c[0], c[1], '+');
      if (connected()) { use(c); break; }
      put(c[0], c[1], '.');
    }
  }

  // Coins anywhere on the floor.
  for (let i = 0; i < diff.coinPiles; i++) {
    const c = pick(() => true);
    if (!c) break;
    const n = range(1, diff.maxPile);
    put(c[0], c[1], n === 1 ? '$' : String(n));
    use(c);
  }

  // Monsters away from the robot (closer if the map is small), on empty floor.
  for (let i = 0; i < diff.monsters; i++) {
    let c: [number, number] | null = null;
    for (let far = MONSTER_DISTANCE; !c && far >= 3; far--) {
      c = pick((x, y) => Math.abs(x - rx) + Math.abs(y - ry) >= far);
    }
    if (!c) break;
    put(c[0], c[1], diff.kinds[rng.int(diff.kinds.length)]);
    use(c);
  }

  return { seed, depth, text: cells.map((r) => r.join('')).join('\n'), rooms, worldSeed };
}

/** Build the world for a level. */
export function buildLevel(level: Level, opts: Omit<MapOptions, 'seed'> = {}): World {
  return parseMap(level.text, { ...opts, seed: level.worldSeed });
}

/**
 * The reachability check: from the robot, over cells whose occupant is not solid or is
 * mobile (monsters can be shot or wait out), the exit and every coin can be reached, and
 * every charger has a reachable cell beside it to dock from. Returns the problems found
 * (empty when the level is solvable).
 */
export function checkLevel(world: World): string[] {
  const g = world.grid;
  const { width, height } = g;
  const open = (x: number, y: number) => {
    const o = g.get('occupant', x, y);
    return !(o.flags & FLAG.SOLID) || !!(o.flags & FLAG.MOBILE);
  };
  const d = distances(width, height, world.robot.x, world.robot.y, open);
  const reached = (x: number, y: number) => g.inBounds(x, y) && d[y * width + x] >= 0;
  const problems: string[] = [];
  let exits = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const f = g.typeAt('floor', x, y);
      if (f === TYPE.EXIT) exits++;
      if ((f === TYPE.EXIT || f === TYPE.COIN) && !reached(x, y)) problems.push(`${f === TYPE.EXIT ? 'exit' : 'coin'} at ${x},${y} cannot be reached`);
      if (g.typeAt('occupant', x, y) === TYPE.CHARGER && !DX.some((dx, h) => reached(x + dx, y + DY[h]))) {
        problems.push(`charger at ${x},${y} cannot be docked`);
      }
    }
  }
  if (exits !== 1) problems.push(`${exits} exits`);
  return problems;
}
