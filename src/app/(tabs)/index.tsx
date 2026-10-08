import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar, Body, Card, Chip, H1, H2, Row, Screen, useToast } from '@/components/ui';
import {
  getDailyQuestion,
  getStreak,
  latestPost,
  listAnswers,
  listEvents,
  sendNudge,
} from '@/lib/api';
import { signedUrl } from '@/lib/media';
import { useSpace } from '@/lib/session';
import { HAND_FONT, colors, radius } from '@/lib/theme';
import type { NudgeKind, Post, StreakInfo } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { anniversaryLabel, daysTogether, distanceKm, formatDistance, plural, timeAgo, upcoming, type Countdown } from '@/lib/util';

const NUDGES: { kind: NudgeKind; emoji: string; label: string }[] = [
  { kind: 'miss_you', emoji: '💗', label: 'Miss you' },
  { kind: 'hug', emoji: '🤗', label: 'Hug' },
  { kind: 'kiss', emoji: '😘', label: 'Kiss' },
  { kind: 'poke', emoji: '👉', label: 'Poke' },
  { kind: 'high_five', emoji: '✋', label: 'High five' },
  { kind: 'love', emoji: '❤️', label: 'Love' },
];

export default function Home() {
  const { space, spaces, setActiveSpace, userId, others, profile } = useSpace();
  const toast = useToast();
  const [latest, setLatest] = useState<{ post: Post; url: string } | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [next, setNext] = useState<Countdown | null>(null);

  const load = useCallback(async () => {
    const [post, s, q, events] = await Promise.all([
      latestPost(space.id, ['drawing', 'note', 'photo'], userId),
      getStreak(space.id).catch(() => null),
      getDailyQuestion(space.id).catch(() => null),
      listEvents(space.id).catch(() => []),
    ]);
    setLatest(post ? { post, url: await signedUrl(post.image_path) } : null);
    setStreak(s);
    setNext(upcoming(events, space.anniversary, space.kind)[0] ?? null);
    if (q) setAnswered((await listAnswers(space.id, q.day)).some((a) => a.user_id === userId));
  }, [space.id, space.anniversary, space.kind, userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );
  useSpaceRealtime(space.id, ['posts', 'nudges', 'answers', 'events'], () => load().catch(() => {}));

  const nudge = async (kind: NudgeKind, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await sendNudge(space.id, kind);
      toast(`${emoji} Sent!`);
    } catch {
      toast("Couldn't send");
    }
  };

  const me = space.members.find((m) => m.user_id === userId)?.profile;
  const together = daysTogether(space.anniversary);

  return (
    <Screen onRefresh={load}>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1 style={{ flexShrink: 1 }} numberOfLines={1}>
          {space.name}
        </H1>
        <Pressable onPress={() => router.push(`/space/${space.id}`)} hitSlop={10}>
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </Pressable>
      </Row>

      {spaces.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {spaces.map((s) => (
            <Chip key={s.id} label={`${s.kind === 'couple' ? '💞' : '👯'} ${s.name}`} active={s.id === space.id} onPress={() => setActiveSpace(s.id)} />
          ))}
          <Chip label="＋" onPress={() => router.push('/new-space')} />
        </ScrollView>
      ) : null}

      {others.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <H2>Invite your {space.kind === 'couple' ? 'person' : 'people'} 💌</H2>
          <Text style={styles.code}>{space.invite_code}</Text>
          <Body dim style={{ textAlign: 'center' }}>
            They install Chalkmates, tap “I have a code” and enter this.
          </Body>
          <Chip
            label="Share invite"
            active
            onPress={() =>
              Share.share({ message: `Join me on Chalkmates 🖍️ Use my code: ${space.invite_code}` }).catch(() => {})
            }
          />
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {others.map(({ user_id, profile: p }) => {
            const km =
              me?.lat != null && me.lng != null && p.lat != null && p.lng != null
                ? distanceKm({ lat: me.lat, lng: me.lng }, { lat: p.lat, lng: p.lng })
                : null;
            return (
              <Card key={user_id} style={styles.person}>
                <Row>
                  <Avatar emoji={p.avatar} color={p.color} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {p.display_name}
                    </Text>
                    <Body dim numberOfLines={1}>
                      {p.mood_emoji ? `${p.mood_emoji} ${p.mood_text ?? ''}` : 'no mood yet'}
                    </Body>
                  </View>
                </Row>
                {km !== null ? <Body dim>📍 {formatDistance(km)}</Body> : null}
              </Card>
            );
          })}
        </ScrollView>
      )}

      {/* The board: front and center. */}
      <Pressable onPress={() => (latest ? router.push(`/post/${latest.post.id}`) : router.push('/draw'))}>
        {latest ? (
          <View>
            <Image source={{ uri: latest.url }} style={[styles.board, { aspectRatio: Math.max(latest.post.aspect, 0.9) }]} contentFit="contain" />
            <View style={styles.boardPill}>
              <Text style={styles.boardPillText}>
                {latest.post.author_id === userId ? 'You' : space.members.find((m) => m.user_id === latest.post.author_id)?.profile.display_name}{' '}
                · {timeAgo(latest.post.created_at)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.board, styles.emptyBoard]}>
            <Text style={styles.emptyText}>Your board is empty.{'\n'}Tap to draw the first one ✏️</Text>
          </View>
        )}
      </Pressable>

      <Row gap={10}>
        <Action emoji="✏️" label="Draw" primary onPress={() => router.push('/draw')} />
        <Action emoji="📝" label="Note" onPress={() => router.push('/note')} />
        <Action emoji="📷" label="Photo" onPress={() => router.push('/photo')} />
        <Action emoji={profile?.mood_emoji ?? '😊'} label="Mood" onPress={() => router.push('/mood')} />
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {NUDGES.map((n) => (
          <Pressable key={n.kind} onPress={() => nudge(n.kind, n.emoji)} style={styles.nudge}>
            <Text style={{ fontSize: 26 }}>{n.emoji}</Text>
            <Text style={styles.nudgeLabel}>{n.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Row gap={10} style={{ alignItems: 'stretch' }}>
        <Card style={{ flex: 1 }} onPress={() => router.push('/together')}>
          <Text style={styles.big}>🔥 {streak?.streak ?? 0}</Text>
          <Body dim>{streak?.today_complete ? 'Streak safe today' : 'day streak'}</Body>
          <Body style={{ color: answered ? colors.textDim : colors.pink }}>
            {answered === null ? '' : answered ? 'Question answered ✓' : 'Answer today’s question →'}
          </Body>
        </Card>
        <Card style={{ flex: 1 }} onPress={() => router.push('/countdowns')}>
          {next ? (
            <>
              <Text style={styles.big}>{next.days === 0 ? 'Today!' : next.days}</Text>
              <Body dim numberOfLines={2}>
                {next.days === 0 ? '' : `${next.days === 1 ? 'day' : 'days'} until `}
                {next.emoji} {next.title}
              </Body>
            </>
          ) : (
            <>
              <Text style={styles.big}>📅</Text>
              <Body dim>Add a countdown</Body>
            </>
          )}
          {together !== null ? (
            <Body dim>
              {plural(together, 'day')} {anniversaryLabel(space.kind).together}
            </Body>
          ) : null}
        </Card>
      </Row>
    </Screen>
  );
}

function Action({ emoji, label, onPress, primary }: { emoji: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && { backgroundColor: colors.pink }, pressed && { opacity: 0.8 }]}>
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text style={[styles.actionLabel, primary && { color: '#3A1F2C' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: HAND_FONT, fontSize: 44, letterSpacing: 8, color: colors.yellow },
  person: { minWidth: 180, maxWidth: 260 },
  personName: { fontFamily: HAND_FONT, fontSize: 20, color: colors.text },
  board: { width: '100%', borderRadius: radius.lg, backgroundColor: '#2F4A3A' },
  emptyBoard: { aspectRatio: 1.4, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#9A6B43' },
  emptyText: { fontFamily: HAND_FONT, fontSize: 24, color: '#F4F1E8', textAlign: 'center', opacity: 0.9 },
  boardPill: { position: 'absolute', left: 12, bottom: 12, backgroundColor: '#00000088', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  boardPillText: { fontFamily: HAND_FONT, color: '#fff', fontSize: 15 },
  action: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', gap: 2 },
  actionLabel: { fontFamily: HAND_FONT, fontSize: 17, color: colors.text },
  nudge: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  nudgeLabel: { color: colors.textDim, fontSize: 12 },
  big: { fontFamily: HAND_FONT, fontSize: 36, color: colors.text },
});
