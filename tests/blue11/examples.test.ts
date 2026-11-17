import { describe, expect, it } from 'vitest';
import { EXAMPLES, SIM_SYMBOLS } from '../../src/simulator/examples';
import { uncommentedLines } from '../helpers/comments';
import { boot } from './helpers';

const run = (source: string, opts: { eis?: boolean; input?: string; budget?: number } = {}) => {
  const b = boot(source, { eis: opts.eis, asm: { symbols: SIM_SYMBOLS } });
  for (const ch of opts.input ?? '') b.m.type(ch);
  return { ...b, result: b.m.run(opts.budget ?? 2_000_000) };
};

describe('simulator examples', () => {
  it.each(EXAMPLES.map((e) => [e.name, e] as const))('%s assembles and runs', (_name, ex) => {
    const { m, result } = run(ex.source, ex);
    expect(result.reason).toBe('halt');
    expect(m.output).toBe(ex.expect);
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))('%s has a comment on every instruction', (_name, ex) => {
    expect(uncommentedLines(ex.source)).toEqual([]);
  });

  it('the addressing-modes tour ends with the documented registers', () => {
    const { cpu, asm } = run(EXAMPLES.find((e) => e.name.startsWith('Addressing'))!.source, { budget: 1000 });
    const tab = asm.symbols.get('TAB')!;
    expect(cpu.r.slice(0, 6)).toEqual([7, tab, tab, 7, 1, 7]);
  });
});
