import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoardStage } from '@/components/BoardStage';
import { SpaceRow, spaceFace } from '@/components/SpaceRow';
import { Avatar, Icon, IconButton, ListGroup, ListRow, Sheet, StatusBarScrim, useToast } from '@/components/ui';
import { getDailyQuestion, getStreak, listAnswers, listPosts, react, sendNudge, type PostWithReactions } from '@/lib/api';
import { signedUrl } from '@/lib/media';
import { useSpace } from '@/lib/session';
import { GUTTER, colors, fonts, radius, type } from '@/lib/theme';
import type { NudgeKind } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { formatWhen } from '@/lib/util';

const NUDGES: { kind: NudgeKind; emoji: string; label: string }[] = [
  { kind: 'miss_you', emoji: '💗', label: 'Miss you' },
  { kind: 'hug', emoji: '🤗', label: 'Hug' },
  { kind: 'kiss', emoji: '😘', label: 'Kiss' },
  { kind: 'love', emoji: '❤️', label: 'Love' },
  { kind: 'high_five', emoji: '✋', label: 'High five' },
  { kind: 'poke', emoji: '👉', label: 'Poke' },
];

type Whose = 'theirs' | 'mine';

export default function Home() {
  const { space, spaces, setActiveSpace, userId } = useSpace();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const face = spaceFace(space, userId);
  const alone = face.others.length === 0;

  const [whose, setWhose] = useState<Whose>('theirs');
  const [latest, setLatest] = useState<{ post: PostWithReactions; url: string } | null | undefined>(undefined);
  const [streak, setStreak] = useState<{ count: number; questionOpen: boolean } | null>(null);
  const [sheet, setSheet] = useState<'none' | 'send' | 'nudge'>('none');

  const load = useCallback(async () => {
    // Nobody to hear from yet: show your own latest board.
    const author = whose === 'mine' || alone ? { is: userId } : { not: userId };
    const [posts, s, q] = await Promise.all([
      listPosts(space.id, { limit: 1, author }),
      getStreak(space.id).catch(() => null),
      getDailyQuestion(space.id).catch(() => null),
    ]);
    const post = posts[0] ?? null;
    setLatest(post ? { post, url: await signedUrl(post.image_path) } : null);
    const answered = q ? (await listAnswers(space.id, q.day).catch(() => [])).some((a) => a.user_id === userId) : true;
    if (s) setStreak({ count: s.streak, questionOpen: !answered });
  }, [space.id, userId, whose, alone]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );
  // (Reactions have no space_id to filter on; they refresh on focus and with their post.)
  useSpaceRealtime(space.id, ['posts', 'answers', 'nudges'], () => load().catch(() => {}));

  const nudge = async (kind: NudgeKind) => {
    setSheet('none');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await sendNudge(space.id, kind);
      const n = NUDGES.find((x) => x.kind === kind)!;
      toast(`${n.emoji} Sent to ${face.name}`);
    } catch {
      toast("Couldn't send", 'Check your connection and try again.');
    }
  };

  const heart = async () => {
    if (!latest || latest.post.author_id === userId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await react(latest.post.id, userId, '❤️');
      load().catch(() => {});
    } catch {
      toast("Couldn't react");
    }
  };

  const invite = () => Share.share({ message: `Join me on Chalkmates: open the app, tap “I have a code” and enter ${space.invite_code}` }).catch(() => {});

  // Square board, shrunk on short screens so the action bar never scrolls away.
  const chrome = insets.top + 4 + 52 + 76 + 56 + 14 * 3 + (12 + 56 + 12) + insets.bottom + 8;
  const boardSize = Math.min(width - GUTTER * 2, height - chrome);
  const post = latest?.post ?? null;
  const fromMe = whose === 'mine';
  const author = post ? space.members.find((m) => m.user_id === post.author_id)?.profile : null;
  const reactions = post ? [...new Set(post.reactions.map((r) => r.emoji))].join('') : '';
  const empty = alone
    ? ['waiting for', face.waitingFor]
    : fromMe
      ? ['nothing from', 'you yet']
      : [`nothing from`, face.partner ? face.partner.display_name : 'them yet'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top + 4, paddingHorizontal: GUTTER, gap: 14 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[type.wordmark, { flex: 1 }]}>Chalkmates</Text>
          {streak ? (
            <Pressable
              onPress={() => router.push('/together')}
              accessibilityRole="button"
              accessibilityLabel={`${streak.count} day streak${streak.questionOpen ? ', today’s question is waiting' : ''}`}
              style={({ pressed }) => [styles.streak, pressed && { opacity: 0.75 }]}
            >
              <Icon name="local_fire_department" filled size={18} color={streak.count > 0 ? colors.yellow : colors.textDim} />
              <Text style={[type.label, { fontSize: 14 }]}>{streak.count}</Text>
              {streak.questionOpen ? <View style={styles.dot} /> : null}
            </Pressable>
          ) : null}
          <IconButton icon="photo_library" label="History" variant="plain" onPress={() => router.push('/history')} />
          <IconButton icon="settings" label="Settings" variant="plain" onPress={() => router.push('/settings')} style={{ marginRight: -8 }} />
        </View>

        <SpaceRow
          spaces={spaces}
          activeId={space.id}
          userId={userId}
          onSelect={(s) => (s.id === space.id ? router.push(`/space/${s.id}`) : setActiveSpace(s.id))}
          onAdd={() => router.push('/new-space')}
        />

        {/* The board */}
        <BoardStage
          size={boardSize}
          post={post}
          url={latest?.url ?? null}
          empty={empty}
          label={post ? `${fromMe ? 'Your' : author ? `${author.display_name}’s` : 'Their'} latest ${post.kind}, ${formatWhen(post.created_at)}` : empty.join(' ')}
          onPress={() => (post ? router.push(`/post/${post.id}`) : alone ? invite() : router.push('/draw'))}
          onDoubleTap={post && !fromMe ? heart : undefined}
        />

        {/* Who / when, or the invite code while nobody has joined */}
        {alone ? (
          <View style={styles.meta}>
            <View style={{ flex: 1 }}>
              <Text style={type.caption}>Invite code</Text>
              <Text style={styles.code} selectable>
                {space.invite_code}
              </Text>
            </View>
            <IconButton
              icon="content_copy"
              label="Copy code"
              onPress={async () => {
                await Clipboard.setStringAsync(space.invite_code);
                toast('Code copied');
              }}
            />
          </View>
        ) : (
          <View style={styles.meta}>
            {post && author ? <Avatar emoji={author.avatar} color={author.color} size={40} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={type.headline} numberOfLines={1}>
                {post ? (fromMe ? 'You' : (author?.display_name ?? 'Someone')) : fromMe ? 'You' : face.name}
              </Text>
              <Text style={type.caption}>{post ? formatWhen(post.created_at) : fromMe ? 'Nothing sent yet' : 'Nothing yet'}</Text>
            </View>
            {reactions ? <Text style={styles.reactions}>{reactions}</Text> : null}
            <IconButton
              icon="swap_horiz"
              label={fromMe ? `Show ${face.name}’s board` : 'Show your board'}
              onPress={() => {
                setLatest(undefined);
                setWhose(fromMe ? 'theirs' : 'mine');
              }}
            />
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        {alone ? null : (
          <Pressable
            onPress={() => nudge('miss_you')}
            onLongPress={() => setSheet('nudge')}
            accessibilityRole="button"
            accessibilityLabel={`Tell ${face.name} you miss them`}
            accessibilityHint="Long press for hugs, kisses and more"
            style={({ pressed }) => [styles.heartBtn, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Icon name="favorite" filled size={26} color={colors.accent} />
          </Pressable>
        )}
        <Pressable
          onPress={() => (alone ? invite() : router.push('/draw'))}
          accessibilityRole="button"
          style={({ pressed }) => [styles.drawBtn, pressed && { opacity: 0.85 }]}
        >
          <Icon name={alone ? 'share' : 'draw'} size={22} color={colors.onAccent} />
          <Text style={[type.label, { fontSize: 17, color: colors.onAccent }]}>{alone ? `Invite ${face.waitingFor}` : 'Draw'}</Text>
        </Pressable>
        <IconButton icon="add" label="More ways to send" size={56} onPress={() => setSheet('send')} />
      </View>

      <StatusBarScrim />

      <Sheet visible={sheet === 'send'} onClose={() => setSheet('none')}>
        <ListGroup>
          <ListRow icon="draw" title="Draw" subtitle="On a fresh chalkboard" onPress={go(setSheet, '/draw')} />
          <ListRow icon="text_fields" title="Write a note" subtitle="Typed in chalk, sized to fit" onPress={go(setSheet, '/note')} />
          <ListRow icon="photo_camera" title="Share a photo" subtitle="Shows on their Photo widget" onPress={go(setSheet, '/photo')} />
        </ListGroup>
        <ListGroup>
          {alone ? null : <ListRow icon="favorite" title="Send a nudge" subtitle="Hug, kiss, high five…" onPress={() => setSheet('nudge')} />}
          <ListRow icon="mood" title="Set your mood" onPress={go(setSheet, '/mood')} />
        </ListGroup>
      </Sheet>

      <Sheet visible={sheet === 'nudge'} onClose={() => setSheet('none')} title={`Send ${face.name}…`}>
        <View style={styles.nudges}>
          {NUDGES.map((n) => (
            <Pressable
              key={n.kind}
              onPress={() => nudge(n.kind)}
              accessibilityRole="button"
              accessibilityLabel={n.label}
              style={({ pressed }) => [styles.nudge, pressed && { backgroundColor: colors.line }]}
            >
              <Text style={{ fontSize: 34 }}>{n.emoji}</Text>
              <Text style={type.caption}>{n.label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/** Close the sheet, then navigate (so the sheet isn't left open behind the new screen). */
const go = (setSheet: (s: 'none') => void, href: '/draw' | '/note' | '/photo' | '/mood') => () => {
  setSheet('none');
  router.push(href);
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 52 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginRight: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginLeft: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  code: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: 4, color: colors.text },
  reactions: { fontSize: 18, letterSpacing: 2 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingTop: 12 },
  heartBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  drawBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nudges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  nudge: { width: '31%', flexGrow: 1, aspectRatio: 1.15, borderRadius: radius.md, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
