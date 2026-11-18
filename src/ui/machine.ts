/**
 * The machine view's contents, without the DOM (DESIGN.md §3 "Machine view"): what the last
 * Step did on the bus and in the registers, told as fetch → execute; the robot's memory map
 * with the PC and SP in it; the stack; and the assembler's listing rows with their addresses.
 * A teaching view: it shows how the program the player wrote is words in memory that the
 * CPU fetches and runs one at a time.
 */

import { octal, REGISTER_NAMES, VEC, type AssembleResult } from 'blue11';
import { inRom, MEMORY, VECTOR } from '../core';
import { disassemblyAround } from './debug';
import type { Access, StepTrace } from './session';

type Read = (addr: number) => number;
type NameOf = (addr: number) => string | undefined;

/** The names of the trap and interrupt vectors. */
const VECTOR_NAMES = new Map<number, string>([
  [VEC.BUS_ERROR, 'bus error'], [VEC.ILLEGAL, 'illegal instruction'], [VEC.BPT, 'BPT / trace'],
  [VEC.IOT, 'IOT'], [VEC.EMT, 'EMT (the BIOS)'], [VEC.TRAP, 'TRAP'],
  [VECTOR.CONSOLE_RX, 'console in'], [VECTOR.CONSOLE_TX, 'console out'], [VECTOR.CLOCK, 'line clock'],
  [VECTOR.WHEELS, 'wheels'], [VECTOR.LASER, 'laser'], [VECTOR.SCANNER, 'scanner'],
  [VECTOR.GRABBER, 'grabber'], [VECTOR.DOCK, 'dock'],
]);

/** Where the program sits in RAM: its first address and the address after its last byte. */
export interface Extent { origin: number; end: number }

export function extentOf(prog: Pick<AssembleResult, 'origin' | 'bytes'> | null): Extent | null {
  return prog && prog.bytes.length ? { origin: prog.origin, end: prog.origin + prog.bytes.length } : null;
}

/** A word about an address: its name (WHLCSR, a label), else the part of memory it is in. */
export function where(addr: number, nameOf: NameOf, prog: Extent | null, sp: number): string {
  const name = nameOf(addr);
  if (name) return name;
  if (addr < 0o400) {
    const v = VECTOR_NAMES.get(addr & ~3);
    return v ? `vector ${octal(addr & ~3, 3)} ${v}` : 'vectors';
  }
  if (prog && addr >= prog.origin && addr < prog.end) return 'program';
  if (prog && addr >= sp && addr < prog.origin) return 'stack';
  if (addr < MEMORY.RAM_END) return 'RAM';
  if (inRom(addr)) return 'BIOS ROM';
  return 'device';
}

export type StepLineKind = 'fetch' | 'read' | 'write' | 'reg' | 'flags' | 'note';

export interface StepLine {
  kind: StepLineKind;
  text: string;
  /** The bus address, for the lines of a bus access. */
  addr?: number;
}

export interface StepExplanation {
  /** `001000  MOV #5, R0`, or what happened instead of an instruction. */
  title: string;
  lines: StepLine[];
}

function flags(psw: number): string {
  return ['N', 'Z', 'V', 'C'].map((f, i) => (psw & (8 >> i) ? f : '-')).join('');
}

/**
 * The last Step, told in the order the CPU did it: the fetch of the instruction's words,
 * the reads and writes it made, then the registers and flags that changed. A trap or an
 * interrupt (two pushes, then the vector's two words) gets a note saying so.
 */
