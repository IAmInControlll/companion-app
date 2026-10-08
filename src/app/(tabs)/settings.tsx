import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';

import { Avatar, Body, Button, Card, H1, H2, Input, Row, Screen, useToast } from '@/components/ui';
import { deleteAccount, updateProfile } from '@/lib/api';
import { enableLocationSharing, syncLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { HAND_FONT, colors } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/task-handler';
import type { WidgetName } from '@/widgets/data';

const AVATARS = ['🙂', '😺', '🐶', '🐻', '🐰', '🦊', '🐼', '🐸', '🦄', '🐧', '🐝', '🌸', '🌻', '🍓', '🍑', '🌙', '⭐', '☁️', '🔥', '👾', '🎧', '🎨', '🌈', '🍩'];
const COLORS = ['#F7A8C4', '#F9D77E', '#9CC9F5', '#A8E0B8', '#D7A8F7', '#FFB37A', '#8EE3D6', '#FF8A8A'];

const WIDGETS: { name: WidgetName; emoji: string; label: string; desc: string }[] = [
  { name: 'Chalkboard', emoji: '🖍️', label: 'Chalkboard', desc: 'Their latest drawing or note' },
  { name: 'MissYou', emoji: '💗', label: 'Miss you', desc: 'Tap it to send a miss-you' },
  { name: 'Photo', emoji: '📷', label: 'Photo', desc: 'Latest shared photo' },
  { name: 'Mood', emoji: '😊', label: 'Mood', desc: 'How they’re feeling' },
  { name: 'Distance', emoji: '📍', label: 'Distance', desc: 'How far apart you are' },
  { name: 'Countdown', emoji: '📅', label: 'Countdown', desc: 'Next special day' },
  { name: 'Streak', emoji: '🔥', label: 'Streak', desc: 'Streak + daily question' },
];

export default function Settings() {
  const { userId, profile, spaces, refresh, signOut } = useSession();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');

  if (!profile || !userId) {
    return (
      <Screen style={{ flexGrow: 1, justifyContent: 'center' }}>
        <Body dim style={{ textAlign: 'center' }}>
          Couldn’t load your profile.
        </Body>
        <Button variant="secondary" title="Try again" onPress={() => refresh().catch(() => toast("Couldn't load", 'Check your connection.'))} />
      </Screen>
    );
  }

  const save = async (patch: Parameters<typeof updateProfile>[1]) => {
    try {
      await updateProfile(userId, patch);
      await refresh();
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    }
  };

  const toggleLocation = async (on: boolean) => {
    if (on && !(await enableLocationSharing())) {
      toast('Location permission is needed for the distance widget');
      return;
    }
    await save({ share_location: on });
    if (on) await syncLocation(true).catch(() => {});
    refreshWidgets(['Distance']);
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile and everything you’ve posted, and removes you from every space. Spaces with nobody left in them are deleted too. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              await signOut().catch(() => {});
            } catch (e) {
              toast("Couldn't delete your account", e instanceof Error ? e.message : undefined);
            }
          },
        },
      ],
    );

  const pin = async (w: WidgetName) => {
    const ok = await requestPinWidget({ widgetName: w }).catch(() => false);
    if (!ok) toast('Long-press your home screen → Widgets → Chalkmates');
  };

  return (
    <Screen onRefresh={refresh}>
      <H1>Me</H1>

      <Card>
        <Row>
          <Avatar emoji={profile.avatar} color={profile.color} size={56} />
          <View style={{ flex: 1 }}>
            <Input value={name} onChangeText={setName} maxLength={40} onEndEditing={() => name.trim() && name !== profile.display_name && save({ display_name: name.trim() })} />
          </View>
        </Row>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {AVATARS.map((a) => (
            <Pressable key={a} onPress={() => save({ avatar: a })} style={{ padding: 4, borderRadius: 10, backgroundColor: a === profile.avatar ? colors.cardHi : 'transparent' }}>
              <Text style={{ fontSize: 26 }}>{a}</Text>
            </Pressable>
          ))}
        </Row>
        <Row gap={10}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => save({ color: c })}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 3, borderColor: c === profile.color ? colors.text : 'transparent' }}
            />
          ))}
        </Row>
      </Card>

      <Card onPress={() => router.push('/mood')}>
        <Row>
          <Text style={{ fontSize: 32 }}>{profile.mood_emoji ?? '😶'}</Text>
          <View style={{ flex: 1 }}>
            <H2>My mood</H2>
            <Body dim>{profile.mood_text ?? (profile.mood_emoji ? '' : 'Set how you’re feeling')}</Body>
          </View>
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <H2>Share my location</H2>
            <Body dim>Rounded to ~1 km, only visible to your spaces. Updates when you open the app.</Body>
          </View>
          <Switch
            value={profile.share_location}
            onValueChange={toggleLocation}
            trackColor={{ true: colors.pink, false: colors.border }}
            thumbColor={colors.text}
          />
        </Row>
      </Card>

      <H2>Home screen widgets</H2>
      <Body dim>Add as many as you like. Each one can follow a different space.</Body>
      {WIDGETS.map((w) => (
        <Card key={w.name} onPress={() => pin(w.name)}>
          <Row>
            <Text style={{ fontSize: 28 }}>{w.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: HAND_FONT, fontSize: 20, color: colors.text }}>{w.label}</Text>
              <Body dim>{w.desc}</Body>
            </View>
            <Text style={{ fontFamily: HAND_FONT, fontSize: 18, color: colors.pink }}>Add</Text>
          </Row>
        </Card>
      ))}
      <Button variant="ghost" title="Refresh all widgets" onPress={() => refreshWidgets('*').then(() => toast('Widgets refreshed'))} />

      <H2>Spaces</H2>
      {spaces.map((s) => (
        <Card key={s.id} onPress={() => router.push(`/space/${s.id}`)}>
          <Text style={{ fontFamily: HAND_FONT, fontSize: 20, color: colors.text }}>
            {s.kind === 'couple' ? '💞' : '👯'} {s.name}
          </Text>
          <Body dim>{s.members.map((m) => m.profile.display_name).join(', ')}</Body>
        </Card>
      ))}
      <Button variant="secondary" title="New space" icon="＋" onPress={() => router.push('/new-space')} />

      <Button
        variant="ghost"
        title="Sign out"
        onPress={() =>
          Alert.alert('Sign out?', 'Your widgets will stop updating until you sign back in.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', onPress: () => signOut() },
          ])
        }
      />
      <Button variant="ghost" title="Privacy policy" onPress={() => router.push('/privacy')} />
      <Button variant="danger" title="Delete account" onPress={confirmDelete} />
    </Screen>
  );
}
