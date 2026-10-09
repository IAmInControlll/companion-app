import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoardStage } from '@/components/BoardStage';
import { scoreLine, standings, useNudgeScores } from '@/components/Scoreboard';
import { SpaceRow, spaceFace } from '@/components/SpaceRow';
import { Avatar, Icon, IconButton, Sheet, StatusBarScrim, useToast, type IconName } from '@/components/ui';
import { getDailyQuestion, getStreak, listAnswers, listPosts, react, sendNudge, type PostWithReactions } from '@/lib/api';
import { SHOW_QUESTIONS } from '@/lib/features';
import { signedUrl } from '@/lib/media';
import { NUDGES, nudgeInfo } from '@/lib/nudges';
import { useSpace } from '@/lib/session';
import { GUTTER, colors, fonts, radius, type } from '@/lib/theme';
import type { NudgeKind } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { formatWhen } from '@/lib/util';

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
  const [nudging, setNudging] = useState(false);
  const todayScores = useNudgeScores(space.id, 'today', nudging && !alone);

  const load = useCallback(async () => {
    // Nobody to hear from yet: show your own latest board.
    const author = whose === 'mine' || alone ? { is: userId } : { not: userId };
    const [posts, s, q] = await Promise.all([
      listPosts(space.id, { limit: 1, author }),
      getStreak(space.id).catch(() => null),
      SHOW_QUESTIONS ? getDailyQuestion(space.id).catch(() => null) : null,
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
    setNudging(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await sendNudge(space.id, kind);
      toast(`${nudgeInfo(kind).emoji} Sent to ${face.name}`);
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
  const chrome = insets.top + 4 + 52 + 76 + 56 + 14 * 3 + (12 + ACTION_SIZE + 6 + 17 + 12) + insets.bottom + 8;
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
          <IconButton icon="history" label="Timeline" variant="plain" onPress={() => router.push('/timeline')} />
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
        {alone ? <Action icon="share" label="Invite" tone="accent" onPress={invite} a11y={`Invite ${face.waitingFor}`} /> : null}
        <Action icon="draw" label="Draw" tone={alone ? 'plain' : 'accent'} onPress={() => router.push('/draw')} />
        <Action icon="text_fields" label="Note" onPress={() => router.push('/note')} a11y="Write a note" />
        {alone ? null : (
          <Action icon="favorite" label="Nudge" tone="heart" onPress={() => setNudging(true)} a11y={`Nudge ${face.name}`} hint="Miss you, hug, kiss, poke and more" />
        )}
        <Action icon="mood" label="Mood" onPress={() => router.push('/mood')} a11y="Set your mood" />
      </View>

      <StatusBarScrim />

      <Sheet visible={nudging} onClose={() => setNudging(false)} title={`Send ${face.name}…`}>
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
        {todayScores ? (
          <Pressable
            onPress={() => {
              setNudging(false);
              router.push('/timeline');
            }}
            accessibilityRole="button"
            accessibilityHint="Opens the timeline"
          >
            <Text style={[type.caption, { textAlign: 'center' }]}>Today: {scoreLine(standings(space, userId, todayScores))}</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

const ACTION_SIZE = 56;

/** Round button with its label underneath, for the row under the board. */
function Action({
  icon,
  label,
  onPress,
  onLongPress,
  tone = 'plain',
  a11y,
  hint,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** accent: the main action. heart: the one-tap "miss you". */
  tone?: 'plain' | 'accent' | 'heart';
  a11y?: string;
  hint?: string;
}) {
  const bg = tone === 'accent' ? colors.accent : tone === 'heart' ? colors.text : colors.surfaceHi;
  const fg = tone === 'accent' ? colors.onAccent : tone === 'heart' ? colors.accent : colors.text;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityHint={hint} style={styles.action}>
      {({ pressed }) => (
        <>
          <View style={[styles.actionCircle, { backgroundColor: bg }, pressed && { transform: [{ scale: 0.92 }] }]}>
            <Icon name={icon} filled={tone === 'heart'} size={26} color={fg} />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

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
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: GUTTER - 8, paddingTop: 12 },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionCircle: { width: ACTION_SIZE, height: ACTION_SIZE, borderRadius: ACTION_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...type.caption, color: colors.text },
  nudges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  nudge: { width: '31%', flexGrow: 1, aspectRatio: 1.15, borderRadius: radius.md, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
