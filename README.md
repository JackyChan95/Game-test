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

**Map.** 3 lanes × 5 tiles. Your base is on the left, the AI's on the right, and each base has 20 HP.
A tile holds one bunker and up to 2 units. At the start you hold the 2 columns nearest your base,
the AI holds its 2, and the middle column belongs to nobody.

**Each round:**

1. **Income.** Each side rolls 2d6 and adds +1 for each Depot (+2 if the Depot is upgraded). Unspent supply carries over, capped at 15.
2. **Event.** One random event is drawn (see below).
3. **Build.** You build, upgrade and train. Then the AI does the same.
4. **Clash.**
   - *Movement.* Every unit advances one tile toward the enemy base. A unit stays put if it already
     has a target in range, if the next tile holds an enemy unit or enemy bunker, or if the next tile
     already has 2 friendly units. A unit that moves onto a tile claims it.
   - *Attacks.* Every unit and Turret hits the nearest enemy in its lane within range. A bunker is hit
     before the units sheltering on its tile. The base is hit when nothing closer is in range. Each
     attack rolls a number inside the attacker's damage range (minimum 1). Units deal +2 extra damage
     to bunkers and bases (siege damage). All attacks land at the same time, then anything at 0 HP is removed.
   - Who moves first alternates each round: you move first on odd rounds, the AI on even rounds.
5. **Win check.**

**Where you can build.** You can put a bunker on any tile you hold that has no bunker.
You can train units on your home column (column 1) or on any tile with one of your bunkers,
so bunkers act as forward spawn points.

| Bunker | Cost | HP | Attack | Upgrade (once) |
|---|---|---|---|---|
| Wall   | 2 | 10 | none | 2 supply: +6 HP |
| Turret | 4 | 8  | 2–3, range 2 (both directions) | 3 supply: +4 HP, damage 3–4 |
| Depot  | 4 | 5  | none, gives +1 supply/round | 3 supply: +3 HP, +1 supply/round |

| Unit | Cost | HP | Damage | vs bunkers and bases |
|---|---|---|---|---|
| Grunt  | 2 | 6  | 2–4, melee (range 1) | 4–6 |
| Sniper | 3 | 4  | 3–4, range 2 | 5–6 |
| Brute  | 5 | 12 | 4–6, melee (range 1) | 6–8 |

The Depot has no attack, so its upgrade adds income where other bunkers gain damage.

**Events** (each equally likely):

- **Supply Drop:** both sides get +3 supply (still capped at 15).
- **Blizzard:** ranged attacks (Snipers, Turrets) deal −1 this round.
- **Mercenary Offer:** the side with less supply gets a free Brute (nobody gets it on a tie).
- **Sabotage:** a random bunker on the board takes 2 damage.
- **Calm:** nothing happens.

**Escalation.** Fights get bloodier over time: from round 6 every attack deals +1 damage, from
round 10 +2, and from round 14 +3. This keeps long games from stalling.

**Winning.** You win by destroying the enemy base. Tile control only settles a stalemate: if both
bases still stand after round 20, the side holding more tiles wins, and base HP breaks a tie. If both
bases fall in the same round, the same tiles-then-HP comparison decides.

**Balance notes.** The numbers were tuned with simulated games (500 per matchup). With the AI playing
both sides, about 74% of games end with a base destroyed, at a median of round 13. A player who
concentrates on one lane ends games faster (83% base kills, median round 11). A Depot built early
improves the AI's win rate by about 5%. Building before the AI (as you do) is an advantage: in
AI-vs-AI games, the side that builds first wins about 60% of the time.

**AI.** The AI is rule-based, and can play either side (the tests and balance simulations use this).
Each step it picks a focus lane, which is the lane where the player's
force (weighted toward pieces close to the AI base) most outweighs its own, and where the player holds tiles. In order, it then tries to:
build one early Depot, defend a lane the player is pushing, keep about one bunker per three units,
train units, and upgrade bunkers. It repeats until it can't afford anything, so it spends nearly
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
  combat.ts              Movement, targeting, simultaneous attacks
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
