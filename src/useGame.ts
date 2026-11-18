import { useCallback, useState } from 'react';
import { createGame, gameReducer, type Action, type GameState } from '../game';

/** Thin React wrapper around the pure game reducer. */
export function useGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const start = useCallback((seed: string) => setGame(createGame(seed)), []);
  const dispatch = useCallback((a: Action) => setGame((g) => (g ? gameReducer(g, a) : g)), []);
  const quit = useCallback(() => setGame(null), []);
  return { game, start, dispatch, quit };
}
