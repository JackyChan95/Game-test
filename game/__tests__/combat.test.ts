import { describe, expect, it } from '@jest/globals';
import { applyAttacks, collectAttacks, escalation, findTarget, moveUnits, resolveClash } from '../combat';
import { ESCALATION_ROUNDS, MAX_ROUNDS, SIEGE_BONUS } from '../config';
import { createRng } from '../rng';
import { emptyGame, highRng, lowRng, putBunker, putUnit } from './helpers';

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
  it('damage is rolled within the attacker\'s range', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'brute'); // 4–6
    putUnit(s, 'enemy', 0, 3, 'grunt'); // 2–4
    const low = collectAttacks(s, lowRng, false);
    const high = collectAttacks(s, highRng, false);
    const dmg = (as: typeof low, name: string) => as.find((a) => a.attacker.includes(name))!.damage;
    expect([dmg(low, 'Brute'), dmg(high, 'Brute')]).toEqual([4, 6]);
    expect([dmg(low, 'Grunt'), dmg(high, 'Grunt')]).toEqual([2, 4]);
  });

  it('real rolls stay inside the range', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      for (const a of collectAttacks(s, rng, false)) {
        expect(a.damage).toBeGreaterThanOrEqual(2);
        expect(a.damage).toBeLessThanOrEqual(4);
      }
    }
  });

  it('units deal siege damage to bunkers and bases', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt');
    putBunker(s, 'enemy', 0, 3, 'wall');
    putUnit(s, 'player', 1, 4, 'grunt');
    const attacks = collectAttacks(s, lowRng, false);
    expect(attacks.map((a) => a.damage)).toEqual([2 + SIEGE_BONUS, 2 + SIEGE_BONUS]);
  });

  it('escalation adds +1 damage per escalation round reached', () => {
    expect(escalation(1)).toBe(0);
    expect(escalation(ESCALATION_ROUNDS[0])).toBe(1);
    expect(escalation(MAX_ROUNDS)).toBe(ESCALATION_ROUNDS.length);
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    s.round = ESCALATION_ROUNDS[1];
    expect(collectAttacks(s, lowRng, false)[0].damage).toBe(2 + 2);
  });

  it('blizzard gives ranged attacks -1 but not melee', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 1, 'sniper'); // ranged 3–4
    putUnit(s, 'enemy', 0, 2, 'grunt'); // melee 2–4, adjacent to the sniper
    putBunker(s, 'enemy', 1, 3, 'turret'); // ranged 2–3
    putUnit(s, 'player', 1, 1, 'brute');
    const attacks = collectAttacks(s, lowRng, true);
    const find = (n: string) => attacks.find((a) => a.attacker.includes(n))!;
    expect(find('Sniper').damage).toBe(2); // 3 - 1
    expect(find('Turret').damage).toBe(1); // 2 - 1
    expect(find('Grunt').damage).toBe(2); // melee: no penalty
  });

  it('damage is at least 1', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 1, 'turret');
    putUnit(s, 'enemy', 0, 2, 'grunt');
    const a = collectAttacks(s, lowRng, true).find((x) => x.attacker.includes('Turret'))!;
    expect(a.damage).toBe(1);
  });

  it('upgraded turrets add +1 to their range', () => {
    const s = emptyGame();
    putBunker(s, 'player', 0, 1, 'turret', true);
    putUnit(s, 'enemy', 0, 3, 'grunt');
    const a = collectAttacks(s, highRng, false).find((x) => x.attacker.includes('Turret'))!;
    expect([a.min, a.max, a.damage]).toEqual([3, 4, 4]);
  });

  it('resolves simultaneously: both units can kill each other', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'grunt', 2);
    putUnit(s, 'enemy', 0, 3, 'grunt', 2);
    applyAttacks(s, collectAttacks(s, lowRng, false));
    expect(s.lanes[0][2].units).toHaveLength(0);
    expect(s.lanes[0][3].units).toHaveLength(0);
  });

  it('walls do not attack and are removed at 0 HP', () => {
    const s = emptyGame();
    putBunker(s, 'enemy', 0, 3, 'wall');
    s.lanes[0][3].bunker!.hp = 2;
    putUnit(s, 'player', 0, 2, 'grunt');
    const attacks = collectAttacks(s, lowRng, false);
    expect(attacks).toHaveLength(1);
    applyAttacks(s, attacks);
    expect(s.lanes[0][3].bunker).toBeNull();
    expect(s.lanes[0][2].units[0].hp).toBe(6);
  });

  it('a full clash damages the base', () => {
    const s = emptyGame();
    putUnit(s, 'player', 1, 3, 'brute');
    s.round = 1;
    resolveClash(s, highRng);
    expect(s.lanes[1][4].units).toHaveLength(1);
    expect(s.players.enemy.baseHp).toBe(20 - (6 + SIEGE_BONUS));
  });
});
