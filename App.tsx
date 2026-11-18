import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useGame } from './src/useGame';
import { NewGameScreen } from './src/screens/NewGameScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { C } from './src/theme';

export default function App() {
  const { game, start, dispatch, quit } = useGame();
  const [showResults, setShowResults] = useState(false);

  // When the game ends, leave the final board up briefly before the results.
  useEffect(() => {
    if (game?.phase !== 'gameOver') {
      setShowResults(false);
      return;
    }
    const t = setTimeout(() => setShowResults(true), 1400);
    return () => clearTimeout(t);
  }, [game?.phase]);

  let screen;
  if (!game) screen = <NewGameScreen onStart={start} />;
  else if (showResults) {
    screen = <ResultsScreen game={game} onRematch={() => start(game.seed)} onNewGame={quit} />;
  } else screen = <GameScreen game={game} dispatch={dispatch} onQuit={quit} />;

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
