/**
 * The expedition bar above the map: depth, seed, what the robot brought in, the deepest
 * level reached, and the Start / New expedition / Starter program buttons. The page
 * decides what the buttons do; this shows the expedition and checks the typed seed.
 */

import { octal } from '../blue11';
import type { Expedition } from './expedition';

export interface ExpeditionActions {
  /** Start on this seed (typed, and checked). */
  start(seed: number): void;
  /** Start on a random seed. */
  startRandom(): void;
  /** Put the starter program into the editor. */
  starter(): void;
  /** The typed seed is not one. */
  badSeed(message: string): void;
}

export class ExpeditionBar {
  private readonly seed: HTMLInputElement;

  constructor(private readonly bar: HTMLElement, actions: ExpeditionActions) {
    const $ = <T extends HTMLElement>(sel: string) => bar.querySelector(sel) as T;
    this.seed = $<HTMLInputElement>('#exp-seed');
    const start = $<HTMLButtonElement>('#exp-start');
    start.addEventListener('click', () => {
      const v = this.seed.value.trim();
      if (!/^[0-7]{1,6}$/.test(v)) {
        this.seed.classList.add('bad');
        actions.badSeed('A seed is up to six octal digits (0–7).');
        return;
      }
      actions.start(parseInt(v, 8));
    });
    this.seed.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') start.click(); });
    $('#exp-new').addEventListener('click', () => actions.startRandom());
    $('#exp-starter').addEventListener('click', () => actions.starter());
  }

  /** Show the expedition (null: none open, the bar is hidden); `bestDepth` is the deepest level reached. */
  show(e: Expedition | null, bestDepth: number): void {
    this.bar.hidden = !e;
    if (!e) return;
    const c = e.carried;
    this.bar.querySelector('.exp-title')!.textContent = `Expedition — depth ${octal(e.depth, 1)}`;
    this.bar.querySelector('.exp-info')!.textContent = [
      `seed ${octal(e.seed, 6)}`,
      `brought in: HP ${c.hp ?? 'full'}${c.hp !== undefined ? '.' : ''}, energy ${c.energy ?? 'full'}${c.energy !== undefined ? '.' : ''}, coins ${octal(c.coins, 1)}`,
      `ticks so far ${octal(e.ticks, 1)}`,
      `deepest ${octal(bestDepth || 1, 1)}`,
    ].join(' · ');
    if (document.activeElement !== this.seed) this.seed.value = octal(e.seed, 6);
    this.seed.classList.remove('bad');
  }
}
