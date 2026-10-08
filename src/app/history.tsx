import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { postBackground } from '@/components/BoardStage';
import { SpaceRow, spaceFace } from '@/components/SpaceRow';
import { Avatar, Button, Header, Icon, Segmented, StatusBarScrim } from '@/components/ui';
import { listPosts, type AuthorFilter, type PostWithReactions } from '@/lib/api';
import { signedUrls } from '@/lib/media';
import { useSpace } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { dayLabel, formatWhen } from '@/lib/util';

const PAGE = 30;
const GAP = 12;

type Layout = 'grid' | 'single';
type Whose = 'all' | 'theirs' | 'mine';

export default function History() {
  const { space, spaces, setActiveSpace, userId } = useSpace();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const face = spaceFace(space, userId);

  const [layout, setLayout] = useState<Layout>('grid');
  const [whose, setWhose] = useState<Whose>('all');
  const [posts, setPosts] = useState<PostWithReactions[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);

  // Ignore responses from superseded requests (filter or space changed mid-flight).
  const requestId = useRef(0);
  const shown = useRef(0);

  const author: AuthorFilter | undefined = whose === 'mine' ? { is: userId } : whose === 'theirs' ? { not: userId } : undefined;

  /** Load the first page (`count` rows), or the page after `before`. */
  const fetchPage = useCallback(
    async (before?: string, count = PAGE) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const page = await listPosts(space.id, { before, limit: count, author });
        const signed = await signedUrls(page.map((p) => p.image_path));
        if (id !== requestId.current) return;
        setUrls((u) => ({ ...u, ...signed }));
        setPosts((prev) => {
          const next = before ? [...(prev ?? []), ...page] : page;
          shown.current = next.length;
          return next;
        });
        setDone(page.length < count);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [space.id, whose, userId],
  );

  useFocusEffect(
    useCallback(() => {
      fetchPage().catch(() => setPosts((p) => p ?? []));
    }, [fetchPage]),
  );
  // A live change reloads as many rows as are on screen, so the scroll position isn't lost.
  useSpaceRealtime(space.id, ['posts'], () => fetchPage(undefined, Math.max(PAGE, shown.current)).catch(() => {}));

  const tile = (width - GUTTER * 2 - GAP) / 2;

  const sections = useMemo(() => {
    const byDay: { title: string; data: PostWithReactions[] }[] = [];
    for (const p of posts ?? []) {
      const title = dayLabel(p.created_at);
      const last = byDay[byDay.length - 1];
      if (last?.title === title) last.data.push(p);
      else byDay.push({ title, data: [p] });
    }
    if (layout === 'single') return byDay.map((s) => ({ title: s.title, data: s.data.map((p) => [p]) }));
    // Grid: two posts per row.
    return byDay.map((s) => ({
      title: s.title,
      data: s.data.reduce<PostWithReactions[][]>((rows, p, i) => (i % 2 ? rows[rows.length - 1].push(p) : rows.push([p]), rows), []),
    }));
  }, [posts, layout]);

  const profileOf = (id: string) => space.members.find((m) => m.user_id === id)?.profile;
  const theirLabel = face.partner ? `From ${face.partner.display_name}` : space.kind === 'couple' ? 'From them' : 'From others';

  const header = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <Header
        title="History"
        right={
          <Segmented
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', icon: 'grid_view', a11y: 'Grid' },
              { value: 'single', icon: 'crop_square', a11y: 'One at a time' },
            ]}
          />
        }
      />
      {spaces.length > 1 ? <SpaceRow spaces={spaces} activeId={space.id} userId={userId} onSelect={(s) => setActiveSpace(s.id)} /> : null}
      <Segmented
        value={whose}
        onChange={(w) => {
          setPosts(null);
          setWhose(w);
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'theirs', label: theirLabel },
          { value: 'mine', label: 'From you' },
        ]}
      />
    </View>
  );

  const renderPost = (p: PostWithReactions, size: number, big: boolean) => {
    const who = profileOf(p.author_id);
    const reactions = [...new Set(p.reactions.map((r) => r.emoji))].join('');
    const mine = p.author_id === userId;
    return (
      <Pressable
        key={p.id}
        onPress={() => router.push(`/post/${p.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${mine ? 'Your' : `${who?.display_name ?? 'Their'}`} ${p.kind}, ${formatWhen(p.created_at)}`}
        style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.tile, { width: size, height: size, borderRadius: big ? radius.board : 20, backgroundColor: postBackground(p) }]}>
          <Image source={{ uri: urls[p.image_path] }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} recyclingKey={p.id} />
          {big ? null : (
            <View style={styles.tileMeta}>
              <View style={styles.pill}>
                {who ? <Text style={{ fontSize: 12 }}>{who.avatar}</Text> : null}
                <Text style={[type.micro, { color: '#FFFFFF' }]}>{new Date(p.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              {reactions ? <Text style={styles.tileReactions}>{reactions}</Text> : null}
            </View>
          )}
        </View>
        {big ? (
          <View style={styles.bigMeta}>
            {who ? <Avatar emoji={who.avatar} color={who.color} size={36} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={type.headline}>{mine ? 'You' : (who?.display_name ?? 'Someone')}</Text>
              <Text style={type.caption}>{formatWhen(p.created_at)}</Text>
            </View>
            {reactions ? <Text style={{ fontSize: 18, letterSpacing: 2 }}>{reactions}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((p) => p.id).join('+')}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
        renderItem={({ item: row }) =>
          layout === 'single' ? (
            <View style={{ marginBottom: 24 }}>{renderPost(row[0], width - GUTTER * 2, true)}</View>
          ) : (
            <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>{row.map((p) => renderPost(p, tile, false))}</View>
          )
        }
        ListEmptyComponent={
          posts === null ? null : (
            <View style={styles.empty}>
              <Icon name="history" size={40} color={colors.textFaint} />
              <Text style={[type.headline, { textAlign: 'center' }]}>
                {whose === 'mine' ? 'You haven’t sent anything yet' : whose === 'theirs' ? `Nothing ${theirLabel.toLowerCase()} yet` : 'Nothing here yet'}
              </Text>
              <Text style={[type.body, { color: colors.textDim, textAlign: 'center' }]}>Everything you send each other is kept here.</Text>
              <Button variant="secondary" icon="draw" title="Draw something" onPress={() => router.push('/draw')} style={{ marginTop: 8 }} />
            </View>
          )
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!done && !loading && posts?.length) fetchPage(posts[posts.length - 1].created_at).catch(() => {});
        }}
        refreshing={pulling}
        onRefresh={() => {
          setPulling(true);
          fetchPage()
            .catch(() => {})
            .finally(() => setPulling(false));
        }}
      />
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  day: { ...type.micro, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 14, marginBottom: 10, marginLeft: 2 },
  tile: { overflow: 'hidden' },
  tileMeta: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00000080', borderRadius: radius.pill, paddingHorizontal: 8, height: 24 },
  tileReactions: { fontSize: 16 },
  bigMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 64, paddingHorizontal: 24 },
});
