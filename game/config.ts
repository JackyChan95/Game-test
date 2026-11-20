import type { BunkerKind, EventKind, Side, UnitKind } from './types';

export const LANES = 3;
export const COLS = 5;
/** If both bases still stand after this many rounds, tiles held decide the winner. */
export const MAX_ROUNDS = 20;
export const BASE_HP = 20;
export const SUPPLY_CAP = 15;
export const STARTING_SUPPLY = 4;
/** Bunkers can be built on empty tiles this many columns from your base (your home zone). */
export const HOME_ZONE = 2;

export interface BunkerStats {
  name: string;
  cost: number;
  hp: number;
  /** Damage range [min, max] per attack; null = does not attack. */
  damage: [number, number] | null;
  range: number;
  income: number;
  upgradeCost: number;
  upgradeHp: number;
  /** Added to both ends of the damage range. */
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
    name: 'Turret', cost: 4, hp: 10, damage: [2, 3], range: 2, income: 0,
    upgradeCost: 3, upgradeHp: 4, upgradeDamage: 1, upgradeIncome: 0, blurb: 'Fires 2 tiles down the lane.',
  },
  depot: {
    name: 'Depot', cost: 4, hp: 5, damage: null, range: 0, income: 1,
    upgradeCost: 3, upgradeHp: 3, upgradeDamage: 0, upgradeIncome: 1, blurb: '+1 supply each round.',
  },
};

export interface UnitStats {
  name: string;
  cost: number;
  hp: number;
  /** Damage range [min, max] per attack. */
  damage: [number, number];
  range: number;
  /** Subtracted from every hit this unit takes (minimum 1 damage). */
  armor: number;
  /** Attacks ignore the target's armor. */
  pierce: boolean;
  blurb: string;
}

export const UNITS: Record<UnitKind, UnitStats> = {
  grunt: { name: 'Grunt', cost: 3, hp: 6, damage: [2, 4], range: 1, armor: 0, pierce: false, blurb: 'Cheap melee.' },
  sniper: { name: 'Sniper', cost: 4, hp: 4, damage: [4, 5], range: 2, armor: 0, pierce: true, blurb: 'Ranged, fragile; shots ignore armor.' },
  brute: { name: 'Brute', cost: 7, hp: 15, damage: [5, 6], range: 1, armor: 1, pierce: false, blurb: 'Armored: every hit it takes is 1 lower.' },
};

export interface UnitUpgrade {
  name: string;
  cost: number;
  /** Added to max HP (existing units are healed by the same amount when researched). */
  hp: number;
  /** Added to both ends of the damage range. */
  damage: number;
  range: number;
  armor: number;
  blurb: string;
}

/** One-time research per unit type; applies to all of that side's units of the type. */
export const UNIT_UPGRADES: Record<UnitKind, UnitUpgrade> = {
  grunt: { name: 'Drill Training', cost: 3, hp: 3, damage: 1, range: 0, armor: 0, blurb: '+3 HP, +1 damage' },
  sniper: { name: 'Long Scopes', cost: 3, hp: 0, damage: 0, range: 1, armor: 0, blurb: '+1 range (3 tiles)' },
  brute: { name: 'Heavy Plating', cost: 4, hp: 0, damage: 0, range: 0, armor: 1, blurb: '+1 armor' },
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

