import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useGame } from './src/useGame';
import { NewGameScreen } from './src/screens/NewGameScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { C } from './src/theme';

export default function App() {
  const { game, gameKey, start, dispatch, quit } = useGame();
  const [showResults, setShowResults] = useState(false);
  const onGameOver = useCallback(() => setShowResults(true), []);

  // Leave the results screen in the same update that starts or quits a game,
  // so it never renders with a game that has no result yet.
  const newGame = useCallback((seed: string) => {
    setShowResults(false);
    start(seed);
  }, [start]);
  const toMenu = useCallback(() => {
    setShowResults(false);
    quit();
  }, [quit]);

  let screen;
  if (!game) screen = <NewGameScreen onStart={newGame} />;
  else if (showResults && game.result) {
    screen = <ResultsScreen game={game} onRematch={() => newGame(game.seed)} onNewGame={toMenu} />;
  } else {
    // `key` gives each game a fresh screen (replay and selection state reset).
    screen = <GameScreen key={gameKey} game={game} dispatch={dispatch} onQuit={toMenu} onGameOver={onGameOver} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {screen}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
