import { isDarkColor } from '@/lib/color';

/**
 * Vector drawing document. All coordinates and sizes are fractions of the canvas WIDTH,
 * so a doc renders identically at any resolution (live canvas, 960px export, replay).
 * y ranges over [0, 1 / aspect].
 */

export type BrushId = 'chalk' | 'pen' | 'neon' | 'highlighter' | 'spray' | 'rainbow' | 'eraser';
export type BoardId = 'classic' | 'slate' | 'midnight' | 'plum' | 'blush' | 'paper' | 'mint' | 'clear';
export type StampId =
  | 'heart'
  | 'star'
  | 'sparkle'
  | 'moon'
  | 'smile'
  | 'flower'
  | 'cloud'
  | 'crown'
  | 'paw'
  | 'bolt'
  | 'note'
  | 'sun';

export type Stroke = {
  t: 'stroke';
  id: string;
  brush: BrushId;
  color: string;
  size: number;
  /** Flat [x0, y0, x1, y1, ...] */
  pts: number[];
  seed: number;
};

export type TextItem = {
  t: 'text';
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  /** Font size as a fraction of width. */
  size: number;
  rot: number;
  seed: number;
};

export type StampItem = {
  t: 'stamp';
  id: string;
  shape: StampId;
  color: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  seed: number;
};

export type PlacedItem = TextItem | StampItem;
export type Item = Stroke | PlacedItem;

export type FrameId = 'wood' | 'darkwood' | 'white' | 'metal' | 'pink' | 'none';

/** Per-doc overrides on top of a preset board. */
export type BoardStyle = { base?: string; frame?: FrameId };

export type Doc = {
  v: 1;
  board: BoardId;
  /** Custom background colour / border, overriding the preset. */
  style?: BoardStyle;
  /** width / height */
  aspect: number;
  items: Item[];
  /** Storage path of an image this doc was drawn on top of ("draw over"). */
  bgImagePath?: string | null;
};

export type Board = {
  name: string;
  base: string;
  /** Light boards get darker default ink and lighter texture. */
  dark: boolean;
  frame: FrameId;
  defaultInk: string;
};

export const BOARDS: Record<BoardId, Board> = {
  classic: { name: 'Classic', base: '#2F4A3A', dark: true, frame: 'wood', defaultInk: '#F4F1E8' },
  slate: { name: 'Slate', base: '#25292C', dark: true, frame: 'darkwood', defaultInk: '#F4F1E8' },
  midnight: { name: 'Midnight', base: '#1D2745', dark: true, frame: 'none', defaultInk: '#FFE08A' },
  plum: { name: 'Plum', base: '#3A2541', dark: true, frame: 'none', defaultInk: '#F7A8C4' },
  blush: { name: 'Blush', base: '#F6D9E1', dark: false, frame: 'none', defaultInk: '#9C3D63' },
  paper: { name: 'Paper', base: '#F3ECDD', dark: false, frame: 'none', defaultInk: '#33312C' },
  mint: { name: 'Mint', base: '#D6EFE2', dark: false, frame: 'none', defaultInk: '#2E5E4E' },
  clear: { name: 'Night', base: '#111111', dark: true, frame: 'none', defaultInk: '#9CC9F5' },
};

export const FRAMES: { id: FrameId; label: string; color: string }[] = [
  { id: 'wood', label: 'Wood', color: '#9A6B43' },
  { id: 'darkwood', label: 'Dark wood', color: '#5E4130' },
  { id: 'white', label: 'Painted', color: '#ECE6DA' },
  { id: 'metal', label: 'Metal', color: '#A7B0B5' },
  { id: 'pink', label: 'Pink', color: '#F2A7C3' },
  { id: 'none', label: 'None', color: 'transparent' },
];

/** Quick picks for the board background (any colour is allowed via the picker). */
export const BOARD_COLORS = ['#2F4A3A', '#25292C', '#1D2745', '#3A2541', '#4A2C2A', '#16302F', '#F6D9E1', '#F3ECDD', '#D6EFE2', '#DCE8F7', '#FFF3C4', '#111111'];

