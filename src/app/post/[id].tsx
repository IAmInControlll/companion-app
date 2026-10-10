import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { postBackground } from '@/components/BoardStage';
import { Avatar, Body, Button, Caption, H2, Header, Icon, IconButton, Input, Loading, Row, Screen, useToast } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import type { Doc } from '@/drawing/model';
import { loadPhotoImages } from '@/drawing/photos';
import { getPost, react, unreact, type PostWithReactions } from '@/lib/api';
import { loadJson, loadSkImage, signedUrl } from '@/lib/media';
import { DEFAULT_REACTIONS, QUICK_COUNT, firstEmoji, quickReactions, rememberReaction } from '@/lib/reactions';
import { useSession } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { formatWhen } from '@/lib/util';
import { goBack } from '@/lib/nav';

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
  const [images, setImages] = useState<Record<string, SkImage>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const raf = useRef<number | null>(null);
  const [quick, setQuick] = useState(DEFAULT_REACTIONS);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    quickReactions().then(setQuick);
  }, []);

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
        if (d) loadPhotoImages(d.items).then((m) => !cancelled && setImages(m));
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
        <H2>This one’s gone</H2>
        <Body dim>Its sender may have deleted their account.</Body>
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

  // Any emoji from the keyboard. It joins the front of your quick row for next time.
  const pickCustom = (text: string) => {
    const emoji = firstEmoji(text);
    if (!emoji) return;
    setPicking(false);
    Keyboard.dismiss();
    rememberReaction(emoji).then(setQuick);
    if (myReaction !== emoji) toggleReaction(emoji);
  };

  // A custom reaction you already picked stays visible (and selected) in the row.
  const row = myReaction && !quick.includes(myReaction) ? [myReaction, ...quick.slice(0, QUICK_COUNT - 1)] : quick;

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
      </View>

      <View style={[styles.board, { width: W, aspectRatio: post.aspect, backgroundColor: postBackground(post) }]}>
        {progress !== null && doc ? (
          <DocView doc={doc} env={{ typeface, bgImage: bg, images }} width={W} progress={progress} />
        ) : url ? (
          <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" transition={150} />
        ) : null}
      </View>

      {post.body && post.kind === 'photo' ? <Body>{post.body}</Body> : null}

      {mine ? (
        reactionSummary ? <Text style={[type.body, { color: colors.textDim }]}>{reactionSummary}</Text> : null
      ) : (
        <View style={styles.reactions} accessibilityRole="radiogroup" accessibilityLabel="React">
          {row.map((e) => {
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
          <Pressable
            onPress={() => setPicking((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel="React with any emoji"
            style={[styles.reaction, picking && { backgroundColor: colors.accentSoft }]}
          >
            <Icon name="add_reaction" size={24} color={colors.textDim} />
          </Pressable>
        </View>
      )}
      {picking && !mine ? (
        <View style={{ gap: 6 }}>
          <Input
            autoFocus
            placeholder="Type or pick any emoji"
            onChangeText={pickCustom}
            onBlur={() => setPicking(false)}
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={32}
            style={{ textAlign: 'center', fontSize: 22 }}
          />
          <Caption style={{ textAlign: 'center' }}>Switch your keyboard to emoji, then tap one</Caption>
        </View>
      ) : null}

      {/* Same actions whoever drew it (and wherever you came from): replay, then reply / draw on it. */}
      {doc ? (
        <Button variant="secondary" icon="replay" title={progress !== null && progress < 1 ? 'Replaying…' : 'Watch it being drawn'} onPress={replay} />
      ) : null}
      {mine ? null : (
        <Row gap={10}>
          <Button variant="secondary" icon="reply" title="Reply" onPress={() => router.push(`/draw?space=${post.space_id}`)} style={{ flex: 1 }} />
          <Button icon="draw" title="Draw on it" onPress={() => router.push(`/draw?over=${post.id}&space=${post.space_id}`)} style={{ flex: 1 }} />
        </Row>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  board: { borderRadius: radius.board, overflow: 'hidden', alignSelf: 'center' },
  reactions: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 6 },
  reaction: { width: 48, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
