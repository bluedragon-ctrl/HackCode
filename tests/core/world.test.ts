/** Object records, the two-layer grid and the seeded RNG (DESIGN.md §2). */
import { describe, expect, it } from 'vitest';
import { dropFor, FLAG, Grid, LOOT, loot, OBJECTS, record, recordWords, Rng, TYPE } from '../../src/core';

describe('object records', () => {
  it('pack as word0 = TYPE | HP<<8, word1 = FLAGS | LOOT<<8', () => {
    const r = record(TYPE.WALL, 255, FLAG.SOLID | FLAG.OPAQUE, loot(LOOT.COINS, 3));
    expect(recordWords(r)).toEqual([0o1 | (255 << 8), 0o14 | (0x13 << 8)]);
  });

  it('walls are destructible solid, opaque objects', () => {
    expect(OBJECTS.wall()).toEqual({ type: 1, hp: 255, flags: 0o14, loot: 0 });
  });

  it('loot becomes a floor item', () => {
    expect(dropFor(loot(LOOT.COINS, 5))).toEqual(OBJECTS.coins(5));
    expect(dropFor(loot(LOOT.CHIP, 0))).toEqual(OBJECTS.chip());
    expect(dropFor(0)).toBeNull();
    expect(dropFor(loot(LOOT.COINS, 0))).toBeNull();
  });
});

describe('grid', () => {
  it('has two independent layers', () => {
    const g = new Grid(4, 3);
    g.set('floor', 1, 2, OBJECTS.coins(2));
    g.set('occupant', 1, 2, OBJECTS.wall());
    expect(g.get('floor', 1, 2)).toEqual(OBJECTS.coins(2));
    expect(g.get('occupant', 1, 2)).toEqual(OBJECTS.wall());
    g.clear('occupant', 1, 2);
    expect(g.typeAt('occupant', 1, 2)).toBe(0);
    expect(g.typeAt('floor', 1, 2)).toBe(TYPE.COIN);
  });

  it('stores 4 bytes per cell, row-major', () => {
    const g = new Grid(4, 3);
    g.set('occupant', 3, 1, record(7, 8, 9, 10));
    expect([...g.occupant.subarray((1 * 4 + 3) * 4, (1 * 4 + 3) * 4 + 4)]).toEqual([7, 8, 9, 10]);
  });

  it('reads nothing outside, refuses writes outside', () => {
    const g = new Grid(2, 2);
    expect(g.get('occupant', -1, 0).type).toBe(0);
    expect(g.inBounds(2, 0)).toBe(false);
    expect(() => g.set('floor', 0, 2, OBJECTS.wall())).toThrow();
    expect(() => new Grid(0, 5)).toThrow();
    expect(() => new Grid(257, 5)).toThrow();
  });
});

describe('rng', () => {
  it('is reproducible from the seed', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const seq = (r: Rng) => Array.from({ length: 5 }, () => r.next());
    const sa = seq(a);
    expect(sa).toEqual(seq(b));
    expect(sa).not.toEqual(seq(c));
    for (const v of sa) expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
  });

  it('int(n) stays in range; state survives JSON', () => {
    const r = new Rng(1);
    for (let i = 0; i < 100; i++) expect(r.int(6)).toBeLessThan(6);
    const copy = new Rng(0);
    copy.state = JSON.parse(JSON.stringify(r.state));
    expect(copy.next()).toBe(r.next());
  });
});
