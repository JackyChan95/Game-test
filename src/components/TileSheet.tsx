import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BUNKERS, UNITS, validateAction,
  type Action, type BunkerKind, type GameState, type UnitKind,
} from '../../game';
import { C, sideColor } from '../theme';

interface Props {
  game: GameState;
  lane: number;
  col: number;
  onAction: (a: Action) => void;
  onClose: () => void;
}

function Option({
  title, detail, cost, reason, onPress,
}: { title: string; detail: string; cost: number; reason: string | null; onPress: () => void }) {
  const disabled = reason !== null;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, disabled && styles.optionDisabled, pressed && styles.optionPressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, disabled && styles.dim]}>{title}</Text>
        <Text style={styles.optionDetail}>{disabled ? reason : detail}</Text>
      </View>
      <Text style={[styles.cost, disabled && styles.dim]}>{cost}</Text>
    </Pressable>
  );
}

const BUNKER_KINDS: BunkerKind[] = ['wall', 'turret', 'depot'];
const UNIT_KINDS: UnitKind[] = ['grunt', 'sniper', 'brute'];

export function TileSheet({ game, lane, col, onAction, onClose }: Props) {
  const tile = game.lanes[lane][col];
  const owner = tile.owner === 'player' ? 'Held by you' : tile.owner === 'enemy' ? 'Held by AI' : 'Neutral';
  const b = tile.bunker;

  const bunkerStats = (k: BunkerKind) => {
    const s = BUNKERS[k];
    const atk = s.damage === null ? 'no attack' : `d6+${s.damage}, range ${s.range}`;
    return `${s.hp} HP · ${atk} · ${s.blurb}`;
  };
  const unitStats = (k: UnitKind) => {
    const s = UNITS[k];
    return `${s.hp} HP · d6+${s.damage}, range ${s.range} · ${s.blurb}`;
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Lane {lane + 1} · Tile {col + 1}</Text>
            <Text style={styles.subtitle}>{owner}</Text>
          </View>
          <Text style={styles.supply}>Supply {game.players.player.supply}</Text>
        </View>

        {(b || tile.units.length > 0) && (
          <View style={styles.contents}>
            {b && (
              <Text style={[styles.contentLine, { color: sideColor(b.owner) }]}>
                {BUNKERS[b.kind].name}{b.upgraded ? ' (upgraded)' : ''} — {b.hp}/{b.maxHp} HP
              </Text>
            )}
            {tile.units.map((u) => (
              <Text key={u.id} style={[styles.contentLine, { color: sideColor(u.owner) }]}>
                {UNITS[u.kind].name} — {u.hp}/{u.maxHp} HP
              </Text>
            ))}
          </View>
        )}

        {b && b.owner === 'player' ? (
          <>
            <Text style={styles.section}>UPGRADE</Text>
            <Option
              title={`Upgrade ${BUNKERS[b.kind].name}`}
              detail={`+${BUNKERS[b.kind].upgradeHp} HP${BUNKERS[b.kind].upgradeDamage ? `, +${BUNKERS[b.kind].upgradeDamage} damage` : ''}${BUNKERS[b.kind].upgradeIncome ? `, +${BUNKERS[b.kind].upgradeIncome} supply/round` : ''}`}
              cost={BUNKERS[b.kind].upgradeCost}
              reason={validateAction(game, { type: 'upgradeBunker', lane, col })}
              onPress={() => onAction({ type: 'upgradeBunker', lane, col })}
            />
          </>
        ) : (
          <>
            <Text style={styles.section}>BUILD BUNKER</Text>
            {BUNKER_KINDS.map((k) => {
              const a: Action = { type: 'buildBunker', lane, col, kind: k };
              return (
                <Option key={k} title={BUNKERS[k].name} detail={bunkerStats(k)} cost={BUNKERS[k].cost}
                  reason={validateAction(game, a)} onPress={() => onAction(a)} />
              );
            })}
          </>
        )}

        <Text style={styles.section}>TRAIN UNIT</Text>
        {UNIT_KINDS.map((k) => {
          const a: Action = { type: 'trainUnit', lane, col, kind: k };
          return (
            <Option key={k} title={UNITS[k].name} detail={unitStats(k)} cost={UNITS[k].cost}
              reason={validateAction(game, a)} onPress={() => onAction(a)} />
          );
        })}

        <Pressable style={styles.done} onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(30,34,31,0.25)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '600', color: C.ink },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  supply: { fontSize: 14, fontWeight: '600', color: C.ink, fontVariant: ['tabular-nums'] },
  contents: { marginTop: 10, gap: 2 },
  contentLine: { fontSize: 13, fontWeight: '500' },
  section: { fontSize: 10, letterSpacing: 1, color: C.muted, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 6,
    backgroundColor: C.bg,
  },
  optionDisabled: { backgroundColor: 'transparent' },
  optionPressed: { backgroundColor: C.neutral },
  optionTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  optionDetail: { fontSize: 11, color: C.muted, marginTop: 1 },
  cost: { fontSize: 16, fontWeight: '700', color: C.ink, marginLeft: 12, fontVariant: ['tabular-nums'] },
  dim: { color: C.faint },
  done: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  doneText: { fontSize: 14, fontWeight: '600', color: C.accent },
});
