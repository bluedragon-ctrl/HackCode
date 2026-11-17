/**
 * Monsters (DESIGN.md §6). Each monster is an {@link Actor} with its own small Blue-11
 * machine: 4 KB of RAM, a motor and a sensor, running the behaviour script of its kind.
 * The scripts are Blue-11 assembly, assembled with {@link MONSTER_SYMBOLS} as the BIOS is
 * with the robot's prelude, and written to be read: players will later hack monsters.
 *
 *   000000–007777  RAM (script from 1000, stack below it)
 *   176400         motor: CSR, error register (vector 300)
 *   176410         laser, for kinds that have one: CSR, error register, distance (vector 304)
 *   176440–176460  sensor, read-only: own X, Y, heading, HP; the robot in sight, its DX,
 *                  DY; the TYPE ahead; a random number
 *
 * Per tick, after the robot, in ID order: the monster's CPU runs {@link TICK_CYCLES}
 * cycles (an overshoot is carried into the next tick), then its busy motor and laser
 * count down and complete as the robot's devices do. Monsters use no energy. A move
 * blocked by the robot bites it: the robot takes the kind's contact damage.
 */

import { assemble, BUS_ERROR, DeviceMachine, type AssembleResult, type Device } from '../blue11';
import { DX, DY, ERR, FN, HEADING, REG, SCAN_RANGE_SQ, TICK_CYCLES, VECTOR } from './constants';
import { beam, CsrDevice, done, lineOfSight, type Outcome } from './devices';
import { FLAG, LOOT, loot, record, TYPE, type ObjectRecord } from './objects';
import { Rng } from './rng';
import { SYMBOLS } from './symbols';
import type { Actor, World } from './world';

/** Bytes of RAM in a monster's machine. */
export const MONSTER_MEMORY = 0o10000;

/** A monster's device registers. */
export const MONSTER_REG = {
  MOTCSR: 0o176400, MOTERR: 0o176402,
  LSRCSR: REG.LSRCSR, LSRERR: REG.LSRERR, LSRDST: REG.LSRDST,
  MYX: 0o176440, MYY: 0o176442, MYHDG: 0o176444, MYHP: 0o176446,
  SEE: 0o176450, RBTDX: 0o176452, RBTDY: 0o176454, AHEAD: 0o176456, RANDOM: 0o176460,
} as const;

/** Motor functions, as written to MOTCSR (bits 3–1). Forward and back go one cell. */
export const MOTOR_FN = { FORWARD: 0o0, LEFT: 0o2, RIGHT: 0o4, BACK: 0o6 } as const;

export const MOTOR_VECTOR = 0o300;

/** A monster sees the robot as the robot's scanner sees: dx² + dy² ≤ 25, line of sight. */
export const SIGHT_RANGE_SQ = SCAN_RANGE_SQ;

/**
 * The prelude for monster scripts: their own registers and motor functions, and the
 * robot's CSR bits, error codes, headings, types and flags.
 */
export const MONSTER_SYMBOLS: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(Object.entries(SYMBOLS).filter(([k]) => /^(CS|ER|H|T|F)\./.test(k))),
  PSW: SYMBOLS.PSW,
  ...MONSTER_REG,
  MOTVEC: MOTOR_VECTOR,
  LSRVEC: VECTOR.LASER,
  'LS.FIR': FN.LASER_FIRE,
  'MO.FWD': MOTOR_FN.FORWARD,
  'MO.LFT': MOTOR_FN.LEFT,
  'MO.RGT': MOTOR_FN.RIGHT,
  'MO.BAK': MOTOR_FN.BACK,
});

// ---------------------------------------------------------------- scripts

/** Start motor function R0 and wait; shared by the scripts. */
const GO = `
; Start motor function R0 and wait until it is done.
; C clear: done. C set: it failed (the way was blocked).
GO:     BIS #CS.GO, R0
        MOV R0, @#MOTCSR
1$:     TSTB @#MOTCSR           ; READY is bit 7, the sign of the low byte
        BPL 1$
        TST @#MOTCSR            ; ERROR is bit 15; TST also clears C
        BPL 2$
        SEC
2$:     RTS PC
`;

const SENSORS = `;
; Sensors (read-only): MYX, MYY, MYHDG, MYHP = where it is, which way it faces
; and its HP. SEE = 1 when the robot is in sight (up to 5 cells away, nothing
; opaque in between), and then RBTDX, RBTDY = where the robot is from here.
; AHEAD = the TYPE of what is in front (T.WALL at the edge of the map).
; RANDOM = a new random number at each read.
; Motor: MOTCSR, functions MO.FWD (one cell), MO.LFT, MO.RGT, MO.BAK.
; Moving into the robot bites it.
`;

