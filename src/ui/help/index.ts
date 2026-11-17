/**
 * In-game help: the sections (sections.ts), the search and F1 lookup (model.ts), and the
 * dialog (view.ts). DESIGN.md §7 "Help".
 */

import { HelpIndex } from './model';
import { SECTIONS } from './sections';

export { HelpIndex, inComment, parseInline, wordAt, type Block, type Entry, type SearchHit, type Section, type Span, type Topic } from './model';
export { SECTIONS } from './sections';

export const HELP = new HelpIndex(SECTIONS);
