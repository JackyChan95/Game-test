import type { BunkerKind, EventKind, Side, UnitKind } from './types';

export const LANES = 3;
export const COLS = 5;
/** If both bases still stand after this many rounds, tiles held decide the winner. */
export const MAX_ROUNDS = 20;
export const BASE_HP = 25;
export const STARTING_SUPPLY = 4;
/** Income each round: a fixed base plus one die roll shared by both sides (6–9 supply). */
export const INCOME = { base: 5, die: 4 };
/** Each base fires every round at the enemy on the tile in front of it, in every lane. */
export const BASE_GUN_DAMAGE: [number, number] = [2, 3];
/** Barrage: hits every enemy unit and building on the tile in front of your base. Once per lane per round. */
export const BARRAGE = { cost: 4, damage: 3 };
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

/** How a unit fights; decides how enemies prioritise it as a target. */
export type UnitRole = 'melee' | 'ranged' | 'support';

export interface UnitStats {
  name: string;
  cost: number;
  hp: number;
  /** Damage range [min, max] per attack; [0, 0] means the unit does not attack. */
  damage: [number, number];
  range: number;
  role: UnitRole;
  /** Subtracted from every hit this unit takes (minimum 1 damage). */
  armor: number;
  /** Attacks ignore the target's armor. */
  pierce: boolean;
  /** Tiles moved per round. */
  speed: number;
  /** Extra damage against bunkers and bases. Units with this go for buildings first. */
  vsStructures: number;
  /** HP restored each round to every wounded friendly unit on the same tile. */
  heal: number;
  blurb: string;
}

const unit = (u: Pick<UnitStats, 'name' | 'cost' | 'hp' | 'damage' | 'range' | 'role' | 'blurb'> & Partial<UnitStats>): UnitStats => ({
  armor: 0, pierce: false, speed: 1, vsStructures: 0, heal: 0, ...u,
});

export const UNITS: Record<UnitKind, UnitStats> = {
  grunt: unit({ name: 'Grunt', cost: 3, hp: 6, damage: [2, 4], range: 1, role: 'melee', blurb: 'Cheap melee.' }),
  sniper: unit({ name: 'Sniper', cost: 4, hp: 4, damage: [4, 5], range: 2, role: 'ranged', pierce: true, blurb: 'Ranged, fragile; shots ignore armor.' }),
  brute: unit({ name: 'Brute', cost: 7, hp: 15, damage: [5, 6], range: 1, role: 'melee', armor: 1, blurb: 'Armored: every hit it takes is 1 lower.' }),
  scout: unit({ name: 'Scout', cost: 2, hp: 4, damage: [1, 2], range: 1, role: 'melee', speed: 2, blurb: 'Fast: moves 2 tiles a round.' }),
  sapper: unit({ name: 'Sapper', cost: 4, hp: 8, damage: [2, 3], range: 1, role: 'melee', vsStructures: 5, blurb: 'Goes for buildings and bases first, +5 damage to them.' }),
  medic: unit({ name: 'Medic', cost: 3, hp: 6, damage: [0, 0], range: 1, role: 'support', heal: 3, blurb: 'No attack; heals every ally on its tile 3 HP a round.' }),
};

/** Stats an upgrade can add to; each is added on top of the unit's base value. */
export type UpgradeStat = 'hp' | 'damage' | 'range' | 'armor' | 'speed' | 'vsStructures' | 'heal';

export type UnitUpgrade = { name: string; cost: number; blurb: string } & Partial<Record<UpgradeStat, number>>;

/** One-time research per unit type; applies to all of that side's units of the type. */
export const UNIT_UPGRADES: Record<UnitKind, UnitUpgrade> = {
  grunt: { name: 'Drill Training', cost: 3, hp: 3, damage: 1, blurb: '+3 HP, +1 damage' },
  sniper: { name: 'Long Scopes', cost: 3, range: 1, blurb: '+1 range (3 tiles)' },
  brute: { name: 'Heavy Plating', cost: 4, armor: 1, blurb: '+1 armor' },
  scout: { name: 'Sprint', cost: 3, speed: 1, blurb: 'Moves 3 tiles a round' },
  sapper: { name: 'Shaped Charges', cost: 4, vsStructures: 2, blurb: '+2 more damage to buildings and bases' },
  medic: { name: 'Field Surgery', cost: 3, heal: 1, blurb: 'Heals 1 more' },
};

/** Order unit types are listed in menus and stacks. */
export const UNIT_KINDS: UnitKind[] = ['grunt', 'sniper', 'brute', 'scout', 'sapper', 'medic'];

export const EVENTS: Record<EventKind, { name: string; text: string }> = {
  supplyDrop: { name: 'Supply Drop', text: 'Both sides gain +3 supply.' },
  blizzard: { name: 'Blizzard', text: 'Ranged attacks deal -1 this round.' },
  mercenary: { name: 'Mercenary Offer', text: 'The side with the weaker army gets a free unit.' },
  sabotage: { name: 'Sabotage', text: 'A random bunker takes 2 damage.' },
  calm: { name: 'Calm', text: 'Nothing happens.' },
};

/** From this round on, Mercenary Offer gives a Brute instead of a Grunt. */
export const MERCENARY_BRUTE_ROUND = 8;

export const EVENT_KINDS: EventKind[] = ['supplyDrop', 'blizzard', 'mercenary', 'sabotage', 'calm'];

/** Direction a side's units move along the lane. */
export const DIR: Record<Side, 1 | -1> = { player: 1, enemy: -1 };
/** Virtual column of each side's base. */
export const BASE_COL: Record<Side, number> = { player: -1, enemy: COLS };
/** Column where a side can always train units. */
export const HOME_COL: Record<Side, number> = { player: 0, enemy: COLS - 1 };

