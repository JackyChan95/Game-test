import { StyleSheet, Text, View } from 'react-native';
import { countTiles, type GameState } from '../../game';
import { Button } from '../components/Button';
import { C } from '../theme';

interface Props {
  game: GameState;
  onRematch: () => void;
  onNewGame: () => void;
}

export function ResultsScreen({ game, onRematch, onNewGame }: Props) {
  const r = game.result!;
  const headline = r.winner === 'draw' ? 'Draw' : r.winner === 'player' ? 'Victory' : 'Defeat';
  const color = r.winner === 'player' ? C.player : r.winner === 'enemy' ? C.enemy : C.ink;
  const rows: [string, string, string][] = [
    ['Base HP', `${game.players.player.baseHp}`, `${game.players.enemy.baseHp}`],
    ['Tiles held', `${countTiles(game, 'player')}`, `${countTiles(game, 'enemy')}`],
  ];
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>ROUND {game.round}</Text>
      <Text style={[styles.headline, { color }]}>{headline}</Text>
      <Text style={styles.reason}>{r.reason}</Text>

      <View style={styles.table}>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.head, { textAlign: 'left' }]} />
          <Text style={[styles.cell, styles.head]}>YOU</Text>
          <Text style={[styles.cell, styles.head]}>AI</Text>
        </View>
        {rows.map(([label, p, e]) => (
          <View key={label} style={styles.row}>
            <Text style={[styles.cell, { textAlign: 'left', color: C.muted }]}>{label}</Text>
            <Text style={[styles.cell, { color: C.player }]}>{p}</Text>
            <Text style={[styles.cell, { color: C.enemy }]}>{e}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.seed}>Seed: {game.seed}</Text>

      <View style={styles.buttons}>
        <Button title="Rematch (same seed)" onPress={onRematch} />
        <Button title="New game" variant="quiet" onPress={onNewGame} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  kicker: { fontSize: 11, letterSpacing: 2, color: C.muted, fontWeight: '600' },
  headline: { fontSize: 40, fontWeight: '700', marginTop: 4, letterSpacing: -0.5 },
  reason: { fontSize: 15, color: C.ink, marginTop: 6, lineHeight: 21 },
  table: { marginTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  cell: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  head: { fontSize: 10, letterSpacing: 1, color: C.muted, fontWeight: '700' },
  seed: { fontSize: 12, color: C.muted, marginTop: 16 },
  buttons: { gap: 10, marginTop: 32 },
});
