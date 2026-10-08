import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Body, Button, Card, H1, H2, IconButton, Input, Row, Screen, useToast } from '@/components/ui';
import { createEvent, deleteEvent, listEvents } from '@/lib/api';
import { useSpace } from '@/lib/session';
import { HAND_FONT, colors } from '@/lib/theme';
import type { SpaceEvent } from '@/lib/types';
import { useSpaceRealtime } from '@/lib/useRealtime';
import { anniversaryLabel, daysTogether, upcoming } from '@/lib/util';
import { refreshWidgets } from '@/widgets/task-handler';

const EMOJIS = ['📅', '🎂', '💍', '✈️', '🎉', '🏖️', '🎄', '🎁', '💐', '🍽️', '🎓', '🏡', '🎬', '🎶', '❤️'];

export default function Countdowns() {
  const { space } = useSpace();
  const toast = useToast();
  const [events, setEvents] = useState<SpaceEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📅');
  const [date, setDate] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  const load = useCallback(() => listEvents(space.id).then(setEvents), [space.id]);
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );
  useSpaceRealtime(space.id, ['events'], () => load().catch(() => {}));

  const list = upcoming(events, space.anniversary, space.kind);
  const together = daysTogether(space.anniversary);
  const label = anniversaryLabel(space.kind);

  const add = async () => {
    if (!title.trim() || !date) return;
    try {
      await createEvent({ space_id: space.id, title: title.trim(), emoji, date, yearly });
      setAdding(false);
      setTitle('');
      setDate(null);
      setYearly(false);
      await load();
      refreshWidgets(['Countdown']);
    } catch (e) {
      toast("Couldn't add", e instanceof Error ? e.message : undefined);
    }
  };

  const remove = (id: string) =>
    Alert.alert('Remove countdown?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(id);
            await load();
            refreshWidgets(['Countdown']);
          } catch (e) {
            toast("Couldn't remove it", e instanceof Error ? e.message : undefined);
          }
        },
      },
    ]);

  return (
    <Screen onRefresh={load}>
      <Row>
        <IconButton icon="←" label="Back" onPress={() => router.back()} />
        <H1>Countdowns</H1>
      </Row>

      {together !== null ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: HAND_FONT, fontSize: 48, color: colors.pink }}>{together}</Text>
          <Body dim>days {label.together}</Body>
        </Card>
      ) : !space.anniversary ? (
        // A future anniversary already shows up below as a countdown.
        <Card onPress={() => router.push(`/space/${space.id}`)}>
          <Body dim>
            {label.emoji} Set {space.kind === 'couple' ? 'your anniversary' : 'the day it all started'} in space settings to count
            your days together.
          </Body>
        </Card>
      ) : null}

      {list.map((c) => (
        <Card key={c.id}>
          <Row>
            <Text style={{ fontSize: 30 }}>{c.emoji}</Text>
            <View style={{ flex: 1 }}>
              <H2>{c.title}</H2>
              <Body dim>{c.days === 0 ? 'Today! 🎉' : c.days === 1 ? 'Tomorrow' : `in ${c.days} days`}{c.yearly ? ' · every year' : ''}</Body>
            </View>
            {c.id !== 'anniversary' ? <IconButton icon="🗑️" label="Remove" size={36} onPress={() => remove(c.id)} /> : null}
          </Row>
        </Card>
      ))}

      {adding ? (
        <Card>
          <H2>New countdown</H2>
          <Row gap={4} style={{ flexWrap: 'wrap' }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={{ padding: 6, borderRadius: 10, backgroundColor: e === emoji ? colors.cardHi : 'transparent' }}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </Row>
          <Input placeholder="What's happening? (e.g. Sam's birthday)" value={title} onChangeText={setTitle} maxLength={60} />
          <DateField value={date} onChange={setDate} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body>Repeats every year</Body>
            <Switch value={yearly} onValueChange={setYearly} trackColor={{ true: colors.pink, false: colors.border }} thumbColor={colors.text} />
          </Row>
          <Row>
            <Button variant="ghost" title="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
            <Button title="Add" disabled={!title.trim() || !date} onPress={add} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button title="Add countdown" icon="＋" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}
