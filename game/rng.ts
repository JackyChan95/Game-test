/**
 * Seeded RNG (mulberry32). The RNG state is a single uint32 stored in the
 * game state, so every random outcome is reproducible from the seed plus the
 * sequence of player actions.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Roll one six-sided die. */
  d6(): number;
  pick<T>(items: readonly T[]): T;
  /** Current internal state; store this back in the game state. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    d6: () => int(1, 6),
    pick: (items) => items[Math.floor(next() * items.length)],
    state: () => s,
  };
}

/** Turn any string (or number) into a 32-bit seed. */
export function seedFrom(input: string | number): number {
  const str = String(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A short, human-friendly random seed for new games (UI only). */
export function randomSeedString(): string {
  return Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
}
