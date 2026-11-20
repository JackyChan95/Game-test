import { describe, expect, it } from '@jest/globals';
import { collectAttacks } from '../combat';
import { UNIT_UPGRADES, UNITS } from '../config';
import { canUpgradeUnit, unitStats, upgradeUnit } from '../build';
import { createGame, gameReducer } from '../engine';
import { emptyGame, highRng, lowRng, putUnit } from './helpers';

describe('unit upgrades', () => {
  it('raise HP of fielded and future units', () => {
    const s = emptyGame();
    s.players.player.supply = 15;
    putUnit(s, 'player', 0, 2, 'grunt', 4);
    upgradeUnit(s, 'player', 'grunt');
    const u = s.lanes[0][2].units[0];
    expect(u.hp).toBe(4 + UNIT_UPGRADES.grunt.hp);
    expect(u.maxHp).toBe(UNITS.grunt.hp + UNIT_UPGRADES.grunt.hp);
    expect(unitStats(s, 'player', 'grunt').hp).toBe(UNITS.grunt.hp + UNIT_UPGRADES.grunt.hp);
    expect(s.players.player.supply).toBe(15 - UNIT_UPGRADES.grunt.cost);
  });

  it('only apply to the side that researched them', () => {
    const s = emptyGame();
    s.players.player.supply = 15;
    upgradeUnit(s, 'player', 'grunt');
    expect(unitStats(s, 'enemy', 'grunt').hp).toBe(UNITS.grunt.hp);
  });

  it('Long Scopes let snipers hit 3 tiles away', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 0, 'sniper');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    expect(collectAttacks(s, lowRng, false).filter((a) => a.attacker.startsWith('Your'))).toHaveLength(0);
    s.players.player.supply = 15;
    upgradeUnit(s, 'player', 'sniper');
    expect(collectAttacks(s, lowRng, false).filter((a) => a.attacker.startsWith('Your'))).toHaveLength(1);
  });

  it('can be researched once, through the reducer', () => {
    let s = createGame('upg');
    s = { ...s, players: { ...s.players, player: { ...s.players.player, supply: 15 } } };
    s = gameReducer(s, { type: 'upgradeUnit', kind: 'brute' });
    expect(s.players.player.upgrades.brute).toBe(true);
    expect(canUpgradeUnit(s, 'player', 'brute')).toBe('Researched');
    expect(gameReducer(s, { type: 'upgradeUnit', kind: 'brute' })).toBe(s);
  });
});

describe('armor', () => {
  it('Brute armor lowers each hit, snipers ignore it', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 0, 3, 'brute');
    putUnit(s, 'player', 0, 2, 'grunt');
    putUnit(s, 'player', 0, 1, 'sniper');
    const mine = collectAttacks(s, highRng, false).filter((a) => a.attacker.startsWith('Your'));
    const grunt = mine.find((a) => a.attacker.includes('Grunt'))!;
    const sniper = mine.find((a) => a.attacker.includes('Sniper'))!;
    expect(grunt.damage).toBe(UNITS.grunt.damage[1] - UNITS.brute.armor);
    expect(sniper.damage).toBe(UNITS.sniper.damage[1]);
  });

  it('Heavy Plating adds armor; hits still deal at least 1', () => {
    const s = emptyGame();
    s.players.enemy.supply = 15;
    upgradeUnit(s, 'enemy', 'brute');
    putUnit(s, 'enemy', 0, 3, 'brute');
    putUnit(s, 'player', 0, 2, 'grunt');
    const [a] = collectAttacks(s, lowRng, false).filter((x) => x.attacker.startsWith('Your'));
    expect(a.damage).toBe(Math.max(1, UNITS.grunt.damage[0] - UNITS.brute.armor - UNIT_UPGRADES.brute.armor));
  });
});
