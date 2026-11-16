/**
 * HackCode simulation: the world grid, the robot's Blue-11 machine and devices, and the
 * tick loop. Deterministic and integer-only: no DOM, no `Math.random`, no wall-clock time
 * (tests/core/determinism.test.ts enforces it). Design: docs/DESIGN.md.
 */

export * from './constants';
export * from './objects';
export { Grid, type Layer } from './grid';
export { Rng } from './rng';
export { ActionDevice, CsrDevice, lineOfSight, Grabber, Inventory, Laser, Scanner, Status, Wheels, scan, type Seen } from './devices';
export { Robot, Rom, type LoadOptions, type RobotOptions } from './robot';
export { World, type Actor, type TickReason, type TickResult, type WorldOptions } from './world';
export { SYMBOLS } from './symbols';
export { BIOS_SOURCE, bios, biosEntry } from './bios';
export { parseMap, type MapOptions } from './maps';
export {
  addMonster, CHASER_SOURCE, Monster, MONSTER_MEMORY, MONSTER_REG, MONSTER_SYMBOLS, MONSTERS, monsterKind,
  monsterScript, Motor, MOTOR_FN, MOTOR_VECTOR, PATROL_SOURCE, Sensor, SIGHT_RANGE_SQ, type MonsterKind,
} from './monster';
