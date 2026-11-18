/**
 * Rule-based AI for the enemy side.
 *
 * Each step it picks a focus lane (where the player's force most outweighs its
 * own), then tries, in order: an early Depot, a defensive bunker if the player
 * is pushing, a bunker to keep units/bunkers balanced, a unit, an upgrade.
 * It repeats until it can't afford anything, so it spends most of its supply.
 */
import { BUNKERS, COLS, MAX_ROUNDS, UNITS } from './config';
import { other } from './board';
import {
  buildBunker, canBuildBunker, canTrainUnit, canUpgradeBunker, trainUnit, upgradeBunker,
} from './build';
import type { BunkerKind, GameState, Side, UnitKind } from './types';
import type { Rng } from './rng';

const AI: Side = 'enemy';

/** Rough military value of a side in a lane, scaled by remaining HP. */
export function laneStrength(state: GameState, side: Side, lane: number): number {
  let total = 0;
  state.lanes[lane].forEach((tile, col) => {
    // Player pieces closer to the AI base count for more.
    const proximity = side === 'player' ? 1 + col / (COLS - 1) : 1;
    for (const u of tile.units) {
      if (u.owner === side) total += UNITS[u.kind].cost * (u.hp / u.maxHp) * proximity;
    }
    const b = tile.bunker;
    if (b && b.owner === side && b.kind !== 'depot') {
      total += BUNKERS[b.kind].cost * (b.hp / b.maxHp) * proximity * 0.8;
    }
  });
  return total;
}

export function pickFocusLane(state: GameState, rng: Rng): number {
  let best = -Infinity;
  let lanes: number[] = [];
  for (let l = 0; l < state.lanes.length; l++) {
    // Also lean toward lanes where the player holds more tiles.
    // Late in the game, tiles decide the winner, so weigh them more.
    const tiles = state.lanes[l].filter((t) => t.owner === 'player').length;
    const tileWeight = state.round >= MAX_ROUNDS - 2 ? 3 : 1;
    const score = laneStrength(state, 'player', l) - laneStrength(state, AI, l) + tiles * tileWeight;
    if (score > best + 0.01) {
      best = score;
      lanes = [l];
    } else if (Math.abs(score - best) <= 0.01) lanes.push(l);
  }
  return rng.pick(lanes);
}

/** Owned tiles in a lane without a bunker, front-most (closest to the player) first. */
function freeBunkerTiles(state: GameState, lane: number): number[] {
  const cols: number[] = [];
  for (let col = 0; col < COLS; col++) {
    const t = state.lanes[lane][col];
    if (t.owner === AI && !t.bunker && !t.units.some((u) => u.owner !== AI)) cols.push(col);
  }
  return cols;
}

function tryBunker(state: GameState, lane: number, kind: BunkerKind, preferBack = false): boolean {
  const cols = freeBunkerTiles(state, lane);
  if (preferBack) cols.reverse();
  for (const col of cols) {
    if (!canBuildBunker(state, AI, lane, col, kind)) {
      buildBunker(state, AI, lane, col, kind);
      return true;
    }
  }
  return false;
}

function tryUnit(state: GameState, lane: number, kind: UnitKind): boolean {
  // Front-most spawn tile with room.
  for (let col = 0; col < COLS; col++) {
    if (!canTrainUnit(state, AI, lane, col, kind)) {
      trainUnit(state, AI, lane, col, kind);
      return true;
    }
  }
  return false;
}

function count(state: GameState) {
  let units = 0;
  let bunkers = 0;
  let depots = 0;
  for (const lane of state.lanes) {
    for (const t of lane) {
      units += t.units.filter((u) => u.owner === AI).length;
      if (t.bunker?.owner === AI) {
        bunkers++;
        if (t.bunker.kind === 'depot') depots++;
      }
    }
  }
  return { units, bunkers, depots };
}

function playerPushing(state: GameState, lane: number): boolean {
  return state.lanes[lane].some(
    (t, col) => col >= 2 && t.units.some((u) => u.owner === other(AI)),
  );
}

function hasDefense(state: GameState, lane: number): boolean {
  return state.lanes[lane].some((t) => t.bunker?.owner === AI && t.bunker.kind !== 'depot');
}

function chooseUnit(state: GameState, rng: Rng): UnitKind {
  const supply = state.players[AI].supply;
  const r = rng.next();
  // Final round: cheap bodies to grab tiles.
  if (state.round === MAX_ROUNDS) return r < 0.3 && supply >= UNITS.brute.cost ? 'brute' : 'grunt';
  if (supply >= UNITS.brute.cost && r < 0.45) return 'brute';
  if (supply >= UNITS.sniper.cost && r < 0.7) return 'sniper';
  return 'grunt';
}

/** One AI decision. Returns false when nothing more can be done. */
function step(state: GameState, rng: Rng): boolean {
  const lane = pickFocusLane(state, rng);
  const lanesByNeed = [lane, ...[0, 1, 2].filter((l) => l !== lane)];
  const { units, bunkers, depots } = count(state);
  const supply = state.players[AI].supply;

  // 1. Economy early on: one depot, built at the back of the quietest lane.
  if (state.round <= 3 && depots === 0 && supply >= BUNKERS.depot.cost + 4) {
    const quiet = [...lanesByNeed].reverse();
    for (const l of quiet) if (tryBunker(state, l, 'depot', true)) return true;
  }

  // 2. Defend the focus lane if the player is pushing and it has no bunker.
  if (playerPushing(state, lane) && !hasDefense(state, lane)) {
    if (tryBunker(state, lane, 'turret') || tryBunker(state, lane, 'wall')) return true;
  }

  // 3. Keep a balanced mix: roughly one bunker per three units.
  if (bunkers * 3 < units) {
    const kind: BunkerKind = supply >= BUNKERS.turret.cost ? 'turret' : 'wall';
    if (tryBunker(state, lane, kind)) return true;
  }

  // 4. Train a unit, focus lane first.
  const kind = chooseUnit(state, rng);
  for (const l of lanesByNeed) {
    if (tryUnit(state, l, kind) || tryUnit(state, l, 'grunt')) return true;
  }

  // 5. Upgrade something, focus lane first.
  for (const l of lanesByNeed) {
    for (let col = 0; col < COLS; col++) {
      if (!canUpgradeBunker(state, AI, l, col)) {
        upgradeBunker(state, AI, l, col);
        return true;
      }
    }
  }

  // 6. Nothing else: any bunker anywhere.
  for (const l of lanesByNeed) {
    if (tryBunker(state, l, 'turret') || tryBunker(state, l, 'wall')) return true;
  }
  return false;
}

/** Run the AI's whole build phase. Mutates state. */
export function runAiTurn(state: GameState, rng: Rng) {
  for (let i = 0; i < 30; i++) {
    if (!step(state, rng)) break;
  }
}
