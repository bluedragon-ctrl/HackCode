import { assemble, SimpleMachine, type AssembleOptions, type AssembleResult, type MachineOptions } from '../../src/blue11';
import { assembleOk } from '../helpers/asm';

/** Assemble at 001000 and boot a SimpleMachine with it (not run yet). */
export function boot(src: string, opts: MachineOptions & { asm?: AssembleOptions } = {}) {
  const asm = assembleOk(src, opts.asm);
  const m = new SimpleMachine(opts);
  m.boot(asm);
  return { m, cpu: m.cpu, asm };
}

/** Assemble at 001000, boot a SimpleMachine, run until HALT (or the budget). */
export function runAsm(src: string, opts: MachineOptions & { asm?: AssembleOptions; budget?: number } = {}) {
  const b = boot(src, opts);
  return { ...b, result: b.m.run(opts.budget ?? 100000) };
}

/** The words a program assembles to; throws on errors. */
export function words(src: string, opts?: AssembleOptions): number[] {
  return wordsOf(assembleOk(src, opts));
}

/** The words of an assembly. */
export function wordsOf(a: Pick<AssembleResult, 'bytes'>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.bytes.length; i += 2) out.push(a.bytes[i] | (a.bytes[i + 1] << 8));
  return out;
}

/** The first word a program assembles to. */
export const word = (src: string, opts?: AssembleOptions): number => words(src, opts)[0];

/** The error messages of a program (none: it assembles). */
export const errors = (src: string, opts?: AssembleOptions): string[] => assemble(src, opts).errors.map((e) => e.message);

/** The first error message; fails the test if the program assembles. */
export function err(src: string, opts?: AssembleOptions): string {
  const e = errors(src, opts);
  if (!e.length) throw new Error(`no error for: ${src}`);
  return e[0];
}

/** The warnings, as `line:column message`. */
export const warns = (src: string, opts?: AssembleOptions): string[] =>
  assemble(src, opts).warnings.map((w) => `${w.line}:${w.column} ${w.message}`);

/** Octal text to a number. */
export const o = (s: string): number => parseInt(s, 8);
