export type Side = 'player' | 'enemy';
export type BunkerKind = 'wall' | 'turret' | 'depot';
export type UnitKind = 'grunt' | 'sniper' | 'brute';
export type EventKind = 'supplyDrop' | 'blizzard' | 'mercenary' | 'sabotage' | 'calm';

export interface Bunker {
  id: number;
  kind: BunkerKind;
  owner: Side;
  hp: number;
  maxHp: number;
  upgraded: boolean;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  owner: Side;
  hp: number;
  maxHp: number;
}

export interface Tile {
  /** Who controls this tile; persists until the other side moves in or builds. */
  owner: Side | null;
  bunker: Bunker | null;
  units: Unit[];
}

export interface PlayerState {
  supply: number;
  baseHp: number;
}

export interface DiceRoll {
  label: string;
  dice: number[];
  bonus: number;
  total: number;
}

/** A damage number to show during the turn animation. */
export interface Hit {
  /** Unit id, or null for a bunker or base hit. */
  unitId: number | null;
  lane: number | null;
  col: number | null;
  /** Set for base hits. */
  base: Side | null;
  damage: number;
}

/** Board snapshot after one stage of the end-of-turn sequence. */
export interface TurnFrame {
  stage: 'aiBuild' | 'move' | 'attack';
  /** The round being resolved. */
  round: number;
  lanes: Tile[][];
  players: Record<Side, PlayerState>;
  /** Damage dealt in this stage, summed per target. */
  hits: Hit[];
}

export type Phase = 'build' | 'gameOver';

export interface GameResult {
  winner: Side | 'draw';
  reason: string;
}

export interface GameState {
  seed: string;
  rngState: number;
  round: number;
  phase: Phase;
  /** lanes[lane][col]; col 0 is next to the player base, col 4 next to the enemy base. */
  lanes: Tile[][];
  players: Record<Side, PlayerState>;
  event: EventKind;
  /** Income dice rolled at the start of this round, for the UI to animate. */
  rolls: DiceRoll[];
  /** Newest entries last. */
  log: string[];
  nextId: number;
  result: GameResult | null;
  /** Snapshots of the last end-of-turn sequence, for the UI to replay. Empty otherwise. */
  replay: TurnFrame[];
}

export type Action =
  | { type: 'buildBunker'; lane: number; col: number; kind: BunkerKind }
  | { type: 'upgradeBunker'; lane: number; col: number }
  | { type: 'trainUnit'; lane: number; col: number; kind: UnitKind }
  | { type: 'endTurn' };
