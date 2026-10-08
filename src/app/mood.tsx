import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Input, Screen, useToast } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { useSession } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { goBack } from '@/lib/nav';
import { refreshWidgets } from '@/widgets/refresh';

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
  const insets = useSafeAreaInsets();
  // Exact cell size: percentage widths + aspectRatio inside a wrapping row mis-measure on Android.
  const cell = Math.floor((useWindowDimensions().width - GUTTER * 2 - 8 * 3) / 4);

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
      goBack();
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="height">
      <Screen padTop>
        <Header
          title="How are you feeling?"
          onBack={() => goBack()}
          right={profile?.mood_emoji ? <Button variant="ghost" title="Clear" onPress={() => save(true)} style={{ paddingHorizontal: 8 }} /> : null}
        />
        {MOODS.map((g) => (
          <View key={g.group} style={{ gap: 10 }}>
            <Text style={styles.group}>{g.group}</Text>
            <View style={styles.grid}>
              {g.items.map(([e, label]) => {
                const on = emoji === e;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={label}
                    onPress={() => {
                      setEmoji(e);
                      // Replace the status only if it was a preset label (don't clobber what they typed).
                      if (!text || MOODS.some((m) => m.items.some(([, l]) => l === text))) setText(label);
                    }}
                    style={[styles.cell, { width: cell, height: cell }, on && styles.cellOn]}
                  >
                    <Text style={{ fontSize: 30 }}>{e}</Text>
                    <Text style={[type.micro, on && { color: colors.text }]} numberOfLines={1}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Screen>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <Input placeholder="Add a status (optional)" value={text} onChangeText={setText} maxLength={80} style={{ flex: 1 }} />
        <Button title="Share" disabled={!emoji} loading={saving} onPress={() => save()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  group: { ...type.micro, textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 2, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  cell: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
