import { describe, expect, it } from '@jest/globals';
import { collectAttacks, moveUnits, resolveClash } from '../combat';
import { BARRAGE, BASE_GUN_DAMAGE } from '../config';
import { barrage, canBarrage, canBuildBunker, canTrainUnit, trainUnit } from '../build';
import { runAiTurn } from '../ai';
import { createRng } from '../rng';
import { emptyGame, highRng, putBunker, putUnit } from './helpers';

describe('base guns', () => {
  it('fire at the enemy on the tile in front of the base', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 1, 0, 'grunt');
    const guns = collectAttacks(s, highRng, false).filter((a) => a.attacker.includes('base guns'));
    expect(guns).toHaveLength(1);
    expect(guns[0]).toMatchObject({ attacker: 'Your base guns (L2)', damage: BASE_GUN_DAMAGE[1] });
  });

  it('do not reach further than that tile', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 1, 1, 'grunt');
    expect(collectAttacks(s, highRng, false).filter((a) => a.attacker.includes('base guns'))).toHaveLength(0);
  });
});

describe('barrage', () => {
  it('is only available while the enemy holds the tile in front of your base', () => {
    const s = emptyGame();
    s.players.player.supply = 15;
    expect(canBarrage(s, 'player', 0)).toMatch(/enemy is on the tile/);
    putUnit(s, 'enemy', 0, 0, 'grunt');
    expect(canBarrage(s, 'player', 0)).toBeNull();
  });

  it('hits every enemy unit and building there, ignoring shelter, once per lane per round', () => {
    const s = emptyGame();
    s.players.player.supply = 15;
    putBunker(s, 'enemy', 0, 0, 'wall');
    putUnit(s, 'enemy', 0, 0, 'grunt');
    putUnit(s, 'enemy', 0, 0, 'scout', 2);
    barrage(s, 'player', 0);
    const tile = s.lanes[0][0];
    expect(tile.units.map((u) => u.kind)).toEqual(['grunt']); // the scout died
    expect(tile.units[0].hp).toBe(6 - BARRAGE.damage);
    expect(tile.bunker!.hp).toBe(14 - BARRAGE.damage);
    expect(s.players.player.supply).toBe(15 - BARRAGE.cost);
    expect(canBarrage(s, 'player', 0)).toMatch(/Already used/);
  });

  it('the AI barrages when you take the tile in front of its base', () => {
    const s = emptyGame();
    s.players.enemy.supply = 4;
    putUnit(s, 'player', 2, 4, 'scout', 3);
    runAiTurn(s, createRng(1));
    expect(s.lanes[2][4].units.filter((u) => u.owner === 'player')).toHaveLength(0);
  });
});

describe('contested home tile', () => {
  it('you can always train on your home column, even with enemies on it', () => {
    const s = emptyGame();
    s.players.player.supply = 15;
    putUnit(s, 'enemy', 1, 0, 'grunt');
    expect(canTrainUnit(s, 'player', 1, 0, 'grunt')).toBeNull();
    trainUnit(s, 'player', 1, 0, 'grunt');
    expect(s.lanes[1][0].owner).toBeNull(); // contested: nobody holds it
    expect(canBuildBunker(s, 'player', 1, 0, 'wall')).toBe('Enemy units here');
  });

  it('units on the same tile fight each other and hold position', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 1, 0, 'grunt');
    putUnit(s, 'player', 1, 0, 'grunt');
    const attacks = collectAttacks(s, highRng, false);
    const mine = attacks.find((a) => a.attacker === 'Your Grunt (L2)')!;
    const theirs = attacks.find((a) => a.attacker === 'AI Grunt (L2)')!;
    expect(mine.target).toMatchObject({ type: 'unit', col: 0 });
    expect(theirs.target).toMatchObject({ type: 'unit', col: 0 });
    moveUnits(s, 'player');
    expect(s.lanes[1][0].units).toHaveLength(2);
  });

  it('a contested tile is cleared and retaken once the enemy falls', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 1, 0, 'scout', 1);
    putUnit(s, 'player', 1, 0, 'brute');
    s.round = 1;
    resolveClash(s, highRng);
    expect(s.lanes[1].flatMap((t) => t.units).every((u) => u.owner === 'player')).toBe(true);
    expect(s.lanes[1][0].owner).toBe('player');
  });
});
