/**
 * The debugger panel beside the map: the disassembly around the PC (a click on a row sets a
 * breakpoint), the memory view, and the breakpoints the session stops at. The views'
 * contents come from debug.ts; this puts them on the page and keeps the editor in step.
 */

import type { EditorView } from '@codemirror/view';
import { octal } from 'blue11';
import { bios, inRom } from '../core';
import { addressNamer, disassemblyAround, lineHeat, memoryRows, parseAddress } from './debug';
import { breakpointLines, setHeat, setPcLine, toggleBreakpointAtCursor } from './editor';
import type { Session } from './session';

/** What the panel reads from the page. */
export interface DebuggerHost {
  readonly session: Session;
  readonly editor: EditorView;
  /** The program is running (animation frames go on). */
  readonly running: boolean;
}

export interface DebuggerElements {
  disasm: HTMLElement;
  memAddr: HTMLInputElement;
  memory: HTMLElement;
}

export class DebuggerPanel {
  /** Breakpoints set in the disassembly at addresses with no source line (the BIOS). */
  private readonly romBreakpoints = new Set<number>();

  constructor(private readonly els: DebuggerElements, private readonly host: DebuggerHost) {
    els.memAddr.addEventListener('input', () => this.show());
  }

  /** The editor holds the code that is loaded, so its lines match the program's. */
  private get current(): boolean {
    return this.host.session.canContinue(this.host.editor.state.doc.toString());
  }

  /** Forget the ROM breakpoints (another map). */
  clear(): void { this.romBreakpoints.clear(); }

  /** The session's breakpoints: the editor's lines (while it holds the loaded code) and the ROM ones. */
  syncBreakpoints(): void {
    const { session, editor } = this.host;
    const set = new Set(this.romBreakpoints);
    if (this.current) {
      for (const l of breakpointLines(editor.state)) {
        const a = session.addressOfLine(l);
        if (a !== null) set.add(a);
      }
    }
    session.breakpoints = set;
  }

  /** Redraw: breakpoints, the editor's heat and PC line, the disassembly and the memory. */
  show(): void {
    this.syncBreakpoints();
    const { session, editor, running } = this.host;
    const cpu = session.world.robot.cpu;
    const pc = cpu.r[7];
    const prog = session.program;
    const current = !!prog && this.current;
    editor.dispatch({ effects: [
      setHeat.of(current ? lineHeat(session.heat, prog.lineAt) : new Map()),
      setPcLine.of(current && !running ? prog.lineAt.get(pc) ?? null : null),
    ] });

    const read = (a: number) => session.world.robot.machine.read(a, false);
    const nameOf = addressNamer(prog?.symbols, prog?.labels);
    const starts = inRom(pc) ? [...bios().lineAt.keys()] : prog ? [...prog.lineAt.keys()] : [];
    const rows = disassemblyAround(read, pc, starts, { before: 4, count: 14, nameOf });
    const width = Math.max(0, ...rows.map((r) => (r.label ?? '').length));
    this.els.disasm.replaceChildren(...rows.map((r) => {
      const e = document.createElement('div');
      const bp = session.breakpoints.has(r.address);
      const n = session.heat[r.address >> 1];
      e.className = 'row' + (r.address === pc ? ' pc' : '') + (bp ? ' bp' : '');
      e.textContent = `${bp ? '●' : ' '}${r.address === pc ? '▶' : ' '}${octal(r.address)} `
        + `${(r.label ? r.label + ':' : '').padEnd(width + 1)} ${r.text}`;
      if (n) {
        const h = document.createElement('span');
        h.className = 'count';
        h.textContent = octal(n, 1);
        e.append(h);
      }
      e.title = `${r.words.map((w) => octal(w)).join(' ')}${n ? ` — run ${octal(n, 1)} times` : ''} — click: breakpoint`;
      e.addEventListener('click', () => this.toggle(r.address));
      return e;
    }));

    const { memAddr, memory } = this.els;
    const at = parseAddress(memAddr.value || 'SP', prog?.symbols ?? new Map(), cpu.r);
    memAddr.classList.toggle('bad', at === null);
    memory.textContent = at === null ? 'An octal address, a label, a device name or a register.'
      : memoryRows(read, at, 8, 4).map((r) => `${octal(r.address)}  ${r.words.map((w) => octal(w)).join(' ')}`).join('\n');
  }

  /** A breakpoint from the disassembly: on its source line if it has one, else by address. */
  private toggle(addr: number): void {
    const { session, editor } = this.host;
    const line = this.current ? session.program?.lineAt.get(addr) : undefined;
    if (line !== undefined) {
      editor.dispatch({ selection: { anchor: editor.state.doc.line(line).from } });
      toggleBreakpointAtCursor(editor);
    } else {
      if (!this.romBreakpoints.delete(addr)) this.romBreakpoints.add(addr);
      this.show();
    }
  }
}
