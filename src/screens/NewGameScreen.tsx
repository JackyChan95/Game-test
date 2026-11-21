import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomSeedString } from '../../game';
import { Button } from '../components/Button';
import { C } from '../theme';

const RULES = [
  'Three lanes, five tiles each. Your base is on the left.',
  'Each round both sides get the same income: 5 supply plus one shared d4 roll. Unspent supply carries over.',
  'Tap a tile to build or train. Units train on your home column (even if the enemy is on it) or on tiles with your bunker. You hold every tile up to your furthest unit.',
  'End the turn: everything in range attacks (each piece has a damage range, like 2–4), then units advance one tile.',
  'Destroy the AI base (25 HP) to win. If both bases survive 20 rounds, whoever holds more tiles wins.',
];

export function NewGameScreen({ onStart }: { onStart: (seed: string) => void }) {
  const [seed, setSeed] = useState(randomSeedString());
  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>A SHORT GAME OF LANES</Text>
        <Text style={styles.title}>Bunker Lanes</Text>
      </View>

      <View style={styles.rules}>
        {RULES.map((r, i) => (
          <View key={i} style={styles.rule}>
            <Text style={styles.ruleNum}>{i + 1}</Text>
            <Text style={styles.ruleText}>{r}</Text>
          </View>
        ))}
      </View>

      <View style={styles.seedRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>SEED</Text>
          <TextInput
            value={seed}
            onChangeText={setSeed}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="any text"
            placeholderTextColor={C.faint}
          />
        </View>
        <Button title="Shuffle" variant="quiet" onPress={() => setSeed(randomSeedString())} style={styles.shuffle} />
      </View>
      <Text style={styles.hint}>Same seed + same moves = same game.</Text>

      <Button title="Start" onPress={() => onStart(seed.trim() || randomSeedString())} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  titleBlock: { marginBottom: 28 },
  kicker: { fontSize: 11, letterSpacing: 2, color: C.muted, fontWeight: '600' },
  title: { fontSize: 36, fontWeight: '700', color: C.ink, marginTop: 4, letterSpacing: -0.5 },
  rules: { gap: 10, marginBottom: 28 },
  rule: { flexDirection: 'row', gap: 10 },
  ruleNum: { width: 16, fontSize: 13, color: C.faint, fontWeight: '700' },
  ruleText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.ink },
  seedRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  label: { fontSize: 10, letterSpacing: 1, color: C.muted, fontWeight: '700', marginBottom: 4 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.surface,
  },
  shuffle: { height: 52 },
  hint: { fontSize: 12, color: C.muted, marginTop: 6 },
});
