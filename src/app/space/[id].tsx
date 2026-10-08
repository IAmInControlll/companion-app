import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Avatar, Button, Card, Header, IconButton, Input, ListGroup, ListRow, Row, Screen, useToast } from '@/components/ui';
import { leaveSpace, regenerateInvite, updateSpace } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, type } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/task-handler';

export default function SpaceSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spaces, userId, refresh } = useSession();
  const toast = useToast();
  const space = spaces.find((s) => s.id === id);
  const [name, setName] = useState(space?.name ?? '');

  if (!space) return null;
  const capacity = space.kind === 'couple' ? 2 : 12;
  const full = space.members.length >= capacity;

  const save = async (patch: Parameters<typeof updateSpace>[1]) => {
    try {
      await updateSpace(space.id, patch);
      await refresh();
      refreshWidgets(['Countdown']);
    } catch (e) {
      toast("Couldn't save", e instanceof Error ? e.message : undefined);
    }
  };

  const leave = () =>
    Alert.alert(`Leave ${space.name}?`, 'You’ll lose access to its board. If you’re the last one, it’s deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveSpace(space.id);
          } catch (e) {
            toast("Couldn't leave", e instanceof Error ? e.message : undefined);
            return;
          }
          // Leaving the last space flips the root guard to onboarding; only navigate when tabs remain.
          const stillHasSpaces = spaces.length > 1;
          await refresh().catch(() => {});
          if (stillHasSpaces) router.replace('/');
        },
      },
    ]);

  const share = () => {
    Share.share({ message: `Join me on Chalkmates: open the app, tap “I have a code” and enter ${space.invite_code}` }).catch(() => {});
  };
  const newCode = async () => {
    try {
      await regenerateInvite(space.id);
      await refresh();
      toast('New code ready', 'The old one no longer works.');
    } catch (e) {
      toast("Couldn't make a new code", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Screen>
      <Header title={space.name} />

      {!full ? (
        <Card style={{ gap: 14 }}>
          <View>
            <Text style={type.caption}>Invite code</Text>
            <Text selectable style={styles.code}>
              {space.invite_code}
            </Text>
            <Text style={type.caption}>They tap “I have a code” in Chalkmates and enter this.</Text>
          </View>
          <Row gap={10}>
            <Button icon="share" title="Share" onPress={share} style={{ flex: 1 }} />
            <IconButton
              icon="content_copy"
              label="Copy code"
              size={52}
              onPress={async () => {
                await Clipboard.setStringAsync(space.invite_code);
                toast('Code copied');
              }}
            />
            <IconButton icon="refresh" label="Make a new code" size={52} onPress={newCode} />
          </Row>
        </Card>
      ) : null}

      <ListGroup title="Space">
        <View style={styles.field}>
          <Text style={type.caption}>Name</Text>
          <Input value={name} onChangeText={setName} maxLength={40} returnKeyType="done" onEndEditing={() => name.trim() && name !== space.name && save({ name: name.trim() })} />
        </View>
        <View style={styles.field}>
          <Text style={type.caption}>{space.kind === 'couple' ? 'Anniversary' : 'Since'}</Text>
          <DateField value={space.anniversary} onChange={(d) => save({ anniversary: d })} placeholder="When did it all start?" />
        </View>
      </ListGroup>

      <ListGroup title={`Members · ${space.members.length} of ${capacity}`}>
        {space.members.map((m) => (
          <ListRow
            key={m.user_id}
            leading={<Avatar emoji={m.profile.avatar} color={m.profile.color} size={32} />}
            title={m.user_id === userId ? `${m.profile.display_name} (you)` : m.profile.display_name}
            subtitle={m.profile.mood_emoji ? `${m.profile.mood_emoji} ${m.profile.mood_text ?? ''}`.trim() : undefined}
          />
        ))}
      </ListGroup>

      <ListGroup>
        <ListRow icon="logout" title="Leave space" danger onPress={leave} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.heavy, fontSize: 34, letterSpacing: 6, color: colors.text, marginVertical: 2 },
  field: { padding: 16, paddingBottom: 12, gap: 6 },
});
