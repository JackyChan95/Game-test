import { describe, expect, it } from '@jest/globals';
import { checkWinner, createGame, gameReducer } from '../engine';
import { countTiles } from '../board';
import { MAX_ROUNDS } from '../config';
import { createRng } from '../rng';
import type { Action, GameState } from '../types';
import { emptyGame } from './helpers';

/** Play a game with a simple random player, for determinism/termination checks. */
function playRandom(seed: string, choiceSeed: number): { state: GameState; actions: Action[] } {
  let s = createGame(seed);
  const rng = createRng(choiceSeed);
  const actions: Action[] = [];
  for (let guard = 0; guard < 500 && s.phase === 'build'; guard++) {
    const a: Action =
      rng.next() < 0.25
        ? { type: 'endTurn' }
        : rng.next() < 0.5
          ? { type: 'trainUnit', lane: rng.int(0, 2), col: 0, kind: rng.pick(['grunt', 'sniper', 'brute'] as const) }
          : { type: 'buildBunker', lane: rng.int(0, 2), col: rng.int(0, 1), kind: rng.pick(['wall', 'turret', 'depot'] as const) };
    const next = gameReducer(s, a);
    if (next !== s) actions.push(a);
    s = next;
  }
  return { state: s, actions };
}

describe('engine', () => {
  it('starts round 1 with income already rolled', () => {
    const s = createGame('abc');
    expect(s.round).toBe(1);
    expect(s.rolls).toHaveLength(2);
    expect(s.players.player.supply).toBeGreaterThanOrEqual(4 + 2);
    expect(countTiles(s, 'player')).toBe(6);
    expect(countTiles(s, 'enemy')).toBe(6);
  });

  it('does not mutate the input state', () => {
    const s = createGame('abc');
    const before = JSON.stringify(s);
    gameReducer(s, { type: 'trainUnit', lane: 0, col: 0, kind: 'grunt' });
    gameReducer(s, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('rejects illegal actions by returning the same state', () => {
    const s = createGame('abc');
    expect(gameReducer(s, { type: 'trainUnit', lane: 0, col: 3, kind: 'grunt' })).toBe(s);
    expect(gameReducer(s, { type: 'buildBunker', lane: 0, col: 4, kind: 'wall' })).toBe(s);
  });

  it('is deterministic: same seed + same actions = same game', () => {
    const a = playRandom('replay-me', 7);
    let s = createGame('replay-me');
    for (const action of a.actions) s = gameReducer(s, action);
    expect(s).toEqual(a.state);
  });

  it('always finishes by the last round', () => {
    for (let i = 0; i < 30; i++) {
      const { state } = playRandom(`seed-${i}`, i);
      expect(state.phase).toBe('gameOver');
      expect(state.round).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(state.result).not.toBeNull();
    }
  });

  it('records AI build, move and attack frames on end turn', () => {
    let s = createGame('frames');
    s = gameReducer(s, { type: 'trainUnit', lane: 0, col: 0, kind: 'grunt' });
    expect(s.replay).toEqual([]);
    s = gameReducer(s, { type: 'endTurn' });
    expect(s.replay.map((f) => f.stage)).toEqual(['aiBuild', 'move', 'attack']);
    // The grunt trained at column 1 has advanced in the move frame.
    expect(s.replay[0].lanes[0][0].units[0].kind).toBe('grunt');
    expect(s.replay[1].lanes[0][1].units[0].kind).toBe('grunt');
    s = gameReducer(s, { type: 'trainUnit', lane: 1, col: 0, kind: 'grunt' });
    expect(s.replay).toEqual([]);
  });

  it('decides by tiles, then base HP, after the last round', () => {
    const s = emptyGame();
    s.round = MAX_ROUNDS;
    expect(checkWinner(s)?.winner).toBe('draw');
    s.players.enemy.baseHp = 15;
    expect(checkWinner(s)?.winner).toBe('player');
    s.lanes[0][2].owner = 'enemy';
    expect(checkWinner(s)?.winner).toBe('enemy');
  });

  it('a destroyed base ends the game immediately', () => {
    const s = emptyGame();
    s.players.enemy.baseHp = 0;
    expect(checkWinner(s)).toMatchObject({ winner: 'player' });
  });
});
