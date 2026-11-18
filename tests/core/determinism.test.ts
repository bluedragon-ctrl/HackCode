/** src/core/ rules (AGENTS.md): deterministic, no DOM, no clock or Math.random, no floats in state. */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importsOf, NONDETERMINISTIC, readSource, sourceFiles, withoutComments } from '../helpers/source-rules';

const DIR = join(__dirname, '../../src/core');
const files = sourceFiles(DIR);

describe('core determinism rules', () => {
  it('has source files', () => expect(files.length).toBeGreaterThan(3));

  for (const f of files) {
    it(`${f} uses no clock, randomness, DOM or floating-point maths`, () => {
      const code = withoutComments(readSource(DIR, f));
      expect(code).not.toMatch(NONDETERMINISTIC);
      expect(code).not.toMatch(/Math\.(sqrt|sin|cos|atan2?|pow|hypot)/);
    });

    it(`${f} imports only from core and the blue11 library`, () => {
      for (const spec of importsOf(readSource(DIR, f))) {
        expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[^/]+$|^blue11$/);
      }
    });
  }
});
