import { StyleSheet, Text, View } from 'react-native';
import { MAX_ROUNDS, countTiles, type GameState } from '../../game';
import { C, font } from '../theme';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, font.mono, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function TopBar({ game }: { game: GameState }) {
  const { player, enemy } = game.players;
  return (
    <View style={styles.bar}>
      <Stat label="ROUND" value={`${game.round}/${MAX_ROUNDS}`} />
      <Stat label="SUPPLY" value={`${player.supply}`} />
      <Stat label="YOUR BASE" value={`${player.baseHp}`} color={C.player} />
      <Stat label="AI BASE" value={`${enemy.baseHp}`} color={C.enemy} />
      <Stat label="AI SUPPLY" value={`${enemy.supply}`} />
      <Stat label="TILES" value={`${countTiles(game, 'player')}–${countTiles(game, 'enemy')}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  stat: { alignItems: 'center' },
  label: { fontSize: 9, letterSpacing: 1, color: C.muted, fontWeight: '600' },
  value: { fontSize: 18, color: C.ink, fontWeight: '600', marginTop: 2 },
});
