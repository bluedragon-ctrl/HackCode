/** Assembly that ships with the game (the BIOS, the monster scripts). */

import { assemble, type AssembleOptions, type AssembleResult } from 'blue11';

/** Assemble code of the game's own: an error in it is a bug, so it throws. */
export function assembleBuiltIn(name: string, source: string, opts: AssembleOptions): AssembleResult {
  const a = assemble(source, opts);
  if (!a.ok) throw new Error(`${name}: ${a.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('; ')}`);
  return a;
}
