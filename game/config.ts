import type { BunkerKind, EventKind, Side, UnitKind } from './types';

export const LANES = 3;
export const COLS = 5;
export const MAX_ROUNDS = 10;
export const BASE_HP = 20;
export const SUPPLY_CAP = 15;
export const STARTING_SUPPLY = 4;
export const UNITS_PER_TILE = 2;

export interface BunkerStats {
  name: string;
  cost: number;
  hp: number;
  /** null = does not attack. */
  damage: number | null;
  range: number;
  income: number;
  upgradeCost: number;
  upgradeHp: number;
  upgradeDamage: number;
  /** Extra income granted by the upgrade (Depot only). */
  upgradeIncome: number;
  blurb: string;
}

export const BUNKERS: Record<BunkerKind, BunkerStats> = {
  wall: {
    name: 'Wall', cost: 2, hp: 14, damage: null, range: 0, income: 0,
    upgradeCost: 2, upgradeHp: 6, upgradeDamage: 0, upgradeIncome: 0, blurb: 'Cheap, tough, blocks the lane.',
  },
  turret: {
    name: 'Turret', cost: 4, hp: 8, damage: 0, range: 2, income: 0,
    upgradeCost: 3, upgradeHp: 4, upgradeDamage: 1, upgradeIncome: 0, blurb: 'Fires 2 tiles down the lane.',
  },
  depot: {
    name: 'Depot', cost: 6, hp: 5, damage: null, range: 0, income: 1,
    upgradeCost: 3, upgradeHp: 3, upgradeDamage: 0, upgradeIncome: 1, blurb: '+1 supply each round.',
  },
};

export interface UnitStats {
  name: string;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  blurb: string;
}

export const UNITS: Record<UnitKind, UnitStats> = {
  grunt: { name: 'Grunt', cost: 2, hp: 6, damage: 0, range: 1, blurb: 'Cheap melee.' },
  sniper: { name: 'Sniper', cost: 3, hp: 4, damage: 1, range: 2, blurb: 'Ranged, fragile.' },
  brute: { name: 'Brute', cost: 5, hp: 12, damage: 2, range: 1, blurb: 'Heavy hitter.' },
};

export const EVENTS: Record<EventKind, { name: string; text: string }> = {
  supplyDrop: { name: 'Supply Drop', text: 'Both sides gain +3 supply.' },
  blizzard: { name: 'Blizzard', text: 'Ranged attacks deal -1 this round.' },
  mercenary: { name: 'Mercenary Offer', text: 'Lower-supply side gets a free Brute.' },
  sabotage: { name: 'Sabotage', text: 'A random bunker takes 2 damage.' },
  calm: { name: 'Calm', text: 'Nothing happens.' },
};

export const EVENT_KINDS: EventKind[] = ['supplyDrop', 'blizzard', 'mercenary', 'sabotage', 'calm'];

/** Direction a side's units move along the lane. */
export const DIR: Record<Side, 1 | -1> = { player: 1, enemy: -1 };
/** Virtual column of each side's base. */
export const BASE_COL: Record<Side, number> = { player: -1, enemy: COLS };
/** Column where a side can always train units. */
export const HOME_COL: Record<Side, number> = { player: 0, enemy: COLS - 1 };

