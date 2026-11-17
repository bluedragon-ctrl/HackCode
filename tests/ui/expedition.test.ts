/** The expedition mode: one seed, level after level, the robot's state carried (DESIGN.md §8). */
import { describe, expect, it } from 'vitest';
import { ENERGY_MAX, generateLevel, ROBOT_HP } from '../../src/core';
import { Expedition, EXPEDITION_STARTER, SEED_MAX } from '../../src/ui/expedition';

/** A seed on which the starter program clears the first two levels. */
const SEED = 0o12;

/** Run the starter on the current level; returns the session. */
function play(e: Expedition, ticks = 3000) {
  const s = e.session();
  expect(s.load(EXPEDITION_STARTER)).toEqual([]);
  const r = s.run(ticks);
  return { s, stop: r.stop };
}

describe('expedition', () => {
  it('plays the generated level of its seed and depth', () => {
    const e = new Expedition(SEED);
    expect(e.depth).toBe(1);
    expect(e.level).toEqual(generateLevel(SEED, 1));
    const s = e.session();
    expect(s.map).toBe(generateLevel(SEED, 1).text);
    expect(s.world.robot.hp).toBe(ROBOT_HP);
    expect(s.world.robot.energy).toBe(ENERGY_MAX);
    expect(s.world.robot.coins).toBe(0);
  });

  it('descends at the exit and carries HP, energy, coins and ticks', () => {
    const e = new Expedition(SEED);
    const { s, stop } = play(e);
    expect(stop).toBe('won');
    const r = s.world.robot;
    e.descend(s.world);
    expect(e.depth).toBe(2);
    expect(e.ticks).toBe(s.world.tick);
    expect(e.carried).toEqual({ hp: r.hp, energy: r.energy, coins: r.coins });
    expect(r.energy).toBeLessThan(ENERGY_MAX);
    expect(e.level).toEqual(generateLevel(SEED, 2));
    const next = e.session().world.robot;
    expect([next.hp, next.energy, next.coins]).toEqual([r.hp, r.energy, r.coins]);
  });

  it('the starter program clears two levels of its seed with the same program', () => {
    const e = new Expedition(SEED);
    for (let depth = 1; depth <= 2; depth++) {
      const { s, stop } = play(e);
      expect(stop).toBe('won');
      e.descend(s.world);
    }
    expect(e.depth).toBe(3);
  });

  it('is the same expedition every time for one seed', () => {
    const run = () => {
      const e = new Expedition(SEED);
      const { s } = play(e, 500);
      return [s.world.tick, s.world.robot.x, s.world.robot.y, s.world.robot.energy, s.world.robot.hp];
    };
    expect(run()).toEqual(run());
  });

  it('a retry starts the level again as the robot entered it', () => {
    const e = new Expedition(SEED, { depth: 2, carried: { hp: 50, energy: 1234, coins: 7 } });
    const { s } = play(e, 50);
    s.reset();
    const r = s.world.robot;
    expect([r.hp, r.energy, r.coins, s.world.tick]).toEqual([50, 1234, 7, 0]);
  });

  it('keeps its state and refuses state that is not one', () => {
    const e = new Expedition(0o1234, { depth: 3, ticks: 400, carried: { hp: 60, energy: 900, coins: 5 } });
    const back = Expedition.restore(JSON.parse(JSON.stringify(e.state)));
    expect(back?.state).toEqual(e.state);
    expect(Expedition.restore(new Expedition(5).state)?.state).toEqual({ seed: 5, depth: 1, ticks: 0, carried: { coins: 0 } });
    for (const bad of [null, 3, {}, { ...e.state, depth: 0 }, { ...e.state, seed: SEED_MAX + 1 },
      { ...e.state, carried: { coins: -1 } }, { ...e.state, carried: { coins: 1, hp: 0 } }, { ...e.state, ticks: 1.5 }]) {
      expect(Expedition.restore(bad)).toBeNull();
    }
    expect(() => new Expedition(-1)).toThrow(/seed/);
    expect(() => new Expedition(SEED_MAX + 1)).toThrow(/seed/);
  });
});
