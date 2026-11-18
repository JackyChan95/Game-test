/**
 * Build-phase rules: validation and (mutating) application of build actions.
 * Callers should pass a cloned state; the engine does this for you.
 */
import { BUNKERS, HOME_COL, UNITS, UNITS_PER_TILE } from './config';
import { inBounds, other, pushLog, SIDE } from './board';
import type { BunkerKind, GameState, Side, Unit, UnitKind } from './types';

/** Returns a reason string if not allowed, or null if the build is legal. */
export function canBuildBunker(
  state: GameState, side: Side, lane: number, col: number, kind: BunkerKind,
): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!inBounds(lane, col)) return 'Off the map';
  const tile = state.lanes[lane][col];
  if (tile.owner !== side) return 'You must hold this tile';
  if (tile.units.some((u) => u.owner !== side)) return 'Enemy units here';
  if (tile.bunker) return 'Tile already has a bunker';
  if (state.players[side].supply < BUNKERS[kind].cost) return 'Not enough supply';
  return null;
}

export function canUpgradeBunker(state: GameState, side: Side, lane: number, col: number): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!inBounds(lane, col)) return 'Off the map';
  const bunker = state.lanes[lane][col].bunker;
  if (!bunker || bunker.owner !== side) return 'No bunker of yours here';
  if (bunker.upgraded) return 'Already upgraded';
  if (state.players[side].supply < BUNKERS[bunker.kind].upgradeCost) return 'Not enough supply';
  return null;
}

/** Units can be trained on your home column, or on any tile with your bunker. */
export function isSpawnTile(state: GameState, side: Side, lane: number, col: number): boolean {
  if (!inBounds(lane, col)) return false;
  const tile = state.lanes[lane][col];
  if (tile.owner !== side) return false;
  if (tile.units.some((u) => u.owner === other(side))) return false;
  return col === HOME_COL[side] || tile.bunker?.owner === side;
}

export function canTrainUnit(
  state: GameState, side: Side, lane: number, col: number, kind: UnitKind,
): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!isSpawnTile(state, side, lane, col)) return 'Train on your home column or a bunker tile';
  if (state.lanes[lane][col].units.length >= UNITS_PER_TILE) return 'Tile is full (2 units)';
  if (state.players[side].supply < UNITS[kind].cost) return 'Not enough supply';
  return null;
}

export function buildBunker(state: GameState, side: Side, lane: number, col: number, kind: BunkerKind) {
  const stats = BUNKERS[kind];
  state.players[side].supply -= stats.cost;
  state.lanes[lane][col].bunker = {
    id: state.nextId++, kind, owner: side, hp: stats.hp, maxHp: stats.hp, upgraded: false,
  };
  pushLog(state, `${SIDE[side]} built a ${stats.name} (L${lane + 1}).`);
}

export function upgradeBunker(state: GameState, side: Side, lane: number, col: number) {
  const bunker = state.lanes[lane][col].bunker!;
  const stats = BUNKERS[bunker.kind];
  state.players[side].supply -= stats.upgradeCost;
  bunker.upgraded = true;
  bunker.maxHp += stats.upgradeHp;
  bunker.hp += stats.upgradeHp;
  pushLog(state, `${SIDE[side]} upgraded a ${stats.name} (L${lane + 1}).`);
}

export function makeUnit(state: GameState, side: Side, kind: UnitKind): Unit {
  const hp = UNITS[kind].hp;
  return { id: state.nextId++, kind, owner: side, hp, maxHp: hp };
}

export function trainUnit(state: GameState, side: Side, lane: number, col: number, kind: UnitKind) {
  state.players[side].supply -= UNITS[kind].cost;
  state.lanes[lane][col].units.push(makeUnit(state, side, kind));
  pushLog(state, `${SIDE[side]} trained a ${UNITS[kind].name} (L${lane + 1}).`);
}
