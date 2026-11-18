import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, type ScrollViewInstance } from 'react-native';
import { C } from '../theme';

/** Short scrolling log; newest at the bottom. */
export function CombatLog({ lines }: { lines: string[] }) {
  const ref = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={ref}
      style={styles.log}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
    >
      {lines.slice(-40).map((line, i) => {
        const header = line.startsWith('—');
        return (
          <Text key={i} style={[styles.line, header && styles.header]}>
            {line}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  log: {
    flex: 1,
    marginHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  content: { paddingVertical: 8 },
  line: { fontSize: 12, lineHeight: 17, color: C.muted },
  header: { color: C.ink, fontWeight: '600', marginTop: 4 },
});
