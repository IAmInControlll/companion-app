import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Scoreboard } from '@/components/Scoreboard';
import { SpaceRow, spaceFace } from '@/components/SpaceRow';
import { Avatar, Button, Header, Icon, StatusBarScrim } from '@/components/ui';
import { listActivity, type Activity } from '@/lib/api';
import { nudgeInfo } from '@/lib/nudges';
import { useSpace } from '@/lib/session';
import { GUTTER, HAND_FONT, colors, radius, type } from '@/lib/theme';
import { groupActivity, type TimelineEntry } from '@/lib/timeline';
import type { PostKind } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { dayLabel } from '@/lib/util';

const DAY_MS = 86_400_000;
/** Days loaded at first, and how many more each "Show earlier" adds. */
const FIRST_WINDOW = 14;
const MORE = 30;

const POST_DID: Record<PostKind, string> = { drawing: 'drew on the board', note: 'left a note', photo: 'drew on a photo' };
const POST_EMOJI: Record<PostKind, string> = { drawing: '✏️', note: '📝', photo: '📷' };

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Who did what to whom: nudges, boards and reactions, newest first, repeats collapsed. */
export default function Timeline() {
  const { space, spaces, setActiveSpace, userId } = useSpace();
  const insets = useSafeAreaInsets();
  const face = spaceFace(space, userId);

  const [lookback, setLookback] = useState(FIRST_WINDOW);
  const [items, setItems] = useState<Activity[] | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const shown = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const list = await listActivity(space.id, new Date(Date.now() - lookback * DAY_MS).toISOString());
      if (id !== requestId.current) return;
      // Nothing in the last couple of weeks: look back further before calling it empty.
      if (!list.length && lookback === FIRST_WINDOW) {
        setLookback(365);
        return;
      }
      setDone(lookback > FIRST_WINDOW && list.length === shown.current);
      shown.current = list.length;
      setItems(list);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [space.id, lookback]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setItems((i) => i ?? []));
    }, [load]),
  );
  useSpaceRealtime(space.id, ['nudges', 'posts'], () => load().catch(() => {}));

  const sections = useMemo(() => groupActivity(items ?? [], (iso) => dayLabel(iso)).map((d) => ({ title: d.title, data: [d.data] })), [items]);

  const profileOf = (id: string) => space.members.find((m) => m.user_id === id)?.profile;
  const who = (id: string) => (id === userId ? 'You' : (profileOf(id)?.display_name ?? 'Someone'));
  // Nudges go to everyone else in the space.
  const whom = (actor: string) => (space.kind === 'couple' ? (actor === userId ? (face.partner?.display_name ?? 'them') : 'you') : 'everyone');

  const describe = (e: TimelineEntry): { emoji: string; did: string; postId: string | null } => {
    switch (e.type) {
      case 'nudge':
        return { emoji: nudgeInfo(e.kind).emoji, did: nudgeInfo(e.kind).did(whom(e.actor)), postId: null };
      case 'post':
        return { emoji: POST_EMOJI[e.kind], did: POST_DID[e.kind], postId: e.id };
      case 'reaction': {
        const owner = e.postAuthor === userId ? 'your' : e.postAuthor === e.actor ? 'their' : `${who(e.postAuthor)}’s`;
        return { emoji: e.emoji, did: `reacted ${e.emoji} to ${owner} ${e.postKind === 'note' ? 'note' : 'board'}`, postId: e.postId };
      }
    }
  };

  const renderEntry = (e: TimelineEntry, i: number) => {
    const { emoji, did, postId } = describe(e);
    const p = profileOf(e.actor);
    const name = who(e.actor);
    const when = e.count > 1 && clock(e.firstAt) !== clock(e.at) ? `${clock(e.firstAt)} – ${clock(e.at)}` : clock(e.at);
    return (
      <Pressable
        key={`${e.type}:${e.id}`}
        disabled={!postId}
        onPress={() => postId && router.push(`/post/${postId}`)}
        accessibilityRole={postId ? 'button' : undefined}
        accessibilityLabel={`${name} ${did}${e.count > 1 ? `, ${e.count} times` : ''}, ${when}`}
        style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.surfaceHi }]}
      >
        <Avatar emoji={p?.avatar ?? '🙂'} color={p?.color ?? colors.textDim} size={38} badge={emoji} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={type.body}>
            <Text style={type.label}>{name}</Text> {did}
          </Text>
          <Text style={type.caption}>{when}</Text>
        </View>
        {e.count > 1 ? <Text style={styles.count}>×{e.count}</Text> : null}
        {postId ? <Icon name="chevron_right" size={20} color={colors.textFaint} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(day, i) => `${i}:${day[0]?.id}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingBottom: 6 }}>
            <Header title="Timeline" />
            {spaces.length > 1 ? (
              <SpaceRow
                spaces={spaces}
                activeId={space.id}
                userId={userId}
                onSelect={(s) => {
                  setItems(null);
                  setDone(false);
                  shown.current = 0;
                  setLookback(FIRST_WINDOW);
                  setActiveSpace(s.id);
                }}
              />
            ) : null}
            {space.members.length > 1 ? <Scoreboard space={space} userId={userId} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
        renderItem={({ item: entries }) => <View style={styles.card}>{entries.map(renderEntry)}</View>}
        ListEmptyComponent={
          items === null ? null : (
            <View style={styles.empty}>
              <Icon name="history" size={40} color={colors.textFaint} />
              <Text style={[type.headline, { textAlign: 'center' }]}>Nothing yet</Text>
              <Text style={[type.body, { color: colors.textDim, textAlign: 'center' }]}>Every nudge, board and reaction between you shows up here.</Text>
            </View>
          )
        }
        ListFooterComponent={
          items?.length && !done ? (
            <Button variant="ghost" title="Show earlier" loading={loading} onPress={() => setLookback((w) => w + MORE)} style={{ marginTop: 16 }} />
          ) : null
        }
      />
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  day: { ...type.micro, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 14, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  count: { fontFamily: HAND_FONT, fontSize: 24, lineHeight: 28, color: colors.accent },
  empty: { alignItems: 'center', gap: 8, paddingTop: 64, paddingHorizontal: 24 },
});
