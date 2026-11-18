import { describe, expect, it } from '@jest/globals';
import { applyIncome, depotIncome, nextSupply } from '../income';
import { applyEvent } from '../events';
import { createRng } from '../rng';
import { emptyGame, fixedRng, putBunker } from './helpers';

describe('income', () => {
  it('adds 2d6 to supply', () => {
    const s = emptyGame();
    const roll = applyIncome(s, 'player', fixedRng(4));
    expect(roll.dice).toEqual([4, 4]);
    expect(roll.total).toBe(8);
    expect(s.players.player.supply).toBe(8);
  });

  it('carries over unspent supply, capped at 15', () => {
    expect(nextSupply(5, 7)).toBe(12);
    expect(nextSupply(10, 12)).toBe(15);
    const s = emptyGame();
    s.players.player.supply = 9;
    applyIncome(s, 'player', fixedRng(6));
    expect(s.players.player.supply).toBe(15);
  });

  it('depots add +1 each, upgraded depots +2', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 0, 'depot');
    putBunker(s, 'player', 1, 0, 'depot', true);
    putBunker(s, 'enemy', 0, 4, 'depot');
    expect(depotIncome(s, 'player')).toBe(3);
    expect(depotIncome(s, 'enemy')).toBe(1);
    const roll = applyIncome(s, 'player', fixedRng(1));
    expect(roll.total).toBe(5);
  });

  it('dice are always between 1 and 6', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const d = rng.d6();
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });
});

describe('events', () => {
  it('supply drop gives both sides +3 (capped)', () => {
    const s = emptyGame();
    s.players.player.supply = 14;
    applyEvent(s, 'supplyDrop', fixedRng(1));
    expect(s.players.player.supply).toBe(15);
    expect(s.players.enemy.supply).toBe(3);
  });

  it('mercenary gives a Brute to the lower-supply side', () => {
    const s = emptyGame();
    s.players.enemy.supply = 5;
    applyEvent(s, 'mercenary', fixedRng(1));
    const brutes = s.lanes.flat().flatMap((t) => t.units);
    expect(brutes).toHaveLength(1);
    expect(brutes[0]).toMatchObject({ kind: 'brute', owner: 'player' });
  });

  it('sabotage deals 2 damage to a bunker', () => {
    const s = emptyGame();
    putBunker(s, 'enemy', 2, 4, 'wall');
    applyEvent(s, 'sabotage', fixedRng(1));
    expect(s.lanes[2][4].bunker!.hp).toBe(12);
  });
});
