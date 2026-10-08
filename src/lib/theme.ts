import type { TextStyle } from 'react-native';

/**
 * UI chrome is neutral so the boards (green chalk, photos) carry the colour.
 * Pink is the one accent: primary actions, selection, the heart. Nothing else.
 */
export const colors = {
  bg: '#111413',
  surface: '#1A1E1C',
  surfaceHi: '#242927',
  line: '#2C322F',
  text: '#F4F1EA',
  textDim: '#A3AAA6',
  textFaint: '#6B7370',
  accent: '#F7A8C4',
  onAccent: '#2B1520',
  accentSoft: '#F7A8C42E',
  danger: '#FF7B72',
  scrim: '#000000B3',
  /** Default chalkboard green, for empty boards. */
  board: '#2F4A3A',
  /** Chalk inks: content colours (answers, avatars), never UI chrome. */
  yellow: '#F9D77E',
  blue: '#9CC9F5',
  green: '#A8E0B8',
} as const;

/** Font file name doubles as the family name on Android (embedded via expo-font plugin). */
export const HAND_FONT = 'PatrickHand-Regular';

/** Loaded at startup in the root layout (see FONT_SOURCES). */
export const fonts = {
  hand: HAND_FONT,
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
  icons: 'ChalkIcons-Regular',
  iconsFilled: 'ChalkIcons-Filled',
} as const;

/**
 * Type scale. The hand font is the voice *on the board* (wordmark, chalk moments);
 * everything you operate is Nunito.
 */
export const type = {
  wordmark: { fontFamily: fonts.hand, fontSize: 30, lineHeight: 36, color: colors.text },
  chalk: { fontFamily: fonts.hand, fontSize: 24, lineHeight: 30, color: colors.text },
  title: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 30, color: colors.text },
  headline: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  label: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.text },
  caption: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: colors.textDim },
  micro: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.textDim },
} satisfies Record<string, TextStyle>;

export const radius = { sm: 10, md: 16, lg: 22, board: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Side margin for every screen. */
export const GUTTER = 20;
