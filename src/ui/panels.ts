/**
 * The text of the robot and CPU panels beside the map. No DOM, so it is tested.
 * Numbers are octal, except HP and energy (decimal, with the dot).
 */

import { octal, REGISTER_NAMES, type Cpu } from '../blue11';
import type { World } from '../core';

const HEADINGS = ['N', 'E', 'S', 'W'];

/** The robot panel: HP, energy, coins, position, heading, tick. */
export function robotText(w: World): string {
  const r = w.robot;
  return [
    `HP     ${r.hp.toString().padStart(6)}.`,
    `Energy ${r.energy.toString().padStart(6)}.${r.dock.charging ? ' charging' : ''}`,
    `Coins  ${octal(r.coins)}`,
    `X Y    ${octal(r.x, 3)} ${octal(r.y, 3)}`,
    `Facing ${HEADINGS[r.heading]}`,
    `Tick   ${octal(w.tick)}`,
  ].join('\n');
}

/** The CPU panel: the registers, the PSW with its flags, and HALTED or WAIT. */
export function registerText(cpu: Cpu): string {
  const flags = ['N', 'Z', 'V', 'C'].map((f, i) => (cpu.psw & (8 >> i) ? f : '-')).join('');
  return REGISTER_NAMES.map((n, i) => `${n.padEnd(3)} ${octal(cpu.r[i])}`).join('\n')
    + `\nPSW ${octal(cpu.psw)} ${flags}` + (cpu.halted ? '\nHALTED' : cpu.waiting ? '\nWAIT' : '');
}
