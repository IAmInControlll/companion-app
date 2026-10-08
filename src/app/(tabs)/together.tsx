import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Body, Button, Card, Chip, H1, H2, Input, Row, Screen, useToast } from '@/components/ui';
import {
  answerTot,
  getDailyQuestion,
  getStreak,
  listAnswers,
  nextTotPrompt,
  questionHistory,
  submitAnswer,
  totAnswers,
  type PastQuestion,
} from '@/lib/api';
import { useSpace } from '@/lib/session';
import { HAND_FONT, colors, radius } from '@/lib/theme';
import type { Answer, DailyQuestion, StreakInfo, TotAnswer, TotPrompt } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { refreshWidgets } from '@/widgets/task-handler';

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

  const load = useCallback(async () => {
    const [s, question] = await Promise.all([getStreak(space.id), getDailyQuestion(space.id)]);
    setStreak(s);
    setQ(question);
    if (question) setAnswers(await listAnswers(space.id, question.day));
  }, [space.id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );
  useSpaceRealtime(space.id, ['answers', 'posts', 'nudges', 'tot_answers'], () => load().catch(() => {}));

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

  return (
    <Screen onRefresh={load}>
      <H1>Together</H1>

      <Card style={{ alignItems: 'center' }}>
        <Text style={styles.streak}>🔥 {streak?.streak ?? 0}</Text>
        <Body dim style={{ textAlign: 'center' }}>
          {streak?.today_complete
            ? couple
              ? 'You both showed up today. Streak safe!'
              : 'Two or more of you showed up today. Streak safe!'
            : 'Draw, nudge, or answer today’s question together to keep it going.'}
        </Body>
        {streak && streak.best > 0 ? <Body dim>Best: {streak.best} days</Body> : null}
        <Row style={{ marginTop: 4 }}>
          {space.members.map((m) => (
            <View key={m.user_id} style={{ opacity: streak?.active_today.includes(m.user_id) ? 1 : 0.35 }}>
              <Avatar emoji={m.profile.avatar} color={m.profile.color} size={34} />
            </View>
          ))}
        </Row>
      </Card>

      <Card>
        <Body dim>Today’s question</Body>
        <H2>{q?.body ?? '…'}</H2>
        {mine && !editing ? (
          <View style={{ gap: 10 }}>
            <AnswerBubble name="You" text={mine.body} color={colors.pink} />
            {theirs.length ? (
              theirs.map((a) => {
                const p = nameOf(a.user_id);
                return <AnswerBubble key={a.user_id} name={p?.display_name ?? 'Them'} text={a.body} color={p?.color ?? colors.blue} />;
              })
            ) : (
              <Body dim>Waiting for {others.length === 1 ? others[0].profile.display_name : 'the others'} to answer… 💭</Body>
            )}
            <Chip
              label="Edit my answer"
              onPress={() => {
                setDraft(mine.body);
                setEditing(true);
              }}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Input placeholder="Your answer…" value={draft} onChangeText={setDraft} multiline maxLength={1000} />
            <Body dim>🔒 Their answer unlocks once you answer.</Body>
            <Button title="Answer" disabled={!draft.trim()} loading={saving} onPress={save} />
          </View>
        )}
      </Card>

      <ThisOrThat />

      {history ? (
        <View style={{ gap: 10 }}>
          <H2>Past questions</H2>
          {history
            .filter((h) => h.day !== q?.day)
            .map((h) => (
              <Card key={h.day}>
                <Body dim>{h.day}</Body>
                <Text style={styles.histQ}>{h.body}</Text>
                {h.answers.length === 0 ? <Body dim>No answers (or yours is missing, so theirs stays locked)</Body> : null}
                {h.answers.map((a) => {
                  const p = nameOf(a.user_id);
                  return <AnswerBubble key={a.user_id} name={a.user_id === userId ? 'You' : (p?.display_name ?? 'Them')} text={a.body} color={p?.color ?? colors.blue} />;
                })}
              </Card>
            ))}
        </View>
      ) : (
        <Button variant="ghost" title="See past questions" onPress={() => questionHistory(space.id).then(setHistory).catch(() => {})} />
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
            You picked <Text style={{ color: colors.pink }}>{label(result.prompt, result.mine)}</Text>
          </Body>
          {result.theirs.length ? (
            <>
              {result.theirs.map((a) => (
                <Body key={a.user_id}>
                  {nameOf(a.user_id)} picked <Text style={{ color: colors.blue }}>{label(result.prompt, a.choice)}</Text>
                </Body>
              ))}
              <Text style={styles.match}>
                {result.theirs.every((a) => a.choice === result.mine) ? 'It’s a match! 💞' : 'Opposites attract 😜'}
              </Text>
            </>
          ) : (
            <Body dim>{others.length === 1 ? others[0].profile.display_name : 'They'} haven’t answered this one yet. You’ll see it when they do.</Body>
          )}
          <Button variant="secondary" title="Next one" onPress={next} />
        </View>
      ) : prompt ? (
        <Row gap={10}>
          <Pressable disabled={busy} style={[styles.tot, { backgroundColor: '#3B2F45' }]} onPress={() => choose(0)}>
            <Text style={styles.totText}>{prompt.option_a}</Text>
          </Pressable>
          <Text style={styles.or}>or</Text>
          <Pressable disabled={busy} style={[styles.tot, { backgroundColor: '#2A3F4F' }]} onPress={() => choose(1)}>
            <Text style={styles.totText}>{prompt.option_b}</Text>
          </Pressable>
        </Row>
      ) : prompt === null ? (
        <Body dim>You’ve answered them all! 🎉 New ones are coming.</Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  streak: { fontFamily: HAND_FONT, fontSize: 56, color: colors.yellow },
  bubble: { backgroundColor: colors.cardHi, borderRadius: radius.sm, padding: 12, borderLeftWidth: 4, gap: 2 },
  bubbleName: { fontFamily: HAND_FONT, fontSize: 17 },
  histQ: { fontFamily: HAND_FONT, fontSize: 19, color: colors.text },
  tot: { flex: 1, minHeight: 90, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: 10 },
  totText: { fontFamily: HAND_FONT, fontSize: 22, color: colors.text, textAlign: 'center' },
  or: { fontFamily: HAND_FONT, fontSize: 18, color: colors.textDim },
  match: { fontFamily: HAND_FONT, fontSize: 24, color: colors.yellow },
});
