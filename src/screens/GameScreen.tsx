import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Action, GameState } from '../../game';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { CombatLog } from '../components/CombatLog';
import { DiceTray } from '../components/DiceTray';
import { TileSheet } from '../components/TileSheet';
import { TopBar } from '../components/TopBar';
import { C } from '../theme';

interface Props {
  game: GameState;
  dispatch: (a: Action) => void;
  onQuit: () => void;
}

export function GameScreen({ game, dispatch, onQuit }: Props) {
  const [selected, setSelected] = useState<{ lane: number; col: number } | null>(null);

  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <View style={styles.screen}>
      <TopBar game={game} />
      <DiceTray game={game} rollKey={game.round} />
      <Board game={game} selected={selected} onSelect={(lane, col) => setSelected({ lane, col })} />
      <View style={styles.legend}>
        <Text style={styles.legendText}>W Wall · T Turret · D Depot · G Grunt · S Sniper · B Brute</Text>
        <Text style={styles.legendText}>Dashed tiles: you can train units there.</Text>
      </View>
      <CombatLog lines={game.log} />
      {confirmQuit ? (
        <View style={styles.footer}>
          <Text style={styles.confirmText}>Leave this game?</Text>
          <Button title="Stay" variant="quiet" onPress={() => setConfirmQuit(false)} />
          <Button title="Leave" onPress={onQuit} />
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable onPress={() => setConfirmQuit(true)} hitSlop={8} style={styles.menu}>
            <Text style={styles.menuText}>Menu</Text>
          </Pressable>
          <Button
            title={game.phase === 'build' ? `End Turn ${game.round}` : 'Game over'}
            onPress={() => {
              setSelected(null);
              dispatch({ type: 'endTurn' });
            }}
            disabled={game.phase !== 'build'}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {selected && game.phase === 'build' && (
        <TileSheet
          game={game}
          lane={selected.lane}
          col={selected.col}
          onAction={dispatch}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  legend: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  legendText: { fontSize: 10, color: C.faint, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  menu: { paddingHorizontal: 6, paddingVertical: 14 },
  menuText: { fontSize: 14, color: C.muted, fontWeight: '600' },
  confirmText: { flex: 1, fontSize: 15, color: C.ink, fontWeight: '600' },
});
