# Bunker Lanes

A short, turn-based lane strategy game for one player against a simple AI.
Built with Expo (SDK 58), React Native and TypeScript.

## Run it

```bash
npm install
npx expo start        # then scan the QR code with Expo Go, or press a / i / w
npm test              # unit tests for the game logic
npm run typecheck
```

## Rules

**Map.** 3 lanes × 5 tiles. Your base is on the left, the AI's on the right, and each base has 25 HP.
A tile holds at most one bunker and any number of units. Tile control follows the front line: in each
lane, every tile from your base up to your furthest unit or bunker is yours, and the same for the AI
from its side. Tiles between the two fronts are neutral, so when the front units on both sides fall,
that ground goes back to neutral. Every tile starts neutral.

**Each round:**

1. **Income.** Each side rolls 2d6 and adds +1 for each Depot (+2 if the Depot is upgraded). Unspent supply carries over, capped at 15.
2. **Event.** One random event is drawn (see below).
3. **Build.** You build, upgrade and train. Then the AI does the same.
4. **Clash: attack, then move.**
   - *Attacks.* Every unit and Turret picks one enemy in its lane within range, in this order:
     an enemy melee unit in melee range (adjacent), then buildings, then melee units, then ranged
     units, then the base. Ties go to the nearest. Units on the same tile as their own building are
     sheltered: they can't be hit until the building is destroyed (damage beyond what's needed to destroy
     it spills onto them that round). A unit's range is measured from the front of its
     own column, so units queued behind friendly units still reach the enemy front. Each attack rolls
     a number inside the attacker's damage range (minimum 1). Attacks never overkill: once enough
     damage is assigned to destroy a target, the remaining attackers pick the next enemy. All attacks
     land at the same time, then anything at 0 HP is removed.
   - *Healing.* After the destroyed are removed, each Medic heals the wounded allies on its tile.
   - *Movement.* Every unit then advances one tile (Scouts two) toward the enemy base, unless it has a target in
     range or the next tile holds an enemy unit or bunker. Who moves first alternates each round.
5. **Win check.**

**Where you can build.** Bunkers go on any tile without a bunker that you hold (anywhere behind
your front line), or on a neutral tile in your first two columns. Units train on your home column (column 1) or on any
tile with one of your bunkers, as long as no enemy is there. So bunkers act as forward spawn points.

| Bunker | Cost | HP | Attack | Upgrade (once) |
|---|---|---|---|---|
| Wall   | 2 | 14 | none | 2 supply: +6 HP |
| Turret | 4 | 10 | 2–3, range 2 (both directions) | 3 supply: +4 HP, damage 3–4 |
| Depot  | 4 | 5  | none, gives +1 supply/round | 3 supply: +3 HP, +1 supply/round |

| Unit | Cost | HP | Damage | Range | Special |
|---|---|---|---|---|---|
| Grunt  | 3 | 6  | 2–4 | melee (1) | — |
| Sniper | 4 | 4  | 4–5 | 2 | Shots ignore armor |
| Brute  | 7 | 15 | 5–6 | melee (1) | Armor 1: every hit it takes is 1 lower (minimum 1) |
| Scout  | 2 | 4  | 1–2 | melee (1) | Fast: moves 2 tiles a round |
| Sapper | 4 | 8  | 2–3 | melee (1) | Goes for buildings, then the base, before units; +5 damage to them |
| Medic  | 3 | 6  | none | — | After combat, heals every wounded ally on its tile by 3 (Medics stack) |

The units form a rough rock-paper-scissors at equal supply (from simulated fights): Brutes beat
Grunts (armor shrugs off small hits), a Grunt+Sniper mix beats Brutes (Snipers pierce armor from
behind the front), and a pure Grunt swarm beats a Grunt+Sniper mix.

**Unit upgrades.** Each unit type has one upgrade, researched once from any tile's menu. It applies to
all your units of that type, including those already on the board. Upgraded units show a small ring.

| Upgrade | Cost | Effect |
|---|---|---|
| Drill Training (Grunt) | 3 | +3 HP, damage 3–5 |
| Long Scopes (Sniper) | 3 | Range 3 |
| Heavy Plating (Brute) | 4 | +1 armor (armor 2) |
| Sprint (Scout) | 3 | Moves 3 tiles a round |
| Shaped Charges (Sapper) | 4 | +7 damage to buildings and bases |
| Field Surgery (Medic) | 3 | Heals 4 |

