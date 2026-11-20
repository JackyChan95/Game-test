import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BUNKERS, UNITS, isSpawnTile, type Action, type GameState, type TurnFrame } from '../../game';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { CombatLog } from '../components/CombatLog';
import { DiceTray } from '../components/DiceTray';
import { BunkerIcon, UnitIcon } from '../components/Icons';
import { TileSheet } from '../components/TileSheet';
import { TopBar } from '../components/TopBar';
import { C } from '../theme';

/** How long each stage of the end-of-turn replay stays on screen (ms). */
const STAGE_MS: Record<TurnFrame['stage'], number> = { aiBuild: 800, move: 800, attack: 1200 };
const STAGE_CAPTION: Record<TurnFrame['stage'], string> = {
  aiBuild: 'AI builds',
  move: 'Units advance',
  attack: 'Combat',
};

interface Props {
  game: GameState;
  dispatch: (a: Action) => void;
  onQuit: () => void;
  onGameOver: () => void;
}

export function GameScreen({ game, dispatch, onQuit, onGameOver }: Props) {
  const [selected, setSelected] = useState<{ lane: number; col: number } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Replay of the last End Turn. `pb` records how far a given replay has played,
  // so a new replay starts at frame 0 on the very first render after End Turn.
  const [pb, setPb] = useState({ replay: game.replay, idx: game.replay.length });
  const idx = pb.replay === game.replay ? pb.idx : 0;
  const playing = idx < game.replay.length;
  const frame = playing ? game.replay[idx] : null;
  const skip = () => setPb({ replay: game.replay, idx: game.replay.length });

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPb({ replay: game.replay, idx: idx + 1 }), STAGE_MS[game.replay[idx].stage]);
    return () => clearTimeout(t);
  }, [playing, idx, game.replay]);

  // Leave the final board up briefly before showing the results.
  useEffect(() => {
    if (playing || game.phase !== 'gameOver') return;
    const t = setTimeout(onGameOver, 1400);
    return () => clearTimeout(t);
  }, [playing, game.phase, onGameOver]);

  // What the board shows: a replay frame while playing, otherwise the live state.
  const view: GameState = frame ? { ...game, round: frame.round, lanes: frame.lanes, players: frame.players } : game;
  const canBuild = !playing && game.phase === 'build';

  return (
    <View style={styles.screen}>
      <TopBar game={view} />
      <DiceTray game={game} rollKey={game.round} caption={frame ? STAGE_CAPTION[frame.stage] : undefined} />
      <Board
        lanes={view.lanes}
        players={view.players}
        hits={frame?.hits ?? []}
        hitKey={`${game.round}-${idx}`}
        isSpawn={(l, c) => canBuild && isSpawnTile(game, 'player', l, c)}
        selected={selected}
        onSelect={(lane, col) => (playing ? skip() : setSelected({ lane, col }))}
      />
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          {(['wall', 'turret', 'depot'] as const).map((k) => (
            <View key={k} style={styles.legendItem}>
              <BunkerIcon kind={k} color={C.muted} detail={C.bg} size={13} />
              <Text style={styles.legendText}>{BUNKERS[k].name}</Text>
            </View>
          ))}
          {(['grunt', 'sniper', 'brute'] as const).map((k) => (
            <View key={k} style={styles.legendItem}>
              <UnitIcon kind={k} color={C.muted} detail={C.bg} size={13} />
              <Text style={styles.legendText}>{UNITS[k].name}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.legendText}>Dashed tiles: you can train units there. Ring on a unit: upgraded.</Text>
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
            title={playing ? 'Resolving…' : game.phase === 'build' ? `End Turn ${game.round}` : 'Game over'}
            onPress={() => {
              setSelected(null);
              dispatch({ type: 'endTurn' });
            }}
            disabled={!canBuild}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {selected && canBuild && (
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
  legend: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, gap: 4, alignItems: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontSize: 10, color: C.faint, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  menu: { paddingHorizontal: 6, paddingVertical: 14 },
  menuText: { fontSize: 14, color: C.muted, fontWeight: '600' },
  confirmText: { flex: 1, fontSize: 15, color: C.ink, fontWeight: '600' },
});
