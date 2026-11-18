import { COLS, LANES, SUPPLY_CAP } from './config';
import type { GameState, Side, Tile, Unit, Bunker } from './types';

export const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

/** Cheap deep clone; game state is plain JSON. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const inBounds = (lane: number, col: number) =>
  lane >= 0 && lane < LANES && col >= 0 && col < COLS;

export const tileAt = (state: GameState, lane: number, col: number): Tile => state.lanes[lane][col];

export const addSupply = (state: GameState, side: Side, amount: number) => {
  const p = state.players[side];
  p.supply = Math.min(SUPPLY_CAP, p.supply + amount);
};

export function countTiles(state: GameState, side: Side): number {
  let n = 0;
  for (const lane of state.lanes) for (const tile of lane) if (tile.owner === side) n++;
  return n;
}

export function allBunkers(state: GameState): { lane: number; col: number; bunker: Bunker }[] {
  const out: { lane: number; col: number; bunker: Bunker }[] = [];
  state.lanes.forEach((lane, l) =>
    lane.forEach((tile, c) => tile.bunker && out.push({ lane: l, col: c, bunker: tile.bunker })),
  );
  return out;
}

export function allUnits(state: GameState): { lane: number; col: number; unit: Unit }[] {
  const out: { lane: number; col: number; unit: Unit }[] = [];
  state.lanes.forEach((lane, l) =>
    lane.forEach((tile, c) => tile.units.forEach((unit) => out.push({ lane: l, col: c, unit }))),
  );
  return out;
}

/** Side currently physically present on a tile (units or bunker), if any. */
export function presence(tile: Tile): Side | null {
  if (tile.units.length > 0) return tile.units[0].owner;
  if (tile.bunker) return tile.bunker.owner;
  return null;
}

/** A tile belongs to whoever has units or a bunker on it; an empty tile is neutral. */
export function syncOwners(state: GameState) {
  for (const lane of state.lanes) for (const tile of lane) tile.owner = presence(tile);
}

export function pushLog(state: GameState, line: string) {
  state.log.push(line);
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
}

export const SIDE: Record<Side, string> = { player: 'You', enemy: 'AI' };
