import { Skia, type SkImage } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = { uri: string; width: number; height: number };

/** Photos used as a drawing background are cropped into this range so the canvas stays drawable. */
export const MIN_PHOTO_ASPECT = 0.6;
export const MAX_PHOTO_ASPECT = 1.8;

/**
 * Let the user pick (or take) a photo, then shrink it for upload (widgets show at most ~400dp)
 * and centre-crop very tall/wide shots. Returns null if they cancel; throws if permission is denied.
 */
export async function pickPhoto(camera: boolean): Promise<PickedPhoto | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission needed');
  }
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;

  const ctx = ImageManipulator.manipulate(a.uri);
  let w = a.width;
  let h = a.height;
  if (w / h > MAX_PHOTO_ASPECT) {
    w = Math.round(h * MAX_PHOTO_ASPECT);
    ctx.crop({ originX: Math.round((a.width - w) / 2), originY: 0, width: w, height: h });
  } else if (w / h < MIN_PHOTO_ASPECT) {
    h = Math.round(w / MIN_PHOTO_ASPECT);
    ctx.crop({ originX: 0, originY: Math.round((a.height - h) / 2), width: w, height: h });
  }
  if (Math.max(w, h) > 1280) ctx.resize(w >= h ? { width: 1280 } : { height: 1280 });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** A copy of a local photo turned 90° clockwise. */
export async function rotatePhoto(uri: string): Promise<PickedPhoto> {
  const out = await (await ImageManipulator.manipulate(uri).rotate(90).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** Decode a local photo for the Skia canvas. */
export async function loadLocalSkImage(uri: string): Promise<SkImage | null> {
  const bytes = await new File(uri).bytes();
  return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
}

/** A drawing background that hasn't been uploaded yet (a local file picked on this phone). */
export const isLocalPhoto = (path: string | null | undefined): path is string => !!path && path.startsWith('file:');
