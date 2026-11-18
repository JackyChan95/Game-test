import { describe, expect, it } from '@jest/globals';
import { applyAttacks, collectAttacks, findTarget, moveUnits, resolveClash } from '../combat';
import { emptyGame, fixedRng, putBunker, putUnit } from './helpers';

describe('movement', () => {
  it('advances units one tile and claims the tile', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 1, 'grunt');
    moveUnits(s, 'player');
    expect(s.lanes[0][1].units).toHaveLength(0);
    expect(s.lanes[0][2].units).toHaveLength(1);
    expect(s.lanes[0][2].owner).toBe('player');
  });

  it('enemy units move toward the player base', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 1, 4, 'grunt');
    moveUnits(s, 'player');
    expect(s.lanes[1][3].units[0].owner).toBe('enemy');
  });

  it('is blocked by an enemy bunker', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt');
    putBunker(s, 'enemy', 0, 3, 'wall');
    moveUnits(s, 'player');
    expect(s.lanes[0][2].units).toHaveLength(1);
  });

  it('snipers hold position when a target is in range', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 1, 'sniper');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    moveUnits(s, 'player');
    expect(s.lanes[0][1].units).toHaveLength(1);
  });

  it('never puts more than 2 units on a tile', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt');
    putUnit(s, 'player', 0, 2, 'grunt');
    putBunker(s, 'enemy', 0, 4, 'wall');
    putUnit(s, 'player', 0, 1, 'grunt');
    moveUnits(s, 'player');
    expect(s.lanes[0][3].units).toHaveLength(2);
    expect(s.lanes[0][2].units).toHaveLength(1);
  });
});

describe('targeting', () => {
  it('melee reaches only the adjacent tile', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 1, 'grunt');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    expect(findTarget(s, 'player', 0, 1, 1, [1])).toBeNull();
    expect(findTarget(s, 'player', 0, 1, 2, [1])).toMatchObject({ type: 'unit', col: 3 });
  });

  it('hits the bunker before units sheltering on its tile', () => {
    const s = emptyGame();
    putBunker(s, 'enemy', 0, 3, 'wall');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    expect(findTarget(s, 'player', 0, 2, 1, [1])).toMatchObject({ type: 'bunker', col: 3 });
  });

  it('targets the enemy base from the last tile', () => {
    const s = emptyGame();
    putUnit(s, 'player', 2, 4, 'grunt');
    expect(findTarget(s, 'player', 2, 4, 1, [1])).toEqual({ type: 'base', side: 'enemy' });
  });
});

describe('attacks', () => {
  it('damage is 1d6 + modifier', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'brute'); // +2
    putUnit(s, 'enemy', 0, 3, 'brute');
    const attacks = collectAttacks(s, fixedRng(4), false);
    expect(attacks).toHaveLength(2);
    expect(attacks.every((a) => a.damage === 6)).toBe(true);
  });

  it('blizzard gives ranged attacks -1 but not melee', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 1, 'sniper'); // ranged, +1
    putUnit(s, 'enemy', 0, 3, 'grunt'); // melee, no target in reach
    putBunker(s, 'enemy', 1, 3, 'turret'); // ranged, +0
    putUnit(s, 'player', 1, 1, 'grunt');
    const attacks = collectAttacks(s, fixedRng(3), true);
    const sniper = attacks.find((a) => a.attacker.includes('Sniper'))!;
    const turret = attacks.find((a) => a.attacker.includes('Turret'))!;
    expect(sniper.damage).toBe(3); // 3 + 1 - 1
    expect(turret.damage).toBe(2); // 3 + 0 - 1
  });

  it('damage is at least 1', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 1, 'turret');
    putUnit(s, 'enemy', 0, 2, 'grunt');
    const [a] = collectAttacks(s, fixedRng(1), true).filter((x) => x.attacker.includes('Turret'));
    expect(a.damage).toBe(1);
  });

  it('upgraded turrets add +1 damage', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 1, 'turret', true);
    putUnit(s, 'enemy', 0, 3, 'grunt');
    const a = collectAttacks(s, fixedRng(2), false).find((x) => x.attacker.includes('Turret'))!;
    expect(a.damage).toBe(3);
  });

  it('resolves simultaneously: both units can kill each other', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt', 3);
    putUnit(s, 'enemy', 0, 3, 'grunt', 3);
    applyAttacks(s, collectAttacks(s, fixedRng(5), false));
    expect(s.lanes[0][2].units).toHaveLength(0);
    expect(s.lanes[0][3].units).toHaveLength(0);
  });

  it('walls do not attack and are removed at 0 HP', () => {
    const s = emptyGame();
    putBunker(s, 'enemy', 0, 3, 'wall');
    s.lanes[0][3].bunker!.hp = 2;
    putUnit(s, 'player', 0, 2, 'grunt');
    const attacks = collectAttacks(s, fixedRng(6), false);
    expect(attacks).toHaveLength(1);
    applyAttacks(s, attacks);
    expect(s.lanes[0][3].bunker).toBeNull();
    expect(s.lanes[0][2].units[0].hp).toBe(6);
  });

  it('a full clash damages the base', () => {
    const s = emptyGame();
    putUnit(s, 'player', 1, 3, 'brute');
    s.round = 1;
    resolveClash(s, fixedRng(6));
    expect(s.lanes[1][4].units).toHaveLength(1);
    expect(s.players.enemy.baseHp).toBe(20 - 8);
  });
});
