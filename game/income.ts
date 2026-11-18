import { BUNKERS, SUPPLY_CAP } from './config';
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

/** Pure arithmetic: carry-over + income, capped. */
export function nextSupply(current: number, income: number): number {
  return Math.min(SUPPLY_CAP, current + income);
}

/** Roll 2d6 (+ depots) and add to the side's supply. Mutates state. */
export function applyIncome(state: GameState, side: Side, rng: Rng): DiceRoll {
  const dice = [rng.d6(), rng.d6()];
  const bonus = depotIncome(state, side);
  const total = dice[0] + dice[1] + bonus;
  const p = state.players[side];
  p.supply = nextSupply(p.supply, total);
  return { label: side === 'player' ? 'Your income' : 'AI income', dice, bonus, total };
}
