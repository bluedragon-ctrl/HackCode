/**
 * Object records: the public 4-byte view of everything in the world (DESIGN.md §2).
 *
 *   byte 0 TYPE   byte 1 HP   byte 2 FLAGS   byte 3 LOOT (bits 7–4 type, 3–0 amount)
 *
 * In memory (scanner buffer, inventory): word0 = TYPE | HP<<8, word1 = FLAGS | LOOT<<8.
 */

export interface ObjectRecord {
  type: number;
  hp: number;
  flags: number;
  loot: number;
}

/** Object TYPE numbers. 0 = nothing; 040–077 are reserved for monsters. */
export const TYPE = {
  NONE: 0,
  WALL: 0o1,
  ROBOT: 0o2,
  EXIT: 0o3,
  CHARGER: 0o4,
  COIN: 0o10,
  CHIP: 0o11,
  /** Monsters (src/core/monster.ts). */
  PATROL: 0o40,
  CHASER: 0o41,
  SENTRY: 0o42,
} as const;

/** FLAGS bits. */
export const FLAG = {
  MOBILE: 0o1,
  HOSTILE: 0o2,
  SOLID: 0o4,
  OPAQUE: 0o10,
  COLLECTIBLE: 0o20,
  INTERACTIVE: 0o40,
} as const;

/** LOOT types (bits 7–4 of LOOT): what an object leaves on the floor when destroyed. */
export const LOOT = {
  NONE: 0,
  /** A coin pile worth the amount (bits 3–0). */
  COINS: 1,
  /** A math chip (amount ignored). */
  CHIP: 2,
} as const;

export const NOTHING: Readonly<ObjectRecord> = Object.freeze({ type: 0, hp: 0, flags: 0, loot: 0 });

export function record(type: number, hp = 0, flags = 0, loot = 0): ObjectRecord {
  return { type: type & 0xff, hp: hp & 0xff, flags: flags & 0xff, loot: loot & 0xff };
}

export const loot = (kind: number, amount: number): number => ((kind & 0xf) << 4) | (amount & 0xf);
export const lootKind = (l: number): number => (l >> 4) & 0xf;
export const lootAmount = (l: number): number => l & 0xf;

/** The two words of a record, as the robot sees them in memory. */
export function recordWords(r: ObjectRecord): [number, number] {
  return [r.type | (r.hp << 8), r.flags | (r.loot << 8)];
}

/** Standard objects. */
export const OBJECTS = {
  /** Walls are destructible. */
  wall: (): ObjectRecord => record(TYPE.WALL, 255, FLAG.SOLID | FLAG.OPAQUE),
  coins: (amount: number): ObjectRecord => record(TYPE.COIN, 1, FLAG.COLLECTIBLE, loot(LOOT.COINS, amount)),
  chip: (): ObjectRecord => record(TYPE.CHIP, 1, FLAG.COLLECTIBLE),
  exit: (): ObjectRecord => record(TYPE.EXIT, 0, 0),
};

/** What a destroyed object with this LOOT byte drops, or null. */
export function dropFor(l: number): ObjectRecord | null {
  switch (lootKind(l)) {
    case LOOT.COINS: return lootAmount(l) > 0 ? OBJECTS.coins(lootAmount(l)) : null;
    case LOOT.CHIP: return OBJECTS.chip();
    default: return null;
  }
}
