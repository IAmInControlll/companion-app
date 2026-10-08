import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Avatar, Body, Button, Card, H1, H2, IconButton, Input, Row, Screen, useToast } from '@/components/ui';
import { leaveSpace, regenerateInvite, updateSpace } from '@/lib/api';
import { useSession } from '@/lib/session';
import { HAND_FONT, colors } from '@/lib/theme';
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

  return (
    <Screen>
      <Row>
        <IconButton icon="←" label="Back" onPress={() => router.back()} />
        <H1 style={{ flexShrink: 1 }} numberOfLines={1}>
          {space.name}
        </H1>
      </Row>

      <Card>
        <H2>Name</H2>
        <Input value={name} onChangeText={setName} maxLength={40} onEndEditing={() => name.trim() && name !== space.name && save({ name: name.trim() })} />
      </Card>

      <Card>
        <H2>{space.kind === 'couple' ? 'Anniversary' : 'Since'}</H2>
        <DateField value={space.anniversary} onChange={(d) => save({ anniversary: d })} placeholder="When did it all start?" />
      </Card>

      <Card>
        <H2>
          Members ({space.members.length}/{capacity})
        </H2>
        {space.members.map((m) => (
          <Row key={m.user_id}>
            <Avatar emoji={m.profile.avatar} color={m.profile.color} size={36} />
            <Body>
              {m.profile.display_name}
              {m.user_id === userId ? ' (you)' : ''}
            </Body>
          </Row>
        ))}
      </Card>

      {!full ? (
        <Card style={{ alignItems: 'center' }}>
          <H2>Invite code</H2>
          <Text style={{ fontFamily: HAND_FONT, fontSize: 44, letterSpacing: 8, color: colors.yellow }}>{space.invite_code}</Text>
          <Row>
            <Button
              variant="secondary"
              title="Copy"
              onPress={async () => {
                await Clipboard.setStringAsync(space.invite_code);
                toast('Copied!');
              }}
            />
            <Button title="Share" onPress={() => {
                Share.share({ message: `Join me on Chalkmates 🖍️ Use my code: ${space.invite_code}` }).catch(() => {});
              }} />
          </Row>
          <View style={{ marginTop: 4 }}>
            <Button
              variant="ghost"
              title="Make a new code"
              onPress={async () => {
                try {
                  await regenerateInvite(space.id);
                  await refresh();
                  toast('New code ready', 'The old one no longer works.');
                } catch (e) {
                  toast("Couldn't make a new code", e instanceof Error ? e.message : undefined);
                }
              }}
            />
          </View>
        </Card>
      ) : null}

      <Button variant="danger" title="Leave space" onPress={leave} />
    </Screen>
  );
}
