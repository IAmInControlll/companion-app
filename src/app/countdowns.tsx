import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';

import { DateField } from '@/components/DateField';
import { Body, Button, Caption, Card, Chalk, Header, Icon, IconButton, Input, ListGroup, ListRow, Screen, Sheet, useToast } from '@/components/ui';
import { createEvent, deleteEvent, listEvents } from '@/lib/api';
import { useSpace } from '@/lib/session';
import { GUTTER, colors, radius, type } from '@/lib/theme';
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
  const cell = Math.floor((useWindowDimensions().width - GUTTER * 2 - 8 * 4) / 5);

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
      <Header title="Countdowns" />

      {together !== null ? (
        <Card style={{ alignItems: 'center', gap: 2, paddingVertical: 20 }}>
          <Chalk size={52} style={{ color: colors.accent }}>
            {together.toLocaleString()}
          </Chalk>
          <Caption>days {label.together}</Caption>
        </Card>
      ) : null}

      {list.length ? (
        <ListGroup>
          {list.map((c) => (
            <ListRow
              key={c.id}
              leading={<Text style={styles.emoji}>{c.emoji}</Text>}
              title={c.title}
              subtitle={`${c.days === 0 ? 'Today' : c.days === 1 ? 'Tomorrow' : `In ${c.days} days`}${c.yearly ? ' · every year' : ''}`}
              right={
                c.id === 'anniversary' ? null : (
                  <IconButton icon="delete" label={`Remove ${c.title}`} variant="plain" size={40} color={colors.textFaint} onPress={() => remove(c.id)} />
                )
              }
            />
          ))}
        </ListGroup>
      ) : (
        <View style={styles.empty}>
          <Icon name="event" size={40} color={colors.textFaint} />
          <Text style={[type.headline, { textAlign: 'center' }]}>Nothing to count down to yet</Text>
          <Body dim style={{ textAlign: 'center' }}>
            Birthdays, trips, the next time you see each other.
          </Body>
        </View>
      )}

      {!space.anniversary ? (
        <ListGroup>
          <ListRow
            icon="favorite"
            title={space.kind === 'couple' ? 'Set your anniversary' : 'Set the day it started'}
            subtitle="Counts your days together"
            onPress={() => router.push(`/space/${space.id}`)}
          />
        </ListGroup>
      ) : null}

      <Button title="Add countdown" icon="add" onPress={() => setAdding(true)} />

      <Sheet visible={adding} onClose={() => setAdding(false)} title="New countdown">
        <Input placeholder="What’s happening? (e.g. Sam’s birthday)" value={title} onChangeText={setTitle} maxLength={60} />
        <DateField value={date} onChange={setDate} />
        <View style={styles.emojis}>
          {EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              accessibilityRole="radio"
              accessibilityState={{ checked: e === emoji }}
              style={[styles.emojiCell, { width: cell, height: cell }, e === emoji && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <ListRow
          icon="refresh"
          title="Repeats every year"
          right={<Switch value={yearly} onValueChange={setYearly} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.text} />}
        />
        <Button title="Add" disabled={!title.trim() || !date} onPress={add} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 24, width: 28, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  emojiCell: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
});
