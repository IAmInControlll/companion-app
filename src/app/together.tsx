import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Body, Button, Caption, Card, Chalk, H2, Header, Icon, Input, ListGroup, ListRow, Row, Screen, useToast } from '@/components/ui';
import {
  answerTot,
  getDailyQuestion,
  getStreak,
  listAnswers,
  listEvents,
  nextTotPrompt,
  questionHistory,
  submitAnswer,
  totAnswers,
  type PastQuestion,
} from '@/lib/api';
import { SHOW_QUESTIONS } from '@/lib/features';
import { useSpace } from '@/lib/session';
import { HAND_FONT, colors, radius, type } from '@/lib/theme';
import type { Answer, DailyQuestion, StreakInfo, TotAnswer, TotPrompt } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { dayLabel, distanceKm, formatDistance, plural, upcoming, type Countdown } from '@/lib/util';
import { refreshWidgets } from '@/widgets/refresh';

export default function Together() {
  const { space, userId, others } = useSpace();
  const toast = useToast();
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [q, setQ] = useState<DailyQuestion | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PastQuestion[] | null>(null);
  const [next, setNext] = useState<Countdown | null>(null);

  const load = useCallback(async () => {
    const [s, question, events] = await Promise.all([
      getStreak(space.id),
      SHOW_QUESTIONS ? getDailyQuestion(space.id) : null,
      listEvents(space.id).catch(() => []),
    ]);
    setStreak(s);
    setQ(question);
    setNext(upcoming(events, space.anniversary, space.kind)[0] ?? null);
    if (question) setAnswers(await listAnswers(space.id, question.day));
  }, [space.id, space.anniversary, space.kind]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );
  useSpaceRealtime(space.id, ['answers', 'posts', 'nudges', 'tot_answers', 'events'], () => load().catch(() => {}));

  const mine = answers.find((a) => a.user_id === userId);
  const theirs = answers.filter((a) => a.user_id !== userId);

  const save = async () => {
    if (!q || !draft.trim()) return;
    setSaving(true);
    try {
      await submitAnswer(space.id, q.day, userId, draft.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(false);
      await load();
      refreshWidgets(['Streak']);
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: string) => space.members.find((m) => m.user_id === id)?.profile;

  const couple = space.kind === 'couple';
  const count = streak?.streak ?? 0;
  const me = space.members.find((m) => m.user_id === userId)?.profile;
  const here = me?.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng } : null;
  const theirName = others.length === 1 ? others[0].profile.display_name : 'the others';

  return (
    <Screen onRefresh={load}>
      <Header title="Together" />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <Icon name="local_fire_department" filled size={36} color={count > 0 ? colors.yellow : colors.textFaint} />
            <Chalk size={44} style={{ color: count > 0 ? colors.yellow : colors.text }}>
              {count}
            </Chalk>
            <Caption style={{ marginTop: 10 }}>{count === 1 ? 'day' : 'days'}</Caption>
          </Row>
          <Row gap={0}>
            {space.members.map((m, i) => (
              <View key={m.user_id} collapsable={false} style={{ marginLeft: i ? -8 : 0, opacity: streak?.active_today.includes(m.user_id) ? 1 : 0.35 }}>
                <Avatar emoji={m.profile.avatar} color={m.profile.color} size={30} />
              </View>
            ))}
          </Row>
        </Row>
        <Body dim>
          {streak?.today_complete
            ? couple
              ? 'You both showed up today. Streak safe.'
              : 'Two or more of you showed up today. Streak safe.'
            : SHOW_QUESTIONS
              ? 'Draw, nudge or answer today’s question, together, to keep it going.'
              : 'Draw or nudge each other every day to keep it going.'}
          {streak && streak.best > count ? ` Best: ${streak.best}.` : ''}
        </Body>
      </Card>

      {SHOW_QUESTIONS ? (
        <Card>
          <Caption>Today’s question</Caption>
          <Chalk size={26}>{q?.body ?? '…'}</Chalk>
          {mine && !editing ? (
            <View style={{ gap: 10 }}>
              <AnswerBubble name="You" text={mine.body} color={colors.accent} />
              {theirs.length ? (
                theirs.map((a) => {
                  const p = nameOf(a.user_id);
                  return <AnswerBubble key={a.user_id} name={p?.display_name ?? 'Them'} text={a.body} color={p?.color ?? colors.blue} />;
                })
              ) : (
                <Body dim>Waiting for {theirName} to answer.</Body>
              )}
              <Button
                variant="ghost"
                icon="edit"
                title="Edit my answer"
                onPress={() => {
                  setDraft(mine.body);
                  setEditing(true);
                }}
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
              />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Input placeholder="Your answer" value={draft} onChangeText={setDraft} multiline maxLength={1000} />
              <Row gap={6}>
                <Icon name="lock" size={16} color={colors.textDim} />
                <Caption style={{ flex: 1 }}>{couple ? 'Their answer unlocks' : 'Their answers unlock'} once you answer.</Caption>
              </Row>
              <Button title="Answer" disabled={!draft.trim()} loading={saving} onPress={save} />
            </View>
          )}
        </Card>
      ) : null}

      <ListGroup title="Us">
        {others.map(({ user_id, profile: p }) => (
          <ListRow
            key={user_id}
            leading={<Avatar emoji={p.avatar} color={p.color} size={28} />}
            title={p.mood_emoji ? `${p.display_name} is feeling ${p.mood_emoji}` : `${p.display_name} hasn’t set a mood`}
            subtitle={
              [p.mood_text, here && p.lat != null && p.lng != null ? `${formatDistance(distanceKm(here, { lat: p.lat, lng: p.lng }))} away` : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        ))}
        <ListRow
          leading={<Text style={styles.leadingEmoji}>{me?.mood_emoji ?? '😶'}</Text>}
          title={me?.mood_emoji ? 'Your mood' : 'Set your mood'}
          subtitle={me?.mood_text ?? undefined}
          onPress={() => router.push('/mood')}
        />
        <ListRow
          icon="event"
          title={next ? (next.days === 0 ? `${next.title} is today` : `${next.title} in ${plural(next.days, 'day')}`) : 'Countdowns'}
          subtitle={next ? undefined : 'Birthdays, trips, the next time you see each other'}
          onPress={() => router.push('/countdowns')}
        />
        {here ? null : (
          <ListRow icon="location_on" title="See how far apart you are" subtitle="Turn on location sharing" onPress={() => router.push('/settings')} />
        )}
      </ListGroup>

      {SHOW_QUESTIONS ? <ThisOrThat /> : null}

      {!SHOW_QUESTIONS ? null : history ? (
        <View style={{ gap: 10 }}>
          <H2>Past questions</H2>
          {history
            .filter((h) => h.day !== q?.day)
            .map((h) => (
              <Card key={h.day}>
                <Caption>{dayLabel(`${h.day}T12:00:00`)}</Caption>
                <Text style={styles.histQ}>{h.body}</Text>
                {h.answers.length === 0 ? <Body dim>Nobody answered this one.</Body> : null}
                {h.answers.map((a) => {
                  const p = nameOf(a.user_id);
                  return <AnswerBubble key={a.user_id} name={a.user_id === userId ? 'You' : (p?.display_name ?? 'Them')} text={a.body} color={p?.color ?? colors.blue} />;
                })}
              </Card>
            ))}
        </View>
      ) : (
        <ListGroup>
          <ListRow icon="history" title="Past questions" onPress={() => questionHistory(space.id).then(setHistory).catch(() => toast("Couldn't load them"))} />
        </ListGroup>
      )}
    </Screen>
  );
}

function AnswerBubble({ name, text, color }: { name: string; text: string; color: string }) {
  return (
    <View style={[styles.bubble, { borderLeftColor: color }]}>
      <Text style={[styles.bubbleName, { color }]}>{name}</Text>
      <Body>{text}</Body>
    </View>
  );
}

function ThisOrThat() {
  const { space, userId, others } = useSpace();
  const [prompt, setPrompt] = useState<TotPrompt | null | undefined>(undefined);
  const [result, setResult] = useState<{ prompt: TotPrompt; mine: 0 | 1; theirs: TotAnswer[] } | null>(null);
  const [stats, setStats] = useState<{ matched: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadStats = useCallback(async () => {
    const all = await totAnswers(space.id);
    const byPrompt = new Map<number, TotAnswer[]>();
    for (const a of all) byPrompt.set(a.prompt_id, [...(byPrompt.get(a.prompt_id) ?? []), a]);
    let matched = 0;
    let total = 0;
    for (const list of byPrompt.values()) {
      const me = list.find((a) => a.user_id === userId);
      const rest = list.filter((a) => a.user_id !== userId);
      if (!me || !rest.length) continue;
      total++;
      if (rest.every((a) => a.choice === me.choice)) matched++;
    }
    setStats({ matched, total });
  }, [space.id, userId]);

  useFocusEffect(
    useCallback(() => {
      nextTotPrompt(space.id).then(setPrompt).catch(() => setPrompt(null));
      loadStats().catch(() => {});
    }, [space.id, loadStats]),
  );

  const choose = async (choice: 0 | 1) => {
    if (!prompt || busy) return;
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      await answerTot(space.id, prompt.id, userId, choice);
      const theirs = (await totAnswers(space.id, prompt.id)).filter((a) => a.user_id !== userId);
      setResult({ prompt, mine: choice, theirs });
      loadStats().catch(() => {});
    } catch (e) {
      toast("Couldn't save your pick", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    setResult(null);
    try {
      setPrompt(await nextTotPrompt(space.id));
    } catch {
      toast("Couldn't load the next one");
    }
  };

  const label = (p: TotPrompt, c: 0 | 1) => (c === 0 ? p.option_a : p.option_b);
  const nameOf = (id: string) => space.members.find((m) => m.user_id === id)?.profile.display_name ?? 'Them';

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>This or that</H2>
        {stats && stats.total > 0 ? (
          <Body dim>
            {Math.round((stats.matched / stats.total) * 100)}% in sync ({stats.total})
          </Body>
        ) : null}
      </Row>
      {result ? (
        <View style={{ gap: 8 }}>
          <Body>
            You picked <Text style={{ color: colors.accent }}>{label(result.prompt, result.mine)}</Text>
          </Body>
          {result.theirs.length ? (
            <>
              {result.theirs.map((a) => (
                <Body key={a.user_id}>
                  {nameOf(a.user_id)} picked <Text style={{ color: colors.blue }}>{label(result.prompt, a.choice)}</Text>
                </Body>
              ))}
              <Text style={styles.match}>
                {result.theirs.every((a) => a.choice === result.mine) ? 'It’s a match!' : 'Opposites attract'}
              </Text>
            </>
          ) : (
            <Body dim>{others.length === 1 ? others[0].profile.display_name : 'They'} haven’t answered this one yet. You’ll see it when they do.</Body>
          )}
          <Button variant="secondary" title="Next one" onPress={next} />
        </View>
      ) : prompt ? (
        <Row gap={10}>
          <Pressable disabled={busy} style={({ pressed }) => [styles.tot, pressed && { backgroundColor: colors.line }]} onPress={() => choose(0)}>
            <Text style={styles.totText}>{prompt.option_a}</Text>
          </Pressable>
          <Text style={styles.or}>or</Text>
          <Pressable disabled={busy} style={({ pressed }) => [styles.tot, pressed && { backgroundColor: colors.line }]} onPress={() => choose(1)}>
            <Text style={styles.totText}>{prompt.option_b}</Text>
          </Pressable>
        </Row>
      ) : prompt === null ? (
        <Body dim>You’ve answered them all. New ones are on the way.</Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  leadingEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  bubble: { backgroundColor: colors.surfaceHi, borderRadius: radius.sm, padding: 12, borderLeftWidth: 4, gap: 2 },
  bubbleName: { ...type.label, fontSize: 14 },
  histQ: type.headline,
  tot: { flex: 1, minHeight: 90, borderRadius: radius.md, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', padding: 10 },
  totText: { ...type.headline, textAlign: 'center' },
  or: type.caption,
  match: { fontFamily: HAND_FONT, fontSize: 24, color: colors.yellow },
});
