/**
 * Top-level game flow. `gameReducer` is the single entry point the UI uses:
 * it never mutates its input and is fully deterministic given the seed.
 */
import { BASE_HP, COLS, LANES, MAX_ROUNDS, STARTING_SUPPLY } from './config';
import { clone, countTiles, pushLog } from './board';
import {
  buildBunker, canBuildBunker, canTrainUnit, canUpgradeBunker, trainUnit, upgradeBunker,
} from './build';
import { applyIncome } from './income';
import { applyEvent, drawEvent } from './events';
import { resolveClash, type Attack } from './combat';
import { runAiTurn } from './ai';
import { createRng, seedFrom, type Rng } from './rng';
import type { Action, GameResult, GameState, Hit, Side, Tile, TurnFrame } from './types';

function initialOwner(col: number): Side | null {
  if (col < 2) return 'player';
  if (col > 2) return 'enemy';
  return null;
}

/** Income + event for a new round. Mutates state. */
function startRound(state: GameState, rng: Rng) {
  state.round += 1;
  pushLog(state, `— Round ${state.round} —`);
  state.rolls = [applyIncome(state, 'player', rng), applyIncome(state, 'enemy', rng)];
  const [p, e] = state.rolls;
  pushLog(state, `Income: you rolled ${p.dice.join('+')}${p.bonus ? ` +${p.bonus}` : ''}, AI rolled ${e.dice.join('+')}${e.bonus ? ` +${e.bonus}` : ''}.`);
  state.event = drawEvent(rng);
  applyEvent(state, state.event, rng);
}

export function createGame(seed: string): GameState {
  const lanes: Tile[][] = Array.from({ length: LANES }, () =>
    Array.from({ length: COLS }, (_, col) => ({ owner: initialOwner(col), bunker: null, units: [] })),
  );
  const state: GameState = {
    seed,
    rngState: seedFrom(seed),
    round: 0,
    phase: 'build',
    lanes,
    players: {
      player: { supply: STARTING_SUPPLY, baseHp: BASE_HP },
      enemy: { supply: STARTING_SUPPLY, baseHp: BASE_HP },
    },
    event: 'calm',
    rolls: [],
    log: [],
    nextId: 1,
    result: null,
    replay: [],
  };
  const rng = createRng(state.rngState);
  startRound(state, rng);
  state.rngState = rng.state();
  return state;
}

/** Decide the winner, if any. Pure. */
export function checkWinner(state: GameState): GameResult | null {
  const p = state.players.player.baseHp;
  const e = state.players.enemy.baseHp;
  const byTiles = (prefix: string): GameResult => {
    const pt = countTiles(state, 'player');
    const et = countTiles(state, 'enemy');
    if (pt !== et) {
      return { winner: pt > et ? 'player' : 'enemy', reason: `${prefix}Tiles held ${pt}–${et}.` };
    }
    if (p !== e) {
      return { winner: p > e ? 'player' : 'enemy', reason: `${prefix}Tiles tied ${pt}–${et}; base HP ${p}–${e}.` };
    }
    return { winner: 'draw', reason: `${prefix}Tiles and base HP are tied.` };
  };
  if (p <= 0 && e <= 0) return byTiles('Both bases fell. ');
  if (e <= 0) return { winner: 'player', reason: 'The enemy base was destroyed.' };
  if (p <= 0) return { winner: 'enemy', reason: 'Your base was destroyed.' };
  if (state.round >= MAX_ROUNDS) return byTiles(`After ${MAX_ROUNDS} rounds. `);
  return null;
}

/** Check whether the player may take an action. Returns a reason or null. */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.phase !== 'build') return 'Game over';
  switch (action.type) {
    case 'buildBunker':
      return canBuildBunker(state, 'player', action.lane, action.col, action.kind);
    case 'upgradeBunker':
      return canUpgradeBunker(state, 'player', action.lane, action.col);
    case 'trainUnit':
      return canTrainUnit(state, 'player', action.lane, action.col, action.kind);
    case 'endTurn':
      return null;
  }
}

/** End the player's turn: AI builds, clash, win check, next round. Mutates state. */
function snapshot(state: GameState, stage: TurnFrame['stage'], attacks: Attack[] = []): TurnFrame {
  const hits = new Map<string, Hit>();
  for (const a of attacks) {
    const t = a.target;
    const key = t.type === 'base' ? `base-${t.side}` : t.type === 'unit' ? `unit-${t.id}` : `bunker-${t.lane}-${t.col}`;
    const hit = hits.get(key) ?? {
      unitId: t.type === 'unit' ? t.id : null,
      lane: t.type === 'base' ? null : t.lane,
      col: t.type === 'base' ? null : t.col,
      base: t.type === 'base' ? t.side : null,
      damage: 0,
    };
    hit.damage += a.damage;
    hits.set(key, hit);
  }
  return { stage, round: state.round, lanes: clone(state.lanes), players: clone(state.players), hits: [...hits.values()] };
}

function endTurn(state: GameState, rng: Rng) {
  runAiTurn(state, rng);
  state.replay.push(snapshot(state, 'aiBuild'));
  resolveClash(state, rng, (stage, attacks) => state.replay.push(snapshot(state, stage, attacks)));
  const result = checkWinner(state);
  if (result) {
    state.result = result;
    state.phase = 'gameOver';
    state.rolls = [];
    pushLog(state, result.winner === 'draw' ? 'Draw.' : result.winner === 'player' ? 'Victory.' : 'Defeat.');
    return;
  }
  startRound(state, rng);
}

export function gameReducer(state: GameState, action: Action): GameState {
  if (validateAction(state, action)) return state;
  const next = clone(state);
  next.replay = [];
  const rng = createRng(next.rngState);
  switch (action.type) {
    case 'buildBunker':
      buildBunker(next, 'player', action.lane, action.col, action.kind);
      break;
    case 'upgradeBunker':
      upgradeBunker(next, 'player', action.lane, action.col);
      break;
    case 'trainUnit':
      trainUnit(next, 'player', action.lane, action.col, action.kind);
      break;
    case 'endTurn':
      endTurn(next, rng);
      break;
  }
  next.rngState = rng.state();
  return next;
}

