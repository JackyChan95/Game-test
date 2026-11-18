import { BUNKERS, EVENTS, EVENT_KINDS, HOME_COL } from './config';
import { addSupply, allBunkers, pushLog, SIDE, syncOwners } from './board';
import { isSpawnTile, makeUnit } from './build';
import type { EventKind, GameState, Side, UnitKind } from './types';
import type { Rng } from './rng';

export function drawEvent(rng: Rng): EventKind {
  return rng.pick(EVENT_KINDS);
}

/**
 * Place a free unit for `side`: home column first (lane with fewest units),
 * then any friendly bunker tile. Returns false if every spawn tile is blocked.
 */
export function placeFreeUnit(state: GameState, side: Side, kind: UnitKind): boolean {
  const candidates: { lane: number; col: number }[] = [];
  for (let lane = 0; lane < state.lanes.length; lane++) {
    if (isSpawnTile(state, side, lane, HOME_COL[side])) candidates.push({ lane, col: HOME_COL[side] });
  }
  for (let lane = 0; lane < state.lanes.length; lane++) {
    for (let col = 0; col < state.lanes[lane].length; col++) {
      if (col !== HOME_COL[side] && isSpawnTile(state, side, lane, col)) candidates.push({ lane, col });
    }
  }
  const open = candidates;
  if (open.length === 0) return false;
  open.sort((a, b) => state.lanes[a.lane][a.col].units.length - state.lanes[b.lane][b.col].units.length);
  const { lane, col } = open[0];
  state.lanes[lane][col].units.push(makeUnit(state, side, kind));
  state.lanes[lane][col].owner = side;
  return true;
}

/** Apply the immediate effect of the round's event. Mutates state. */
export function applyEvent(state: GameState, event: EventKind, rng: Rng) {
  pushLog(state, `Event: ${EVENTS[event].name}. ${EVENTS[event].text}`);
  switch (event) {
    case 'supplyDrop':
      addSupply(state, 'player', 3);
      addSupply(state, 'enemy', 3);
      break;
    case 'mercenary': {
      const { player, enemy } = state.players;
      if (player.supply === enemy.supply) {
        pushLog(state, 'Supply is tied; the mercenary walks away.');
        break;
      }
      const side: Side = player.supply < enemy.supply ? 'player' : 'enemy';
      if (placeFreeUnit(state, side, 'brute')) pushLog(state, `${SIDE[side]} hired a free Brute.`);
      else pushLog(state, `${SIDE[side]} had no room for the Brute.`);
      break;
    }
    case 'sabotage': {
      const bunkers = allBunkers(state);
      if (bunkers.length === 0) {
        pushLog(state, 'No bunkers to sabotage.');
        break;
      }
      const { lane, col, bunker } = rng.pick(bunkers);
      bunker.hp -= 2;
      const owner = `${bunker.owner === 'player' ? 'Your' : "AI's"} ${BUNKERS[bunker.kind].name}`;
      if (bunker.hp <= 0) {
        state.lanes[lane][col].bunker = null;
        syncOwners(state);
        pushLog(state, `${owner} (L${lane + 1}) was destroyed by sabotage.`);
      } else {
        pushLog(state, `${owner} (L${lane + 1}) took 2 damage.`);
      }
      break;
    }
    case 'blizzard':
    case 'calm':
      break;
  }
}
