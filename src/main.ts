/**
 * Pre-alpha page: a Blue-11 console (editor, run, output, registers) to prove the library
 * runs in the browser and the Pages deployment works. The game UI replaces it later.
 */
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { assemble, octal, SimpleMachine } from './blue11';
import { blue11Asm, blue11Highlight } from './blue11/codemirror';

const SAMPLE = `; Print a message on the console, then halt.
        MOV #MSG, R1
1$:     MOVB (R1)+, R0      ; next character
        BEQ 2$              ; 0: done
3$:     TSTB @#177564       ; transmitter ready?
        BPL 3$
        MOVB R0, @#177566   ; print it
        BR 1$
2$:     HALT
MSG:    .ASCIZ /HELLO, ROBOT/
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>('output');
const regs = $<HTMLPreElement>('regs');
const status = $<HTMLSpanElement>('status');

const editor = new EditorView({
  parent: $('editor'),
  state: EditorState.create({
    doc: SAMPLE,
    extensions: [
      lineNumbers(), history(), keymap.of([...defaultKeymap, ...historyKeymap]),
      blue11Asm, blue11Highlight, EditorView.theme({}, { dark: true }),
    ],
  }),
});

function showStatus(text: string, error = false): void {
  status.textContent = text;
  status.className = error ? 'error' : '';
}

function run(): void {
  const asm = assemble(editor.state.doc.toString());
  if (!asm.ok) {
    showStatus(asm.errors.map((e) => `line ${e.line}:${e.column} ${e.message}`).join('; '), true);
    return;
  }
  const m = new SimpleMachine();
  m.boot(asm);
  const r = m.run(100_000);
  output.textContent = m.output;
  const names = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'SP', 'PC'];
  regs.textContent = names.map((n, i) => `${n.padEnd(3)} ${octal(m.cpu.r[i])}`).join('\n')
    + `\nPSW ${octal(m.cpu.psw)}`;
  showStatus(`${r.reason} — ${r.instructions} instructions, ${r.cycles} cycles`, r.reason !== 'halt');
}

$('run').addEventListener('click', run);
