/**
 * One sentence per predefined symbol (`SYMBOLS`, src/core/symbols.ts). The sections show
 * them where they belong (the wheels' registers with the wheels); every symbol must be
 * described and shown exactly once: tests/ui/help.test.ts.
 */

import { octal } from '../../blue11';
import { SYMBOLS } from '../../core';
import type { Entry } from './model';

export const SYMBOL_HELP: Readonly<Record<string, string>> = {
  // Wheels
  WHLCSR: 'Wheels control and status: GO, function (`WH.FWD` …), IE, READY, ERROR.',
  WHLERR: 'Wheels error code (`ER.BLK`, `ER.PWR`, `ER.ARG`).',
  WHLCNT: 'Cells to drive; counts down as the robot moves, and keeps the cells left after a block.',
  'WH.FWD': 'Wheels function: drive `WHLCNT` cells forward.',
  'WH.LFT': 'Wheels function: turn left (90°).',
  'WH.RGT': 'Wheels function: turn right (90°).',
  'WH.BAK': 'Wheels function: drive `WHLCNT` cells back, without turning.',
  WHLVEC: 'Wheels interrupt vector.',
  // Laser
  LSRCSR: 'Laser control and status.',
  LSRERR: 'Laser error code (`ER.PWR`, `ER.ARG`).',
  LSRDST: 'After a shot: the distance to what was hit, 0 if nothing.',
  LSRTGT: 'Target of an aimed shot: `DX | DY<<8`, as in a scanner record.',
  'LS.FIR': 'Laser function: fire straight ahead.',
  'LS.AIM': 'Laser function: fire at the cell in `LSRTGT`.',
  LSRVEC: 'Laser interrupt vector.',
  // Scanner
  SCNCSR: 'Scanner control and status.',
  SCNERR: 'Scanner error code (`ER.ADR`, `ER.PWR`).',
  SCNBUF: 'Address of the buffer in RAM that the scan fills.',
  SCNLEN: 'Length of the buffer, in bytes.',
  'SC.ALL': 'Scanner function: report everything in sight.',
  'SC.NWL': 'Scanner function: everything except walls.',
  SCNVEC: 'Scanner interrupt vector.',
  // Grabber
  GRBCSR: 'Grabber control and status.',
  GRBERR: 'Grabber error code (`ER.NON`, `ER.FUL`, `ER.ARG`, `ER.BLK`).',
  GRBSLT: 'Inventory slot: where a grab put the item, which slot a drop takes.',
  'GR.GRB': 'Grabber function: take what is in front.',
  'GR.DRP': 'Grabber function: drop slot `GRBSLT` in front.',
  GRBVEC: 'Grabber interrupt vector.',
  // Status and inventory
  STHP: 'The robot\'s hit points (read only).',
  STNRG: 'The robot\'s energy (read only).',
  STX: 'The robot\'s X: the column, 0 on the left (read only).',
  STY: 'The robot\'s Y: the row, 0 at the top (read only).',
  STHDG: 'The robot\'s heading: `H.N`, `H.E`, `H.S` or `H.W` (read only).',
  STCOIN: 'Coins collected (read only).',
  INV: 'The inventory: 4 slots of one 4-byte object record each, to 176477 (read only).',
  // CSR bits
  'CS.GO': 'CSR bit 0: write 1 to start the function.',
  'CS.FN': 'CSR bits 3–1: the function (a mask).',
  'CS.IE': 'CSR bit 6: interrupt when the device becomes READY.',
  'CS.RDY': 'CSR bit 7: the device is idle (read only). `TSTB` puts it in N.',
  'CS.ERR': 'CSR bit 15: the last function failed; the code is in the error register (read only). `TST` puts it in N.',
  // Error codes
  'ER.PWR': 'Not enough energy for the action.',
  'ER.FN': 'No such function, or no such BIOS call.',
  'ER.BLK': 'The way is blocked (wheels), or there is no room to drop (grabber).',
  'ER.ADR': 'The scanner buffer is odd, shorter than 2 bytes, or not all in RAM.',
  'ER.NON': 'Nothing to take.',
  'ER.FUL': 'The inventory is full.',
  'ER.ARG': 'A bad argument: wheel count 0, a drop slot out of range or empty, a laser target outside the arc or range.',
  // BIOS calls
  MOVE: 'Drive R0 cells forward.',
  BACK: 'Drive R0 cells back, without turning.',
  LEFT: 'Turn left.',
  RIGHT: 'Turn right.',
  FIRE: 'Fire the laser straight ahead. R0 = the distance to the hit, 0 if nothing.',
  SCAN: 'Scan into the buffer at R0, R1 bytes long (`SC.ALL`). R0 = the buffer.',
  GRAB: 'Take what is in front. R0 = the inventory slot, or −1 for coins.',
  DROP: 'Drop inventory slot R0 in front.',
  PRINT: 'Print the `.ASCIZ` text at R0 on the console.',
  AIM: 'Fire at the cell R0 = `DX | DY<<8`. R0 = steps to the hit, 0 if nothing.',
  // Console, clock, PSW
  LKS: 'Line clock status: bit 7 is set every tick, bit 6 (IE) interrupts every tick.',
  LKSVEC: 'Line clock interrupt vector.',
  RCSR: 'Console keyboard status (no keyboard input yet).',
  RBUF: 'Console keyboard data.',
  XCSR: 'Console printer status: bit 7 = ready for the next character.',
  XBUF: 'Console printer data: write a character here to print it.',
  RCVVEC: 'Console keyboard interrupt vector.',
  XMTVEC: 'Console printer interrupt vector.',
  PSW: 'The processor status word, in memory: priority (bits 7–5) and the flags N Z V C (bits 3–0).',
  // Headings
  'H.N': 'Heading north (up).',
  'H.E': 'Heading east (right).',
  'H.S': 'Heading south (down).',
  'H.W': 'Heading west (left).',
  // Object types
  'T.WALL': 'A wall. Walls can be shot down (HP 377).',
  'T.ROBO': 'A robot.',
  'T.EXIT': 'The exit: drive onto it to win.',
  'T.CHRG': 'A charger.',
  'T.COIN': 'A pile of coins: LOOT holds how many.',
  'T.CHIP': 'A math chip.',
  'T.PTRL': 'A patrol monster.',
  'T.CHSR': 'A chaser monster.',
  'T.SNTR': 'A sentry monster.',
  // Flags
  'F.MOB': 'FLAGS bit: it moves.',
  'F.HOST': 'FLAGS bit: hostile.',
  'F.SOLD': 'FLAGS bit: solid, blocks movement and takes laser hits.',
  'F.OPAQ': 'FLAGS bit: opaque, blocks sight and the laser.',
  'F.COLL': 'FLAGS bit: collectible with the grabber.',
  'F.INTR': 'FLAGS bit: interactive.',
};

const VALUES = SYMBOLS as Readonly<Record<string, number>>;

/** Entries for these symbols, with their octal values. */
export function symbolEntries(...names: string[]): Entry[] {
  return names.map((n) => {
    const v = VALUES[n];
    if (v === undefined) throw new Error(`help: no symbol ${n}`);
    return { anchor: `sym-${n}`, names: [n], term: `\`${n}\``, detail: `= ${octal(v, v > 0o777 ? 6 : 1)}`, text: SYMBOL_HELP[n] ?? '' };
  });
}
