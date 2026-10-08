import { createPost } from '@/lib/api';
import { newMediaPath, primeCache, uploadBytes, uploadJson } from '@/lib/media';
import type { Post } from '@/lib/types';

import { resolveBoard, type Doc } from './model';
import { exportDocImage, type RenderEnv } from './render';

/** Render, upload (image + vector doc) and post a board. Recipients' widgets update via push. */
export async function publishDoc(spaceId: string, doc: Doc, env: RenderEnv, kind: 'drawing' | 'note', body?: string): Promise<Post> {
  const bytes = exportDocImage(doc, env);
  const imagePath = newMediaPath(spaceId, 'jpg');
  const docPath = newMediaPath(spaceId, 'json');
  await Promise.all([uploadBytes(imagePath, bytes, 'image/jpeg'), uploadJson(docPath, doc)]);
  primeCache(imagePath, bytes);
  return createPost({
    space_id: spaceId,
    kind,
    image_path: imagePath,
    doc_path: docPath,
    body: body ?? null,
    board: doc.board,
    bg_color: resolveBoard(doc).base,
    aspect: doc.aspect,
  });
}
