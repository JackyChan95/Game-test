import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { C } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', disabled, style }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.quiet,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[styles.text, { color: primary ? C.accentInk : C.ink }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: C.accent },
  quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  text: { fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
});
