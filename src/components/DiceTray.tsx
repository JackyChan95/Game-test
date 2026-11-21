import { StyleSheet, Text, View } from 'react-native';
import { EVENTS, INCOME, type GameState } from '../../game';
import { C } from '../theme';
import { Die } from './Die';

/** Income dice for the current round plus the round's event. */
export function DiceTray({ game, rollKey, caption }: { game: GameState; rollKey: number; caption?: string }) {
  const [p, e] = game.rolls;
  const ev = EVENTS[game.event];
  if (caption) {
    return (
      <View style={styles.tray}>
        <View style={styles.rolls}>
          <Text style={styles.caption}>{caption}</Text>
          <Text style={styles.small}>Tap board to skip</Text>
        </View>
        <View style={[styles.event, { opacity: 0 }]}>
          <Text style={styles.eventName}> </Text>
          <Text style={styles.eventText}> </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.tray}>
      <View style={styles.rolls}>
        {p ? (
          <>
            <View style={styles.roll}>
              <Text style={styles.small}>{INCOME.base} +</Text>
              {p.dice.map((d, i) => (
                <Die key={i} value={d} rollKey={rollKey} color={C.player} sides={INCOME.die} />
              ))}
              <Text style={styles.rollText}>
                = +{p.total}
                {p.bonus ? <Text style={styles.small}>{`  (incl. ${p.bonus} depot)`}</Text> : null}
              </Text>
            </View>
            <View style={styles.roll}>
              <Text style={[styles.small, { marginRight: 2 }]}>AI</Text>
              {e.dice.map((d, i) => (
                <Die key={i} value={d} rollKey={rollKey} size={20} color={C.enemy} sides={INCOME.die} />
              ))}
              <Text style={styles.small}>+{e.total}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.small}>Build phase — tap a tile.</Text>
        )}
      </View>
      <View style={styles.event}>
        <Text style={styles.eventName}>{ev.name.toUpperCase()}</Text>
        <Text style={styles.eventText}>{ev.text}</Text>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  tray: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  rolls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  roll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rollText: { fontSize: 16, fontWeight: '600', color: C.ink, marginLeft: 4 },
  caption: { fontSize: 15, fontWeight: '600', color: C.ink, letterSpacing: 0.2 },
  small: { fontSize: 11, color: C.muted, fontWeight: '400' },
  event: {
    borderLeftWidth: 2,
    borderColor: C.warn,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  eventName: { fontSize: 10, letterSpacing: 1, fontWeight: '700', color: C.warn },
  eventText: { fontSize: 12, color: C.ink, marginTop: 1 },
});
