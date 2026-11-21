import { describe, expect, it } from '@jest/globals';
import { applyIncome, depotIncome, rollIncome } from '../income';
import { createGame } from '../engine';
import { applyEvent } from '../events';
import { createRng } from '../rng';
import { BUNKERS, INCOME, MERCENARY_BRUTE_ROUND } from '../config';
import { emptyGame, fixedRng, putBunker, putUnit } from './helpers';

describe('income', () => {
  it('adds the base income plus the roll', () => {
    const s = emptyGame();
    const roll = applyIncome(s, 'player', 3);
    expect(roll.dice).toEqual([3]);
    expect(roll.total).toBe(INCOME.base + 3);
    expect(s.players.player.supply).toBe(INCOME.base + 3);
  });

  it('rolls within a narrow band', () => {
    const rng = createRng(9);
    for (let i = 0; i < 300; i++) {
      const r = rollIncome(rng);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(INCOME.die);
    }
  });

  it('carries over unspent supply with no cap', () => {
    const s = emptyGame();
    s.players.player.supply = 40;
    applyIncome(s, 'player', INCOME.die);
    expect(s.players.player.supply).toBe(40 + INCOME.base + INCOME.die);
  });

  it('both sides get the same income each round, apart from depots', () => {
    for (let i = 0; i < 20; i++) {
      const g = createGame(`same-${i}`);
      const [p, e] = g.rolls;
      expect(p.dice).toEqual(e.dice);
      expect(p.total).toBe(e.total);
      expect(g.players.player.supply).toBe(g.players.enemy.supply);
    }
  });

  it('depots add +1 each, upgraded depots +2', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 0, 'depot');
    putBunker(s, 'player', 1, 0, 'depot', true);
    putBunker(s, 'enemy', 0, 4, 'depot');
    expect(depotIncome(s, 'player')).toBe(3);
    expect(depotIncome(s, 'enemy')).toBe(1);
    const roll = applyIncome(s, 'player', 1);
    expect(roll.total).toBe(INCOME.base + 1 + 3);
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
  it('supply drop gives both sides +3, uncapped', () => {
    const s = emptyGame();
    s.players.player.supply = 14;
    applyEvent(s, 'supplyDrop', fixedRng(1));
    expect(s.players.player.supply).toBe(17);
    expect(s.players.enemy.supply).toBe(3);
  });

  it('mercenary goes to the weaker army, not the side with less supply', () => {
    const s = emptyGame();
    s.round = 2;
    s.players.player.supply = 0; // spending everything does not earn the mercenary
    s.players.enemy.supply = 10;
    putUnit(s, 'player', 0, 1, 'brute');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    applyEvent(s, 'mercenary', fixedRng(1));
    const enemy = s.lanes.flat().flatMap((t) => t.units).filter((u) => u.owner === 'enemy');
    expect(enemy.map((u) => u.kind).sort()).toEqual(['grunt', 'grunt']);
  });

  it('mercenary sends a Brute only later in the game, and nobody gets one when armies are even', () => {
    const s = emptyGame();
    applyEvent(s, 'mercenary', fixedRng(1));
    expect(s.lanes.flat().flatMap((t) => t.units)).toHaveLength(0);
    s.round = MERCENARY_BRUTE_ROUND;
    putUnit(s, 'enemy', 0, 3, 'grunt');
    applyEvent(s, 'mercenary', fixedRng(1));
    expect(s.lanes.flat().flatMap((t) => t.units).find((u) => u.owner === 'player')?.kind).toBe('brute');
  });

  it('sabotage deals 2 damage to a bunker', () => {
    const s = emptyGame();
    putBunker(s, 'enemy', 2, 4, 'wall');
    applyEvent(s, 'sabotage', fixedRng(1));
    expect(s.lanes[2][4].bunker!.hp).toBe(BUNKERS.wall.hp - 2);
  });
});
