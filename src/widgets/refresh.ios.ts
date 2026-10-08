import { Directory, File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { widgetsDirectory } from 'expo-widgets';

import { cachedFile } from '@/lib/media';

import { WIDGET_NAMES, loadWidget, type ChalkboardData, type WidgetName } from './data';
import { present } from './ios/present';
import { IOS_WIDGETS } from './ios/widgets';

// iOS has no "pin widget" prompt; people add widgets from the Home Screen editor.
export const ADD_WIDGET_HINT = 'Touch and hold the Home Screen → Edit → Add Widget → Chalkmates';
export const pinWidget = async (_name: WidgetName) => false;

/**
 * Copy a post's image into the app group container the widget extension can read, shrunk so
 * WidgetKit doesn't reject it for being too large. One file per widget kind, named by post.
 */
async function sharedImage(name: WidgetName, imagePath: string): Promise<string | null> {
  if (!widgetsDirectory) return null;
  const dir = new Directory(widgetsDirectory);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const png = imagePath.endsWith('.png');
  const target = new File(dir, `${name}-${imagePath.replace(/\//g, '_')}`);
  if (!target.exists) {
    const source = await cachedFile(imagePath);
    const ref = await ImageManipulator.manipulate(source.uri).resize({ width: 720 }).renderAsync();
    const out = await ref.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.85 });
    await new File(out.uri).move(target);
  }
  for (const old of dir.list()) {
    if (old instanceof File && old.name.startsWith(`${name}-`) && old.uri !== target.uri) old.delete();
  }
  return target.uri;
}

/** Push fresh data to the iOS widgets. They follow the active space (iOS can't ask per widget). */
export async function refreshWidgets(names: WidgetName[] | '*' = '*') {
  const list = names === '*' ? WIDGET_NAMES : names;
  await Promise.all(
    list.map(async (name) => {
      try {
        const payload = await loadWidget(name);
        const post = payload.status === 'ok' && (name === 'Chalkboard' || name === 'Photo') ? (payload.data as ChalkboardData).post : null;
        const image = post ? await sharedImage(name, post.image_path).catch(() => null) : null;
        IOS_WIDGETS[name].updateSnapshot(present(name, payload, image));
      } catch (e) {
        console.warn(`Widget ${name} refresh failed`, e);
      }
    }),
  );
}
