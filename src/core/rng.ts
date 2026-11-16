/**
 * Seeded random numbers (mulberry32): the only source of randomness in the simulation.
 * Integer-only; the state is one 32-bit number, so it survives JSON.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next 32-bit unsigned integer. */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Integer in [0, n), n ≥ 1. */
  int(n: number): number {
    if (!(n >= 1)) throw new Error('rng: n must be at least 1');
    return this.next() % n;
  }
}
