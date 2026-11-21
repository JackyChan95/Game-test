import { BUNKERS, INCOME } from './config';
import { allBunkers } from './board';
import type { DiceRoll, GameState, Side } from './types';
import type { Rng } from './rng';

/** Supply produced by a side's depots each round. */
export function depotIncome(state: GameState, side: Side): number {
  return allBunkers(state)
    .filter(({ bunker }) => bunker.owner === side)
    .reduce((sum, { bunker }) => {
      const s = BUNKERS[bunker.kind];
      return sum + s.income + (bunker.upgraded ? s.upgradeIncome : 0);
    }, 0);
}

/** Roll this round's income die. Both sides get the same roll. */
export function rollIncome(rng: Rng): number {
  return rng.int(1, INCOME.die);
}

/** Base income + the shared roll + this side's depots, added to its supply. No cap. Mutates state. */
export function applyIncome(state: GameState, side: Side, roll: number): DiceRoll {
  const bonus = depotIncome(state, side);
  const total = INCOME.base + roll + bonus;
  state.players[side].supply += total;
  return { label: side === 'player' ? 'Your income' : 'AI income', dice: [roll], bonus, total };
}
