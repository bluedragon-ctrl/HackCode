/**
 * The help dialog: contents on the left, a search box, the section on the right. Links and
 * search hits jump to a section or an entry in it; F1 opens it at a topic.
 */

import { parseInline, type Block, type HelpIndex, type Section, type Topic } from './model';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class HelpView {
  private current: Topic;
  private readonly nav: HTMLElement;
  private readonly content: HTMLElement;
  private readonly search: HTMLInputElement;

  constructor(private readonly dialog: HTMLDialogElement, private readonly index: HelpIndex) {
    this.nav = dialog.querySelector<HTMLElement>('.help-nav')!;
    this.content = dialog.querySelector<HTMLElement>('.help-content')!;
    this.search = dialog.querySelector<HTMLInputElement>('.help-search')!;
    this.current = { section: index.sections[0].id };
    this.renderNav();
    this.search.addEventListener('input', () => this.onSearch());
    this.search.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const first = this.index.search(this.search.value)[0];
      if (first) this.go(first);
    });
    dialog.querySelector<HTMLButtonElement>('.help-close')!.addEventListener('click', () => dialog.close());
  }

  get isOpen(): boolean { return this.dialog.open; }

  /** Open at `topic`, or where it was last. */
  open(topic?: Topic | null): void {
    if (!this.dialog.open) this.dialog.showModal();
    this.go(topic ?? this.current);
    if (!topic) this.search.focus();
  }

  /** Show a section, scrolled to the entry if there is one. The search is cleared. */
  go(topic: Topic): void {
    const section = this.index.section(topic.section);
    if (!section) return;
    this.current = topic;
    this.search.value = '';
    this.renderSection(section);
    for (const a of this.nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.section === section.id);
    const target = topic.anchor ? this.content.querySelector<HTMLElement>(`[id="help-${topic.anchor}"]`) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.remove('flash');
      void target.offsetWidth; // restart the animation
      target.classList.add('flash');
    } else {
      this.content.scrollTop = 0;
    }
  }

  private renderNav(): void {
    let group = '';
    for (const s of this.index.sections) {
      if (s.group !== group) {
        group = s.group;
        this.nav.append(el('h3', undefined, group));
      }
      const a = el('a', undefined, s.title);
      a.href = '#';
      a.dataset.section = s.id;
      a.addEventListener('click', (ev) => { ev.preventDefault(); this.go({ section: s.id }); });
      this.nav.append(a);
    }
  }

  private onSearch(): void {
    const q = this.search.value;
    if (!q.trim()) {
      this.go(this.current);
      this.search.focus();
      return;
    }
    const hits = this.index.search(q);
    this.content.replaceChildren(el('h2', undefined, hits.length ? `Found for “${q}”` : `Nothing found for “${q}”`));
    const ul = el('ul', 'help-hits');
    for (const hit of hits) {
      const li = el('li');
      const a = el('a', undefined, hit.label);
      a.href = '#';
      a.addEventListener('click', (ev) => { ev.preventDefault(); this.go(hit); });
      li.append(a, el('span', 'where', hit.where));
      ul.append(li);
    }
    this.content.append(ul);
    this.content.scrollTop = 0;
  }

  private renderSection(s: Section): void {
    this.content.replaceChildren(el('h2', undefined, s.title), ...s.blocks.map((b) => renderBlock(b, (t) => this.go(t))));
  }
}

/** Inline markup into `into`; a link calls `go`. */
export function renderInline<T extends HTMLElement>(into: T, text: string, go: (t: Topic) => void): T {
  for (const s of parseInline(text)) {
    switch (s.kind) {
      case 'text': into.append(s.text); break;
      case 'code': into.append(el('code', undefined, s.text)); break;
      case 'bold': into.append(el('strong', undefined, s.text)); break;
      case 'link': {
        const a = el('a', undefined, s.text);
        a.href = '#';
        a.addEventListener('click', (ev) => { ev.preventDefault(); go({ section: s.section, anchor: s.anchor }); });
        into.append(a);
      }
    }
  }
  return into;
}

/** A block of the help's content; a link calls `go`. */
export function renderBlock(b: Block, go: (t: Topic) => void): HTMLElement {
  const inline = <T extends HTMLElement>(into: T, text: string): T => renderInline(into, text, go);
  switch (b.kind) {
    case 'p': return inline(el('p'), b.text);
    case 'h': return inline(el('h3'), b.text);
    case 'note': return inline(el('p', 'help-note'), b.text);
    case 'code': return el('pre', 'help-code', b.text);
    case 'list': {
      const ul = el('ul');
      for (const i of b.items) ul.append(inline(el('li'), i));
      return ul;
    }
    case 'table': {
      const t = el('table', 'help-table');
      const head = el('tr');
      for (const c of b.head) head.append(inline(el('th'), c));
      t.append(el('thead'), el('tbody'));
      t.tHead!.append(head);
      for (const row of b.rows) {
        const tr = el('tr');
        for (const c of row) tr.append(inline(el('td'), c));
        t.tBodies[0].append(tr);
      }
      return t;
    }
    case 'entries': {
      const dl = el('dl', 'help-entries');
      for (const en of b.entries) {
        const dt = el('dt');
        dt.id = `help-${en.anchor}`;
        dt.append(inline(el('span', 'term'), en.term));
        if (en.detail) dt.append(el('span', 'detail', en.detail));
        dl.append(dt, inline(el('dd'), en.text));
      }
      return dl;
    }
  }
}
