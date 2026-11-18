import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { C } from '../theme';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface Props {
  value: number;
  /** Change this to replay the roll animation. */
  rollKey: unknown;
  size?: number;
  color?: string;
}

/** A small die that tumbles briefly, then settles on its value. */
export function Die({ value, rollKey, size = 30, color = C.ink }: Props) {
  const [face, setFace] = useState(value);
  const spin = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    // Cosmetic only: flicker random faces before settling (does not touch game RNG).
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      if (ticks >= 7) {
        clearInterval(id);
        setFace(value);
      } else setFace(1 + Math.floor(Math.random() * 6));
    }, 65);
    return () => clearInterval(id);
  }, [rollKey, value, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] });
  const scale = spin.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 1.06, 1] });
  const pip = Math.max(3, Math.round(size / 7));

  return (
    <Animated.View
      style={[
        styles.die,
        { width: size, height: size, borderRadius: size / 6, transform: [{ rotate }, { scale }] },
      ]}
    >
      <View style={styles.grid}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={styles.cell}>
            {PIPS[face].includes(i) && (
              <View style={{ width: pip, height: pip, borderRadius: pip / 2, backgroundColor: color }} />
            )}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  die: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    padding: 3,
  },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
});