The Depot has no attack, so its upgrade adds income where other bunkers gain damage.

**Base defences.** Each base defends the tile right in front of it, in every lane:

- *Base guns* (automatic): during each clash, the base fires at the enemy on that tile for 2–3 damage,
  using the normal target order.
- *Barrage* (4 supply, once per lane per round): while the enemy holds the tile in front of your
  base, tap it and call a barrage. Every enemy unit and building on that tile takes 3 damage at
  once, ignoring building shelter. Useful because an enemy on that tile also stops you training
  units there. The AI barrages whenever you take the tile in front of its base.

**Events** (each equally likely):

- **Supply Drop:** both sides get +3 supply (still capped at 15).
- **Blizzard:** ranged attacks (Snipers, Turrets) deal −1 this round.
- **Mercenary Offer:** the side with less supply gets a free Brute (nobody gets it on a tie).
- **Sabotage:** a random bunker on the board takes 2 damage.
- **Calm:** nothing happens.

**Winning.** You win by destroying the enemy base. Tile control only settles a stalemate: if both
bases still stand after round 20, the side holding more tiles wins, and base HP breaks a tie. If both
bases fall in the same round, the same tiles-then-HP comparison decides.

**Balance notes.** The numbers were tuned with simulated games (500 per matchup). With the AI playing
both sides, about 96% of games end with a base destroyed, at a median of round 11 (half of games end
between rounds 9 and 13). Against a player making random moves the AI wins about 58%. An early Depot
improves win rate by about 5%; unit upgrades are worth roughly what they cost. Each of the six units
earns its cost: stopping the AI from training any one of them changes its win rate by at most a few
percent (Grunts and Snipers matter most).

**AI.** The AI is rule-based, and can play either side (the tests and balance simulations use this).
Each step it picks a focus lane, which is the lane where the player's
force (weighted toward pieces close to the AI base) most outweighs its own, and where the player holds tiles. In order, it then tries to:
build one early Depot, defend a lane the player is pushing, keep about one bunker per five units,
research the upgrade for the unit type it fields most (from round 4, if it can still afford a unit),
train units, and upgrade bunkers. Unit choice is a weighted pick that reacts to the focus lane: Sappers
when the player has buildings there, a Medic once it has a group, Scouts mostly early, and more of
any type it has upgraded. It repeats until it can't afford anything, so it spends nearly
all its supply each turn.

**Replays.** All randomness, including the AI's, comes from a seeded RNG stored in the game state. The same seed plus
the same moves always replays the same game. The results screen shows the seed and has a Rematch button.

## File structure

```
App.tsx                  Screen switching (new game → game → results)
game/                    Pure game logic, no React imports
  types.ts               GameState, Tile, Unit, Bunker, Action…
  config.ts              All tunable numbers: costs, HP, damage, events
  rng.ts                 Seeded RNG (mulberry32) + string → seed hashing
  board.ts               Small helpers (clone, tile counting, logging)
  build.ts               Build-phase validation and actions
  income.ts              2d6 + depot income, supply cap
  events.ts              Random events
  combat.ts              Targeting, simultaneous attacks, healing, movement
  ai.ts                  Rule-based opponent
  engine.ts              createGame, gameReducer, checkWinner
  __tests__/             Jest tests (combat, income/events, engine)
src/
  useGame.ts             React hook wrapping the pure reducer
  theme.ts               Muted palette
  components/            TopBar, Board, DiceTray, Die, Icons, TileSheet, CombatLog, Button
  screens/               NewGameScreen, GameScreen, ResultsScreen
```

**Turn animation.** On End Turn the engine also saves a board snapshot after each stage
(AI builds, units advance, combat) in `state.replay`, with the damage dealt per target. The game
screen plays these back before showing the new round: new pieces pop in, units slide one tile, and
damage numbers float over their targets. Tap the board to skip.

`gameReducer(state, action)` is the only entry point the UI uses. It clones the state, applies the
action and returns a new state, so the logic can be tested without any UI.
