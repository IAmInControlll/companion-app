import { File } from 'expo-file-system';

import { createPost } from '@/lib/api';
import { newMediaPath, primeCache, uploadBytes, uploadJson } from '@/lib/media';
import { isLocalPhoto } from '@/lib/photo';
import type { Post } from '@/lib/types';

import { resolveBoard, type Doc } from './model';
import { exportDocImage, type RenderEnv } from './render';

/**
 * Render, upload (image + vector doc) and post a board. Recipients' widgets update via push.
 * A photo picked on this phone as the background is uploaded first, so replays can show it.
 */
export async function publishDoc(spaceId: string, doc: Doc, env: RenderEnv, kind: 'drawing' | 'note' | 'photo', body?: string): Promise<Post> {
  const bytes = exportDocImage(doc, env);
  const imagePath = newMediaPath(spaceId, 'jpg');
  const docPath = newMediaPath(spaceId, 'json');

  let stored = doc;
  if (isLocalPhoto(doc.bgImagePath)) {
    const bgPath = newMediaPath(spaceId, 'jpg');
    await uploadBytes(bgPath, await new File(doc.bgImagePath).bytes(), 'image/jpeg');
    stored = { ...doc, bgImagePath: bgPath };
  }

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
