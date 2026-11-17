import { assemble, type AsmError, type AssembleOptions, type AssembleResult } from '../../src/blue11';

/** `line:column message`, one per line. */
export const formatErrors = (errors: readonly AsmError[]): string =>
  errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('\n');

/** Assemble; throws with the errors if there are any. */
export function assembleOk(src: string, opts?: AssembleOptions): AssembleResult {
  const a = assemble(src, opts);
  if (!a.ok) throw new Error(formatErrors(a.errors));
  return a;
}
