/** The expedition's dungeon generator and its reachability check (DESIGN.md §8). */
import { describe, expect, it } from 'vitest';
import { buildLevel, checkLevel, difficulty, generateLevel, MAP_SIZE, parseMap, TYPE } from '../../src/core';

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

describe('dungeon generator', () => {
  it('gives the same level for the same seed and depth', () => {
    expect(generateLevel(42, 3)).toEqual(generateLevel(42, 3));
    expect(generateLevel(42, 3).text).not.toBe(generateLevel(43, 3).text);
    expect(generateLevel(42, 3).text).not.toBe(generateLevel(42, 4).text);
  });

  it('makes a walled map of the standard size', () => {
    const rows = generateLevel(7, 1).text.split('\n');
    expect(rows).toHaveLength(MAP_SIZE);
    for (const r of rows) expect(r).toHaveLength(MAP_SIZE);
    expect(rows[0]).toBe('#'.repeat(MAP_SIZE));
    expect(rows[MAP_SIZE - 1]).toBe('#'.repeat(MAP_SIZE));
    for (const r of rows) expect(r[0] + r[MAP_SIZE - 1]).toBe('##');
  });

  it('builds a world with the level\'s monsters', () => {
    const level = generateLevel(5, 4);
    const w = buildLevel(level);
    expect(w.actors.length).toBe(count(level.text, /[PHS]/g));
    expect(w.atExit).toBe(false);
    const [ex, ey] = [level.text.indexOf('E') % (MAP_SIZE + 1), Math.floor(level.text.indexOf('E') / (MAP_SIZE + 1))];
    expect(w.grid.typeAt('floor', ex, ey)).toBe(TYPE.EXIT);
  });

  it('holds more the deeper the level', () => {
    expect(difficulty(1)).toMatchObject({ monsters: 1, kinds: 'P', chargers: 0 });
    expect(difficulty(2)).toMatchObject({ monsters: 2, kinds: 'PH', chargers: 1 });
    expect(difficulty(3).kinds).toBe('PHS');
    expect(difficulty(20)).toMatchObject({ monsters: 6, coinPiles: 6, maxPile: 9, chargers: 2 });
    expect(() => difficulty(0)).toThrow(/depth/);
    const level = generateLevel(1, 6);
    expect(count(level.text, /[PHS]/g)).toBe(6);
    expect(count(level.text, /\+/g)).toBe(2);
  });

  it('generates solvable maps for 1000 seeds', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const depth = 1 + (seed % 8);
      const level = generateLevel(seed, depth);
      const d = difficulty(depth);
      const w = buildLevel(level);
      expect(checkLevel(w), `seed ${seed} depth ${depth}\n${level.text}`).toEqual([]);
      expect(count(level.text, /[PHS]/g), `seed ${seed}: monsters`).toBe(d.monsters);
      expect(count(level.text, /\+/g), `seed ${seed}: chargers`).toBe(d.chargers);
      expect(count(level.text, /[$1-9]/g), `seed ${seed}: coins`).toBe(d.coinPiles);
    }
  });
});

describe('reachability check', () => {
  it('passes an open map', () => {
    expect(checkLevel(parseMap('>.$E'))).toEqual([]);
  });

  it('lets the robot through monsters but not walls or chargers', () => {
    expect(checkLevel(parseMap('>PE'))).toEqual([]);
    expect(checkLevel(parseMap('>#E'))).toEqual(['exit at 2,0 cannot be reached']);
    expect(checkLevel(parseMap('>+E'))).toEqual(['exit at 2,0 cannot be reached']);
  });

  it('finds unreachable coins, chargers out of reach and missing exits', () => {
    expect(checkLevel(parseMap('>E#$'))).toEqual(['coin at 3,0 cannot be reached']);
    expect(checkLevel(parseMap('>E#.\n###+'))).toEqual(['charger at 3,1 cannot be docked']);
    expect(checkLevel(parseMap('>.'))).toEqual(['0 exits']);
  });
});
