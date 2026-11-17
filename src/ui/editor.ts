/**
 * Debugger parts of the editor: a breakpoint gutter (click a line number's left side),
 * an execution heat gutter, assembler errors shown on their lines, and the PC's line.
 * The page sets them with the effects below; they move with edits like any text.
 */

import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter, WidgetType, type DecorationSet } from '@codemirror/view';

// ---------------------------------------------------------------- breakpoints

const toggleBreakpoint = StateEffect.define<number>({ map: (pos, m) => m.mapPos(pos) });

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const e = document.createElement('span');
    e.className = 'cm-bp';
    e.textContent = '●';
    return e;
  }
}
const breakpointMarker = new BreakpointMarker();

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(toggleBreakpoint)) continue;
      let had = false;
      set.between(e.value, e.value, () => { had = true; });
      set = had
        ? set.update({ filter: (from) => from !== e.value })
        : set.update({ add: [breakpointMarker.range(e.value)] });
    }
    return set;
  },
});

function toggleAt(view: EditorView, pos: number): boolean {
  view.dispatch({ effects: toggleBreakpoint.of(view.lineBlockAt(pos).from) });
  return true;
}

/** Source lines (1-based) with a breakpoint. */
export function breakpointLines(state: EditorState): number[] {
  const lines: number[] = [];
  const iter = state.field(breakpointField).iter();
  for (; iter.value; iter.next()) lines.push(state.doc.lineAt(iter.from).number);
  return lines;
}

// ---------------------------------------------------------------- heat

/** Executions per source line; an empty map clears the gutter. */
export const setHeat = StateEffect.define<ReadonlyMap<number, number>>();

/** The heat per line, and its largest count (worked out once, not per line). */
interface Heat { lines: ReadonlyMap<number, number>; max: number }

const heatField = StateField.define<Heat>({
  create: () => ({ lines: new Map(), max: 1 }),
  update(v, tr) {
    for (const e of tr.effects) {
      if (!e.is(setHeat)) continue;
      let max = 1;
      for (const n of e.value.values()) max = Math.max(max, n);
      v = { lines: e.value, max };
    }
    return v;
  },
});

class HeatMarker extends GutterMarker {
  constructor(readonly count: number, readonly level: number) { super(); }
  eq(o: HeatMarker) { return o.count === this.count && o.level === this.level; }
  toDOM() {
    const e = document.createElement('span');
    e.className = 'cm-heat';
    e.style.setProperty('--heat', String(this.level));
    e.title = `${this.count.toString(8)} executions (octal)`;
    return e;
  }
}

// ---------------------------------------------------------------- errors and PC

export interface LineMessage { line: number; message: string }

/** Assembler errors to show; [] clears them. */
export const setErrors = StateEffect.define<LineMessage[]>();
/** The line the PC is on, or null. */
export const setPcLine = StateEffect.define<number | null>();

class ErrorWidget extends WidgetType {
  constructor(readonly message: string) { super(); }
  eq(o: ErrorWidget) { return o.message === this.message; }
  toDOM() {
    const e = document.createElement('span');
    e.className = 'cm-asm-error';
    e.textContent = this.message;
    return e;
  }
}

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setErrors)) continue;
      const doc = tr.state.doc;
      const ranges = e.value
        .filter((m) => m.line >= 1 && m.line <= doc.lines)
        .sort((a, b) => a.line - b.line)
        .flatMap((m) => {
          const l = doc.line(m.line);
          return [Decoration.line({ class: 'cm-error-line' }).range(l.from),
            Decoration.widget({ widget: new ErrorWidget(m.message), side: 1 }).range(l.to)];
        });
      set = Decoration.set(ranges, true);
    }
    return set;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const pcField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setPcLine)) continue;
      const doc = tr.state.doc;
      set = e.value && e.value <= doc.lines
        ? Decoration.set([Decoration.line({ class: 'cm-pc-line' }).range(doc.line(e.value).from)])
        : Decoration.none;
    }
    return set;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------- together

export const debugExtensions: Extension = [
  breakpointField,
  gutter({
    class: 'cm-bp-gutter',
    markers: (v) => v.state.field(breakpointField),
    initialSpacer: () => breakpointMarker,
    domEventHandlers: { mousedown: (view, line) => toggleAt(view, line.from) },
  }),
  heatField,
  gutter({
    class: 'cm-heat-gutter',
    lineMarker(view, line) {
      const { lines, max } = view.state.field(heatField);
      if (!lines.size) return null;
      const n = lines.get(view.state.doc.lineAt(line.from).number);
      if (!n) return null;
      // log scale, 1–8
      return new HeatMarker(n, Math.max(1, Math.ceil((8 * Math.log(n + 1)) / Math.log(max + 1))));
    },
    lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setHeat))),
  }),
  errorField,
  pcField,
];

/** F9 toggles a breakpoint on the cursor's line. */
export function toggleBreakpointAtCursor(view: EditorView): boolean {
  return toggleAt(view, view.state.selection.main.head);
}
