import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';

import { spaceFace } from '@/components/SpaceRow';
import { Avatar, Body, Button, Header, Icon, Input, ListGroup, ListRow, Screen, Sheet, useToast, type IconName } from '@/components/ui';
import { deleteAccount, updateProfile, type ProfilePatch } from '@/lib/api';
import { enableLocationSharing, syncLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/task-handler';
import type { WidgetName } from '@/widgets/data';

const AVATARS = ['🙂', '😺', '🐶', '🐻', '🐰', '🦊', '🐼', '🐸', '🦄', '🐧', '🐝', '🌸', '🌻', '🍓', '🍑', '🌙', '⭐', '☁️', '🔥', '👾', '🎧', '🎨', '🌈', '🍩'];
const COLORS = ['#F7A8C4', '#F9D77E', '#9CC9F5', '#A8E0B8', '#D7A8F7', '#FFB37A', '#8EE3D6', '#FF8A8A'];

const WIDGETS: { name: WidgetName; icon: IconName; label: string; desc: string }[] = [
  { name: 'Chalkboard', icon: 'draw', label: 'Chalkboard', desc: 'Their latest drawing or note' },
  { name: 'Photo', icon: 'image', label: 'Photo', desc: 'The latest shared photo' },
  { name: 'MissYou', icon: 'favorite', label: 'Miss you', desc: 'Tap it to send a miss-you' },
  { name: 'Mood', icon: 'mood', label: 'Mood', desc: 'How they’re feeling' },
  { name: 'Distance', icon: 'location_on', label: 'Distance', desc: 'How far apart you are' },
  { name: 'Countdown', icon: 'event', label: 'Countdown', desc: 'Your next special day' },
  { name: 'Streak', icon: 'local_fire_department', label: 'Streak', desc: 'Your streak and today’s question' },
];

export default function Settings() {
  const { userId, profile, spaces, refresh, signOut } = useSession();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [editingLook, setEditingLook] = useState(false);
  // 24 avatars as 4 even rows of 6.
  const cell = Math.floor((useWindowDimensions().width - GUTTER * 2 - 8 * 5) / 6);

  if (!profile || !userId) {
    return (
      <Screen>
        <Header title="Settings" />
        <Body dim>Couldn’t load your profile.</Body>
        <Button variant="secondary" title="Try again" onPress={() => refresh().catch(() => toast("Couldn't load", 'Check your connection.'))} />
      </Screen>
    );
  }

  const save = async (patch: ProfilePatch) => {
    try {
      await updateProfile(userId, patch);
      await refresh();
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    }
  };

  const toggleLocation = async (on: boolean) => {
    if (on && !(await enableLocationSharing())) {
      toast('Location permission needed', 'Allow it in Android settings to see how far apart you are.');
      return;
    }
    await save({ share_location: on });
    if (on) await syncLocation(true).catch(() => {});
    refreshWidgets(['Distance']);
  };

  const pin = async (w: WidgetName) => {
    const ok = await requestPinWidget({ widgetName: w }).catch(() => false);
    if (!ok) toast('Add it from your home screen', 'Long-press an empty spot → Widgets → Chalkmates');
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your widgets will stop updating until you sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: () => signOut() },
    ]);

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

  const saveName = () => {
    const n = name.trim();
    if (n && n !== profile.display_name) save({ display_name: n });
    else setName(profile.display_name);
  };

  return (
    <Screen onRefresh={refresh}>
      <Header title="Settings" />

      {/* Profile */}
      <View style={styles.profile}>
        <Pressable onPress={() => setEditingLook(true)} accessibilityRole="button" accessibilityLabel="Change avatar and colour">
          <Avatar emoji={profile.avatar} color={profile.color} size={64} />
          <View style={styles.editBadge}>
            <Icon name="edit" size={14} color={colors.bg} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.caption}>Your name</Text>
          <Input value={name} onChangeText={setName} maxLength={40} onEndEditing={saveName} returnKeyType="done" style={styles.nameInput} />
        </View>
      </View>

      <ListGroup>
        <ListRow
          leading={<Text style={styles.leadingEmoji}>{profile.mood_emoji ?? '😶'}</Text>}
          title="Mood"
          subtitle={profile.mood_emoji ? (profile.mood_text ?? undefined) : 'Let them know how you’re feeling'}
          onPress={() => router.push('/mood')}
        />
        <ListRow
          icon="location_on"
          title="Share my location"
          subtitle="Rounded to about 1 km, only for your spaces"
          right={<Switch value={profile.share_location} onValueChange={toggleLocation} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.text} />}
        />
      </ListGroup>

      <ListGroup title="Spaces">
        {spaces.map((s) => {
          const face = spaceFace(s, userId);
          return (
            <ListRow
              key={s.id}
              leading={
                face.others[0] ? (
                  <Avatar emoji={face.others[0].avatar} color={face.others[0].color} size={28} />
                ) : (
                  <Icon name={s.kind === 'couple' ? 'favorite' : 'group'} size={22} color={colors.textDim} />
                )
              }
              title={s.name}
              subtitle={face.others.length ? face.others.map((p) => p.display_name).join(', ') : `Waiting for ${face.waitingFor}`}
              onPress={() => router.push(`/space/${s.id}`)}
            />
          );
        })}
        <ListRow icon="add" title="New space" onPress={() => router.push('/new-space')} />
      </ListGroup>

      <ListGroup title="Home screen widgets">
        {WIDGETS.map((w) => (
          <ListRow key={w.name} icon={w.icon} title={w.label} subtitle={w.desc} onPress={() => pin(w.name)} right={<Text style={[type.label, { color: colors.accent }]}>Add</Text>} />
        ))}
        <ListRow icon="refresh" title="Refresh widgets" onPress={() => refreshWidgets('*').then(() => toast('Widgets refreshed'))} right={null} />
      </ListGroup>

      <ListGroup title="Account">
        <ListRow icon="privacy_tip" title="Privacy policy" onPress={() => router.push('/privacy')} />
        <ListRow icon="logout" title="Sign out" onPress={confirmSignOut} right={null} />
        <ListRow icon="delete" title="Delete account" danger onPress={confirmDelete} />
      </ListGroup>

      <Sheet visible={editingLook} onClose={() => setEditingLook(false)} title="Your look">
        <View style={styles.grid}>
          {AVATARS.map((a) => (
            <Pressable
              key={a}
              onPress={() => save({ avatar: a })}
              accessibilityRole="button"
              accessibilityState={{ selected: a === profile.avatar }}
              style={[styles.emojiCell, { width: cell, height: cell }, a === profile.avatar && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            >
              <Text style={{ fontSize: 28 }}>{a}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.swatches}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => save({ color: c })}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${c}`}
              accessibilityState={{ selected: c === profile.color }}
              style={[styles.swatch, { borderColor: c === profile.color ? colors.text : 'transparent' }]}
            >
              <View style={{ flex: 1, borderRadius: 18, backgroundColor: c }} />
            </Pressable>
          ))}
        </View>
        <Button title="Done" onPress={() => setEditingLook(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  nameInput: { paddingVertical: 10 },
  leadingEmoji: { fontSize: 22, width: 22, textAlign: 'center' },
  // 24 avatars in rows of 6, spread edge to edge.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatches: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  emojiCell: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, padding: 3 },
});
