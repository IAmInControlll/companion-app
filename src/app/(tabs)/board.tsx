import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Chip, H1, Row } from '@/components/ui';
import { listPosts, type PostWithReactions } from '@/lib/api';
import { signedUrls } from '@/lib/media';
import { useSpace } from '@/lib/session';
import { HAND_FONT, colors, radius } from '@/lib/theme';
import type { PostKind } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { timeAgo } from '@/lib/util';

const PAGE = 24;

const FILTERS: { id: PostKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'drawing', label: '✏️ Drawings' },
  { id: 'note', label: '📝 Notes' },
  { id: 'photo', label: '📷 Photos' },
];

export default function Board() {
  const { space } = useSpace();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<PostKind | 'all'>('all');
  const [posts, setPosts] = useState<PostWithReactions[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);

  // Ignore responses from superseded requests (e.g. the filter changed mid-flight).
  const requestId = useRef(0);
  const shown = useRef(0);

  /** Load the first page (`count` rows), or the page after `before`. */
  const fetchPage = useCallback(
    async (before?: string, count = PAGE) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const page = await listPosts(space.id, { before, limit: count, kind: filter === 'all' ? undefined : filter });
        const signed = await signedUrls(page.map((p) => p.image_path));
        if (id !== requestId.current) return;
        setUrls((u) => ({ ...u, ...signed }));
        setPosts((prev) => {
          const next = before ? [...prev, ...page] : page;
          shown.current = next.length;
          return next;
        });
        setDone(page.length < count);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [space.id, filter],
  );

  useFocusEffect(
    useCallback(() => {
      fetchPage().catch(() => {});
    }, [fetchPage]),
  );
  // A live change reloads as many rows as are on screen, so scrolling position isn't lost.
  useSpaceRealtime(space.id, ['posts'], () => fetchPage(undefined, Math.max(PAGE, shown.current)).catch(() => {}));

  const tile = (width - 16 * 2 - 10) / 2;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
      columnWrapperStyle={{ gap: 10 }}
      numColumns={2}
      data={posts}
      keyExtractor={(p) => p.id}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (!done && !loading && posts.length) fetchPage(posts[posts.length - 1].created_at).catch(() => {});
      }}
      refreshing={pulling}
      onRefresh={() => {
        setPulling(true);
        fetchPage()
          .catch(() => {})
          .finally(() => setPulling(false));
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <H1>Our board</H1>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <Chip key={f.id} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />
            ))}
          </Row>
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <Pressable onPress={() => router.push('/draw')} style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Body dim>Nothing here yet. Tap to draw something ✏️</Body>
          </Pressable>
        )
      }
      renderItem={({ item }) => {
        const author = space.members.find((m) => m.user_id === item.author_id)?.profile;
        const hearts = item.reactions.map((r) => r.emoji).join('');
        return (
          <Pressable onPress={() => router.push(`/post/${item.id}`)} style={{ width: tile }}>
            <Image source={{ uri: urls[item.image_path] }} style={[styles.thumb, { width: tile, height: tile }]} contentFit="cover" transition={150} />
            <Text style={styles.caption} numberOfLines={1}>
              {author?.avatar} {timeAgo(item.created_at)} {hearts}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md, backgroundColor: colors.card },
  caption: { fontFamily: HAND_FONT, color: colors.textDim, fontSize: 15, marginTop: 4 },
});
