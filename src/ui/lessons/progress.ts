/**
 * What the player has done, kept in the browser: the lessons completed, the program in
 * the editor for each lesson (and the sandbox and the expedition), the lesson open last,
 * the expedition under way and the deepest level reached. Any Storage works
 * (localStorage on the page, a Map in tests); a storage that fails is ignored.
 */

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'hackcode.';

export class Progress {
  constructor(private readonly store: KeyValue | null) {}

  private get(key: string): string | null {
    try { return this.store?.getItem(KEY + key) ?? null; } catch { return null; }
  }

  private set(key: string, value: string): void {
    try { this.store?.setItem(KEY + key, value); } catch { /* full or blocked: not kept */ }
  }

  /** Ids of the lessons completed. */
  get done(): Set<string> {
    try {
      const v: unknown = JSON.parse(this.get('done') ?? '[]');
      return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    } catch { return new Set(); }
  }

  complete(id: string): void {
    const d = this.done;
    if (d.has(id)) return;
    d.add(id);
    this.set('done', JSON.stringify([...d]));
  }

  /** The program kept for a lesson (or 'sandbox', 'expedition'), or null. */
  code(id: string): string | null { return this.get(`code.${id}`); }
  saveCode(id: string, source: string): void { this.set(`code.${id}`, source); }

  /** The lesson (or 'sandbox', 'expedition') open last, or null. */
  get current(): string | null { return this.get('current'); }
  set current(id: string | null) { if (id) this.set('current', id); }

  /** The expedition under way, as it was saved (checked by its reader), or null. */
  get expedition(): unknown {
    try { return JSON.parse(this.get('expedition') ?? 'null'); } catch { return null; }
  }
  set expedition(state: unknown) { this.set('expedition', JSON.stringify(state)); }

  /** The deepest expedition level reached (0: none yet). */
  get bestDepth(): number {
    const n = Number(this.get('best') ?? 0);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
  reachDepth(depth: number): void { if (depth > this.bestDepth) this.set('best', String(depth)); }
}
