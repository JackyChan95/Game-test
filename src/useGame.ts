import { useCallback, useState } from 'react';
import { createGame, gameReducer, type Action, type GameState } from '../game';

/** Thin React wrapper around the pure game reducer. */
export function useGame() {
  const [game, setGame] = useState<GameState | null>(null);
  // Increments for every new game, so screens can reset per game (a rematch reuses the seed).
  const [gameKey, setGameKey] = useState(0);
  const start = useCallback((seed: string) => {
    setGame(createGame(seed));
    setGameKey((k) => k + 1);
  }, []);
  const dispatch = useCallback((a: Action) => setGame((g) => (g ? gameReducer(g, a) : g)), []);
  const quit = useCallback(() => setGame(null), []);
  return { game, gameKey, start, dispatch, quit };
}
