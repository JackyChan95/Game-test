import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { BunkerKind, Side, UnitKind } from '../../game';

/**
 * Simple map-style glyphs on a 24×24 grid. Pieces face the enemy:
 * player pieces point right, AI pieces are mirrored to point left.
 */
interface IconProps {
  size?: number;
  color: string;
  /** Second colour for cut-outs drawn on top of the glyph. */
  detail?: string;
  facing?: Side;
}

const flip = (facing: Side | undefined, size: number) =>
  facing === 'enemy' ? { transform: [{ scaleX: -1 }], width: size, height: size } : { width: size, height: size };

export function UnitIcon({ kind, size = 16, color, detail = 'transparent', facing }: IconProps & { kind: UnitKind }) {
  return (
    <Svg viewBox="0 0 24 24" style={flip(facing, size)}>
      {kind === 'grunt' && (
        <>
          {/* Helmet and shoulders */}
          <Path d="M6.5 11.5a5.5 5.5 0 0 1 11 0z" fill={color} />
          <Rect x="4.5" y="11" width="15" height="2" rx="1" fill={color} />
          <Path d="M5 21.5c0-3.6 3.1-6 7-6s7 2.4 7 6z" fill={color} />
        </>
      )}
      {kind === 'sniper' && (
        <>
          {/* Scope reticle */}
          <Circle cx="12" cy="12" r="7" stroke={color} strokeWidth="2.2" fill="none" />
          <Path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
        </>
      )}
      {kind === 'brute' && (
        <>
          {/* Heavy shield with a forward chevron */}
          <Path d="M12 2.5l8 3.2v5.8c0 5.2-3.4 8.7-8 10.5-4.6-1.8-8-5.3-8-10.5V5.7z" fill={color} />
          <Path d="M9.5 8.5l4 3.5-4 3.5" stroke={detail} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

export function BunkerIcon({ kind, size = 16, color, detail = 'transparent', facing }: IconProps & { kind: BunkerKind }) {
  return (
    <Svg viewBox="0 0 24 24" style={flip(facing, size)}>
      {kind === 'wall' && (
        <>
          {/* Brick courses */}
          <Rect x="3" y="5" width="8.5" height="4" rx="0.8" fill={color} />
          <Rect x="12.5" y="5" width="8.5" height="4" rx="0.8" fill={color} />
          <Rect x="3" y="10" width="4" height="4" rx="0.8" fill={color} />
          <Rect x="8" y="10" width="8" height="4" rx="0.8" fill={color} />
          <Rect x="17" y="10" width="4" height="4" rx="0.8" fill={color} />
          <Rect x="3" y="15" width="8.5" height="4" rx="0.8" fill={color} />
          <Rect x="12.5" y="15" width="8.5" height="4" rx="0.8" fill={color} />
        </>
      )}
      {kind === 'turret' && (
        <>
          {/* Dome on a base with a barrel pointing at the enemy */}
          <Rect x="11" y="9" width="12" height="3.2" rx="1.2" fill={color} />
          <Path d="M3.5 17a7.5 7.5 0 0 1 15 0z" fill={color} />
          <Rect x="2" y="17.5" width="18" height="4" rx="1" fill={color} />
        </>
      )}
      {kind === 'depot' && (
        <>
          {/* Supply crate */}
          <Rect x="3.5" y="6" width="17" height="14" rx="1.5" fill={color} />
          <Path d="M3.5 10.5h17M12 10.5V20" stroke={detail} strokeWidth="1.8" />
          <Rect x="9.5" y="3.5" width="5" height="3" rx="0.8" fill={color} />
        </>
      )}
    </Svg>
  );
}
