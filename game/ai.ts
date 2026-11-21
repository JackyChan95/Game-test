/**
 * Rule-based AI. It normally plays the enemy side, but takes the side as a
 * parameter so it can also play the player side in simulations and tests.
 *
 * If the opponent holds the tile in front of its base, it barrages it first.
 * Each step it picks a focus lane (where the opponent's force most outweighs
 * its own), then tries, in order: an early Depot, a defensive bunker if the
 * opponent is pushing, a bunker to keep units/bunkers balanced, research, a unit, an
 * upgrade. It repeats until it can't afford anything, so it spends most of its
 * supply.
 */
import { BASE_COL, BUNKERS, COLS, DIR, HOME_COL, MAX_ROUNDS, UNIT_KINDS, UNIT_UPGRADES, UNITS } from './config';
import { other } from './board';
import {
  buildBunker, canBuildBunker, canTrainUnit, canUpgradeBunker, canUpgradeUnit, trainUnit, upgradeBunker,
  upgradeUnit, canBarrage, barrage,
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

/** Weighted pick of what to train, reacting to what is in the focus lane. */
function chooseUnit(state: GameState, me: Side, lane: number, rng: Rng): UnitKind {
  const supply = state.players[me].supply;
  const foe = other(me);
  const tiles = state.lanes[lane];
  const foeBuildings = tiles.filter((t) => t.bunker?.owner === foe).length;
  const mine = tiles.flatMap((t) => t.units.filter((u) => u.owner === me));
  const medics = mine.filter((u) => u.kind === 'medic').length;
  const weights: Record<UnitKind, number> = {
    grunt: 3,
    sniper: 2.5,
    brute: 2.5,
    scout: state.round <= 5 ? 1.5 : 0.5,
    sapper: foeBuildings > 0 ? 2.5 : 0.3,
    medic: mine.length >= 3 && medics < Math.floor(mine.length / 4) + 1 ? 2 : 0,
  };
  for (const k of UNIT_KINDS) {
    if (supply < UNITS[k].cost) weights[k] = 0;
    else if (state.players[me].upgrades[k]) weights[k] *= 2; // lean on researched types
  }
  const total = UNIT_KINDS.reduce((n, k) => n + weights[k], 0);
  if (total <= 0) return 'grunt';
  let r = rng.next() * total;
  for (const k of UNIT_KINDS) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return 'grunt';
}

/** One AI decision. Returns false when nothing more can be done. */
function step(state: GameState, me: Side, rng: Rng): boolean {
  const lane = pickFocusLane(state, rng, me);
  const lanesByNeed = [lane, ...[0, 1, 2].filter((l) => l !== lane)];
  const { units, bunkers, depots } = count(state, me);
  const supply = state.players[me].supply;

  // 0. The opponent is on the tile in front of our base: barrage it, then
  //    train melee units onto it until our side outweighs theirs there.
  for (const l of [0, 1, 2]) {
    if (!canBarrage(state, me, l)) {
      barrage(state, me, l);
      return true;
    }
  }
  const home = HOME_COL[me];
  for (const l of [0, 1, 2]) {
    const units = state.lanes[l][home].units;
    const theirs = units.filter((u) => u.owner !== me).reduce((n, u) => n + UNITS[u.kind].cost, 0);
    const ours = units.filter((u) => u.owner === me).reduce((n, u) => n + UNITS[u.kind].cost, 0);
    if (theirs > 0 && ours <= theirs) {
      const kind: UnitKind = !canTrainUnit(state, me, l, home, 'brute') ? 'brute' : 'grunt';
      if (!canTrainUnit(state, me, l, home, kind)) {
        trainUnit(state, me, l, home, kind);
        return true;
      }
    }
  }

  // 1. Economy early on: one Depot, built at the back of the quietest lane.
  if (state.round <= 4 && depots === 0 && supply >= BUNKERS.depot.cost + 2) {
    for (const l of [...lanesByNeed].reverse()) if (tryBunker(state, me, l, 'depot', true)) return true;
  }

  // 2. Defend the focus lane if the opponent is pushing and it has no bunker.
  if (foePushing(state, me, lane) && !hasDefense(state, me, lane)) {
    if (tryBunker(state, me, lane, 'turret') || tryBunker(state, me, lane, 'wall')) return true;
  }

  // 3. Keep a balanced mix: roughly one bunker per five units.
  if (bunkers * 5 < units) {
    const kind: BunkerKind = supply >= BUNKERS.turret.cost ? 'turret' : 'wall';
    if (tryBunker(state, me, lane, kind)) return true;
  }

  // 4. Research the upgrade for the unit type we field most, once we have a few
  //    and can still afford a unit afterwards.
  if (state.round >= 4) {
    const counts = Object.fromEntries(UNIT_KINDS.map((k) => [k, 0])) as Record<UnitKind, number>;
    for (const l of state.lanes) for (const t of l) for (const u of t.units) if (u.owner === me) counts[u.kind]++;
    const top = (Object.keys(counts) as UnitKind[]).sort((a, b) => counts[b] - counts[a])[0];
    const spare = state.players[me].supply - UNIT_UPGRADES[top].cost >= UNITS.grunt.cost;
    if (counts[top] >= 4 && spare && !canUpgradeUnit(state, me, top)) {
      upgradeUnit(state, me, top);
      return true;
    }
  }

  // 5. Train a unit, focus lane first.
  const kind = chooseUnit(state, me, lane, rng);
  for (const l of lanesByNeed) {
    if (tryUnit(state, me, l, kind) || tryUnit(state, me, l, 'grunt')) return true;
  }

  // 6. Upgrade a bunker, focus lane first.
  for (const l of lanesByNeed) {
    for (let col = 0; col < COLS; col++) {
      if (!canUpgradeBunker(state, me, l, col)) {
        upgradeBunker(state, me, l, col);
        return true;
      }
    }
  }

  // 7. Nothing else: any bunker anywhere.
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
