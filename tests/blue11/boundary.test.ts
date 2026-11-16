/**
 * The library's rules (src/blue11/AGENTS.md): it imports nothing from outside its folder,
 * has no runtime dependencies, and stays deterministic. Only codemirror.ts may import
 * @codemirror / @lezer, and index.ts must never load it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../src/blue11');
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const source = (f: string) => readFileSync(join(DIR, f), 'utf8');
const imports = (f: string) => [...source(f).matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

describe('blue11 boundary', () => {
  it('has source files', () => expect(files.length).toBeGreaterThan(5));

  for (const f of files) {
    it(`${f} imports only from its own folder`, () => {
      for (const spec of imports(f)) {
        if (f === 'codemirror.ts' && /^@(codemirror|lezer)\//.test(spec)) continue;
        expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[^/]+$/);
      }
    });

    if (f !== 'codemirror.ts') {
      it(`${f} uses no clock, randomness or DOM`, () => {
        const code = source(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        expect(code).not.toMatch(/Math\.random|Date\b|performance\.now|setTimeout|setInterval|\bwindow\b|\bdocument\b/);
      });
    }
  }

  it('index.ts does not load codemirror.ts', () => {
    expect(imports('index.ts')).not.toContain('./codemirror');
  });
});
