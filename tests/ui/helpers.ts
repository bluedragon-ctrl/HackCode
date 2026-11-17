import { expect } from 'vitest';
import { TEST_MAP } from '../../src/ui/samples';
import { Session, type SessionOptions } from '../../src/ui/session';

/** A session on `map` (default: the test map) with `src` loaded; fails the test if it does not load. */
export function loaded(src: string, map = TEST_MAP, opts?: SessionOptions): Session {
  const s = new Session(map, opts);
  expect(s.load(src).map((e) => `${e.line}: ${e.message}`)).toEqual([]);
  return s;
}
