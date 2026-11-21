import { describe, expect, it } from '@jest/globals';
import { applyHeals, collectAttacks, findTarget, moveUnits } from '../combat';
import { UNITS } from '../config';
import { emptyGame, highRng, putBunker, putUnit } from './helpers';

describe('scout', () => {
  it('moves 2 tiles a round, stopping at enemies', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 0, 'scout');
    moveUnits(s, 'player');
    expect(s.lanes[0][2].units[0]?.kind).toBe('scout');
    putUnit(s, 'enemy', 1, 3, 'grunt');
    putUnit(s, 'player', 1, 0, 'scout');
    moveUnits(s, 'player');
    // Two steps take it to column 2, right next to the grunt.
    expect(s.lanes[1][2].units.some((u) => u.kind === 'scout')).toBe(true);
  });
});

describe('sapper', () => {
  it('goes for buildings before an adjacent melee unit', () => {
    const s = emptyGame();
    putUnit(s, 'enemy', 0, 3, 'grunt');
    putBunker(s, 'enemy', 0, 4, 'wall');
    expect(findTarget(s, 'player', 0, 2, 2, [1], undefined, true)).toMatchObject({ type: 'bunker', col: 4 });
    expect(findTarget(s, 'player', 0, 2, 2, [1])).toMatchObject({ type: 'unit', col: 3 });
  });

  it('deals bonus damage to buildings and bases only', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'sapper');
    putBunker(s, 'enemy', 0, 3, 'wall');
    putUnit(s, 'player', 1, 2, 'sapper');
    putUnit(s, 'enemy', 1, 3, 'grunt');
    putUnit(s, 'player', 2, 4, 'sapper');
    const mine = collectAttacks(s, highRng, false).filter((a) => a.attacker.startsWith('Your'));
    const bonus = UNITS.sapper.damage[1] + UNITS.sapper.vsStructures;
    expect(mine.map((a) => [a.target.type, a.damage])).toEqual([
      ['bunker', bonus],
      ['unit', UNITS.sapper.damage[1]],
      ['base', bonus],
    ]);
  });
});

describe('medic', () => {
  it('does not attack', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'medic');
    putUnit(s, 'enemy', 0, 3, 'grunt');
    expect(collectAttacks(s, highRng, false).filter((a) => a.attacker.startsWith('Your'))).toHaveLength(0);
  });

  it('heals every wounded ally on its tile, capped at max HP', () => {
    const s = emptyGame();
    putUnit(s, 'player', 0, 2, 'medic');
    putUnit(s, 'player', 0, 2, 'grunt', 1);
    putUnit(s, 'player', 0, 2, 'brute', UNITS.brute.hp - 1);
    putUnit(s, 'player', 0, 1, 'grunt', 1); // other tile: not healed
    applyHeals(s);
    const [, grunt, brute] = s.lanes[0][2].units;
    expect(grunt.hp).toBe(1 + UNITS.medic.heal);
    expect(brute.hp).toBe(UNITS.brute.hp);
    expect(s.lanes[0][1].units[0].hp).toBe(1);
  });
});
