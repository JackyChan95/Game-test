import { createGame } from '../engine';
import type { GameState, Side, UnitKind, BunkerKind } from '../types';
import { BUNKERS, UNITS } from '../config';

/** A fresh game with an empty board, no supply and a calm event. */
export function emptyGame(seed = 'test'): GameState {
  const s = createGame(seed);
  s.players.player.supply = 0;
  s.players.enemy.supply = 0;
  s.event = 'calm';
  s.log = [];
  return s;
}

let id = 1000;
export function putUnit(s: GameState, side: Side, lane: number, col: number, kind: UnitKind, hp?: number) {
  const max = UNITS[kind].hp;
  s.lanes[lane][col].units.push({ id: id++, kind, owner: side, hp: hp ?? max, maxHp: max });
  s.lanes[lane][col].owner = side;
}

export function putBunker(s: GameState, side: Side, lane: number, col: number, kind: BunkerKind, upgraded = false) {
  const st = BUNKERS[kind];
  const hp = st.hp + (upgraded ? st.upgradeHp : 0);
  s.lanes[lane][col].bunker = { id: id++, kind, owner: side, hp, maxHp: hp, upgraded };
  s.lanes[lane][col].owner = side;
}

/** Fake RNG that always rolls the given die value. */
export const fixedRng = (die: number) => ({
  next: () => (die - 1) / 6,
  int: (min: number) => min + die - 1,
  d6: () => die,
  pick: <T,>(xs: readonly T[]) => xs[0],
  state: () => 0,
});
