/** Monsters: their machines, behaviour scripts, contact and laser damage, loot (DESIGN.md §6). */
import { describe, expect, it } from 'vitest';
import {
  addMonster, FLAG, HEADING, LOOT, loot, Monster, MONSTER_MEMORY, MONSTER_REG, MONSTER_SYMBOLS, MONSTERS, monsterScript,
  OBJECTS, parseMap, scan, SYMBOLS, type World,
} from '../../src/core';
import { asm } from './helpers';

/** The robot idles in a busy loop, so the world keeps running. */
const IDLE = '1$: BR 1$';

function start(map: string, program = IDLE, seed = 0): World {
  const w = parseMap(map, { seed });
  const err = w.robot.load(asm(program));
  if (err) throw new Error(err);
  return w;
}

const monsters = (w: World) => w.actors.filter((a): a is Monster => a instanceof Monster);

/** Where each monster stands after each tick. */
function trail(w: World, ticks: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    w.runTick();
    out.push(monsters(w).map((m) => `${m.x},${m.y},${m.heading}`).join(' '));
  }
  return out;
}

/** The distinct cells a monster passes through, in order. */
function cells(w: World, m: Monster, ticks: number): string[] {
  const out = [`${m.x},${m.y}`];
  for (let i = 0; i < ticks; i++) {
    w.runTick();
    const c = `${m.x},${m.y}`;
    if (c !== out[out.length - 1]) out.push(c);
  }
  return out;
}

// A ring corridor around a block; the robot is walled in at the bottom right.
const RING = `
#########
#P......#
#.#####.#
#.......#
#########
#>#######
#########
`;

// A room with a chaser and no robot in sight (the robot is walled in, top left).
const ROOM = `
###########
#>#.......#
###.......#
#.........#
#.........#
#....H....#
#.........#
#.........#
###########
`;

describe('monster types', () => {
  it('have TYPEs in the monster range, and records with hostile flags and loot', () => {
    for (const k of Object.values(MONSTERS)) {
      expect(k.type).toBeGreaterThanOrEqual(0o40);
      expect(k.type).toBeLessThanOrEqual(0o77);
      expect(k.record.type).toBe(k.type);
      expect(k.record.flags & FLAG.HOSTILE).toBeTruthy();
      expect(k.record.flags & FLAG.SOLID).toBeTruthy();
    }
    expect(MONSTERS.patrol.record.loot).toBe(loot(LOOT.COINS, 2));
    expect(SYMBOLS['T.PTRL']).toBe(MONSTERS.patrol.type);
    expect(SYMBOLS['T.CHSR']).toBe(MONSTERS.chaser.type);
    expect(SYMBOLS['T.SNTR']).toBe(MONSTERS.sentry.type);
  });

  it('each script assembles with the monster prelude and fits the machine', () => {
    for (const k of Object.values(MONSTERS)) {
      const a = monsterScript(k);
      expect(a.ok).toBe(true);
      expect(a.origin + a.bytes.length).toBeLessThanOrEqual(MONSTER_MEMORY);
    }
    expect(MONSTER_MEMORY).toBeGreaterThanOrEqual(2048);
    expect(MONSTER_MEMORY).toBeLessThanOrEqual(4096);
  });

  it('the monster prelude has the same 6-character rule as the robot one', () => {
    for (const name of Object.keys(MONSTER_SYMBOLS)) expect(name).toMatch(/^[A-Z.$][A-Z0-9.$]{0,5}$/);
  });
});

describe('monsters on a map', () => {
  it('P and H place a patrol and a chaser, facing north, with IDs in reading order', () => {
    const w = parseMap(`
#####
#H.P#
#.>.#
#####
`);
    const [a, b] = monsters(w);
    expect([a.id, a.kind.name, a.x, a.y, a.heading]).toEqual([1, 'chaser', 1, 1, HEADING.N]);
    expect([b.id, b.kind.name, b.x, b.y]).toEqual([2, 'patrol', 3, 1]);
    expect(w.grid.get('occupant', 3, 1)).toEqual(MONSTERS.patrol.record);
  });

  it('the robot scanner sees a monster as a hostile object', () => {
    const w = start(RING);
    const seen = scan(w.robot, true);
    expect(seen).toEqual([]); // walled in
    const w2 = parseMap('>.P');
    expect(scan(w2.robot, false)[0].r).toEqual(MONSTERS.patrol.record);
  });

  it('a world with monsters still stops when the robot stops', () => {
    const w = start(RING, ' HALT');
    expect(w.run(10).reason).toBe('halt');
    expect(w.tick).toBe(0);
  });
});

