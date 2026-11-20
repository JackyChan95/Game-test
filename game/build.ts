/**
 * Build-phase rules: validation and (mutating) application of build actions.
 * Callers should pass a cloned state; the engine does this for you.
 */
import { BASE_COL, BUNKERS, HOME_COL, HOME_ZONE, UNIT_UPGRADES, UNITS } from './config';
import { inBounds, other, pushLog, SIDE, syncOwners } from './board';
import type { BunkerKind, GameState, Side, Unit, UnitKind } from './types';

/** Returns a reason string if not allowed, or null if the build is legal. */
export function canBuildBunker(
  state: GameState, side: Side, lane: number, col: number, kind: BunkerKind,
): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!inBounds(lane, col)) return 'Off the map';
  const tile = state.lanes[lane][col];
  if (tile.bunker) return 'Tile already has a bunker';
  if (tile.owner && tile.owner !== side) return 'The AI holds this tile';
  if (tile.owner !== side && !inHomeZone(side, col)) return 'Build in your first two columns or behind your front line';
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

/** Your first HOME_ZONE columns, where you may build on empty tiles. */
export const inHomeZone = (side: Side, col: number) => Math.abs(col - BASE_COL[side]) <= HOME_ZONE;

/** Units can be trained on your home column, or on any tile with your bunker, if no enemy is there. */
export function isSpawnTile(state: GameState, side: Side, lane: number, col: number): boolean {
  if (!inBounds(lane, col)) return false;
  const tile = state.lanes[lane][col];
  if (tile.owner === other(side)) return false;
  return col === HOME_COL[side] || tile.bunker?.owner === side;
}

export function canTrainUnit(
  state: GameState, side: Side, lane: number, col: number, kind: UnitKind,
): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!isSpawnTile(state, side, lane, col)) return 'Train on your home column or a bunker tile';
  if (state.players[side].supply < UNITS[kind].cost) return 'Not enough supply';
  return null;
}

export function buildBunker(state: GameState, side: Side, lane: number, col: number, kind: BunkerKind) {
  const stats = BUNKERS[kind];
  state.players[side].supply -= stats.cost;
  state.lanes[lane][col].bunker = {
    id: state.nextId++, kind, owner: side, hp: stats.hp, maxHp: stats.hp, upgraded: false,
  };
  syncOwners(state);
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

/** A side's effective stats for a unit type, including its researched upgrade. */
export function unitStats(state: GameState, side: Side, kind: UnitKind) {
  const base = UNITS[kind];
  const up = state.players[side].upgrades[kind] ? UNIT_UPGRADES[kind] : null;
  return {
    hp: base.hp + (up?.hp ?? 0),
    damage: [base.damage[0] + (up?.damage ?? 0), base.damage[1] + (up?.damage ?? 0)] as [number, number],
    range: base.range + (up?.range ?? 0),
    armor: base.armor + (up?.armor ?? 0),
  };
}

export function canUpgradeUnit(state: GameState, side: Side, kind: UnitKind): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (state.players[side].upgrades[kind]) return 'Researched';
  if (state.players[side].supply < UNIT_UPGRADES[kind].cost) return 'Not enough supply';
  return null;
}

/** Research a unit upgrade. Existing units of that type gain the extra HP too. */
export function upgradeUnit(state: GameState, side: Side, kind: UnitKind) {
  const up = UNIT_UPGRADES[kind];
  state.players[side].supply -= up.cost;
  state.players[side].upgrades[kind] = true;
  for (const lane of state.lanes) {
    for (const tile of lane) {
      for (const u of tile.units) {
        if (u.owner === side && u.kind === kind) {
          u.maxHp += up.hp;
          u.hp += up.hp;
        }
      }
    }
  }
  pushLog(state, `${SIDE[side]} researched ${up.name} (${UNITS[kind].name}s: ${up.blurb}).`);
}

export function makeUnit(state: GameState, side: Side, kind: UnitKind): Unit {
  const hp = unitStats(state, side, kind).hp;
  return { id: state.nextId++, kind, owner: side, hp, maxHp: hp };
}

export function trainUnit(state: GameState, side: Side, lane: number, col: number, kind: UnitKind) {
  state.players[side].supply -= UNITS[kind].cost;
  state.lanes[lane][col].units.push(makeUnit(state, side, kind));
  syncOwners(state);
  pushLog(state, `${SIDE[side]} trained a ${UNITS[kind].name} (L${lane + 1}).`);
}
