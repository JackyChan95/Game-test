/**
 * Clash phase: attacks first, then movement.
 *
 * Attacks: every unit and armed bunker picks an enemy in its lane within
 * range, by priority: an enemy melee unit in melee range, then buildings, then
 * melee units, then ranged units, then the base (ties go to the nearest).
 * Units on their own building's tile are sheltered until it falls.
 * A unit's range is measured from the front of its own column, so units
 * queued behind friendly units still reach the enemy front. Damage is rolled within the attacker's range,
 * minimum 1. Attacks never overkill: once enough damage is assigned to destroy
 * a target, further attackers pick the next enemy. All damage lands at once
 * (a unit destroyed this round still gets its attack), then the destroyed are
 * removed.
 *
 * Healing: after the destroyed are removed, every Medic heals the most wounded
 * friendly unit within 1 tile.
 *
 * Movement: each unit then advances (Scouts 2 tiles) toward the enemy base unless it
 * has a target in range or the next tile holds an enemy (unit or bunker).
 * There is no limit on units per tile. Tile control follows the front line
 * (see syncOwners).
 */
import { BASE_COL, BASE_GUN_DAMAGE, BUNKERS, COLS, DIR, UNITS } from './config';
import { other, pushLog, syncOwners } from './board';
import { unitStats } from './build';
import type { GameState, Side, Unit } from './types';
import type { Rng } from './rng';

export type Target =
  | { type: 'unit'; lane: number; col: number; id: number }
  | { type: 'bunker'; lane: number; col: number }
  | { type: 'base'; side: Side };

export interface Attack {
  attacker: string;
  target: Target;
  /** The attacker's damage range for this attack, before any event penalty. */
  min: number;
  max: number;
  /** Event penalty applied to the roll (e.g. -1 in a blizzard). */
  modifier: number;
  damage: number;
}

/**
 * Nearest enemy of `side` in `lane` within `range` of `col`.
 * `dirs` = which directions to search (units look forward only, bunkers both ways).
 */
/**
 * Target priority, lowest first: an enemy melee unit in melee range, then
 * buildings, then melee units, then ranged units, then the base. Ties go to the
 * nearest. Units on the same tile as their own building are sheltered: they
 * can't be targeted until that building has taken enough damage to fall.
 * `alive` lets the caller skip targets that are already doomed.
 */
export function findTarget(
  state: GameState, side: Side, lane: number, col: number, range: number, dirs: number[],
  alive: (t: Target) => boolean = () => true,
  structuresFirst = false,
): Target | null {
  const foe = other(side);
  // Sappers go for buildings, then the base, before any unit.
  const R = structuresFirst
    ? { bunker: 0, base: 1, meleeClose: 2, melee: 2, back: 3 }
    : { bunker: 1, base: 4, meleeClose: 0, melee: 2, back: 3 };
  const options: { t: Target; rank: number; dist: number }[] = [];
  // d = 0 is the attacker's own tile: enemies can share it on a contested home column.
  for (let d = 0; d <= range; d++) {
    for (const dir of d === 0 ? [dirs[0]] : dirs) {
      const c = col + dir * d;
      if (c === BASE_COL[foe]) options.push({ t: { type: 'base', side: foe }, rank: R.base, dist: d });
      if (c < 0 || c >= COLS) continue;
      const tile = state.lanes[lane][c];
      let sheltered = false;
      if (tile.bunker && tile.bunker.owner === foe) {
        const t: Target = { type: 'bunker', lane, col: c };
        options.push({ t, rank: R.bunker, dist: d });
        // Units on a building's tile can't be hit until the building is (about to be) destroyed.
        sheltered = alive(t);
      }
      for (const u of tile.units) {
        if (u.owner !== foe || sheltered) continue;
        const melee = UNITS[u.kind].role === 'melee';
        const rank = melee ? (d <= 1 ? R.meleeClose : R.melee) : R.back;
        options.push({ t: { type: 'unit', lane, col: c, id: u.id }, rank, dist: d });
      }
    }
  }
  options.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
  return options.find((o) => alive(o.t))?.t ?? null;
}

/**
 * Column a unit's range is measured from: the front of the unbroken column of
 * friendly units it stands in, so the back ranks of an army can still fight.
 */
export function reachFrom(state: GameState, side: Side, lane: number, col: number): number {
  const dir = DIR[side];
  let front = col;
  while (front + dir >= 0 && front + dir < COLS) {
    const units = state.lanes[lane][front + dir].units;
    if (units.length === 0 || units.some((u) => u.owner !== side)) break;
    front += dir;
  }
  return front;
}

