import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Avatar, Body, Button, H2, IconButton, Loading, Row, Screen, useToast } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import type { Doc } from '@/drawing/model';
import { deletePost, getPost, react, unreact, type PostWithReactions } from '@/lib/api';
import { loadJson, loadSkImage, signedUrl } from '@/lib/media';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { timeAgo } from '@/lib/util';

const REACTIONS = ['❤️', '😍', '😂', '🥺', '🔥', '👏'];

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, spaces } = useSession();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const typeface = useHandTypeface();
  const [post, setPost] = useState<PostWithReactions | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [bg, setBg] = useState<SkImage | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPost(id).catch(() => null);
      if (cancelled) return;
      setPost(p);
      if (!p) return;
      const u = await signedUrl(p.image_path);
      if (!cancelled) setUrl(u);
      if (p.doc_path) {
        const d = await loadJson<Doc>(p.doc_path).catch(() => null);
        if (cancelled) return;
        setDoc(d);
        if (d?.bgImagePath) {
          const img = await loadSkImage(d.bgImagePath).catch(() => null);
          if (!cancelled) setBg(img);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [id]);

  const replay = () => {
    if (!doc) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    const points = doc.items.reduce((n, it) => n + (it.t === 'stroke' ? it.pts.length / 2 : 20), 0);
    const duration = Math.min(9000, Math.max(1800, points * 9));
    const start = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else raf.current = null;
    };
    step();
  };

  if (post === undefined) return <Loading />;
  if (post === null) {
    return (
      <Screen>
        <H2>This board was wiped 🧽</H2>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const space = spaces.find((s) => s.id === post.space_id);
  const author = space?.members.find((m) => m.user_id === post.author_id)?.profile;
  const mine = post.author_id === userId;
  const myReaction = post.reactions.find((r) => r.user_id === userId)?.emoji;
  const W = width - 32;

  const toggleReaction = async (emoji: string) => {
    if (!userId) return;
    try {
      if (myReaction === emoji) await unreact(post.id, userId);
      else await react(post.id, userId, emoji);
      setPost(await getPost(post.id));
    } catch {
      toast("Couldn't react");
    }
  };

  const remove = () =>
    Alert.alert('Delete this?', 'It will disappear from everyone’s board.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            router.back();
          } catch (e) {
            toast("Couldn't delete it", e instanceof Error ? e.message : undefined);
          }
        },
      },
    ]);

  return (
    <Screen>
      <Row>
        <IconButton icon="←" label="Back" onPress={() => router.back()} />
        {author ? <Avatar emoji={author.avatar} color={author.color} size={36} /> : null}
        <View style={{ flex: 1 }}>
          <H2>{author?.display_name ?? 'Someone'}</H2>
          <Body dim>{timeAgo(post.created_at)}</Body>
        </View>
        {mine ? <IconButton icon="🗑️" label="Delete" onPress={remove} /> : null}
      </Row>

      {progress !== null && doc ? (
        <DocView doc={doc} env={{ typeface, bgImage: bg }} width={W} progress={progress} />
      ) : url ? (
        <Image source={{ uri: url }} style={{ width: W, aspectRatio: post.aspect, borderRadius: radius.md }} contentFit="cover" />
      ) : (
        <View style={{ width: W, aspectRatio: post.aspect }} />
      )}

      {post.body && post.kind === 'photo' ? <Body>{post.body}</Body> : null}

      <Row style={{ justifyContent: 'space-between' }}>
        {REACTIONS.map((e) => {
          const count = post.reactions.filter((r) => r.emoji === e).length;
          return (
            <Pressable
              key={e}
              onPress={() => toggleReaction(e)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 18,
                backgroundColor: myReaction === e ? colors.pink + '55' : colors.card,
              }}
            >
              <Text style={{ fontSize: 22 }}>
                {e}
                {count > 1 ? <Text style={{ fontSize: 13, color: colors.text }}> {count}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {doc ? <Button variant="secondary" icon="▶️" title={progress !== null && progress < 1 ? 'Replaying…' : 'Watch it being drawn'} onPress={replay} /> : null}
      <Button icon="🖍️" title={post.kind === 'photo' ? 'Doodle on this photo' : 'Draw on their board'} onPress={() => router.push(`/draw?over=${post.id}&space=${post.space_id}`)} />
      <Button variant="ghost" icon="✏️" title="Reply with a fresh board" onPress={() => router.push(`/draw?space=${post.space_id}`)} />
    </Screen>
  );
}
