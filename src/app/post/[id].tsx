import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { postBackground } from '@/components/BoardStage';
import { Avatar, Body, Button, H2, Header, IconButton, Loading, Row, Screen, useToast } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import type { Doc } from '@/drawing/model';
import { deletePost, getPost, react, unreact, type PostWithReactions } from '@/lib/api';
import { loadJson, loadSkImage, signedUrl } from '@/lib/media';
import { useSession } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { formatWhen } from '@/lib/util';
import { goBack } from '@/lib/nav';

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
        <Header title="" />
        <H2>This one’s been deleted</H2>
        <Body dim>Whoever sent it took it down.</Body>
      </Screen>
    );
  }

  const space = spaces.find((s) => s.id === post.space_id);
  const author = space?.members.find((m) => m.user_id === post.author_id)?.profile;
  const mine = post.author_id === userId;
  const myReaction = post.reactions.find((r) => r.user_id === userId)?.emoji;
  const W = width - GUTTER * 2;

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
            goBack();
          } catch (e) {
            toast("Couldn't delete it", e instanceof Error ? e.message : undefined);
          }
        },
      },
    ]);

  const reactionSummary = post.reactions
    .filter((r) => r.user_id !== userId)
    .map((r) => `${space?.members.find((m) => m.user_id === r.user_id)?.profile.display_name ?? 'Someone'} ${r.emoji}`)
    .join('  ·  ');

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow_back" label="Back" variant="plain" onPress={() => goBack()} style={{ marginLeft: -10 }} />
        {author ? <Avatar emoji={author.avatar} color={author.color} size={36} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={type.headline} numberOfLines={1}>
            {mine ? 'You' : (author?.display_name ?? 'Someone')}
          </Text>
          <Text style={type.caption}>{formatWhen(post.created_at)}</Text>
        </View>
        {mine ? <IconButton icon="delete" label="Delete" variant="plain" color={colors.textDim} onPress={remove} /> : null}
      </View>

      <View style={[styles.board, { width: W, aspectRatio: post.aspect, backgroundColor: postBackground(post) }]}>
        {progress !== null && doc ? (
          <DocView doc={doc} env={{ typeface, bgImage: bg }} width={W} progress={progress} />
        ) : url ? (
          <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" transition={150} />
        ) : null}
      </View>

      {post.body && post.kind === 'photo' ? <Body>{post.body}</Body> : null}

      {mine ? (
        reactionSummary ? <Text style={[type.body, { color: colors.textDim }]}>{reactionSummary}</Text> : null
      ) : (
        <View style={styles.reactions} accessibilityRole="radiogroup" accessibilityLabel="React">
          {REACTIONS.map((e) => {
            const on = myReaction === e;
            return (
              <Pressable
                key={e}
                onPress={() => toggleReaction(e)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`React ${e}`}
                style={[styles.reaction, on && { backgroundColor: colors.accentSoft }]}
              >
                <Text style={{ fontSize: 24, opacity: myReaction && !on ? 0.5 : 1 }}>{e}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Row gap={10}>
        {doc && mine ? (
          // Your own post: replay is the only action, so give it words.
          <Button variant="secondary" icon="replay" title={progress !== null && progress < 1 ? 'Replaying…' : 'Watch it being drawn'} onPress={replay} style={{ flex: 1 }} />
        ) : doc ? (
          <IconButton icon="replay" label={progress !== null && progress < 1 ? 'Replaying' : 'Watch it being drawn'} size={52} onPress={replay} />
        ) : null}
        {mine ? null : (
          <>
            <Button variant="secondary" icon="reply" title="Reply" onPress={() => router.push(`/draw?space=${post.space_id}`)} style={{ flex: 1 }} />
            <Button
              icon="draw"
              title={post.kind === 'photo' ? 'Doodle on it' : 'Draw on it'}
              onPress={() => router.push(`/draw?over=${post.id}&space=${post.space_id}`)}
              style={{ flex: 1 }}
            />
          </>
        )}
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  board: { borderRadius: radius.board, overflow: 'hidden', alignSelf: 'center' },
  reactions: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 6 },
  reaction: { width: 48, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
