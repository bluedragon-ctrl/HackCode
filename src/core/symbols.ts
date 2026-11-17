/**
 * The predefined symbols ("prelude") for `assemble(source, { symbols: SYMBOLS })`: device
 * registers, vectors, CSR bits, function and error codes, object types and flags. Names
 * are at most 6 characters (the assembler's `names: 'dec'`). DESIGN.md §5 lists them.
 */

import { BIOS_CALL, CSR, ERR, FN, HEADING, REG, VECTOR } from './constants';
import { FLAG, TYPE } from './objects';

export const SYMBOLS: Readonly<Record<string, number>> = Object.freeze({
  // Registers: WHLCSR … INV, LKS, RCSR … XBUF
  ...REG,
  PSW: 0o177776,

  // BIOS calls: EMT MOVE, EMT LEFT, …
  ...BIOS_CALL,

  // Vectors
  WHLVEC: VECTOR.WHEELS,
  LSRVEC: VECTOR.LASER,
  SCNVEC: VECTOR.SCANNER,
  GRBVEC: VECTOR.GRABBER,
  DCKVEC: VECTOR.DOCK,
  LKSVEC: VECTOR.CLOCK,
  RCVVEC: VECTOR.CONSOLE_RX,
  XMTVEC: VECTOR.CONSOLE_TX,

  // CSR bits
  'CS.GO': CSR.GO,
  'CS.FN': CSR.FN,
  'CS.IE': CSR.IE,
  'CS.RDY': CSR.READY,
  'CS.ERR': CSR.ERROR,

  // Functions (bits 3–1, already shifted)
  'WH.FWD': FN.WHEELS_FORWARD,
  'WH.LFT': FN.WHEELS_LEFT,
  'WH.RGT': FN.WHEELS_RIGHT,
  'WH.BAK': FN.WHEELS_BACK,
  'LS.FIR': FN.LASER_FIRE,
  'LS.AIM': FN.LASER_AIM,
  'SC.ALL': FN.SCAN_ALL,
  'SC.NWL': FN.SCAN_NO_WALLS,
  'GR.GRB': FN.GRAB,
  'GR.DRP': FN.DROP,
  'DK.CHG': FN.CHARGE,

  // Error codes
  'ER.PWR': ERR.POWER,
  'ER.FN': ERR.FUNCTION,
  'ER.BLK': ERR.BLOCKED,
  'ER.ADR': ERR.ADDRESS,
  'ER.NON': ERR.NOTHING,
  'ER.FUL': ERR.FULL,
  'ER.ARG': ERR.ARGUMENT,

  // Headings
  'H.N': HEADING.N,
  'H.E': HEADING.E,
  'H.S': HEADING.S,
  'H.W': HEADING.W,

  // Object types and flags
  'T.WALL': TYPE.WALL,
  'T.ROBO': TYPE.ROBOT,
  'T.EXIT': TYPE.EXIT,
  'T.CHRG': TYPE.CHARGER,
  'T.COIN': TYPE.COIN,
  'T.CHIP': TYPE.CHIP,
  'T.PTRL': TYPE.PATROL,
  'T.CHSR': TYPE.CHASER,
  'T.SNTR': TYPE.SENTRY,
  'F.MOB': FLAG.MOBILE,
  'F.HOST': FLAG.HOSTILE,
  'F.SOLD': FLAG.SOLID,
  'F.OPAQ': FLAG.OPAQUE,
  'F.COLL': FLAG.COLLECTIBLE,
  'F.INTR': FLAG.INTERACTIVE,
});
