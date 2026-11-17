/**
 * The game page: the editor, the map, Run / Continue / Pause / Step / Step tick, the
 * robot, CPU and console panels, and the debugger (breakpoints, heat map, disassembly,
 * memory). The simulation runs in whole ticks paced by animation
 * frames; the speed setting is the only use of wall-clock time, and it never reaches the core.
 */

import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { octal } from '../blue11';
import { blue11Asm, blue11Highlight } from '../blue11/codemirror';
import { bios, BIOS_SOURCE, ENERGY_MAX, MEMORY } from '../core';
import { CanvasRenderer, type Renderer } from '../render';
import { addressNamer, disassemblyAround, lineHeat, memoryRows, parseAddress } from './debug';
import { breakpointLines, debugExtensions, setErrors, setHeat, setPcLine, toggleBreakpointAtCursor } from './editor';
import { HELP, wordAt } from './help';
import { HelpView } from './help/view';
import { BIOS_PROGRAM, TEST_MAP, TEST_PROGRAM } from './samples';
import { Session, type StepResult } from './session';

const HEADINGS = ['N', 'E', 'S', 'W'];
const REGS = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'SP', 'PC'];
/** At most this many ticks per animation frame, so a slow machine still answers. */
const MAX_TICKS_PER_FRAME = 50;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startPage(): void {
  const session = new Session(TEST_MAP);
  const renderer: Renderer = new CanvasRenderer($<HTMLCanvasElement>('map'));
  const status = $<HTMLDivElement>('status');
  const speed = $<HTMLSelectElement>('speed');
  const buttons = {
    run: $<HTMLButtonElement>('run'),
    continue: $<HTMLButtonElement>('continue'),
    pause: $<HTMLButtonElement>('pause'),
    step: $<HTMLButtonElement>('step'),
    stepTick: $<HTMLButtonElement>('step-tick'),
    reset: $<HTMLButtonElement>('reset'),
  };

  let running = false;
  let frame = 0;
  let lastTime = 0;
  let owed = 0; // ticks owed to the speed setting, fractional
  let resumeNext = false; // the next batch passes a breakpoint at the PC (Continue)
  /** Breakpoints set in the disassembly at addresses with no source line (the BIOS). */
  const romBreakpoints = new Set<number>();

  const help = new HelpView($<HTMLDialogElement>('help'), HELP);
  /** F1 in the editor: help on the word under the cursor. */
  const helpAtCursor = (view: EditorView): boolean => {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    help.open(HELP.topicFor(wordAt(line.text, pos - line.from)));
    return true;
  };

  const editor = new EditorView({
    parent: $('editor'),
    state: EditorState.create({
      doc: BIOS_PROGRAM,
      extensions: [
        debugExtensions, lineNumbers(), history(),
        keymap.of([
          { key: 'Mod-Enter', run: () => { run(); return true; } },
          { key: 'F9', run: toggleBreakpointAtCursor },
          { key: 'F1', run: helpAtCursor },
          ...defaultKeymap, ...historyKeymap]),
        blue11Asm, blue11Highlight, EditorView.theme({}, { dark: true }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) refreshButtons();
          // a breakpoint toggled: show it in the disassembly (our own effects are skipped)
          if (!running && u.transactions.some((t) => t.effects.some((e) => !e.is(setHeat) && !e.is(setPcLine) && !e.is(setErrors)))) {
            queueMicrotask(showDebugger);
          }
        }),
      ],
    }),
  });
  const source = () => editor.state.doc.toString();

  function showStatus(text: string, kind: 'info' | 'error' | 'win' = 'info'): void {
    status.textContent = text;
    status.className = kind;
  }

  function refreshButtons(): void {
    const can = session.canContinue(source());
    buttons.run.disabled = running;
    buttons.continue.disabled = running || !can;
    buttons.pause.disabled = !running;
    buttons.step.disabled = running || session.over;
    buttons.stepTick.disabled = running || session.over;
  }

  function show(): void {
    const w = session.world;
    const r = w.robot;
    const cpu = r.cpu;
    renderer.draw(w);
    $<HTMLDivElement>('energy-bar').style.width = `${(100 * r.energy) / ENERGY_MAX}%`;
    $<HTMLPreElement>('robot').textContent = [
      `HP     ${r.hp.toString().padStart(6)}.`,
      `Energy ${r.energy.toString().padStart(6)}.`,
      `Coins  ${octal(r.coins)}`,
      `X Y    ${octal(r.x, 3)} ${octal(r.y, 3)}`,
      `Facing ${HEADINGS[r.heading]}`,
      `Tick   ${octal(w.tick)}`,
    ].join('\n');
    const psw = cpu.psw;
    const flags = ['N', 'Z', 'V', 'C'].map((f, i) => (psw & (8 >> i) ? f : '-')).join('');
    $<HTMLPreElement>('regs').textContent = REGS.map((n, i) => `${n.padEnd(3)} ${octal(cpu.r[i])}`).join('\n')
      + `\nPSW ${octal(psw)} ${flags}` + (cpu.halted ? '\nHALTED' : cpu.waiting ? '\nWAIT' : '');
    $<HTMLPreElement>('output').textContent = r.console.output;
    showDebugger();
    refreshButtons();
  }

  /** The breakpoints: the editor's lines (while it holds the loaded code) and the ROM ones. */
  function syncBreakpoints(): void {
    const set = new Set(romBreakpoints);
    if (session.canContinue(source())) {
      for (const l of breakpointLines(editor.state)) {
        const a = session.addressOfLine(l);
        if (a !== null) set.add(a);
      }
    }
    session.breakpoints = set;
  }

  const disasm = $<HTMLDivElement>('disasm');
  const memAddr = $<HTMLInputElement>('mem-addr');
  const memory = $<HTMLPreElement>('memory');

  function showDebugger(): void {
    syncBreakpoints();
    const cpu = session.world.robot.cpu;
    const pc = cpu.r[7];
    const prog = session.program;
    const current = !!prog && session.canContinue(source());
    editor.dispatch({ effects: [
      setHeat.of(current ? lineHeat(session.heat, prog.lineAt) : new Map()),
      setPcLine.of(current && !running ? prog.lineAt.get(pc) ?? null : null),
    ] });

    const read = (a: number) => session.world.robot.machine.read(a, false);
    const nameOf = addressNamer(prog?.symbols, prog?.labels);
    const inRom = pc >= MEMORY.ROM_BASE && pc < MEMORY.ROM_BASE + MEMORY.ROM_SIZE;
    const starts = inRom ? [...bios().lineAt.keys()] : prog ? [...prog.lineAt.keys()] : [];
    const rows = disassemblyAround(read, pc, starts, { before: 4, count: 14, nameOf });
    const width = Math.max(0, ...rows.map((r) => (r.label ?? '').length));
    disasm.replaceChildren(...rows.map((r) => {
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
      e.addEventListener('click', () => toggleAddress(r.address));
      return e;
    }));

    const at = parseAddress(memAddr.value || 'SP', prog?.symbols ?? new Map(), cpu.r);
    memAddr.classList.toggle('bad', at === null);
    memory.textContent = at === null ? 'An octal address, a label, a device name or a register.'
      : memoryRows(read, at, 8, 4).map((r) => `${octal(r.address)}  ${r.words.map((w) => octal(w)).join(' ')}`).join('\n');
  }

  /** A breakpoint from the disassembly: on its source line if it has one, else by address. */
  function toggleAddress(addr: number): void {
    const line = session.canContinue(source()) ? session.program?.lineAt.get(addr) : undefined;
    if (line !== undefined) {
      editor.dispatch({ selection: { anchor: editor.state.doc.line(line).from } });
      toggleBreakpointAtCursor(editor);
    } else {
      if (!romBreakpoints.delete(addr)) romBreakpoints.add(addr);
      showDebugger();
    }
  }

  /** Report a stop; returns true if the program can go on by itself. */
  function report(res: StepResult): boolean {
    switch (res.stop) {
      case 'tick': return true;
      case 'won': showStatus(`Exit reached in ${octal(session.world.tick)} ticks.`, 'win'); return false;
      case 'halt': showStatus(`HALT at ${octal(session.world.robot.cpu.r[7] - 2)}.`); return false;
      case 'wait': showStatus('WAIT with nothing to wake the CPU: stopped.', 'error'); return false;
      case 'destroyed': showStatus('The robot is destroyed. Reset the map to try again.', 'error'); return false;
      case 'double-fault': showStatus('Double fault: the CPU stopped. Run again to reboot.', 'error'); return false;
      case 'breakpoint': showStatus(`Breakpoint at ${octal(session.world.robot.cpu.r[7])}.`); return false;
      case 'trap': {
        const t = res.trap;
        showStatus(`Trap${t ? ` to ${octal(t.vector, 3)}` : ''} at ${octal(session.world.robot.cpu.r[7])}.`, 'error');
        return false;
      }
    }
  }

  function loadEditor(): boolean {
    const errs = session.load(source());
    editor.dispatch({ effects: setErrors.of(errs.filter((e) => e.line).map((e) => ({ line: e.line, message: e.message }))) });
    if (errs.length) {
      const n = errs.length;
      showStatus(`${n} error${n > 1 ? 's' : ''}: ` + errs.map((e) => (e.line ? `line ${e.line}: ` : '') + e.message).join('; '), 'error');
      show();
      return false;
    }
    return true;
  }

  function loop(time: number): void {
    if (!running) return;
    const rate = Number(speed.value);
    owed += Math.min(0.25, (time - lastTime) / 1000) * rate;
    lastTime = time;
    const n = Math.min(MAX_TICKS_PER_FRAME, Math.floor(owed));
    if (n > 0) {
      owed -= n;
      syncBreakpoints();
      const res = session.run(n, resumeNext);
      resumeNext = false;
      if (!report(res)) running = false;
    }
    show();
    if (running) frame = requestAnimationFrame(loop);
  }

  /** `resume`: pass a breakpoint at the PC (Continue); a fresh Run stops on one. */
  function start(resume: boolean): void {
    running = true;
    resumeNext = resume;
    owed = 1; // the first tick at once
    lastTime = performance.now();
    showStatus('Running…');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
    refreshButtons();
  }

  function run(): void {
    if (running) return;
    if (session.over) session.reset();
    if (loadEditor()) start(false);
  }

  function pause(): void {
    running = false;
    cancelAnimationFrame(frame);
    showStatus(`Paused at tick ${octal(session.world.tick)}.`);
    show();
  }

  /** Step and Step tick load the code first if it changed (PC then at the start). */
  function stepWith(f: () => StepResult): void {
    if (running || session.over) return;
    if (!session.canContinue(source())) {
      if (loadEditor()) { showStatus('Loaded. Step to go on.'); show(); }
      return;
    }
    syncBreakpoints();
    if (report(f())) showStatus(`Stepped: tick ${octal(session.world.tick)}, PC ${octal(session.world.robot.cpu.r[7])}.`);
    show();
  }

  buttons.run.addEventListener('click', run);
  buttons.continue.addEventListener('click', () => { if (!running && session.canContinue(source())) start(true); });
  buttons.pause.addEventListener('click', pause);
  buttons.step.addEventListener('click', () => stepWith(() => session.stepInstruction()));
  buttons.stepTick.addEventListener('click', () => stepWith(() => session.stepTick()));
  buttons.reset.addEventListener('click', () => {
    running = false;
    cancelAnimationFrame(frame);
    session.reset();
    showStatus('Map reset.');
    show();
  });
  window.addEventListener('resize', show);
  memAddr.addEventListener('input', showDebugger);

  const examples: Record<string, string> = { bios: BIOS_PROGRAM, raw: TEST_PROGRAM };
  const example = $<HTMLSelectElement>('example');
  example.addEventListener('change', () => {
    const text = examples[example.value];
    example.value = '';
    if (text) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
  });

  const dialog = $<HTMLDialogElement>('bios');
  $<HTMLPreElement>('bios-source').textContent = BIOS_SOURCE;
  $('show-bios').addEventListener('click', () => dialog.showModal());
  $('close-bios').addEventListener('click', () => dialog.close());

  $('show-help').addEventListener('click', () => help.open());
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'F1' || ev.defaultPrevented) return;
    ev.preventDefault();
    if (help.isOpen) $<HTMLDialogElement>('help').close(); else help.open();
  });

  showStatus('Press Run (Ctrl+Enter) to drive the robot to the exit. F1: help.');
  show();
}
