import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeHeader, useRecipient } from '@/components/ComposeHeader';
import { Button, Icon, Input, Row, useToast } from '@/components/ui';
import { createPost } from '@/lib/api';
import { newMediaPath, primeCache, uploadBytes } from '@/lib/media';
import { useSpace, useSpaceParam } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { goBack } from '@/lib/nav';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';

export default function PhotoScreen() {
  const { space: spaceParam } = useLocalSearchParams<{ space?: string }>();
  useSpaceParam(spaceParam);
  const { space } = useSpace();
  const toast = useToast();
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const recipient = useRecipient().name;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const pick = async (camera: boolean) => {
    try {
      const p = await pickPhoto(camera);
      if (p) setPicked(p);
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
      toast(recipient ? `Shared with ${recipient}` : 'Saved to your board');
      goBack();
    } catch (e) {
      toast("Couldn't share", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  const W = width - GUTTER * 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ComposeHeader onClose={() => goBack()} onSend={send} disabled={!picked} busy={sending} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {picked ? (
          <Pressable onPress={() => pick(false)} accessibilityRole="button" accessibilityLabel="Choose a different photo">
            <Image source={{ uri: picked.uri }} style={[styles.photo, { width: W, height: Math.min(W / (picked.width / picked.height), W * 1.25) }]} contentFit="cover" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => pick(false)}
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            style={({ pressed }) => [styles.placeholder, { width: W, height: W }, pressed && { backgroundColor: colors.surfaceHi }]}
          >
            <Icon name="add_photo_alternate" size={44} color={colors.textDim} />
            <Text style={type.headline}>Choose a photo</Text>
            <Text style={type.caption}>It shows up on their Photo widget</Text>
          </Pressable>
        )}
        <Row gap={10}>
          <Button variant="secondary" title="Gallery" icon="image" onPress={() => pick(false)} style={{ flex: 1 }} />
          <Button variant="secondary" title="Camera" icon="photo_camera" onPress={() => pick(true)} style={{ flex: 1 }} />
        </Row>
        {picked ? (
          <>
            <Button
              icon="draw"
              variant="secondary"
              title="Draw on it"
              onPress={() =>
                // Replace, so sending from Draw lands back on Home rather than here.
                router.replace({ pathname: '/draw', params: { photo: picked.uri, w: String(picked.width), h: String(picked.height), space: space.id } })
              }
            />
            <Input placeholder="Add a caption (optional)" value={caption} onChangeText={setCaption} maxLength={200} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: GUTTER, gap: 16, paddingTop: 8 },
  photo: { borderRadius: radius.board, backgroundColor: colors.surface },
  placeholder: { borderRadius: radius.board, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
