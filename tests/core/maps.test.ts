/** Text maps and the exit check. */
import { describe, expect, it } from 'vitest';
import { HEADING, OBJECTS, parseMap, TYPE } from '../../src/core';

describe('text maps', () => {
  it('reads walls, floor items and the robot', () => {
    const w = parseMap(`
#####
#v$E#
#5.C#
#####
`);
    expect([w.grid.width, w.grid.height]).toEqual([5, 4]);
    expect(w.grid.get('occupant', 0, 0)).toEqual(OBJECTS.wall());
    expect(w.grid.get('floor', 2, 1)).toEqual(OBJECTS.coins(1));
    expect(w.grid.get('floor', 1, 2)).toEqual(OBJECTS.coins(5));
    expect(w.grid.typeAt('floor', 3, 1)).toBe(TYPE.EXIT);
    expect(w.grid.typeAt('floor', 3, 2)).toBe(TYPE.CHIP);
    expect([w.robot.x, w.robot.y, w.robot.heading]).toEqual([1, 1, HEADING.S]);
    expect(w.grid.typeAt('occupant', 1, 1)).toBe(TYPE.ROBOT);
    expect(w.grid.typeAt('occupant', 2, 2)).toBe(0);
  });

  it('reads + as a charger', () => {
    const w = parseMap('>+');
    expect(w.grid.get('occupant', 1, 0)).toEqual(OBJECTS.charger());
  });

  it('passes robot options through', () => {
    const w = parseMap('>.', { robot: { energy: 7, hp: 3 } });
    expect([w.robot.energy, w.robot.hp]).toEqual([7, 3]);
  });

  it('refuses malformed maps', () => {
    expect(() => parseMap('')).toThrow(/empty/);
    expect(() => parseMap('...')).toThrow(/no robot/);
    expect(() => parseMap('>.<')).toThrow(/second robot/);
    expect(() => parseMap('>..\n..')).toThrow(/row 1/);
    expect(() => parseMap('>x')).toThrow(/unknown/);
  });

  it('knows when the robot stands on the exit', () => {
    const w = parseMap('>E');
    expect(w.atExit).toBe(false);
    expect(w.moveRobot(1, 0)).toBe(true);
    expect(w.atExit).toBe(true);
  });
});
