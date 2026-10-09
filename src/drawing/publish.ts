import { File } from 'expo-file-system';

import { createPost } from '@/lib/api';
import { newMediaPath, primeCache, uploadBytes, uploadJson } from '@/lib/media';
import { isLocalPhoto } from '@/lib/photo';
import type { Post } from '@/lib/types';

import { resolveBoard, type Doc, type Item } from './model';
import { exportDocImage, type RenderEnv } from './render';

/**
 * Render, upload (image + vector doc) and post a board. Recipients' widgets update via push.
 * Photos picked on this phone (the background, and pictures placed on the board) are uploaded
 * first, and the stored doc points at the uploaded copies, so replays can show them.
 */
export async function publishDoc(spaceId: string, doc: Doc, env: RenderEnv, kind: 'drawing' | 'note' | 'photo', body?: string): Promise<Post> {
  const bytes = exportDocImage(doc, env);
  const imagePath = newMediaPath(spaceId, 'jpg');
  const docPath = newMediaPath(spaceId, 'json');

  const upload = async (local: string) => {
    const path = newMediaPath(spaceId, 'jpg');
    await uploadBytes(path, await new File(local).bytes(), 'image/jpeg');
    return path;
  };
  // Upload each local picture once, even if it was duplicated on the board.
  const uploads = new Map<string, Promise<string>>();
  const uploaded = (local: string) => {
    if (!uploads.has(local)) uploads.set(local, upload(local));
    return uploads.get(local)!;
  };
  const [bgImagePath, items] = await Promise.all([
    isLocalPhoto(doc.bgImagePath) ? uploaded(doc.bgImagePath) : doc.bgImagePath,
    Promise.all(doc.items.map(async (it): Promise<Item> => (it.t === 'photo' && isLocalPhoto(it.path) ? { ...it, path: await uploaded(it.path) } : it))),
  ]);
  const stored: Doc = { ...doc, bgImagePath, items };

  await Promise.all([uploadBytes(imagePath, bytes, 'image/jpeg'), uploadJson(docPath, stored)]);
  primeCache(imagePath, bytes);
  return createPost({
    space_id: spaceId,
    kind,
    image_path: imagePath,
    doc_path: docPath,
    body: body ?? null,
    board: doc.board,
    // Photos letterbox on the neutral surface, not the board colour.
    bg_color: kind === 'photo' ? null : resolveBoard(doc).base,
    aspect: doc.aspect,
  });
}
