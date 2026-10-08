import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SpaceWithMembers } from '@/lib/api';
import { colors, GUTTER, type } from '@/lib/theme';

import { Avatar, Icon } from './ui';

/** How a space looks from the viewer's side: a couple space is "them", a group is its name. */
export function spaceFace(space: SpaceWithMembers, userId: string) {
  const others = space.members.filter((m) => m.user_id !== userId).map((m) => m.profile);
  const partner = space.kind === 'couple' ? (others[0] ?? null) : null;
  return {
    others,
    partner,
    /** Short label under the avatar and in "to …" headers. */
    name: partner?.display_name ?? space.name,
    /** Who you're waiting for when nobody has joined yet. */
    waitingFor: space.kind === 'couple' ? 'your person' : 'your people',
  };
}

const SIZE = 52;

function SpaceAvatar({ space, userId, active }: { space: SpaceWithMembers; userId: string; active: boolean }) {
  const { others, partner } = spaceFace(space, userId);
  if (partner) return <Avatar emoji={partner.avatar} color={partner.color} size={SIZE} ring={active} badge={partner.mood_emoji} />;
  if (others.length >= 2) {
    // Group: two overlapping faces.
    const [a, b] = others;
    return (
      <View style={[styles.ring, active && { borderColor: colors.accent }]}>
        <View style={{ width: SIZE, height: SIZE }}>
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <Avatar emoji={a.avatar} color={a.color} size={32} />
          </View>
          <View style={{ position: 'absolute', right: -2, bottom: -2 }}>
            <Avatar emoji={b.avatar} color={b.color} size={32} />
          </View>
        </View>
      </View>
    );
  }
  if (others.length === 1) return <Avatar emoji={others[0].avatar} color={others[0].color} size={SIZE} ring={active} badge={others[0].mood_emoji} />;
  // Nobody has joined yet.
  return (
    <View style={[styles.ring, active && { borderColor: colors.accent }]}>
      <View style={[styles.empty, { borderColor: colors.textFaint }]}>
        <Icon name="person_add" size={22} color={colors.textDim} />
      </View>
    </View>
  );
}

/** Horizontal row of spaces (the people you draw for), plus "New". */
export function SpaceRow({
  spaces,
  activeId,
  userId,
  onSelect,
  onAdd,
}: {
  spaces: SpaceWithMembers[];
  activeId: string;
  userId: string;
  onSelect: (space: SpaceWithMembers) => void;
  onAdd?: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, flexGrow: 0 }} contentContainerStyle={styles.row}>
      {spaces.map((s) => {
        const active = s.id === activeId;
        return (
          <Pressable
            key={s.id}
            onPress={() => onSelect(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={spaceFace(s, userId).name}
            style={styles.item}
          >
            <SpaceAvatar space={s} userId={userId} active={active} />
            <Text style={[type.micro, { color: active ? colors.text : colors.textDim }]} numberOfLines={1}>
              {spaceFace(s, userId).name}
            </Text>
          </Pressable>
        );
      })}
      {onAdd ? (
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="New space" style={styles.item}>
          <View style={styles.ring}>
            <View style={[styles.empty, { borderStyle: 'solid', borderColor: colors.surfaceHi, backgroundColor: colors.surfaceHi }]}>
              <Icon name="add" size={24} color={colors.text} />
            </View>
          </View>
          <Text style={[type.micro, { color: colors.textDim }]}>New</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER - 6, gap: 6 },
  item: { width: 72, alignItems: 'center', gap: 4 },
  ring: { padding: 3, borderRadius: SIZE, borderWidth: 2, borderColor: 'transparent' },
  empty: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
