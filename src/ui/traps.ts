/**
 * What the status line says when the robot's CPU stops on a trap with no handler
 * (src/core/robot.ts stops instead of jumping through an empty vector). No DOM, so it is tested.
 */

import { decodeOp, octal, type TrapInfo } from 'blue11';
import { inRom, type Robot } from '../core';

/** One line for the status bar: what happened and where. */
export function describeTrap(t: TrapInfo, robot: Robot): string {
  const at = `at ${octal(t.pc)}`;
  const a = t.detail ?? 0;
  switch (t.cause) {
    case 'odd-address':
      return `Odd address ${octal(a)} ${at}: a word needs an even address (a missing .EVEN?).`;
    case 'bus-error':
      if (inRom(a)) return `Bus error ${at}: the ROM at ${octal(a)} is read-only.`;
      return `Bus error ${at}: nothing answers at ${octal(a)}.`;
    case 'stack-limit':
      return `Stack overflow ${at}: SP went below ${octal(a)}.`;
    case 'illegal': {
      const w = robot.machine.read(t.pc, false);
      const op = w < 0 ? null : decodeOp(w);
      if (op?.eis && !robot.cpu.eis) return `${op.name} ${at} needs the math chip (EIS): it is not installed yet.`;
      if (op?.name === 'JMP' || op?.name === 'JSR') return `${op.name} to a register ${at} is illegal: jump to an address.`;
      return `Illegal instruction ${w < 0 ? '' : octal(w) + ' '}${at}: is the CPU running into data?`;
    }
    case 'bpt':
      return `BPT ${at}. Continue goes on after it.`;
    case 'trace':
      return `Trace trap ${at}, with no handler at 014.`;
    case 'interrupt':
      return `Interrupt through vector ${octal(t.vector, 3)} with no handler ${at}: set the vector before IE.`;
    default:
      // emt, trap, iot
      return `${t.cause.toUpperCase()}${t.detail !== undefined ? ' ' + octal(t.detail, 3) : ''} ${at}, with no handler at ${octal(t.vector, 3)}.`;
  }
}
