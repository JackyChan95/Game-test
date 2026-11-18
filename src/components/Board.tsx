import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isSpawnTile, type Bunker, type GameState, type Tile, type Unit } from '../../game';
import { C, sideColor, sideTint } from '../theme';

const BUNKER_LETTER = { wall: 'W', turret: 'T', depot: 'D' } as const;
const UNIT_LETTER = { grunt: 'G', sniper: 'S', brute: 'B' } as const;

function HpBar({ hp, max, color }: { hp: number; max: number; color: string }) {
  return (
    <View style={styles.hpTrack}>
      <View style={[styles.hpFill, { width: `${Math.max(0, (hp / max) * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function BunkerChip({ b }: { b: Bunker }) {
  const color = sideColor(b.owner);
  return (
    <View style={styles.bunkerWrap}>
      <View style={[styles.bunker, { borderColor: color }]}>
        <Text style={[styles.bunkerText, { color }]}>{BUNKER_LETTER[b.kind]}</Text>
        {b.upgraded && <View style={[styles.upgradePip, { backgroundColor: color }]} />}
      </View>
      <HpBar hp={b.hp} max={b.maxHp} color={color} />
    </View>
  );
}

function UnitChip({ u }: { u: Unit }) {
  const color = sideColor(u.owner);
  return (
    <View style={styles.unitWrap}>
      <View style={[styles.unit, { backgroundColor: color }]}>
        <Text style={styles.unitText}>{UNIT_LETTER[u.kind]}</Text>
      </View>
      <HpBar hp={u.hp} max={u.maxHp} color={color} />
    </View>
  );
}

function TileView({
  tile, spawn, selected, onPress, label,
}: { tile: Tile; spawn: boolean; selected: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: sideTint(tile.owner) },
        spawn && styles.spawn,
        selected && styles.selected,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={styles.bunkerSlot}>{tile.bunker && <BunkerChip b={tile.bunker} />}</View>
      <View style={styles.unitRow}>
        {tile.units.map((u) => (
          <UnitChip key={u.id} u={u} />
        ))}
      </View>
    </Pressable>
  );
}

interface Props {
  game: GameState;
  selected: { lane: number; col: number } | null;
  onSelect: (lane: number, col: number) => void;
}

export function Board({ game, selected, onSelect }: Props) {
  return (
    <View style={styles.board}>
      <View style={[styles.base, { backgroundColor: C.player }]}>
        <Text style={styles.baseText}>YOU</Text>
        <Text style={styles.baseHp}>{game.players.player.baseHp}</Text>
      </View>
      <View style={styles.lanes}>
        {game.lanes.map((lane, l) => (
          <View key={l} style={styles.lane}>
            <Text style={styles.laneLabel}>{l + 1}</Text>
            {lane.map((tile, c) => (
              <TileView
                key={c}
                tile={tile}
                label={`Lane ${l + 1}, tile ${c + 1}`}
                spawn={game.phase === 'build' && isSpawnTile(game, 'player', l, c)}
                selected={selected?.lane === l && selected?.col === c}
                onPress={() => onSelect(l, c)}
              />
            ))}
          </View>
        ))}
        <View style={styles.colLabels}>
          <Text style={styles.laneLabel}> </Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Text key={n} style={styles.colLabel}>{n}</Text>
          ))}
        </View>
      </View>
      <View style={[styles.base, { backgroundColor: C.enemy }]}>
        <Text style={styles.baseText}>AI</Text>
        <Text style={styles.baseHp}>{game.players.enemy.baseHp}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', paddingHorizontal: 12, gap: 6 },
  base: {
    width: 30,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  baseText: { color: C.accentInk, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  baseHp: { color: C.accentInk, fontSize: 14, fontWeight: '700', marginTop: 4 },
  lanes: { flex: 1, gap: 6 },
  lane: { flexDirection: 'row', gap: 4, alignItems: 'stretch' },
  laneLabel: { width: 10, fontSize: 10, color: C.faint, alignSelf: 'center', textAlign: 'center' },
  colLabels: { flexDirection: 'row', gap: 4 },
  colLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: C.faint },
  tile: {
    flex: 1,
    height: 84,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spawn: { borderColor: C.faint, borderStyle: 'dashed' },
  selected: { borderColor: C.ink, borderWidth: 2, borderStyle: 'solid' },
  bunkerSlot: { height: 30, justifyContent: 'center' },
  bunkerWrap: { alignItems: 'center', gap: 2 },
  bunker: {
    width: 24,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 3,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bunkerText: { fontSize: 12, fontWeight: '700' },
  upgradePip: { position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: 3 },
  unitRow: { flexDirection: 'row', gap: 3, height: 30, alignItems: 'center' },
  unitWrap: { alignItems: 'center', gap: 2 },
  unit: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: { color: C.accentInk, fontSize: 10, fontWeight: '700' },
  hpTrack: { width: 20, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  hpFill: { height: 3 },
});
