/** src/core/ rules (AGENTS.md): deterministic, no DOM, no clock or Math.random, no floats in state. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../src/core');
const files = readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));

describe('core determinism rules', () => {
  it('has source files', () => expect(files.length).toBeGreaterThan(3));

  for (const f of files) {
    it(`${f} uses no clock, randomness or DOM`, () => {
      const code = readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code).not.toMatch(/Math\.random|Date\b|performance\.now|setTimeout|setInterval|\bwindow\b|\bdocument\b|Math\.(sqrt|sin|cos|atan2?|pow|hypot)/);
    });

    it(`${f} imports only from core and the blue11 library`, () => {
      const code = readFileSync(join(DIR, f), 'utf8');
      for (const m of code.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
        expect(m[1], `${f} imports ${m[1]}`).toMatch(/^\.\/[^/]+$|^\.\.\/blue11$/);
      }
    });
  }
});