export function moveUnits(state: GameState, first: Side) {
  for (const side of [first, other(first)]) {
    const dir = DIR[side];
    for (let lane = 0; lane < state.lanes.length; lane++) {
      // Front-most units first.
      const movers: { unit: Unit; col: number }[] = [];
      state.lanes[lane].forEach((tile, col) =>
        tile.units.forEach((unit) => unit.owner === side && movers.push({ unit, col })),
      );
      movers.sort((a, b) => (b.col - a.col) * dir);
      for (const m of movers) {
        const s = unitStats(state, side, m.unit.kind);
        for (let step = 0; step < s.speed; step++) {
          if (findTarget(state, side, lane, m.col, s.range, [dir])) break;
          const next = m.col + dir;
          if (next < 0 || next >= COLS) break;
          const dest = state.lanes[lane][next];
          if (dest.bunker && dest.bunker.owner !== side) break;
          if (dest.units.some((u) => u.owner !== side)) break;
          const from = state.lanes[lane][m.col];
          from.units = from.units.filter((u) => u.id !== m.unit.id);
          dest.units.push(m.unit);
          m.col = next;
        }
      }
    }
  }
  syncOwners(state);
}

/** A Medic's heal, for the log and the turn animation. */
export interface Heal {
  unitId: number;
  lane: number;
  col: number;
  amount: number;
}

/**
 * Every Medic heals each wounded friendly unit on its own tile (itself
 * included), up to their max HP. Several Medics on one tile stack.
 */
export function applyHeals(state: GameState): Heal[] {
  const heals: Heal[] = [];
  state.lanes.forEach((lane, l) =>
    lane.forEach((tile, c) => {
      for (const medic of tile.units) {
        const amount = unitStats(state, medic.owner, medic.kind).heal;
        if (amount <= 0) continue;
        let total = 0;
        for (const u of tile.units) {
          if (u.owner !== medic.owner || u.hp >= u.maxHp) continue;
          const healed = Math.min(amount, u.maxHp - u.hp);
          u.hp += healed;
          total += healed;
          const prev = heals.find((h) => h.unitId === u.id);
          if (prev) prev.amount += healed;
          else heals.push({ unitId: u.id, lane: l, col: c, amount: healed });
        }
        if (total > 0) pushLog(state, `${NAME(medic.owner, 'Medic')} (L${l + 1}) healed ${total} HP.`);
      }
    }),
  );
  return heals;
}

const NAME = (side: Side, name: string) => `${side === 'player' ? 'Your' : 'AI'} ${name}`;

export function collectAttacks(state: GameState, rng: Rng, blizzard: boolean): Attack[] {
  const attacks: Attack[] = [];

  // Damage already assigned this round, so later attackers skip doomed targets.
  const pending = new Map<string, number>();
  const key = (t: Target) =>
    t.type === 'base' ? `base-${t.side}` : t.type === 'unit' ? `unit-${t.id}` : `bunker-${t.lane}-${t.col}`;
  const hpOf = (t: Target): number => {
    if (t.type === 'base') return Infinity; // always worth hitting
    const tile = state.lanes[t.lane][t.col];
    if (t.type === 'bunker') return tile.bunker?.hp ?? 0;
    return tile.units.find((u) => u.id === t.id)?.hp ?? 0;
  };
  const alive = (t: Target) => hpOf(t) - (pending.get(key(t)) ?? 0) > 0;

  const add = (
    attacker: string, target: Target, [lo, hi]: [number, number], ranged: boolean, pierce = false,
    vsStructures = 0,
  ) => {
    const bonus = target.type === 'unit' ? 0 : vsStructures;
    const min = lo + bonus;
    const max = hi + bonus;
    let modifier = blizzard && ranged ? -1 : 0;
    if (target.type === 'unit' && !pierce) {
      const u = state.lanes[target.lane][target.col].units.find((x) => x.id === target.id);
      if (u) modifier -= unitStats(state, u.owner, u.kind).armor;
    }
    const damage = Math.max(1, rng.int(min, max) + modifier);
    attacks.push({ attacker, target, min, max, modifier, damage });
    pending.set(key(target), (pending.get(key(target)) ?? 0) + damage);
  };

  state.lanes.forEach((lane, l) =>
    lane.forEach((tile, c) => {
      const b = tile.bunker;
      if (b) {
        const s = BUNKERS[b.kind];
        if (s.damage !== null) {
          const target = findTarget(state, b.owner, l, c, s.range, [DIR[b.owner], -DIR[b.owner]], alive);
          const up = b.upgraded ? s.upgradeDamage : 0;
          if (target) add(`${NAME(b.owner, s.name)} (L${l + 1})`, target, [s.damage[0] + up, s.damage[1] + up], s.range >= 2);
        }
      }
      for (const u of tile.units) {
        const s = unitStats(state, u.owner, u.kind);
        if (s.damage[1] <= 0) continue; // Medics don't attack
        const from = reachFrom(state, u.owner, l, c);
        const target = findTarget(state, u.owner, l, from, s.range, [DIR[u.owner]], alive, s.vsStructures > 0);
        if (target) {
          add(`${NAME(u.owner, UNITS[u.kind].name)} (L${l + 1})`, target, s.damage, s.range >= 2, UNITS[u.kind].pierce, s.vsStructures);
        }
      }
    }),
  );
  // Base guns: each base fires at the enemy on the tile in front of it, in every lane.
  for (const side of ['player', 'enemy'] as Side[]) {
    state.lanes.forEach((_, l) => {
      const target = findTarget(state, side, l, BASE_COL[side], 1, [DIR[side]], alive);
      if (target) add(`${side === 'player' ? 'Your' : 'AI'} base guns (L${l + 1})`, target, BASE_GUN_DAMAGE, false);
    });
  }
  return attacks;
}

