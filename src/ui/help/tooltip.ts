/**
 * Hover help in the editor: rest the mouse on an instruction, a symbol, a directive or a
 * register and its help entry shows in a tooltip. Not in comments. A link in it, or a click
 * on the title, opens the help there (as F1 does).
 */

import type { Extension } from '@codemirror/state';
import { hoverTooltip } from '@codemirror/view';
import { inComment, wordAt, type HelpIndex, type Topic } from './model';
import { el, renderInline } from './view';

const NAME = /[A-Za-z0-9.$%]/;

export function helpTooltip(index: HelpIndex, open: (t: Topic) => void): Extension {
  return hoverTooltip((view, pos, side) => {
    const line = view.state.doc.lineAt(pos);
    const col = pos - line.from;
    // at a word's edge, the side tells which character the mouse is over
    const at = side < 0 && col > 0 ? col - 1 : col;
    if (!NAME.test(line.text[at] ?? '') || inComment(line.text, at)) return null;
    const word = wordAt(line.text, at);
    const found = word ? index.entryFor(word) : null;
    if (!found) return null;
    const { entry, section } = found;
    const topic = { section: section.id, anchor: entry.anchor };
    // the word's extent, so the tooltip stays while the mouse is on it
    let from = at;
    while (from > 0 && NAME.test(line.text[from - 1])) from--;
    return {
      pos: line.from + from,
      end: line.from + from + word.length,
      above: true,
      create() {
        const dom = el('div', 'help-tip');
        const head = el('div', 'help-tip-head');
        const term = renderInline(el('a', 'term'), entry.term, open);
        term.href = '#';
        term.title = `${section.title}: open in the help (F1)`;
        term.addEventListener('click', (ev) => { ev.preventDefault(); open(topic); });
        head.append(term);
        if (entry.detail) head.append(el('span', 'detail', entry.detail));
        dom.append(head, renderInline(el('div', 'help-tip-text'), entry.text, open));
        return { dom };
      },
    };
  }, { hoverTime: 450 });
}