/** Turn to face a heading; shared by the scripts that aim. Uses {@link GO}. */
const FACE = `
; Turn to face heading R0 (H.N, H.E, H.S or H.W), the shorter way round.
FACE:   MOV R0, -(SP)
1$:     MOV (SP), R0
        SUB @#MYHDG, R0
        BIC #177774, R0         ; (wanted - now) mod 4: 0 there, 3 left, else right
        BEQ 3$
        CMP R0, #3
        BEQ 2$
        MOV #MO.RGT, R0
        JSR PC, GO
        BR 1$
2$:     MOV #MO.LFT, R0
        JSR PC, GO
        BR 1$
3$:     TST (SP)+
        RTS PC
`;

export const PATROL_SOURCE = `; Patrol: walk ahead until something is in the way, then turn right.
; In a ring corridor it goes round and round, clockwise.
${SENSORS}
START:  MOV #MO.FWD, R0
        JSR PC, GO
        BCC START               ; moved: keep going
        MOV #MO.RGT, R0         ; blocked: turn right
        JSR PC, GO
        BR START
${GO}`;

export const CHASER_SOURCE = `; Chaser: when it sees the robot, it steps towards it, along the axis on
; which the robot is further away. Otherwise it wanders at random.
${SENSORS}
START:  TST @#SEE               ; robot in sight?
        BEQ WANDER

; Which way is the robot? R1 = DX, R3 = |DX|; R2 = DY, R4 = |DY|.
        MOV @#RBTDX, R1
        MOV R1, R3
        BPL 1$
        NEG R3
1$:     MOV @#RBTDY, R2
        MOV R2, R4
        BPL 2$
        NEG R4
2$:     CMP R3, R4              ; further away along X, or along Y?
        BLT 3$
        MOV #H.E, R0            ; along X: east if DX > 0, else west
        TST R1
        BGT 4$
        MOV #H.W, R0
        BR 4$
3$:     MOV #H.S, R0            ; along Y: south if DY > 0, else north
        TST R2
        BGT 4$
        MOV #H.N, R0
4$:     JSR PC, FACE
        MOV #MO.FWD, R0
        JSR PC, GO
        BCC START               ; one step closer
        CMP @#AHEAD, #T.ROBO    ; blocked by the robot: that was a bite
        BEQ START
        BR TURN                 ; by something else: try to get round it

; Wander: one step in four, turn left or right first.
WANDER: BIT #3, @#RANDOM
        BNE STEP
TURN:   MOV #MO.LFT, R0
        BIT #1, @#RANDOM        ; left or right?
        BEQ 1$
        MOV #MO.RGT, R0
1$:     JSR PC, GO
STEP:   MOV #MO.FWD, R0
        JSR PC, GO
        BCS TURN                ; blocked: turn and try again
        BR START
${FACE}${GO}`;

export const SENTRY_SOURCE = `; Sentry: stands still and watches. When it sees the robot in its row or
; its column, close enough for its laser, it turns to face it and fires.
; After a shot the laser reloads; READY comes back when it is done.
; Laser: LSRCSR, function LS.FIR; LSRDST = distance of the hit, 0 = none.
${SENSORS}
RANGE = 3                       ; how far the laser reaches

START:  TST @#SEE               ; robot in sight?
        BEQ START
        MOV @#RBTDX, R1
        MOV @#RBTDY, R2
        TST R1                  ; DX = 0: in our column
        BEQ COLUMN
        TST R2                  ; DY = 0: in our row
        BNE START               ; neither: keep watching

        MOV #H.E, R0            ; in our row: east if DX > 0, else west
        TST R1
        BGT 1$
        MOV #H.W, R0
        NEG R1                  ; R1 = |DX|
1$:     CMP R1, #RANGE
        BGT START               ; too far
        BR SHOOT

COLUMN: MOV #H.S, R0            ; in our column: south if DY > 0, else north
        TST R2
        BGT 1$
        MOV #H.N, R0
        NEG R2                  ; R2 = |DY|
1$:     CMP R2, #RANGE
        BGT START               ; too far

SHOOT:  JSR PC, FACE
        JSR PC, FIRE
        BR START

; Fire the laser and wait until it has reloaded.
FIRE:   MOV #LS.FIR!CS.GO, @#LSRCSR
1$:     TSTB @#LSRCSR           ; READY is bit 7
        BPL 1$
        RTS PC
${FACE}${GO}`;

// ---------------------------------------------------------------- kinds