describe('patrol', () => {
  it('walks ahead until blocked, then turns right: clockwise round the ring', () => {
    const w = start(RING);
    const [p] = monsters(w);
    const lap = ['1,1', '2,1', '3,1', '4,1', '5,1', '6,1', '7,1', '7,2', '7,3',
      '6,3', '5,3', '4,3', '3,3', '2,3', '1,3', '1,2'];
    const seen = cells(w, p, 200);
    expect(seen.slice(0, lap.length * 2 + 1)).toEqual([...lap, ...lap, '1,1']);
  });

  it('takes the same time for every lap', () => {
    const w = start(RING);
    const [p] = monsters(w);
    const laps: number[] = [];
    let wasHome = true;
    for (let t = 1; t <= 400; t++) {
      w.runTick();
      const home = p.x === 1 && p.y === 1;
      if (home && !wasHome) laps.push(t);
      wasHome = home;
    }
    expect(laps.length).toBeGreaterThanOrEqual(3);
    const period = laps[1] - laps[0];
    expect(laps[2] - laps[1]).toBe(period);
    // 16 cells and 4 blocked tries, MOVE ticks each (a move fails when it completes),
    // and four right turns.
    expect(period).toBe(20 * MONSTERS.patrol.moveTicks + 4 * MONSTERS.patrol.turnTicks);
  });

  it('behaves the same from the same seed', () => {
    expect(trail(start(RING, IDLE, 7), 150)).toEqual(trail(start(RING, IDLE, 7), 150));
  });

  it('bites the robot when it bumps into it', () => {
    const w = start(`
#####
#>..#
#P###
#####
`);
    // The patrol faces north: the robot is right ahead.
    const before = w.robot.hp;
    w.run(MONSTERS.patrol.moveTicks);
    expect(w.robot.hp).toBe(before - MONSTERS.patrol.contact);
    const [p] = monsters(w);
    expect([p.x, p.y]).toEqual([1, 2]);
  });
});

describe('chaser', () => {
  it('heads for the robot it sees and bites it until it is destroyed', () => {
    const w = start(`
#######
#>...H#
#######
`);
    const [c] = monsters(w);
    const r = w.run(2000);
    expect(r.reason).toBe('destroyed');
    expect(w.robot.hp).toBe(0);
    expect(w.robot.destroyed).toBe(true);
    expect([c.x, c.y, c.heading]).toEqual([2, 1, HEADING.W]);
    // Once destroyed, the world stops.
    expect(w.run(10).reason).toBe('destroyed');
  });

  it('turns along the longer axis towards the robot', () => {
    const w = start(`
#######
#.....#
#.....#
#.....#
#H...>#
#######
`);
    const [c] = monsters(w);
    cells(w, c, 3 * MONSTERS.chaser.moveTicks + 2 * MONSTERS.chaser.turnTicks);
    expect(c.y).toBe(4);
    expect(c.x).toBeGreaterThan(1);
    expect(c.heading).toBe(HEADING.E);
  });

  it('wanders the same way from the same seed, and differently from another', () => {
    const a = trail(start(ROOM, IDLE, 1), 300);
    const b = trail(start(ROOM, IDLE, 1), 300);
    const c = trail(start(ROOM, IDLE, 2), 300);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // It does wander: more than a few cells.
    expect(new Set(a.map((s) => s.split(',').slice(0, 2).join())).size).toBeGreaterThan(4);
  });

  it('never leaves the floor or overlaps anything', () => {
    const w = start(ROOM, IDLE, 3);
    const [c] = monsters(w);
    for (let t = 0; t < 300; t++) {
      w.runTick();
      expect(w.grid.get('occupant', c.x, c.y)).toEqual(MONSTERS.chaser.record);
    }
  });
});

