import { Skia, type SkTypeface } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

export const HAND_FONT_ASSET = require('../../assets/fonts/PatrickHand-Regular.ttf');

// Loaded once for the whole app. Skia's useTypeface loads per component and never retries, so a
// single failed fetch (common in dev, where assets come from Metro) left chalk text blank.
let cached: SkTypeface | null = null;
let pending: Promise<SkTypeface> | null = null;

async function loadOnce(): Promise<SkTypeface> {
  const { uri } = Image.resolveAssetSource(HAND_FONT_ASSET);
  for (let attempt = 0; ; attempt++) {
    try {
      const tf = Skia.Typeface.MakeFreeTypeFaceFromData(await Skia.Data.fromURI(uri));
      if (tf) return tf;
    } catch {
      // retry below
    }
    if (attempt >= 4) throw new Error('Could not load the chalk font');
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
}

function loadHandTypeface(): Promise<SkTypeface> {
  pending ??= loadOnce()
    .then((tf) => (cached = tf))
    .catch((e) => {
      pending = null; // let the next screen try again
      throw e;
    });
  return pending;
}

/** The chalk hand font for Skia drawing; null for the first frame until it has loaded. */
export function useHandTypeface(): SkTypeface | null {
  const [tf, setTf] = useState(cached);
  useEffect(() => {
    if (tf) return;
    let alive = true;
    loadHandTypeface()
      .then((t) => alive && setTf(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tf]);
  return tf;
}