export interface MonsterKind {
  readonly name: string;
  readonly type: number;
  readonly hp: number;
  /** Damage to the robot when the monster moves into it. */
  readonly contact: number;
  /** The LOOT byte: what it drops when destroyed. */
  readonly loot: number;
  /** Motor ticks per cell, and per turn. */
  readonly moveTicks: number;
  readonly turnTicks: number;
  /** A laser, if the kind has one: damage, reach, ticks to fire, then ticks to reload. */
  readonly laser?: { readonly damage: number; readonly range: number; readonly ticks: number; readonly reload: number };
  /** The behaviour script, shared by every monster of the kind. */
  readonly source: string;
  /** Its object record as it starts. */
  readonly record: Readonly<ObjectRecord>;
}

const FLAGS = FLAG.MOBILE | FLAG.HOSTILE | FLAG.SOLID | FLAG.OPAQUE;

function kind(k: Omit<MonsterKind, 'record'>): MonsterKind {
  return Object.freeze({ ...k, record: Object.freeze(record(k.type, k.hp, FLAGS, k.loot)) });
}

/**
 * The monster kinds. The robot has 100 HP, and its laser does 40 damage up to 3 cells.
 * Contact damage is the close-up attack; a laser the ranged one.
 */
export const MONSTERS = {
  patrol: kind({
    name: 'patrol', type: TYPE.PATROL, hp: 40, contact: 10, loot: loot(LOOT.COINS, 2),
    moveTicks: 4, turnTicks: 1, source: PATROL_SOURCE,
  }),
  chaser: kind({
    name: 'chaser', type: TYPE.CHASER, hp: 80, contact: 20, loot: loot(LOOT.COINS, 5),
    moveTicks: 6, turnTicks: 1, source: CHASER_SOURCE,
  }),
  sentry: kind({
    name: 'sentry', type: TYPE.SENTRY, hp: 40, contact: 0, loot: loot(LOOT.COINS, 3),
    moveTicks: 4, turnTicks: 1, laser: { damage: 15, range: 3, ticks: 3, reload: 6 }, source: SENTRY_SOURCE,
  }),
} as const;

const scripts = new Map<MonsterKind, AssembleResult>();

/** A kind's assembled script (assembled once); throws if it does not assemble. */
export function monsterScript(k: MonsterKind): AssembleResult {
  let a = scripts.get(k);
  if (!a) {
    a = assemble(k.source, { symbols: MONSTER_SYMBOLS });
    if (!a.ok) throw new Error(`${k.name}: ${a.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('; ')}`);
    scripts.set(k, a);
  }
  return a;
}

// ---------------------------------------------------------------- devices

/** Motor: one cell forward or back, or a quarter turn. Moving into the robot bites it. */
export class Motor extends CsrDevice {
  readonly base = MONSTER_REG.MOTCSR;
  readonly size = 4;
  readonly vector = MOTOR_VECTOR;

  constructor(private readonly m: Monster) { super(); }

  protected start(fn: number): Outcome {
    switch (fn << 1) {
      case MOTOR_FN.FORWARD:
      case MOTOR_FN.BACK: return { ticks: this.m.kind.moveTicks };
      case MOTOR_FN.LEFT:
      case MOTOR_FN.RIGHT: return { ticks: this.m.kind.turnTicks };
      default: return { error: ERR.FUNCTION };
    }
  }

  protected complete(): Outcome {
    const m = this.m;
    switch (this.fn << 1) {
      case MOTOR_FN.LEFT: m.heading = (m.heading + 3) & 3; return done;
      case MOTOR_FN.RIGHT: m.heading = (m.heading + 1) & 3; return done;
    }
    const dir = this.fn << 1 === MOTOR_FN.BACK ? (m.heading + 2) & 3 : m.heading;
    const g = m.world.grid;
    const x = m.x + DX[dir], y = m.y + DY[dir];
    if (!g.inBounds(x, y)) return { error: ERR.BLOCKED };
    const occ = g.typeAt('occupant', x, y);
    if (occ === TYPE.ROBOT) m.world.damage(x, y, m.kind.contact);
    if (occ) return { error: ERR.BLOCKED };
    g.set('occupant', x, y, g.get('occupant', m.x, m.y));
    g.clear('occupant', m.x, m.y);
    m.x = x;
    m.y = y;
    return done;
  }
}

/**
 * Laser, for the kinds that have one: fires along the heading when it completes, as the
 * robot's does, then stays busy reloading before READY comes back. No energy.
 */
export class MonsterLaser extends CsrDevice {
  readonly base = MONSTER_REG.LSRCSR;
  readonly size = 6;
  readonly vector = VECTOR.LASER;
  /** Distance of the last hit, 0 = nothing hit. */
  distance = 0;
  private reloading = false;

  constructor(private readonly m: Monster, private readonly spec: NonNullable<MonsterKind['laser']>) { super(); }

