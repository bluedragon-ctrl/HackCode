/**
 * The robot machine's fixed numbers: memory map, device registers, vectors, timings and
 * energy costs. DESIGN.md §3–§5 records the same table; change both together.
 */

/** Blue-11 cycles per game tick. The KW11-L line clock ticks once per tick of CPU time. */
export const TICK_CYCLES = 200;

export const MEMORY = {
  /** RAM 000000–137777. */
  RAM_END: 0o140000,
  /** ROM (BIOS) 140000–157777; writes are bus errors. */
  ROM_BASE: 0o140000,
  ROM_SIZE: 0o20000,
} as const;

/** Robot device registers (1764xx). Every action device: CSR at +0, error register at +2. */
export const REG = {
  WHLCSR: 0o176400, WHLERR: 0o176402, WHLCNT: 0o176404,
  LSRCSR: 0o176410, LSRERR: 0o176412, LSRDST: 0o176414, LSRTGT: 0o176416,
  SCNCSR: 0o176420, SCNERR: 0o176422, SCNBUF: 0o176424, SCNLEN: 0o176426,
  GRBCSR: 0o176430, GRBERR: 0o176432, GRBSLT: 0o176434,
  STHP: 0o176440, STNRG: 0o176442, STX: 0o176444, STY: 0o176446, STHDG: 0o176450, STCOIN: 0o176452,
  INV: 0o176460,
  // DEC devices
  LKS: 0o177546,
  RCSR: 0o177560, RBUF: 0o177562, XCSR: 0o177564, XBUF: 0o177566,
} as const;

/**
 * BIOS calls: `EMT n` (DESIGN.md §4 "BIOS"). The source is src/core/bios.ts. The EMT
 * vector (030) is set to the BIOS on every load.
 */
export const BIOS_CALL = {
  MOVE: 0, BACK: 1, LEFT: 2, RIGHT: 3, FIRE: 4, SCAN: 5, GRAB: 6, DROP: 7, PRINT: 0o10, AIM: 0o11,
} as const;

/** Interrupt vectors (bus level {@link DEVICE_LEVEL}). */
export const VECTOR = {
  WHEELS: 0o300,
  LASER: 0o304,
  SCANNER: 0o310,
  GRABBER: 0o314,
  CLOCK: 0o100,
  CONSOLE_RX: 0o060,
  CONSOLE_TX: 0o064,
} as const;

/** Bus request level of the robot devices (BR4). */
export const DEVICE_LEVEL = 4;

/** Common CSR bits. */
export const CSR = {
  GO: 0o1,
  /** Function: bits 3–1. */
  FN: 0o16,
  IE: 0o100,
  READY: 0o200,
  ERROR: 0o100000,
} as const;

/** Function codes, as written to the CSR (already shifted to bits 3–1). */
export const FN = {
  WHEELS_FORWARD: 0o0,
  WHEELS_LEFT: 0o2,
  WHEELS_RIGHT: 0o4,
  WHEELS_BACK: 0o6,
  LASER_FIRE: 0o0,
  LASER_AIM: 0o2,
  SCAN_ALL: 0o0,
  SCAN_NO_WALLS: 0o2,
  GRAB: 0o0,
  DROP: 0o2,
} as const;

/** Error register codes. */
export const ERR = {
  NONE: 0,
  /** Not enough energy for the action. */
  POWER: 1,
  /** No such function. */
  FUNCTION: 2,
  /** Way blocked (wheels), or no room to drop (grabber). */
  BLOCKED: 3,
  /** Scanner buffer not in RAM, odd, or shorter than 2 bytes. */
  ADDRESS: 4,
  /** Nothing to take. */
  NOTHING: 5,
  /** Inventory full. */
  FULL: 6,
  /** Bad argument: wheel count 0, drop slot out of range or empty, laser target out of the arc or range. */
  ARGUMENT: 7,
} as const;

/** Headings: 0 N, 1 E, 2 S, 3 W. */
export const HEADING = { N: 0, E: 1, S: 2, W: 3 } as const;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/** Ticks a device stays busy. */
export const TICKS = {
  /** Per cell. */
  MOVE: 4,
  TURN: 2,
  LASER: 3,
  SCAN: 2,
  GRAB: 2,
} as const;

/** Energy costs, charged when an action (or each cell of a move) starts. */
export const COST = {
  MOVE: 5,
  TURN: 2,
  LASER: 20,
  SCAN: 3,
  GRAB: 2,
} as const;

/** Standard map size, 15×15 cells (DESIGN.md §2): lesson maps and the first expedition depths. */
export const MAP_SIZE = 15;

export const ENERGY_MAX = 10000;
export const ROBOT_HP = 100;

/**
 * CPU drain, in 1/64 energy units: per instruction executed, and per tick whatever the
 * CPU does. A busy loop of ~65 instructions per tick costs about 1 energy a tick; a tick
 * asleep in WAIT 1/64.
 */
export const DRAIN = { PER_INSTRUCTION: 1, PER_TICK: 1, SHIFT: 6 } as const;

/** Laser range: straight fire up to LASER_RANGE cells; aimed fire at dx² + dy² ≤ LASER_RANGE². */
export const LASER_RANGE = 3;
export const LASER_RANGE_SQ = LASER_RANGE * LASER_RANGE;
export const LASER_DAMAGE = 40;
/** Scanner range: cells with dx² + dy² ≤ SCAN_RADIUS². */
export const SCAN_RADIUS = 5;
export const SCAN_RANGE_SQ = SCAN_RADIUS * SCAN_RADIUS;
export const INVENTORY_SLOTS = 4;
