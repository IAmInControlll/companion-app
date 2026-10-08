import type { SkTypeface } from '@shopify/react-native-skia';

import { fontFor, textWidth } from './render';

/**
 * Word-wrap and shrink text until it fits the board.
 * Returns the wrapped text and the font size (fraction of width).
 */
export function fitText(raw: string, aspect: number, typeface: SkTypeface | null, maxW = 0.84, maxH = 0.8) {
  const W = 1000; // measure in a virtual 1000px-wide canvas
  const boxH = (maxH / aspect) * W;
  const boxW = maxW * W;
  const paragraphs = raw.trim().split('\n');

  for (let size = 0.2; size > 0.03; size *= 0.92) {
    const font = fontFor(typeface, size * W);
    const lines: string[] = [];
    let tooWide = false;
    for (const para of paragraphs) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (textWidth(font, candidate) <= boxW) line = candidate;
        else {
          if (line) lines.push(line);
          line = word;
          if (textWidth(font, word) > boxW) tooWide = true;
        }
      }
      lines.push(line);
    }
    if (!tooWide && lines.length * size * W * 1.15 <= boxH) return { text: lines.join('\n'), size };
  }
  return { text: raw.trim(), size: 0.03 };
}
