import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Bunker, Hit, PlayerState, Side, Tile, Unit } from '../../game';
import { C, sideColor, sideTint } from '../theme';
import { BunkerIcon, UnitIcon } from './Icons';

// Board geometry. Units are drawn in an overlay so they can slide between tiles,
// so their positions are computed from these numbers rather than from layout.
const LABEL_W = 10;
const GAP = 4;
const TILE_H = 84;
const LANE_GAP = 6;
const CHIP = 22;
const CHIP_GAP = 3;
const COLS = 5;

const tileWidth = (w: number) => (w - LABEL_W - COLS * GAP) / COLS;
const tileX = (w: number, col: number) => LABEL_W + GAP + col * (tileWidth(w) + GAP);
const laneY = (lane: number) => lane * (TILE_H + LANE_GAP);

function unitPos(w: number, lane: number, col: number, index: number, count: number) {
  const total = count * CHIP + (count - 1) * CHIP_GAP;
  return {
    x: tileX(w, col) + (tileWidth(w) - total) / 2 + index * (CHIP + CHIP_GAP),
    y: laneY(lane) + TILE_H - 6 - 28,
  };
}

/** Scales a piece in when it first appears on the board. */
function PopIn({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return <Animated.View style={{ opacity: v, transform: [{ scale }] }}>{children}</Animated.View>;
}

/** A damage number that drifts up and fades out. */
function DamageFloat({ damage, x, y }: { damage: number; x: number; y: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[styles.float, { left: x - 20, top: y - 18, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.floatText}>−{damage}</Text>
    </Animated.View>
  );
}

function HpBar({ hp, max, color, width }: { hp: number; max: number; color: string; width: number }) {
  return (
    <View style={[styles.hpTrack, { width }]}>
      <View style={[styles.hpFill, { width: `${Math.max(0, (hp / max) * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function BunkerChip({ b }: { b: Bunker }) {
  const color = sideColor(b.owner);
  return (
    <PopIn>
      <View style={[styles.bunkerWrap, b.hp <= 0 && styles.destroyed]}>
        <View style={[styles.bunker, { borderColor: color }]}>
          <BunkerIcon kind={b.kind} color={color} detail={C.surface} facing={b.owner} size={17} />
          {b.upgraded && <View style={[styles.upgradePip, { backgroundColor: color }]} />}
        </View>
        <HpBar hp={b.hp} max={b.maxHp} color={color} width={26} />
      </View>
    </PopIn>
  );
}

/** A unit in the overlay; glides to its new position whenever it changes. */
function UnitSprite({ u, x, y }: { u: Unit; x: number; y: number }) {
  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  useEffect(() => {
    Animated.timing(pos, {
      toValue: { x, y }, duration: 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [x, y, pos]);
  const color = sideColor(u.owner);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.sprite, u.hp <= 0 && styles.destroyed, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
    >
      <PopIn>
        <View style={styles.unitWrap}>
          <View style={[styles.unit, { backgroundColor: color }]}>
            <UnitIcon kind={u.kind} color={C.accentInk} detail={color} facing={u.owner} size={15} />
          </View>
          <HpBar hp={u.hp} max={u.maxHp} color={color} width={CHIP} />
        </View>
      </PopIn>
    </Animated.View>
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
      <View style={styles.bunkerSlot}>{tile.bunker && <BunkerChip key={tile.bunker.id} b={tile.bunker} />}</View>
    </Pressable>
  );
}

function Base({ side, hp, hit, hitKey }: { side: Side; hp: number; hit?: Hit; hitKey: string }) {
  return (
    <View style={[styles.base, { backgroundColor: sideColor(side) }]}>
      <Text style={styles.baseText}>{side === 'player' ? 'YOU' : 'AI'}</Text>
      <Text style={styles.baseHp}>{Math.max(0, hp)}</Text>
      {hit && <DamageFloat key={hitKey} damage={hit.damage} x={15} y={TILE_H * 1.5 - 4} />}
    </View>
  );
}

interface Props {
  lanes: Tile[][];
  players: Record<Side, PlayerState>;
  /** Damage numbers to show; `hitKey` changes whenever a new set should animate. */
  hits: Hit[];
  hitKey: string;
  isSpawn: (lane: number, col: number) => boolean;
  selected: { lane: number; col: number } | null;
  onSelect: (lane: number, col: number) => void;
}

export function Board({ lanes, players, hits, hitKey, isSpawn, selected, onSelect }: Props) {
  const [width, setWidth] = useState(0);

  const sprites: { u: Unit; x: number; y: number }[] = [];
  const unitAt = new Map<number, { x: number; y: number }>();
  if (width > 0) {
    lanes.forEach((lane, l) =>
      lane.forEach((tile, c) =>
        tile.units.forEach((u, i) => {
          const p = unitPos(width, l, c, i, tile.units.length);
          sprites.push({ u, ...p });
          unitAt.set(u.id, p);
        }),
      ),
    );
  }
  // Stable order so React keeps each sprite mounted while it moves.
  sprites.sort((a, b) => a.u.id - b.u.id);

  const floats = width > 0 ? hits.flatMap((h, i) => {
    if (h.base) return [];
    let p: { x: number; y: number } | undefined;
    if (h.unitId !== null) {
      const at = unitAt.get(h.unitId);
      if (at) p = { x: at.x + CHIP / 2, y: at.y + 2 };
    } else if (h.lane !== null && h.col !== null) {
      p = { x: tileX(width, h.col) + tileWidth(width) / 2, y: laneY(h.lane) + 30 };
    }
    return p ? [<DamageFloat key={`${hitKey}-${i}`} damage={h.damage} x={p.x} y={p.y} />] : [];
  }) : [];

  return (
    <View style={styles.board}>
      <Base side="player" hp={players.player.baseHp} hit={hits.find((h) => h.base === 'player')} hitKey={hitKey} />
      <View style={styles.lanes}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.grid}>
          {lanes.map((lane, l) => (
            <View key={l} style={styles.lane}>
              <Text style={styles.laneLabel}>{l + 1}</Text>
              {lane.map((tile, c) => (
                <TileView
                  key={c}
                  tile={tile}
                  label={`Lane ${l + 1}, tile ${c + 1}`}
                  spawn={isSpawn(l, c)}
                  selected={selected?.lane === l && selected?.col === c}
                  onPress={() => onSelect(l, c)}
                />
              ))}
            </View>
          ))}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {sprites.map((s) => (
              <UnitSprite key={s.u.id} u={s.u} x={s.x} y={s.y} />
            ))}
            {floats}
          </View>
        </View>
        <View style={styles.colLabels}>
          <Text style={styles.laneLabel}> </Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Text key={n} style={styles.colLabel}>{n}</Text>
          ))}
        </View>
      </View>
      <Base side="enemy" hp={players.enemy.baseHp} hit={hits.find((h) => h.base === 'enemy')} hitKey={hitKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', paddingHorizontal: 12, gap: 6 },
  base: {
    width: 30,
    height: TILE_H * 3 + LANE_GAP * 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: { color: C.accentInk, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  baseHp: { color: C.accentInk, fontSize: 14, fontWeight: '700', marginTop: 4 },
  lanes: { flex: 1, gap: 6 },
  grid: { gap: LANE_GAP },
  lane: { flexDirection: 'row', gap: GAP, alignItems: 'stretch' },
  laneLabel: { width: LABEL_W, fontSize: 10, color: C.faint, alignSelf: 'center', textAlign: 'center' },
  colLabels: { flexDirection: 'row', gap: GAP },
  colLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: C.faint },
  tile: {
    flex: 1,
    height: TILE_H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingTop: 5,
    alignItems: 'center',
  },
  spawn: { borderColor: C.faint, borderStyle: 'dashed' },
  selected: { borderColor: C.ink, borderWidth: 2, borderStyle: 'solid' },
  bunkerSlot: { height: 32, justifyContent: 'center' },
  bunkerWrap: { alignItems: 'center', gap: 2 },
  bunker: {
    width: 26,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 3,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradePip: { position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: 3 },
  sprite: { position: 'absolute', left: 0, top: 0 },
  unitWrap: { alignItems: 'center', gap: 2 },
  unit: {
    width: CHIP,
    height: CHIP,
    borderRadius: CHIP / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destroyed: { opacity: 0.3 },
  hpTrack: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  hpFill: { height: 3 },
  float: { position: 'absolute', width: 40, alignItems: 'center' },
  floatText: { fontSize: 13, fontWeight: '700', color: C.ink, textShadowColor: C.surface, textShadowRadius: 3 },
});
