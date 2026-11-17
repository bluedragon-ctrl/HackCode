/**
 * The in-game help as data: sections of blocks, with a small inline markup. No DOM here
 * (view.ts renders it), so the content, search and F1 lookup are tested.
 *
 * Inline markup in any text: `code`, **bold**, and links [label](section) or
 * [label](section#anchor).
 */

/** One described thing that F1 and search can find: an instruction, a symbol, a directive. */
export interface Entry {
  /** Unique across the help; the DOM id is `help-<anchor>`. */
  anchor: string;
  /** The names that lead here, upper case: `MOV`, `MOVB`, `WHLCSR`, `.WORD`. */
  names: string[];
  /** As shown: `MOV src, dst`. */
  term: string;
  /** A short tag beside the term: a value, the flags. */
  detail?: string;
  text: string;
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  /** Assembly. `run`: the example must run on the test map to a HALT of its own (tested). */
  | { kind: 'code'; text: string; run?: boolean }
  | { kind: 'note'; text: string }
  | { kind: 'entries'; entries: Entry[] };

export interface Section {
  id: string;
  title: string;
  /** The heading it is listed under in the contents. */
  group: string;
  blocks: Block[];
}

// ------------------------------------------------------------------ building

export const p = (text: string): Block => ({ kind: 'p', text });
export const h = (text: string): Block => ({ kind: 'h', text });
export const list = (...items: string[]): Block => ({ kind: 'list', items });
export const table = (head: string[], rows: string[][]): Block => ({ kind: 'table', head, rows });
export const note = (text: string): Block => ({ kind: 'note', text });
/** Assembly, with the common indentation and the first and last blank lines removed. */
export const code = (text: string, opts: { run?: boolean } = {}): Block => ({ kind: 'code', text: dedent(text), ...opts });
export const entries = (...e: Entry[]): Block => ({ kind: 'entries', entries: e });

function dedent(text: string): string {
  const lines = text.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** A decimal number the way the player writes it: `200.` (0–7 need no dot). */
export const dec = (n: number): string => (n >= 0 && n < 8 ? String(n) : `${n}.`);

// ------------------------------------------------------------------ inline markup

export type Span =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; section: string; anchor?: string };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([\w-]+)(?:#([\w.$-]+))?\)/g;

export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'bold', text: m[2] });
    else out.push({ kind: 'link', text: m[3], section: m[4], ...(m[5] ? { anchor: m[5] } : {}) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** The text without markup, for search. */
export const plain = (text: string): string => parseInline(text).map((s) => s.text).join('');

/** Every text of a block (cells, items, entries), for search and link checks. */
export function blockTexts(b: Block): string[] {
  switch (b.kind) {
    case 'p': case 'h': case 'note': return [b.text];
    case 'code': return [];
    case 'list': return b.items;
    case 'table': return [...b.head, ...b.rows.flat()];
    case 'entries': return b.entries.flatMap((e) => [e.term, e.detail ?? '', e.text]);
  }
}

// ------------------------------------------------------------------ F1 and search

/** A place in the help: a section, and an entry in it. */
export interface Topic {
  section: string;
  anchor?: string;
}

/**
 * The assembler name at `col` (0-based) in `line`: letters, digits, `.` and `$`, upper
 * case, or '' if there is none. `#WHLCSR` gives `WHLCSR`; `CS.GO!CS.IE` gives either name.
 */
export function wordAt(line: string, col: number): string {
  const ch = (i: number) => /[A-Za-z0-9.$%]/.test(line[i] ?? '');
  let from = Math.min(col, line.length);
  if (!ch(from) && ch(from - 1)) from--;
  if (!ch(from)) return '';
  let to = from;
  while (ch(from - 1)) from--;
  while (ch(to)) to++;
  return line.slice(from, to).toUpperCase();
}

/** Whether `col` is in the line's comment (after a `;` that is not a character constant `';`). */
export function inComment(line: string, col: number): boolean {
  for (let i = 0; i < Math.min(col, line.length); i++) {
    if (line[i] === "'") i++;
    else if (line[i] === ';') return true;
  }
  return false;
}

export interface SearchHit extends Topic {
  label: string;
  /** Section title, for a hit in an entry. */
  where: string;
  score: number;
}

export class HelpIndex {
  private readonly described = new Map<string, { entry: Entry; section: Section }>();
  private readonly items: Array<SearchHit & { names: string[]; body: string }> = [];

  constructor(readonly sections: readonly Section[]) {
    for (const s of sections) {
      let body = s.title;
      for (const b of s.blocks) {
        body += ' ' + blockTexts(b).map(plain).join(' ');
        if (b.kind !== 'entries') continue;
        for (const e of b.entries) {
          for (const n of e.names) if (!this.described.has(n)) this.described.set(n, { entry: e, section: s });
          this.items.push({ section: s.id, anchor: e.anchor, label: plain(e.term), where: s.title, score: 0,
            names: e.names, body: `${plain(e.term)} ${plain(e.text)}`.toLowerCase() });
        }
      }
      this.items.push({ section: s.id, label: s.title, where: s.group, score: 0, names: [], body: body.toLowerCase() });
    }
  }

  section(id: string): Section | undefined {
    return this.sections.find((s) => s.id === id);
  }

  /** Where F1 on this name goes (an instruction, a symbol, a directive, a register), or null. */
  topicFor(word: string): Topic | null {
    const d = this.entryFor(word);
    return d ? { section: d.section.id, anchor: d.entry.anchor } : null;
  }

  /** The entry F1 on this name goes to, with its section, for a tooltip; or null. */
  entryFor(word: string): { entry: Entry; section: Section } | null {
    const w = word.toUpperCase();
    return this.described.get(w) ?? this.described.get(w.replace(/^[#@]+/, '')) ?? null;
  }

  /** Entries named by the query first, then entries and sections that mention every word. */
  search(query: string, limit = 30): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    const hits: SearchHit[] = [];
    for (const it of this.items) {
      const names = it.names.map((n) => n.toLowerCase());
      let score = 0;
      if (names.includes(q)) score = 100;
      else if (names.some((n) => n.startsWith(q))) score = 80;
      else if (it.label.toLowerCase().includes(q)) score = it.anchor ? 60 : 70;
      else if (words.every((w) => it.body.includes(w))) score = it.anchor ? 30 : 20;
      if (score) hits.push({ section: it.section, anchor: it.anchor, label: it.label, where: it.where, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