describe('sentry', () => {
  const S = MONSTERS.sentry;
  const L = S.laser!;

  it('has a laser; the other kinds have none', () => {
    expect(L.range).toBe(3);
    expect(MONSTERS.patrol.laser).toBeUndefined();
    const w = start(RING);
    expect(monsters(w)[0].machine.read(MONSTER_REG.LSRCSR, false)).toBeLessThan(0); // bus error
  });

  it('turns to the robot in its row and shoots it, then reloads', () => {
    const w = start(`
######
#>..S#
######
`);
    const [s] = monsters(w);
    const first = S.turnTicks + L.ticks;
    w.run(first - 1);
    expect(w.robot.hp).toBe(100);
    w.run(1);
    expect(w.robot.hp).toBe(100 - L.damage);
    expect(s.heading).toBe(HEADING.W);
    w.run(L.ticks + L.reload - 1);
    expect(w.robot.hp).toBe(100 - L.damage);
    w.run(1);
    expect(w.robot.hp).toBe(100 - 2 * L.damage);
    expect([s.x, s.y]).toEqual([4, 1]); // it never moves
  });

  it('shoots along a column too', () => {
    const w = start(`
###
#S#
#.#
#^#
###
`);
    w.run(S.turnTicks * 2 + L.ticks);
    expect(w.robot.hp).toBe(100 - L.damage);
    expect(monsters(w)[0].heading).toBe(HEADING.S);
  });

  it('holds fire beyond its range, off its row and column, and behind cover', () => {
    for (const map of [`
#######
#>...S#
#######
`, `
#####
#>..#
#...#
#..S#
#####
`, `
######
#>#.S#
######
`]) {
      const w = start(map);
      w.run(60);
      expect(w.robot.hp, map).toBe(100);
    }
  });

  it('one robot shot destroys it before it fires, and it drops its coins', () => {
    const w = start(`
####
#>S#
####
`, ` EMT FIRE
 HALT`);
    w.run(20);
    expect(monsters(w)[0].destroyed).toBe(true);
    expect(w.robot.hp).toBe(100);
    expect(w.grid.get('floor', 2, 1)).toEqual(OBJECTS.coins(3));
  });

  it('behaves the same from the same seed', () => {
    const map = `
#######
#.....#
#..S..#
#.....#
#>....#
#######
`;
    const a = start(map, ` MOV #1, R0
1$: EMT MOVE
 EMT LEFT
 BR 1$`, 5);
    const b = start(map, ` MOV #1, R0
1$: EMT MOVE
 EMT LEFT
 BR 1$`, 5);
    const ta = trail(a, 120), tb = trail(b, 120);
    expect(ta).toEqual(tb);
    expect(a.robot.hp).toBe(b.robot.hp);
  });
});

describe('laser damage and loot', () => {
  const FIRE = ` EMT FIRE
 HALT`;

  it('one shot destroys a patrol, which drops its coins and stops acting', () => {
    const w = start(`
####
#>P#
####
`, FIRE);
    const [p] = monsters(w);
    expect(w.run(20).reason).toBe('halt');
    expect(w.robot.cpu.r[0]).toBe(1); // hit at distance 1
    expect(p.destroyed).toBe(true);
    expect(w.grid.typeAt('occupant', 2, 1)).toBe(0);
    expect(w.grid.get('floor', 2, 1)).toEqual(OBJECTS.coins(2));
    expect(w.robot.hp).toBe(100);
  });

  it('a chaser takes two shots', () => {
    const w = start(`
#####
#>#H#
#####
`, ` EMT RIGHT
 EMT FIRE
 HALT`);
    // Turned away and walled off: the chaser is never hit, nothing breaks.
    w.run(50);
    expect(monsters(w)[0].destroyed).toBe(false);

    const w2 = start(`
####
#>H#
####
`, ` EMT FIRE
 EMT FIRE
 HALT`);
    const [c] = monsters(w2);
    w2.run(4);
    expect(c.destroyed).toBe(false);
    expect(w2.grid.get('occupant', 2, 1).hp).toBe(MONSTERS.chaser.hp - 40);
    w2.run(100);
    expect(c.destroyed).toBe(true);
    expect(w2.grid.get('floor', 2, 1)).toEqual(OBJECTS.coins(5));
  });

  it('a monster that HALTs or crashes just stands still', () => {
    const w = start(`
#######
#>....#
#######
`);
    const m = addMonster(w, MONSTERS.chaser, 5, 1, HEADING.W, asm(' HALT'));
    w.run(50);
    expect([m.x, m.y]).toEqual([5, 1]);
    const m2 = addMonster(w, MONSTERS.chaser, 3, 1, HEADING.W, asm(' MOV #1, R0\n TST (R0)'));
    w.run(50);
    expect([m2.x, m2.y]).toEqual([3, 1]);
    expect(w.robot.hp).toBe(100);
  });
});
