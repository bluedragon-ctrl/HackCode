/**
 * Lessons as data (DESIGN.md §7): a hand-made map, a briefing, a goal the simulation
 * checks, rules on the program, hints and a reference solution. No DOM here, so every
 * lesson is tested: its solution wins, and the mistakes it teaches about do not.
 */

import { octal, type AssembleResult } from '../../blue11';
import type { MapOptions, World } from '../../core';
import { inComment, type Block } from '../help/model';

/** What wins a map, checked after every tick; the plain goal is the exit. */
export interface Goal {
  /** For the player, with the help's inline markup. */
  text: string;
  won(w: World): boolean;
  /** Why the run can no longer win (it stops there), or null. */
  failed?(w: World): string | null;
}

/** Rules on the program, checked when it is loaded. */
export interface Rules {
  /** At most this many words of instructions (data and buffers do not count). */
  maxWords?: number;
  /** Instructions the program must use. */
  uses?: string[];
  /** Instructions the program must not use. */
  forbids?: string[];
}

export interface Lesson {
  id: string;
  /** Shown as "Lesson n". */
  number: number;
  /**
   * Bumped when the lesson changes so much that programs saved for it no longer fit (new
   * rules): those are then left in storage and the starter opens instead. Absent: 1.
   */
  revision?: number;
  title: string;
  map: string;
  mapOptions?: MapOptions;
  goal: Goal;
  rules?: Rules;
  /** Shown when the lesson starts; the help's blocks and markup. */
  briefing: Block[];
  /** The editor's program when the lesson is first opened. */
  starter: string;
  /** Shown one at a time, on request. */
  hints: string[];
  /** A program that wins (tested). */
  solution: string;
}

export const EXIT_GOAL: Goal = { text: 'Reach the **exit**.', won: (w) => w.atExit };

/** The exit, with at least `coins` coins collected. */
export function exitWithCoins(coins: number): Goal {
  return {
    text: `Collect all **${octal(coins, 1)}** coins (octal), then reach the **exit**.`,
    won: (w) => w.atExit && w.robot.coins >= coins,
    failed: (w) => (w.atExit && w.robot.coins < coins
      ? `Exit reached with ${octal(w.robot.coins, 1)} of ${octal(coins, 1)} coins.` : null),
  };
}

/** The exit, with at least `energy` energy left. */
export function exitWithEnergy(energy: number): Goal {
  return {
    text: `Reach the **exit** with at least **${energy}.** energy left.`,
    won: (w) => w.atExit && w.robot.energy >= energy,
    failed: (w) => (w.atExit && w.robot.energy < energy
      ? `Exit reached with ${w.robot.energy}. energy: the goal is at least ${energy}.` : null),
  };
}

/** The key the lesson's program is saved under: its id, plus the revision from 2 on. */
export function codeId(lesson: Pick<Lesson, 'id' | 'revision'>): string {
  return (lesson.revision ?? 1) > 1 ? `${lesson.id}.r${lesson.revision}` : lesson.id;
}

/** The mnemonics of a source, upper case: the first word of each line after its labels. */
export function mnemonics(source: string): Set<string> {
  const out = new Set<string>();
  for (const raw of source.split('\n')) {
    let end = raw.length;
    for (let i = 0; i < raw.length; i++) if (inComment(raw, i + 1)) { end = i; break; }
    let text = raw.slice(0, end).trim();
    for (let m; (m = /^[A-Za-z0-9.$]+:\s*/.exec(text)); ) text = text.slice(m[0].length);
    const word = /^[A-Za-z.]+/.exec(text)?.[0];
    if (word && !text.slice(word.length).trimStart().startsWith('=')) out.add(word.toUpperCase());
  }
  return out;
}

/** Words of instructions in an assembly (data, `.BLKW` and the like do not count). */
export function codeWords(asm: AssembleResult): number {
  return asm.lines.reduce((n, l) => n + (l.code ? l.bytes.length >> 1 : 0), 0);
}

/** What the program breaks of the rules, for the player; empty if nothing. */
export function checkRules(rules: Rules | undefined, source: string, asm: AssembleResult): string[] {
  if (!rules) return [];
  const out: string[] = [];
  const used = mnemonics(source);
  const words = codeWords(asm);
  if (rules.maxWords !== undefined && words > rules.maxWords) {
    out.push(`the program has ${octal(words, 1)} words of instructions; this lesson allows ${octal(rules.maxWords, 1)}`);
  }
  for (const u of rules.uses ?? []) if (!used.has(u)) out.push(`this lesson asks you to use ${u}`);
  for (const f of rules.forbids ?? []) if (used.has(f)) out.push(`this lesson does not allow ${f}`);
  return out;
}

/** The rules as a line for the player, or '' if there are none. */
export function rulesText(rules: Rules | undefined): string {
  if (!rules) return '';
  const parts: string[] = [];
  if (rules.maxWords !== undefined) parts.push(`at most **${octal(rules.maxWords, 1)}** words of instructions`);
  if (rules.uses?.length) parts.push(`use ${rules.uses.map((u) => `\`${u}\``).join(', ')}`);
  if (rules.forbids?.length) parts.push(`no ${rules.forbids.map((u) => `\`${u}\``).join(', ')}`);
  return parts.join('; ');
}