  protected start(fn: number): Outcome {
    if (fn << 1 !== FN.LASER_FIRE) return { error: ERR.FUNCTION };
    this.reloading = false;
    return { ticks: this.spec.ticks };
  }

  protected complete(): Outcome {
    if (this.reloading) return done;
    const m = this.m;
    this.distance = beam(m.world, m.x, m.y, m.heading, this.spec.range, this.spec.damage);
    this.reloading = true;
    return this.spec.reload > 0 ? { ticks: this.spec.reload } : done;
  }

  protected readReg(offset: number): number { return offset === 4 ? this.distance : BUS_ERROR; }
  protected writeReg(offset: number): boolean { return offset === 4; }
  reset(): void { super.reset(); this.distance = 0; this.reloading = false; }
}

/** Sensor (read-only): the monster itself, the robot if in sight, what is ahead, random numbers. */
export class Sensor implements Device {
  readonly base = MONSTER_REG.MYX;
  readonly size = MONSTER_REG.RANDOM + 2 - MONSTER_REG.MYX;

  constructor(private readonly m: Monster) {}

  read(offset: number): number {
    const m = this.m;
    const g = m.world.grid;
    switch (offset) {
      case 0: return m.x;
      case 2: return m.y;
      case 4: return m.heading;
      case 6: return g.get('occupant', m.x, m.y).hp;
      case 8: return m.robotInSight() ? 1 : 0;
      case 10: return m.robotInSight() ? (m.world.robot.x - m.x) & 0xffff : 0;
      case 12: return m.robotInSight() ? (m.world.robot.y - m.y) & 0xffff : 0;
      case 14: {
        const x = m.x + DX[m.heading], y = m.y + DY[m.heading];
        return g.inBounds(x, y) ? g.typeAt('occupant', x, y) : TYPE.WALL;
      }
      case 16: return m.rng.next() & 0xffff;
      default: return BUS_ERROR;
    }
  }

  write(): boolean { return true; }
}

// ---------------------------------------------------------------- the monster

export class Monster implements Actor {
  heading: number;
  destroyed = false;
  readonly machine: DeviceMachine;
  readonly motor: Motor;
  readonly laser: MonsterLaser | null;
  /** Cycles already run into the next tick. */
  private phase = 0;

  constructor(
    readonly world: World,
    readonly id: number,
    readonly kind: MonsterKind,
    public x: number,
    public y: number,
    heading: number,
    readonly rng: Rng,
    script: Pick<AssembleResult, 'origin' | 'bytes' | 'start'>,
  ) {
    this.heading = heading & 3;
    this.machine = new DeviceMachine({ memory: MONSTER_MEMORY, eis: false });
    this.motor = new Motor(this);
    this.laser = kind.laser ? new MonsterLaser(this, kind.laser) : null;
    this.machine.add(this.motor).add(new Sensor(this));
    if (this.laser) this.machine.add(this.laser);
    if (script.origin + script.bytes.length > MONSTER_MEMORY) throw new Error(`${kind.name}: script does not fit`);
    this.machine.boot(script);
  }

  /** The robot is within sight range, with nothing opaque in between. */
  robotInSight(): boolean {
    const r = this.world.robot;
    if (r.destroyed) return false;
    const dx = r.x - this.x, dy = r.y - this.y;
    return dx * dx + dy * dy <= SIGHT_RANGE_SQ && lineOfSight(this.world.grid, this.x, this.y, dx, dy);
  }

  tick(): void {
    while (this.phase < TICK_CYCLES) {
      const r = this.machine.run(TICK_CYCLES - this.phase);
      this.phase += r.cycles;
      // Asleep, halted or crashed: idle to the end of the tick.
      if (r.reason !== 'budget') { this.phase = TICK_CYCLES; break; }
    }
    this.phase -= TICK_CYCLES;
    this.motor.endTick();
    this.laser?.endTick();
  }
}

/**
 * Put a monster on the map at (x, y), which must be inside and free. It gets the next
 * actor ID and its own random numbers, seeded from the world's.
 */
export function addMonster(world: World, k: MonsterKind, x: number, y: number,
  heading: number = HEADING.N, script: Pick<AssembleResult, 'origin' | 'bytes' | 'start'> = monsterScript(k)): Monster {
  const g = world.grid;
  if (!g.inBounds(x, y) || g.typeAt('occupant', x, y)) throw new Error(`monster: ${x},${y} is not free`);
  g.set('occupant', x, y, k.record);
  const m = new Monster(world, world.nextActorId(), k, x, y, heading, new Rng(world.rng.next()), script);
  world.addActor(m);
  return m;
}

/** The kind with this TYPE, or undefined. */
export function monsterKind(type: number): MonsterKind | undefined {
  return Object.values(MONSTERS).find((k) => k.type === type);
}
