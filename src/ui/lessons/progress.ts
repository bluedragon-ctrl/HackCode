/**
 * What the player has done, kept in the browser: the lessons completed, the program in
 * the editor for each lesson (and the sandbox), the lesson open last. Any Storage works
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

  /** The program kept for a lesson (or 'sandbox'), or null. */
  code(id: string): string | null { return this.get(`code.${id}`); }
  saveCode(id: string, source: string): void { this.set(`code.${id}`, source); }

  /** The lesson (or 'sandbox') open last, or null. */
  get current(): string | null { return this.get('current'); }
  set current(id: string | null) { if (id) this.set('current', id); }
}
