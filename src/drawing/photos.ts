import type { SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';

import { loadSkImage } from '@/lib/media';
import { isLocalPhoto, loadLocalSkImage } from '@/lib/photo';

import type { Item, PhotoItem } from './model';

const isPhoto = (it: Item): it is PhotoItem => it.t === 'photo';

/** Decode one placed picture: a file picked on this phone, or a sent one from storage. */
const loadPhoto = (path: string) => (isLocalPhoto(path) ? loadLocalSkImage(path) : loadSkImage(path));

/** Decode every picture placed in `items` (for replays; the live canvas uses the hook below). */
export async function loadPhotoImages(items: Item[]): Promise<Record<string, SkImage>> {
  const paths = [...new Set(items.filter(isPhoto).map((p) => p.path))];
  const loaded = await Promise.all(paths.map((p) => loadPhoto(p).catch(() => null)));
  return Object.fromEntries(paths.flatMap((p, i) => (loaded[i] ? [[p, loaded[i]]] : [])));
}

/**
 * The decoded pictures placed in `items`, loading new ones as they appear. The returned object
 * only changes when a picture finishes loading, so it can sit in render-cache dependencies.
 */
export function usePhotoImages(items: Item[]): Record<string, SkImage> {
  const [images, setImages] = useState<Record<string, SkImage>>({});
  const pending = useRef(new Set<string>());
  const key = [...new Set(items.filter(isPhoto).map((p) => p.path))].sort().join('\n');

  useEffect(() => {
    for (const path of key ? key.split('\n') : []) {
      if (images[path] || pending.current.has(path)) continue;
      pending.current.add(path);
      loadPhoto(path)
        .then((img) => img && setImages((m) => ({ ...m, [path]: img })))
        .catch(() => {})
        .finally(() => pending.current.delete(path));
    }
    // `images` is read only to skip finished ones; re-running on it would just no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return images;
}
