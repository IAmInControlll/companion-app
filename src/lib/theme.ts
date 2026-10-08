export const colors = {
  bg: '#1B2420',
  card: '#24312B',
  cardHi: '#2E3D36',
  border: '#3A4B43',
  text: '#F4EFE6',
  textDim: '#B5BDB5',
  textFaint: '#7E8A83',
  pink: '#F7A8C4',
  yellow: '#F9D77E',
  blue: '#9CC9F5',
  green: '#A8E0B8',
  danger: '#FF8A80',
} as const;

/** Font file name doubles as the family name on Android (embedded via expo-font plugin). */
export const HAND_FONT = 'PatrickHand-Regular';

export const radius = { sm: 10, md: 16, lg: 24 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
