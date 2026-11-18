import type { Side } from '../game';

/** Muted "paper map" palette. */
export const C = {
  bg: '#ECE9E1',
  surface: '#F6F4EE',
  ink: '#2D332F',
  muted: '#7B8079',
  faint: '#A9Aca3',
  line: '#D3CFC3',
  neutral: '#E2DED3',
  accent: '#56644D',
  accentInk: '#F4F2EA',
  player: '#4D6A78',
  playerTint: '#D7E0E2',
  enemy: '#985B4C',
  enemyTint: '#EAD9D2',
  warn: '#A0703A',
};

export const sideColor = (s: Side) => (s === 'player' ? C.player : C.enemy);
export const sideTint = (s: Side | null) => (s === 'player' ? C.playerTint : s === 'enemy' ? C.enemyTint : C.neutral);

export const font = {
  mono: { fontVariant: ['tabular-nums' as const] },
};
