/**
 * Build-phase rules: validation and (mutating) application of build actions.
 * Callers should pass a cloned state; the engine does this for you.
 */
import { BARRAGE, BASE_COL, BUNKERS, HOME_COL, HOME_ZONE, UNIT_UPGRADES, UNITS, type UpgradeStat } from './config';
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
  const up = state.players[side].upgrades[kind] ? UNIT_UPGRADES[kind] : {};
  const add = (k: UpgradeStat) => (up as Partial<Record<UpgradeStat, number>>)[k] ?? 0;
  const attacks = base.damage[1] > 0;
  return {
    hp: base.hp + add('hp'),
    damage: attacks
      ? ([base.damage[0] + add('damage'), base.damage[1] + add('damage')] as [number, number])
      : ([0, 0] as [number, number]),
    range: base.range + add('range'),
    armor: base.armor + add('armor'),
    speed: base.speed + add('speed'),
    vsStructures: base.vsStructures + add('vsStructures'),
    heal: base.heal + add('heal'),
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
  const extraHp = up.hp ?? 0;
  for (const lane of state.lanes) {
    for (const tile of lane) {
      for (const u of tile.units) {
        if (u.owner === side && u.kind === kind) {
          u.maxHp += extraHp;
          u.hp += extraHp;
        }
      }
    }
  }
  pushLog(state, `${SIDE[side]} researched ${up.name} (${UNITS[kind].name}s: ${up.blurb}).`);
}

/** Barrage: only on the tile in front of your own base, while the enemy holds it. */
export function canBarrage(state: GameState, side: Side, lane: number): string | null {
  if (state.phase !== 'build') return 'Not in build phase';
  if (!inBounds(lane, 0)) return 'Off the map';
  const tile = state.lanes[lane][HOME_COL[side]];
  const foe = other(side);
  if (!tile.units.some((u) => u.owner === foe) && tile.bunker?.owner !== foe) {
    return 'Only when the enemy is on the tile in front of your base';
  }
  if (state.players[side].barraged.includes(lane)) return 'Already used in this lane this round';
  if (state.players[side].supply < BARRAGE.cost) return 'Not enough supply';
  return null;
}

/** Hit every enemy unit and building on the tile in front of the base. Ignores shelter. */
export function barrage(state: GameState, side: Side, lane: number) {
  const tile = state.lanes[lane][HOME_COL[side]];
  const foe = other(side);
  state.players[side].supply -= BARRAGE.cost;
  state.players[side].barraged.push(lane);
  let hit = 0;
  for (const u of tile.units) {
    if (u.owner === foe) {
      u.hp -= BARRAGE.damage;
      hit++;
    }
  }
  if (tile.bunker?.owner === foe) {
    tile.bunker.hp -= BARRAGE.damage;
    hit++;
  }
  const lost = tile.units.filter((u) => u.owner === foe && u.hp <= 0).length;
  tile.units = tile.units.filter((u) => u.hp > 0);
  if (tile.bunker && tile.bunker.hp <= 0) tile.bunker = null;
  syncOwners(state);
  pushLog(state, `${SIDE[side]} called a barrage (L${lane + 1}): ${hit} hit for ${BARRAGE.damage}, ${lost} destroyed.`);
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
