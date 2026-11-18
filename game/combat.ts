/**
 * Clash phase: movement, then simultaneous attacks.
 *
 * Movement: each unit advances one tile toward the enemy base unless it already
 * has a target in range, the next tile holds an enemy (unit or bunker), or the
 * next tile already has 2 friendly units. Moving onto a tile claims it.
 *
 * Attacks: every unit and armed bunker picks the nearest enemy in its lane
 * within range (a bunker on a tile is hit before the units sheltering in it,
 * the base is hit when nothing closer is in range). Damage is rolled within the
 * attacker's range (e.g. 2–3), minimum 1. All damage is applied at once, then
 * the dead are removed.
 */
import { BASE_COL, BUNKERS, COLS, DIR, ESCALATION_ROUNDS, SIEGE_BONUS, UNITS, UNITS_PER_TILE } from './config';
import { other, pushLog } from './board';
import type { GameState, Side } from './types';
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
export function findTarget(
  state: GameState, side: Side, lane: number, col: number, range: number, dirs: number[],
): Target | null {
  const foe = other(side);
  for (let d = 1; d <= range; d++) {
    for (const dir of dirs) {
      const c = col + dir * d;
      if (c === BASE_COL[foe]) return { type: 'base', side: foe };
      if (c < 0 || c >= COLS) continue;
      const tile = state.lanes[lane][c];
      if (tile.bunker && tile.bunker.owner === foe) return { type: 'bunker', lane, col: c };
      const unit = tile.units.find((u) => u.owner === foe);
      if (unit) return { type: 'unit', lane, col: c, id: unit.id };
    }
  }
  return null;
}

export function moveUnits(state: GameState, first: Side) {
  for (const side of [first, other(first)]) {
    const dir = DIR[side];
    for (let lane = 0; lane < state.lanes.length; lane++) {
      // Front-most tiles first so units don't block their own column behind them.
      const cols = [...Array(COLS).keys()].sort((a, b) => (b - a) * dir);
      for (const col of cols) {
        const tile = state.lanes[lane][col];
        for (const unit of [...tile.units]) {
          if (unit.owner !== side) continue;
          if (findTarget(state, side, lane, col, UNITS[unit.kind].range, [dir])) continue;
          const next = col + dir;
          if (next < 0 || next >= COLS) continue;
          const dest = state.lanes[lane][next];
          if (dest.bunker && dest.bunker.owner !== side) continue;
          if (dest.units.some((u) => u.owner !== side)) continue;
          if (dest.units.length >= UNITS_PER_TILE) continue;
          tile.units = tile.units.filter((u) => u.id !== unit.id);
          dest.units.push(unit);
          dest.owner = side;
        }
      }
    }
  }
}

const NAME = (side: Side, name: string) => `${side === 'player' ? 'Your' : 'AI'} ${name}`;

/** Damage bonus every attack gets in this round from escalation. */
export const escalation = (round: number) => ESCALATION_ROUNDS.filter((r) => round >= r).length;

export function collectAttacks(state: GameState, rng: Rng, blizzard: boolean): Attack[] {
  const attacks: Attack[] = [];
  const esc = escalation(state.round);
  const add = (attacker: string, target: Target, [lo, hi]: [number, number], ranged: boolean) => {
    const min = lo + esc;
    const max = hi + esc;
    const modifier = blizzard && ranged ? -1 : 0;
    const damage = Math.max(1, rng.int(min, max) + modifier);
    attacks.push({ attacker, target, min, max, modifier, damage });
  };
  state.lanes.forEach((lane, l) =>
    lane.forEach((tile, c) => {
      const b = tile.bunker;
      if (b) {
        const s = BUNKERS[b.kind];
        if (s.damage !== null) {
          const target = findTarget(state, b.owner, l, c, s.range, [DIR[b.owner], -DIR[b.owner]]);
          const up = b.upgraded ? s.upgradeDamage : 0;
          const range: [number, number] = [s.damage[0] + up, s.damage[1] + up];
          if (target) add(`${NAME(b.owner, s.name)} (L${l + 1})`, target, range, s.range >= 2);
        }
      }
      for (const u of tile.units) {
        const s = UNITS[u.kind];
        const target = findTarget(state, u.owner, l, c, s.range, [DIR[u.owner]]);
        const siege = target && target.type !== 'unit' ? SIEGE_BONUS : 0;
        const range: [number, number] = [s.damage[0] + siege, s.damage[1] + siege];
        if (target) add(`${NAME(u.owner, s.name)} (L${l + 1})`, target, range, s.range >= 2);
      }
    }),
  );
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
    const penalty = a.modifier ? `, ${a.modifier} blizzard` : '';
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
}

/** Called after each stage of the clash so the UI can animate it. */
export type ClashObserver = (stage: 'move' | 'attack', attacks: Attack[]) => void;

/** Full clash: move, then fight. Mutates state. */
export function resolveClash(state: GameState, rng: Rng, observe?: ClashObserver) {
  pushLog(state, `— Clash, round ${state.round} —`);
  // Alternate who moves first so neither side has a permanent edge.
  const first: Side = state.round % 2 === 1 ? 'player' : 'enemy';
  moveUnits(state, first);
  observe?.('move', []);
  const attacks = collectAttacks(state, rng, state.event === 'blizzard');
  if (attacks.length === 0) pushLog(state, 'No contact this round.');
  applyDamage(state, attacks);
  observe?.('attack', attacks);
  removeDestroyed(state);
}
