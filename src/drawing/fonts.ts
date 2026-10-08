import { useTypeface } from '@shopify/react-native-skia';

export const HAND_FONT_ASSET = require('../../assets/fonts/PatrickHand-Regular.ttf');

export function useHandTypeface() {
  return useTypeface(HAND_FONT_ASSET);
}
