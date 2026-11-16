/**
 * The debugger's views, without the DOM: disassembly around the PC with symbolic names
 * (device registers, labels, BIOS calls),
 * memory rows, the execution heat map per source line, and address parsing.
 */

import { disassemble } from '../blue11';
import { bios, BIOS_CALL, REG, SYMBOLS } from '../core';

type Read = (addr: number) => number;

/**
 * A name for an address: a device register (WHLCSR, PSW…), a program label, or a BIOS
 * label. Plain `=` symbols (call numbers, bits) are not addresses and are left out.
 */
export function addressNamer(symbols: ReadonlyMap<string, number> = new Map(), labels: ReadonlySet<string> = new Set()): (addr: number) => string | undefined {
  const names = new Map<number, string>();
  const b = bios();
  for (const l of b.labels) if (/^[A-Z]/.test(l)) names.set(b.symbols.get(l)!, l);
  for (const l of labels) {
    const v = symbols.get(l);
    if (v !== undefined && /^[A-Z]/.test(l)) names.set(v, l);
  }
  for (const [k, v] of Object.entries(REG)) names.set(v, k);
  names.set(SYMBOLS.PSW, 'PSW');
  return (addr) => names.get(addr & 0xffff);
}

/** BIOS call names by number, for `EMT MOVE` instead of `EMT`. */
const CALL_NAMES = new Map<number, string>(Object.entries(BIOS_CALL).map(([k, v]) => [v, k]));

export interface DisasmRow {
  address: number;
  words: number[];
  text: string;
  /** A label at this address, if any. */
  label?: string;
}

/**
 * About `count` instructions around `pc`, `before` of them ahead of it. `starts` are
 * addresses known to begin instructions (an assembly's `lineAt` keys), so the rows before
 * the PC line up; without them, the view starts at the PC.
 */
export function disassemblyAround(read: Read, pc: number, starts: number[],
  opts: { before?: number; count?: number; nameOf?: (a: number) => string | undefined } = {}): DisasmRow[] {
  const { before = 4, count = 16, nameOf } = opts;
  const sorted = [...starts].sort((a, b) => a - b);
  let from = pc;
  const i = sorted.indexOf(pc);
  if (i >= 0) from = sorted[Math.max(0, i - before)];
  const rows: DisasmRow[] = [];
  let a = from & 0xfffe;
  while (rows.length < count) {
    const d = disassemble(read, a, { nameOf });
    const call = (d.words[0] & 0o177400) === 0o104000 ? CALL_NAMES.get(d.words[0] & 0o377) : undefined;
    rows.push({ address: a, words: d.words, text: call ? `EMT ${call}` : d.text, label: nameOf?.(a) });
    a = (a + 2 * d.words.length) & 0xffff;
    if (a === 0) break;
  }
  return rows;
}

/** `rows` rows of `perRow` words from `start` (made even, rounded down to a row). */
export function memoryRows(read: Read, start: number, rows = 8, perRow = 4): Array<{ address: number; words: number[] }> {
  const out = [];
  let a = start & ~(2 * perRow - 1) & 0xffff;
  for (let r = 0; r < rows; r++) {
    const words = [];
    for (let i = 0; i < perRow; i++) words.push(read((a + 2 * i) & 0xffff) & 0xffff);
    out.push({ address: a, words });
    a = (a + 2 * perRow) & 0xffff;
  }
  return out;
}

const REGISTER_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'SP', 'PC'];

/**
 * An address typed by the player: octal, a label or symbol of the program, a predefined
 * name (WHLCSR), or a register (its value). Null if it is none of these.
 */
export function parseAddress(text: string, symbols: ReadonlyMap<string, number>, regs?: ArrayLike<number>): number | null {
  const t = text.trim().toUpperCase();
  if (/^[0-7]+$/.test(t)) {
    const v = parseInt(t, 8);
    return v <= 0xffff ? v : null;
  }
  const r = REGISTER_NAMES.indexOf(t === 'R6' ? 'SP' : t === 'R7' ? 'PC' : t);
  if (r >= 0 && regs) return regs[r] & 0xffff;
  const v = symbols.get(t) ?? (SYMBOLS as Record<string, number>)[t] ?? bios().symbols.get(t);
  return v === undefined ? null : v & 0xffff;
}

/** Executions per source line: the counts of its instructions' first words (lines with 0 left out). */
export function lineHeat(heat: Uint32Array, lineAt: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [addr, line] of lineAt) {
    const n = heat[addr >> 1];
    if (n) out.set(line, (out.get(line) ?? 0) + n);
  }
  return out;
}
