/**
 * Rule-based AI. It normally plays the enemy side, but takes the side as a
 * parameter so it can also play the player side in simulations and tests.
 *
 * Each step it picks a focus lane (where the opponent's force most outweighs
 * its own), then tries, in order: an early Depot, a defensive bunker if the
 * opponent is pushing, a bunker to keep units/bunkers balanced, a unit, an
 * upgrade. It repeats until it can't afford anything, so it spends most of its
 * supply.
 */
import { BASE_COL, BUNKERS, COLS, DIR, MAX_ROUNDS, UNITS } from './config';
import { other } from './board';
import {
  buildBunker, canBuildBunker, canTrainUnit, canUpgradeBunker, trainUnit, upgradeBunker,
} from './build';
import type { BunkerKind, GameState, Side, UnitKind } from './types';
import type { Rng } from './rng';

/** Columns ordered from `side`'s front line (nearest the enemy) back to its base. */
const frontFirst = (side: Side) => {
  const cols = [...Array(COLS).keys()];
  return DIR[side] === 1 ? cols.reverse() : cols;
};

/** How far a column is from `side`'s base, 0 (next to it) to COLS - 1. */
const distanceFromBase = (side: Side, col: number) => Math.abs(col - BASE_COL[side]) - 1;

/**
 * Rough military value of `side` in a lane, scaled by remaining HP.
 * If `threatTo` is given, pieces closer to that side's base count for more.
 */
export function laneStrength(state: GameState, side: Side, lane: number, threatTo?: Side): number {
  let total = 0;
  state.lanes[lane].forEach((tile, col) => {
    const proximity = threatTo ? 1 + (COLS - 1 - distanceFromBase(threatTo, col)) / (COLS - 1) : 1;
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

export function pickFocusLane(state: GameState, rng: Rng, me: Side = 'enemy'): number {
  const foe = other(me);
  let best = -Infinity;
  let lanes: number[] = [];
  for (let l = 0; l < state.lanes.length; l++) {
    // Also lean toward lanes where the opponent holds more tiles; late in the
    // game, tiles can decide a stalemate, so weigh them more.
    const tiles = state.lanes[l].filter((t) => t.owner === foe).length;
    const tileWeight = state.round >= MAX_ROUNDS - 2 ? 3 : 1;
    const score = laneStrength(state, foe, l, me) - laneStrength(state, me, l) + tiles * tileWeight;
    if (score > best + 0.01) {
      best = score;
      lanes = [l];
    } else if (Math.abs(score - best) <= 0.01) lanes.push(l);
  }
  return rng.pick(lanes);
}

function tryBunker(state: GameState, me: Side, lane: number, kind: BunkerKind, preferBack = false): boolean {
  const cols = frontFirst(me);
  if (preferBack) cols.reverse();
  for (const col of cols) {
    if (!canBuildBunker(state, me, lane, col, kind)) {
      buildBunker(state, me, lane, col, kind);
      return true;
    }
  }
  return false;
}

function tryUnit(state: GameState, me: Side, lane: number, kind: UnitKind): boolean {
  for (const col of frontFirst(me)) {
    if (!canTrainUnit(state, me, lane, col, kind)) {
      trainUnit(state, me, lane, col, kind);
      return true;
    }
  }
  return false;
}

function count(state: GameState, me: Side) {
  let units = 0;
  let bunkers = 0;
  let depots = 0;
  for (const lane of state.lanes) {
    for (const t of lane) {
      units += t.units.filter((u) => u.owner === me).length;
      if (t.bunker?.owner === me) {
        bunkers++;
        if (t.bunker.kind === 'depot') depots++;
      }
    }
  }
  return { units, bunkers, depots };
}

/** Opponent units in my half of the lane (middle column included). */
function foePushing(state: GameState, me: Side, lane: number): boolean {
  return state.lanes[lane].some(
    (t, col) => distanceFromBase(me, col) <= 2 && t.units.some((u) => u.owner !== me),
  );
}

function hasDefense(state: GameState, me: Side, lane: number): boolean {
  return state.lanes[lane].some((t) => t.bunker?.owner === me && t.bunker.kind !== 'depot');
}

function chooseUnit(state: GameState, me: Side, rng: Rng): UnitKind {
  const supply = state.players[me].supply;
  const r = rng.next();
  if (supply >= UNITS.brute.cost && r < 0.45) return 'brute';
  if (supply >= UNITS.sniper.cost && r < 0.7) return 'sniper';
  return 'grunt';
}

/** One AI decision. Returns false when nothing more can be done. */
function step(state: GameState, me: Side, rng: Rng): boolean {
  const lane = pickFocusLane(state, rng, me);
  const lanesByNeed = [lane, ...[0, 1, 2].filter((l) => l !== lane)];
  const { units, bunkers, depots } = count(state, me);
  const supply = state.players[me].supply;

  // 1. Economy early on: one Depot, built at the back of the quietest lane.
  if (state.round <= 4 && depots === 0 && supply >= BUNKERS.depot.cost + 2) {
    for (const l of [...lanesByNeed].reverse()) if (tryBunker(state, me, l, 'depot', true)) return true;
  }

  // 2. Defend the focus lane if the opponent is pushing and it has no bunker.
  if (foePushing(state, me, lane) && !hasDefense(state, me, lane)) {
    if (tryBunker(state, me, lane, 'turret') || tryBunker(state, me, lane, 'wall')) return true;
  }

  // 3. Keep a balanced mix: roughly one bunker per three units.
  if (bunkers * 3 < units) {
    const kind: BunkerKind = supply >= BUNKERS.turret.cost ? 'turret' : 'wall';
    if (tryBunker(state, me, lane, kind)) return true;
  }

  // 4. Train a unit, focus lane first.
  const kind = chooseUnit(state, me, rng);
  for (const l of lanesByNeed) {
    if (tryUnit(state, me, l, kind) || tryUnit(state, me, l, 'grunt')) return true;
  }

  // 5. Upgrade something, focus lane first.
  for (const l of lanesByNeed) {
    for (let col = 0; col < COLS; col++) {
      if (!canUpgradeBunker(state, me, l, col)) {
        upgradeBunker(state, me, l, col);
        return true;
      }
    }
  }

  // 6. Nothing else: any bunker anywhere.
  for (const l of lanesByNeed) {
    if (tryBunker(state, me, l, 'turret') || tryBunker(state, me, l, 'wall')) return true;
  }
  return false;
}

/** Run a whole build phase for `me` (the enemy by default). Mutates state. */
export function runAiTurn(state: GameState, rng: Rng, me: Side = 'enemy') {
  for (let i = 0; i < 30; i++) {
    if (!step(state, me, rng)) break;
  }
}
