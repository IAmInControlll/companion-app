import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from './supabase';

const BUCKET = 'media';

export function newMediaPath(spaceId: string, ext: 'jpg' | 'png' | 'json'): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${spaceId}/${id}.${ext}`;
}

export async function uploadBytes(path: string, bytes: Uint8Array | ArrayBuffer, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export async function uploadJson(path: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  await uploadBytes(path, bytes, 'application/json');
}

const signedCache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(path: string): Promise<string> {
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (error || !data) throw error ?? new Error('No signed URL');
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 60 * 60 * 6 * 1000 });
  return data.signedUrl;
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing = paths.filter((p) => {
    const hit = signedCache.get(p);
    if (hit && hit.expires > Date.now() + 60_000) {
      out[p] = hit.url;
      return false;
    }
    return true;
  });
  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 60 * 60 * 6);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        out[row.path] = row.signedUrl;
        signedCache.set(row.path, { url: row.signedUrl, expires: Date.now() + 60 * 60 * 6 * 1000 });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Local cache (media is immutable: one path == one file forever)
// ---------------------------------------------------------------------------

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function cacheFile(path: string): File {
  return new File(cacheDir(), path.replace(/\//g, '_'));
}

/** Download (once) and return the local file. */
export async function cachedFile(path: string): Promise<File> {
  const file = cacheFile(path);
  if (file.exists && (file.size ?? 0) > 0) return file;
  const url = await signedUrl(path);
  return File.downloadFileAsync(url, file, { idempotent: true });
}

export async function loadImageDataUri(path: string): Promise<`data:image${string}`> {
  const file = await cachedFile(path);
  const mime = path.endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${mime};base64,${await file.base64()}`;
}

export async function loadSkImage(path: string): Promise<SkImage | null> {
  const file = await cachedFile(path);
  const data = Skia.Data.fromBytes(await file.bytes());
  return Skia.Image.MakeImageFromEncoded(data);
}

export async function loadJson<T>(path: string): Promise<T> {
  const file = await cachedFile(path);
  return JSON.parse(await file.text()) as T;
}

/** Remember freshly uploaded bytes locally so we don't re-download our own posts. */
export function primeCache(path: string, bytes: Uint8Array) {
  try {
    const file = cacheFile(path);
    if (!file.exists) file.create();
    file.write(bytes);
  } catch {
    // cache is best effort
  }
}
