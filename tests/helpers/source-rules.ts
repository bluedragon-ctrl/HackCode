/** Checks on source files themselves: what they import, and which APIs they may not use. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The .ts files under `dir` (recursively), relative to it. */
export const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));

export const readSource = (dir: string, f: string): string => readFileSync(join(dir, f), 'utf8');

/** What a file imports or re-exports from. */
export const importsOf = (code: string): string[] =>
  [...code.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

/** The code without comments. */
export const withoutComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

/** Clock, randomness and the DOM: what deterministic code may not touch. */
export const NONDETERMINISTIC = /Math\.random|Date\b|performance\.now|setTimeout|setInterval|\bwindow\b|\bdocument\b/;
