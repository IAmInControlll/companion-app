import type { Item, PhotoItem } from './model';

/**
 * Layer order is simply the order of `doc.items` (later = on top). Pure, unit-tested.
 * "forward" / "backward" step past the next item that actually overlaps, so every press
 * visibly changes something; "front" / "back" go all the way.
 */
export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Half the width and height of a placed picture as drawn, in doc units (square for circle/heart). */
export function photoHalfSize(p: Pick<PhotoItem, 'size' | 'aspect' | 'shape'>): { hw: number; hh: number } {
  const w = p.size;
  const h = p.size / p.aspect;
  if (p.shape === 'circle' || p.shape === 'heart') {
    const s = Math.min(w, h) / 2;
    return { hw: s, hh: s };
  }
  return { hw: w / 2, hh: h / 2 };
}

/** Rough bounds in doc units (fractions of the board width), generous for rotated items. */
export function itemBox(it: Item): Box {
  switch (it.t) {
    case 'stroke': {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < it.pts.length; i += 2) {
        x0 = Math.min(x0, it.pts[i]);
        x1 = Math.max(x1, it.pts[i]);
        y0 = Math.min(y0, it.pts[i + 1]);
        y1 = Math.max(y1, it.pts[i + 1]);
      }
      const r = it.size / 2;
      return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r };
    }
    case 'text': {
      // Without the font: about 0.55em per character, one line tall. Rotation-safe radius.
      const r = Math.hypot((it.size * 0.55 * it.text.length) / 2, it.size * 0.6);
      return { x0: it.x - r, y0: it.y - r, x1: it.x + r, y1: it.y + r };
    }
    case 'stamp': {
      const r = (it.size / 2) * Math.SQRT2;
      return { x0: it.x - r, y0: it.y - r, x1: it.x + r, y1: it.y + r };
    }
    case 'photo': {
      const { hw, hh } = photoHalfSize(it);
      const r = Math.hypot(hw, hh);
      return { x0: it.x - r, y0: it.y - r, x1: it.x + r, y1: it.y + r };
    }
  }
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The items with `id` moved in the stack. Returns the same array if nothing changes. */
export function moveLayer(items: Item[], id: string, how: LayerMove): Item[] {
  const i = items.findIndex((it) => it.id === id);
  if (i < 0) return items;
  const item = items[i];
  const rest = items.filter((_, k) => k !== i);
  let at: number;
  if (how === 'front') at = rest.length;
  else if (how === 'back') at = 0;
  else {
    const box = itemBox(item);
    if (how === 'forward') {
      // Just above the next overlapping item; to the top if nothing above overlaps.
      const j = items.findIndex((it, k) => k > i && overlaps(box, itemBox(it)));
      at = j < 0 ? rest.length : j; // `rest` has lost the item at i < j, so j is "right after it"
    } else {
      let j = -1;
      for (let k = i - 1; k >= 0; k--) {
        if (overlaps(box, itemBox(items[k]))) {
          j = k;
          break;
        }
      }
      at = j < 0 ? 0 : j;
    }
  }
  if (at === i) return items;
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}
