import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, H1, Input, Row, Screen, useToast } from '@/components/ui';
import { createPost } from '@/lib/api';
import { newMediaPath, primeCache, uploadBytes } from '@/lib/media';
import { useSpace, useSpaceParam } from '@/lib/session';
import { radius } from '@/lib/theme';

type Picked = { uri: string; width: number; height: number };

export default function PhotoScreen() {
  const { space: spaceParam } = useLocalSearchParams<{ space?: string }>();
  useSpaceParam(spaceParam);
  const { space } = useSpace();
  const toast = useToast();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return toast('Camera permission needed');
      }
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      // Keep uploads small: widgets show at most ~400dp.
      const ctx = ImageManipulator.manipulate(a.uri);
      if (Math.max(a.width, a.height) > 1280) ctx.resize(a.width >= a.height ? { width: 1280 } : { height: 1280 });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
      setPicked({ uri: out.uri, width: out.width, height: out.height });
    } catch (e) {
      toast("Couldn't open that photo", e instanceof Error ? e.message : undefined);
    }
  };

  const send = async () => {
    if (!picked) return;
    setSending(true);
    try {
      const bytes = await new File(picked.uri).bytes();
      const path = newMediaPath(space.id, 'jpg');
      await uploadBytes(path, bytes, 'image/jpeg');
      primeCache(path, bytes);
      await createPost({
        space_id: space.id,
        kind: 'photo',
        image_path: path,
        body: caption.trim() || null,
        board: 'clear',
        aspect: Math.min(4, Math.max(0.25, picked.width / picked.height)),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Photo shared 📷');
      router.back();
    } catch (e) {
      toast("Couldn't share", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <H1>Share a photo</H1>
      {picked ? (
        <Image source={{ uri: picked.uri }} style={{ width: '100%', aspectRatio: picked.width / picked.height, borderRadius: radius.md }} />
      ) : (
        <View style={{ aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: '#3A4B43', alignItems: 'center', justifyContent: 'center' }}>
          <Body dim>It’ll show up on their Photo widget</Body>
        </View>
      )}
      <Row>
        <Button variant="secondary" title="Gallery" icon="🖼️" onPress={() => pick(false)} style={{ flex: 1 }} />
        <Button variant="secondary" title="Camera" icon="📸" onPress={() => pick(true)} style={{ flex: 1 }} />
      </Row>
      {picked ? <Input placeholder="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={200} /> : null}
      <Row>
        <Button variant="ghost" title="Cancel" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title="Share" disabled={!picked} loading={sending} onPress={send} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
