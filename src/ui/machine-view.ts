/**
 * The machine view, shown in place of the map (the Map / Machine tabs): the last Step told
 * as fetch → execute, the assembler's listing (the program as words in memory, the PC's row
 * lit), the memory map with the PC and SP in it, and the stack. Contents from machine.ts.
 */

import { octal } from '../blue11';
import { inRom } from '../core';
import { addressNamer } from './debug';
import { explainStep, extentOf, listingRows, memoryMap, stackRows } from './machine';
import type { Session } from './session';

export interface MachineElements {
  step: HTMLElement;
  listing: HTMLElement;
  /** A line over the listing: where the PC is when it is not in the program. */
  listingNote: HTMLElement;
  map: HTMLElement;
  stack: HTMLElement;
}

const NO_STEP = 'Press Step to run one instruction and see what the CPU does with it: '
  + 'fetch its words from memory (PC moves on), read and write its operands, then set the registers and flags.';

function div(className: string, text: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  e.textContent = text;
  return e;
}

export class MachineView {
  /** The program the listing was built for, so it is rebuilt only on a new load. */
  private listed: unknown = null;
  /** The listing's rows; a row's words are at `address` up to `end`. */
  private rows: Array<{ el: HTMLElement; address: number | null; end: number; line: number }> = [];

  constructor(private readonly els: MachineElements) {}

  show(session: Session, running: boolean): void {
    const prog = session.program;
    const cpu = session.world.robot.cpu;
    const read = (a: number) => session.world.robot.machine.read(a, false);
    const nameOf = addressNamer(prog?.symbols, prog?.labels);
    const extent = extentOf(prog);
    const pc = cpu.r[7];
    const sp = cpu.r[6];

    // The last step
    const t = !running ? session.lastStep : null;
    const touched = new Map<number, 'fetch' | 'read' | 'write'>();
    if (t) {
      const e = explainStep(t, read, nameOf, extent);
      this.els.step.replaceChildren(div('step-title', e.title), ...e.lines.map((l) => div(`step-line ${l.kind}`, l.text)));
      for (const l of e.lines) {
        if (l.addr !== undefined && (l.kind === 'fetch' || l.kind === 'read' || l.kind === 'write')) {
          if (touched.get(l.addr & ~1) !== 'write') touched.set(l.addr & ~1, l.kind);
        }
      }
    } else {
      this.els.step.replaceChildren(div('step-none', running ? 'Running… Pause, then Step.' : NO_STEP));
    }

    // The listing: built once per load, then only its highlights change
    if (this.listed !== prog) {
      this.listed = prog;
      const rows = prog ? listingRows(prog) : [];
      this.rows = rows.map((r, i) => {
        const el = div('lrow' + (r.code ? '' : r.address === null ? ' blank' : ' data'), '');
        el.append(div('lw', r.words), div('ls', r.source || ' '));
        const next = rows.slice(i + 1).find((n) => n.address !== null && n.address > r.address!);
        return { el, address: r.address, end: next?.address ?? (r.address ?? 0) + 6, line: r.line };
      });
      this.els.listing.style.setProperty('--words', `${Math.max(0, ...rows.map((r) => r.words.length))}ch`);
      this.els.listing.replaceChildren(...(this.rows.length ? this.rows.map((r) => r.el)
        : [div('step-none', 'Run or Step to assemble the program and load it into memory.')]));
    }
    const pcLine = prog?.lineAt.get(pc);
    let pcRow: HTMLElement | null = null;
    for (const r of this.rows) {
      const isPc = !running && pcLine !== undefined && r.line === pcLine && r.address !== null;
      r.el.classList.toggle('pc', isPc);
      if (isPc && !pcRow) pcRow = r.el;
      // the program's own words the step read or wrote as data (its variables)
      const kinds = new Set<string>();
      if (r.address !== null) for (const [a, k] of touched) if (k !== 'fetch' && a >= r.address && a < r.end) kinds.add(k);
      r.el.classList.toggle('read', kinds.has('read'));
      r.el.classList.toggle('write', kinds.has('write'));
    }
    const inProgram = extent !== null && pc >= extent.origin && pc < extent.end;
    this.els.listingNote.textContent = running || !prog || inProgram ? ''
      : inRom(pc) ? `PC ${octal(pc)} is in the BIOS (ROM), running an EMT call for your program. The BIOS button shows its source.`
      : `PC ${octal(pc)} is outside your program.`;
    if (pcRow) {
      const box = this.els.listing;
      const top = pcRow.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - pcRow.offsetHeight) {
        box.scrollTop = top - box.clientHeight / 3;
      }
    }

    // The memory map, high addresses first
    this.els.map.replaceChildren(...memoryMap(extent, sp, pc).map((r) => {
      const e = document.createElement('div');
      e.className = `region ${r.kind}`;
      const marks = [r.pc ? `◀ PC ${octal(pc)}` : '', r.sp ? `◀ SP ${octal(sp)}` : ''].filter(Boolean).join('\n');
      e.append(div('range', `${octal(r.to)}\n${octal(r.from)}`), div('name', r.name), div('marks', marks));
      const bytes = r.to - r.from + 1;
      e.title = `${octal(r.from)}–${octal(r.to)}: ${octal(bytes)} bytes (${bytes}. decimal)`;
      return e;
    }));

    // The stack, from SP (its top) to where it started (the program's origin)
    const base = extent?.origin ?? 0;
    const rows = stackRows(read, sp, base);
    const written = new Set([...touched].filter(([, k]) => k === 'write').map(([a]) => a));
    this.els.stack.replaceChildren(...(rows.length ? rows.map((r) => div('srow' + (written.has(r.address) ? ' write' : ''),
      `${r.top ? 'SP →' : '    '} ${octal(r.address)}  ${octal(r.value)}${nameOf(r.value) ? `  ${nameOf(r.value)}` : ''}`))
      : [div('step-none', extent ? `Empty: SP = ${octal(sp)}, the stack starts at ${octal(base)} and grows down.` : '—')]));
  }
}