function describe(state: GameState, t: Target): string {
  if (t.type === 'base') return t.side === 'player' ? 'your base' : 'AI base';
  const tile = state.lanes[t.lane][t.col];
  if (t.type === 'bunker') return tile.bunker ? NAME(tile.bunker.owner, BUNKERS[tile.bunker.kind].name) : 'bunker';
  const u = tile.units.find((x) => x.id === t.id);
  return u ? NAME(u.owner, UNITS[u.kind].name) : 'unit';
}

/** Apply attacks simultaneously, then remove anything at 0 HP. */
export function applyAttacks(state: GameState, attacks: Attack[]) {
  applyDamage(state, attacks);
  removeDestroyed(state);
}

/** Subtract damage from every target. Pieces at 0 HP stay on the board until removeDestroyed. */
export function applyDamage(state: GameState, attacks: Attack[]) {
  for (const a of attacks) {
    const t = a.target;
    const penalty = a.modifier ? `, ${a.modifier}` : '';
    pushLog(state, `${a.attacker} → ${describe(state, t)}: ${a.damage} (${a.min}–${a.max}${penalty})`);
    if (t.type === 'base') state.players[t.side].baseHp -= a.damage;
    else if (t.type === 'bunker') {
      const b = state.lanes[t.lane][t.col].bunker;
      if (b) b.hp -= a.damage;
    } else {
      const u = state.lanes[t.lane][t.col].units.find((x) => x.id === t.id);
      if (u) u.hp -= a.damage;
    }
  }
}

/** Remove units and bunkers at 0 HP, and clamp base HP at 0. */
export function removeDestroyed(state: GameState) {
  state.lanes.forEach((lane, l) =>
    lane.forEach((tile) => {
      for (const u of tile.units) {
        if (u.hp <= 0) pushLog(state, `${NAME(u.owner, UNITS[u.kind].name)} (L${l + 1}) is down.`);
      }
      tile.units = tile.units.filter((u) => u.hp > 0);
      if (tile.bunker && tile.bunker.hp <= 0) {
        pushLog(state, `${NAME(tile.bunker.owner, BUNKERS[tile.bunker.kind].name)} (L${l + 1}) destroyed.`);
        tile.bunker = null;
      }
    }),
  );
  for (const side of ['player', 'enemy'] as Side[]) {
    state.players[side].baseHp = Math.max(0, state.players[side].baseHp);
  }
  syncOwners(state);
}

/** Called after each stage of the clash so the UI can animate it. */
export type ClashObserver = (stage: 'move' | 'attack', attacks: Attack[], heals: Heal[]) => void;

/** Full clash: fight, then move. Mutates state. */
export function resolveClash(state: GameState, rng: Rng, observe?: ClashObserver) {
  pushLog(state, `— Clash, round ${state.round} —`);
  const attacks = collectAttacks(state, rng, state.event === 'blizzard');
  if (attacks.length === 0) pushLog(state, 'No contact this round.');
  applyDamage(state, attacks);
  observe?.('attack', attacks, []);
  removeDestroyed(state);
  const heals = applyHeals(state);
  // Alternate who moves first so neither side always claims contested tiles.
  const first: Side = state.round % 2 === 1 ? 'player' : 'enemy';
  moveUnits(state, first);
  observe?.('move', [], heals);
}