export function explainStep(t: StepTrace, read: Read, nameOf: NameOf, prog: Extent | null): StepExplanation {
  const lines: StepLine[] = [];
  const sp = Math.min(t.before.r[6], t.after.r[6]);
  const at = (a: Access) => `${octal(a.addr)} ${where(a.addr, nameOf, prog, sp)}`.padEnd(16);
  const value = (a: Access) => (a.byte ? `${octal(a.value, 3)} (byte)` : octal(a.value));

  let title: string;
  let fetchEnd = t.pc;
  if (t.instructions) {
    const [d] = disassemblyAround(read, t.pc, [], { count: 1, nameOf });
    title = `${octal(t.pc)}  ${d.text}`;
    fetchEnd = t.pc + 2 * d.words.length;
  } else {
    title = 'Interrupt taken (no instruction ran)';
  }

  let fetched = 0;
  t.accesses.forEach((a, i) => {
    const fetch = !a.write && !a.byte && a.addr >= t.pc && a.addr < fetchEnd && fetched === (a.addr - t.pc) >> 1;
    if (fetch) {
      fetched++;
      lines.push({ kind: 'fetch', addr: a.addr, text: `Fetch  ${at(a)} → ${octal(a.value)}  `
        + (a.addr === t.pc ? 'the instruction word; PC moves on by 2' : 'an extra word of the instruction; PC moves on by 2') });
      return;
    }
    // A trap or interrupt: push PSW, push PC, read the new PC and PSW from the vector.
    const next = t.accesses[i + 1];
    if (!a.write && a.addr < 0o400 && !(a.addr & 3) && next && !next.write && next.addr === a.addr + 2
      && i >= 2 && t.accesses[i - 1].write && t.accesses[i - 2].write) {
      const v = VECTOR_NAMES.get(a.addr);
      lines.push({ kind: 'note', text: `Trap through vector ${octal(a.addr, 3)}${v ? ` (${v})` : ''}: `
        + 'the old PSW and PC were pushed on the stack; the new PC and PSW come from the vector' });
    }
    lines.push({ kind: a.write ? 'write' : 'read', addr: a.addr,
      text: a.write ? `Write  ${at(a)} ← ${value(a)}` : `Read   ${at(a)} → ${value(a)}` });
  });
  if (t.truncated) lines.push({ kind: 'note', text: '… more bus accesses (the step ran on to the end of the tick)' });

  for (let i = 0; i < 7; i++) {
    const [b, a] = [t.before.r[i], t.after.r[i]];
    if (a !== b) lines.push({ kind: 'reg', text: `${REGISTER_NAMES[i].padEnd(3)}    ${octal(b)} → ${octal(a)}` });
  }
  const pc = t.after.r[7];
  const trapped = lines.some((l) => l.kind === 'note' && l.text.startsWith('Trap'));
  const how = trapped || !t.instructions ? 'the handler, from the vector'
    : pc === fetchEnd ? 'the next instruction' : 'a jump: not the next instruction';
  lines.push({ kind: 'reg', text: `PC     ${octal(t.pc)} → ${octal(pc)}  ${how}` });
  if (t.after.psw !== t.before.psw) {
    const f = flags(t.before.psw) !== flags(t.after.psw) ? `  flags ${flags(t.before.psw)} → ${flags(t.after.psw)}` : '';
    lines.push({ kind: 'flags', text: `PSW    ${octal(t.before.psw)} → ${octal(t.after.psw)}${f}` });
  }
  return { title, lines };
}

export type RegionKind = 'io' | 'rom' | 'free' | 'program' | 'stack' | 'vectors';

export interface Region {
  from: number;
  /** The last address in it. */
  to: number;
  kind: RegionKind;
  name: string;
  /** The PC / SP point into it. */
  pc: boolean;
  sp: boolean;
}

/**
 * The robot's memory, highest address first (so the stack grows down the page): the I/O
 * page, the BIOS ROM, free RAM, the program, the stack below it, free RAM, the vectors.
 * Empty regions are left out.
 */
export function memoryMap(prog: Extent | null, sp: number, pc: number): Region[] {
  const parts: Array<[number, number, RegionKind, string]> = [[0o160000, 0o177777, 'io', 'I/O page: devices']];
  parts.push([MEMORY.ROM_BASE, MEMORY.ROM_BASE + MEMORY.ROM_SIZE - 1, 'rom', 'ROM: BIOS']);
  const top = MEMORY.RAM_END - 1;
  if (prog) {
    const stackLow = sp >= 0o400 && sp <= prog.origin ? sp : prog.origin;
    parts.push([prog.end, top, 'free', 'free RAM']);
    parts.push([prog.origin, prog.end - 1, 'program', 'Your program']);
    parts.push([stackLow, prog.origin - 1, 'stack', 'Stack ↓']);
    parts.push([0o400, stackLow - 1, 'free', 'free RAM']);
  } else {
    parts.push([0o400, top, 'free', 'RAM']);
  }
  parts.push([0, 0o377, 'vectors', 'Vectors']);
  return parts.filter(([from, to]) => to >= from).map(([from, to, kind, name]) => ({
    from, to, kind, name,
    pc: pc >= from && pc <= to,
    sp: sp >= from && sp <= to,
  }));
}

export interface StackRow { address: number; value: number; top: boolean }

/** The words on the stack, from SP (the top) up to where it started; at most `max` of them. */
export function stackRows(read: Read, sp: number, base: number, max = 12): StackRow[] {
  const rows: StackRow[] = [];
  if (sp & 1 || sp >= MEMORY.RAM_END) return rows;
  for (let a = sp; a < base && rows.length < max; a += 2) rows.push({ address: a, value: read(a) & 0xffff, top: a === sp });
  return rows;
}

export interface ListingRow {
  /** The address the row's words are at, or null for a row with none (a comment, `.EVEN`). */
  address: number | null;
  line: number;
  text: string;
  /** The address and words columns (blank for a row with none). */
  words: string;
  /** The source, its indent shortened (a label stays at the left). */
  source: string;
  /** The row's line is an instruction (not data). */
  code: boolean;
}

/** The assembler's listing, with each row's address read back from its first column. */
export function listingRows(prog: Pick<AssembleResult, 'listingRows' | 'lineAt'>): ListingRow[] {
  const codeLines = new Set(prog.lineAt.values());
  return prog.listingRows.map((r) => {
    const m = /^([0-7]{6}) /.exec(r.text);
    // The assembler's listing: 30 columns of address and words, then the source.
    const words = r.text.slice(0, 30).trimEnd();
    const source = r.text.slice(30).replace(/^[ \t]+/, '  ');
    return { address: m ? parseInt(m[1], 8) : null, line: r.line, text: r.text, words, source, code: codeLines.has(r.line) };
  });
}
