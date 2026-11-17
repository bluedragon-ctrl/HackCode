/**
 * The lesson on the page: the bar above the map (title, goal, rules, hints, buttons) and
 * the briefing dialog. The page decides what the buttons do; this only shows the lesson.
 */

import { el, renderBlock, renderInline } from '../help/view';
import type { Topic } from '../help/model';
import { rulesText, type Lesson } from './model';

export interface LessonActions {
  /** A help link in the lesson's text. */
  help(t: Topic): void;
  /** Put the reference solution into the editor. */
  solution(): void;
  /** Put the starter program back into the editor. */
  starter(): void;
  next(): void;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

/** Ask before the editor's program is replaced by `what` ("the starter program"). */
export function confirmReplace(what: string): boolean {
  return confirm(`Replace your program with ${what}? Your program is not kept.`);
}

const heading = (l: Lesson): string => `Lesson ${l.number} · ${l.title}`;

export class LessonView {
  private lesson: Lesson | null = null;
  /** Hints shown so far. */
  private hints = 0;
  private readonly title: HTMLElement;
  private readonly goal: HTMLElement;
  private readonly rules: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly hintButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly briefTitle: HTMLElement;
  private readonly briefContent: HTMLElement;

  constructor(private readonly bar: HTMLElement, private readonly dialog: HTMLDialogElement, private readonly actions: LessonActions) {
    this.title = $(bar, '.lesson-title');
    this.goal = $(bar, '.lesson-goal');
    this.rules = $(bar, '.lesson-rules');
    this.hint = $(bar, '.lesson-hint');
    this.hintButton = $(bar, '.lesson-hint-button');
    this.nextButton = $(bar, '.lesson-next');
    this.briefTitle = $(dialog, '.brief-title');
    this.briefContent = $(dialog, '.brief-content');
    $(bar, '.lesson-brief').addEventListener('click', () => this.brief());
    this.hintButton.addEventListener('click', () => this.nextHint());
    $(bar, '.lesson-solution').addEventListener('click', () => {
      if (confirmReplace('the reference solution')) actions.solution();
    });
    $(bar, '.lesson-starter').addEventListener('click', () => {
      if (confirmReplace('the starter program')) actions.starter();
    });
    this.nextButton.addEventListener('click', () => actions.next());
    $(dialog, '.brief-close').addEventListener('click', () => dialog.close());
  }

  /** Show a lesson (null: the sandbox, no bar). `last`: there is no lesson after it. */
  show(lesson: Lesson | null, done: boolean, last: boolean): void {
    this.lesson = lesson;
    this.hints = 0;
    this.bar.hidden = !lesson;
    if (!lesson) return;
    this.title.textContent = heading(lesson);
    this.inline(this.goal, `**Goal:** ${lesson.goal.text}`);
    const rules = rulesText(lesson.rules);
    this.rules.hidden = !rules;
    if (rules) this.inline(this.rules, `**Rules:** ${rules}.`);
    this.nextButton.hidden = last;
    this.showHint();
    this.setDone(done);
  }

  /** Mark the lesson done (or not): a tick by the title, the Next button lit. */
  setDone(done: boolean): void {
    this.bar.classList.toggle('done', done);
    this.nextButton.classList.toggle('secondary', !done);
  }

  /** The briefing dialog. */
  brief(): void {
    const l = this.lesson;
    if (!l) return;
    this.briefTitle.textContent = heading(l);
    const goal = renderInline(el('p', 'brief-goal'), `**Goal:** ${l.goal.text}`, (t) => this.help(t));
    this.briefContent.replaceChildren(...l.briefing.map((b) => renderBlock(b, (t) => this.help(t))), goal);
    if (!this.dialog.open) this.dialog.showModal();
    this.briefContent.scrollTop = 0;
  }

  private nextHint(): void {
    if (this.lesson && this.hints < this.lesson.hints.length) this.hints++;
    this.showHint();
  }

  private showHint(): void {
    const l = this.lesson!;
    this.hint.hidden = this.hints === 0;
    if (this.hints) this.inline(this.hint, `**Hint ${this.hints}/${l.hints.length}:** ${l.hints[this.hints - 1]}`);
    this.hintButton.disabled = this.hints >= l.hints.length;
    this.hintButton.textContent = this.hints ? 'Next hint' : 'Hint';
  }

  private help(t: Topic): void {
    this.dialog.close();
    this.actions.help(t);
  }

  private inline(into: HTMLElement, text: string): void {
    into.replaceChildren();
    renderInline(into, text, (t) => this.help(t));
  }
}
