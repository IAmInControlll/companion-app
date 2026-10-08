import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';

import { fonts } from './theme';

/** Fonts loaded at runtime before the splash screen hides (PatrickHand is embedded natively). */
export const FONT_SOURCES = {
  [fonts.regular]: Nunito_400Regular,
  [fonts.semibold]: Nunito_600SemiBold,
  [fonts.bold]: Nunito_700Bold,
  [fonts.heavy]: Nunito_800ExtraBold,
  [fonts.icons]: require('../../assets/fonts/ChalkIcons-Regular.ttf'),
  [fonts.iconsFilled]: require('../../assets/fonts/ChalkIcons-Filled.ttf'),
};
