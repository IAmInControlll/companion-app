import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { useHandTypeface } from '@/drawing/fonts';
import { drawText, measureText } from '@/drawing/render';

/** Big chalk-textured heading, drawn with the same renderer as the boards. */
export function ChalkTitle({ text, width = 300, height = 70, color = '#F4F1E8' }: { text: string; width?: number; height?: number; color?: string }) {
  const typeface = useHandTypeface();
  const picture = useMemo(
    () =>
      createPicture(
        (c) => {
          if (!typeface) return;
          const item = { t: 'text', id: 'title', text, color, x: 0.5, y: height / 2 / width, size: (height * 0.8) / width, rot: -2, seed: 42 } as const;
          // Shrink long titles (e.g. "Hi <long name>!") to fit instead of clipping.
          const fits = (width * 0.94) / measureText(item, width, typeface).width;
          drawText(c, { ...item, size: item.size * Math.min(1, fits) }, width, { typeface }, true);
        },
        { width, height },
      ),
    [typeface, text, width, height, color],
  );
  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
