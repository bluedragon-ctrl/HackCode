/**
 * The library's rules (src/blue11/AGENTS.md): it imports nothing from outside its folder,
 * has no runtime dependencies, and stays deterministic. Only codemirror.ts may import
 * @codemirror / @lezer, and index.ts must never load it.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importsOf, NONDETERMINISTIC, readSource, sourceFiles, withoutComments } from '../helpers/source-rules';

const DIR = join(__dirname, '../../src/blue11');
const files = sourceFiles(DIR);

describe('blue11 boundary', () => {
  it('has source files', () => expect(files.length).toBeGreaterThan(5));

  for (const f of files) {
    it(`${f} imports only from its own folder`, () => {
      for (const spec of importsOf(readSource(DIR, f))) {
        if (f === 'codemirror.ts' && /^@(codemirror|lezer)\//.test(spec)) continue;
        expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[^/]+$/);
      }
    });

    if (f !== 'codemirror.ts') {
      it(`${f} uses no clock, randomness or DOM`, () => {
        expect(withoutComments(readSource(DIR, f))).not.toMatch(NONDETERMINISTIC);
      });
    }
  }

  it('index.ts does not load codemirror.ts', () => {
    expect(importsOf(readSource(DIR, 'index.ts'))).not.toContain('./codemirror');
  });
});