export type BoardLook = { base: string; dark: boolean; frame: FrameId; defaultInk: string };

export function resolveBoard(doc: Pick<Doc, 'board' | 'style'>): BoardLook {
  const preset = BOARDS[doc.board] ?? BOARDS.classic;
  const base = doc.style?.base ?? preset.base;
  const custom = !!doc.style?.base && doc.style.base.toLowerCase() !== preset.base.toLowerCase();
  const dark = custom ? isDarkColor(base) : preset.dark;
  return {
    base,
    dark,
    frame: doc.style?.frame ?? preset.frame,
    defaultInk: custom ? (dark ? '#F4F1E8' : '#33312C') : preset.defaultInk,
  };
}

export const BOARD_IDS = Object.keys(BOARDS) as BoardId[];

export const PALETTE = [
  '#F4F1E8', // chalk white
  '#FFE08A', // yellow
  '#FFB37A', // orange
  '#FF8A8A', // coral
  '#F7A8C4', // pink
  '#D7A8F7', // lilac
  '#9CC9F5', // sky
  '#8EE3D6', // teal
  '#A8E0B8', // mint
  '#C9B79C', // sand
  '#E53950', // red
  '#9C3D63', // raspberry
  '#3A6FD8', // blue
  '#2E5E4E', // forest
  '#6B4F3A', // brown
  '#33312C', // charcoal
] as const;

export type BrushDef = { id: BrushId; label: string; icon: string; defaultSize: number };

export const BRUSHES: BrushDef[] = [
  { id: 'chalk', label: 'Chalk', icon: '🖍️', defaultSize: 0.018 },
  { id: 'pen', label: 'Pen', icon: '✒️', defaultSize: 0.01 },
  { id: 'neon', label: 'Neon', icon: '💡', defaultSize: 0.014 },
  { id: 'highlighter', label: 'Marker', icon: '🖊️', defaultSize: 0.03 },
  { id: 'spray', label: 'Dust', icon: '✨', defaultSize: 0.025 },
  { id: 'rainbow', label: 'Rainbow', icon: '🌈', defaultSize: 0.016 },
  { id: 'eraser', label: 'Eraser', icon: '🧽', defaultSize: 0.05 },
];

/** Brush size presets, as fractions of width. */
export const SIZES = [0.006, 0.011, 0.018, 0.03, 0.05, 0.08];

export const STAMPS: { id: StampId; label: string }[] = [
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'moon', label: 'Moon' },
  { id: 'sun', label: 'Sun' },
  { id: 'smile', label: 'Smile' },
  { id: 'flower', label: 'Flower' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'crown', label: 'Crown' },
  { id: 'paw', label: 'Paw' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'note', label: 'Music' },
];

export const ASPECTS = [
  { id: 'square', label: 'Square', value: 1 },
  { id: 'wide', label: 'Wide', value: 2 },
  { id: 'tall', label: 'Tall', value: 0.75 },
] as const;

export function newDoc(board: BoardId = 'classic', aspect = 1): Doc {
  return { v: 1, board, aspect, items: [] };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** Deterministic PRNG (mulberry32) so effects like spray dust replay identically. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isDocEmpty(doc: Doc): boolean {
  return doc.items.length === 0 && !doc.bgImagePath;
}

/** Drop near-duplicate points & quantize to keep stored docs small. */
export function compactPoints(pts: number[], minDist = 0.0015): number[] {
  if (pts.length <= 4) return pts.map(q);
  const out = [q(pts[0]), q(pts[1])];
  let lx = pts[0];
  let ly = pts[1];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const dx = pts[i] - lx;
    const dy = pts[i + 1] - ly;
    if (dx * dx + dy * dy >= minDist * minDist) {
      out.push(q(pts[i]), q(pts[i + 1]));
      lx = pts[i];
      ly = pts[i + 1];
    }
  }
  out.push(q(pts[pts.length - 2]), q(pts[pts.length - 1]));
  return out;
}

function q(n: number): number {
  return Math.round(n * 10000) / 10000;
}
