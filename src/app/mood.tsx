import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Body, Button, H1, H2, Input, Row, Screen, useToast } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/task-handler';

const MOODS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Good',
    items: [
      ['😊', 'Happy'], ['🥰', 'In love'], ['😌', 'Calm'], ['🤩', 'Excited'], ['😎', 'Confident'], ['🥳', 'Celebrating'],
      ['😇', 'Grateful'], ['🤗', 'Huggy'], ['😋', 'Hungry (good)'], ['🙃', 'Silly'], ['💪', 'Productive'], ['✨', 'Inspired'],
    ],
  },
  {
    group: 'Meh',
    items: [
      ['😐', 'Meh'], ['😴', 'Sleepy'], ['🥱', 'Bored'], ['🤔', 'Thinking'], ['😶‍🌫️', 'Spaced out'], ['🫠', 'Melting'],
      ['🤒', 'Sick'], ['🍕', 'Hungry'], ['☕', 'Need coffee'], ['📚', 'Studying'], ['💼', 'Working'], ['🎮', 'Gaming'],
    ],
  },
  {
    group: 'Rough',
    items: [
      ['😢', 'Sad'], ['😔', 'Down'], ['😩', 'Stressed'], ['😤', 'Annoyed'], ['😠', 'Angry'], ['😰', 'Anxious'],
      ['🥺', 'Need a hug'], ['😞', 'Lonely'], ['🤯', 'Overwhelmed'], ['🫥', 'Low battery'], ['💔', 'Heartsore'], ['🌧️', 'Gloomy'],
    ],
  },
  {
    group: 'Missing you',
    items: [['🥹', 'Missing you'], ['💭', 'Thinking of you'], ['🫶', 'Love you'], ['😘', 'Kisses'], ['🏡', 'Want to be home'], ['✈️', 'Travelling']],
  },
];

export default function MoodScreen() {
  const { userId, profile, refresh } = useSession();
  const toast = useToast();
  const [emoji, setEmoji] = useState<string | null>(profile?.mood_emoji ?? null);
  const [text, setText] = useState(profile?.mood_text ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (clear = false) => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateProfile(userId, {
        mood_emoji: clear ? null : emoji,
        mood_text: clear ? null : text.trim() || null,
        mood_updated_at: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refresh();
      refreshWidgets(['Mood']);
      router.back();
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <H1>How are you feeling?</H1>
      {MOODS.map((g) => (
        <View key={g.group} style={{ gap: 8 }}>
          <H2 style={{ fontSize: 20, color: colors.textDim }}>{g.group}</H2>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {g.items.map(([e, label]) => (
              <Pressable
                key={label}
                onPress={() => {
                  setEmoji(e);
                  if (!text || MOODS.some((m) => m.items.some(([, l]) => l === text))) setText(label);
                }}
                style={{
                  width: 74,
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderRadius: 14,
                  backgroundColor: emoji === e ? colors.pink + '55' : colors.card,
                }}
              >
                <Text style={{ fontSize: 28 }}>{e}</Text>
                <Text style={{ color: colors.textDim, fontSize: 11 }} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </Row>
        </View>
      ))}
      <Input placeholder="Add a status (optional)" value={text} onChangeText={setText} maxLength={80} />
      <Body dim>Your people see this on their Mood widget and get a little notification.</Body>
      <Row>
        <Button variant="ghost" title="Clear mood" onPress={() => save(true)} style={{ flex: 1 }} />
        <Button title="Share mood" disabled={!emoji} loading={saving} onPress={() => save()} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
