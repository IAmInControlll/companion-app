import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSpace } from '@/lib/session';
import { colors, type } from '@/lib/theme';

import { Avatar, IconButton } from './ui';

/** Who a new post goes to, from the active space: one person, the group, or nobody yet. */
export function useRecipient() {
  const { space, others } = useSpace();
  const name = others.length === 0 ? null : others.length === 1 ? others[0].profile.display_name : space.name;
  return { name, face: others.length === 1 ? others[0].profile : null };
}

/** Top bar for Draw / Note: close, who it's going to ("to 🌸 Lina"), and Send. */
export function ComposeHeader({
  onClose,
  onSend,
  title,
  disabled,
  busy,
}: {
  onClose: () => void;
  onSend: () => void;
  /** Replaces the "to …" chip (e.g. "On their board"). */
  title?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { name, face } = useRecipient();
  const label = name ? 'Send' : 'Save';
  const fg = disabled ? colors.textFaint : colors.onAccent;
  return (
    <View style={styles.header}>
      <IconButton icon="close" label="Close" variant="plain" onPress={onClose} />
      <View style={styles.middle}>
        {title ? (
          <Text style={type.headline} numberOfLines={1}>
            {title}
          </Text>
        ) : name ? (
          <>
            <Text style={[type.body, { color: colors.textDim }]}>to</Text>
            {/* Avatar and name together in one chip; a long name shortens with "…". */}
            <View style={styles.chip} accessible accessibilityLabel={`To ${name}`}>
              {face ? <Avatar emoji={face.avatar} color={face.color} size={24} /> : null}
              <Text style={[type.label, styles.chipName]} numberOfLines={1}>
                {name}
              </Text>
            </View>
          </>
        ) : (
          <Text style={type.headline}>Your board</Text>
        )}
      </View>
      <Pressable
        onPress={onSend}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={name ? `Send to ${name}` : 'Save'}
        accessibilityState={{ disabled: !!disabled, busy: !!busy }}
        style={({ pressed }) => [styles.send, disabled && { backgroundColor: colors.surfaceHi }, pressed && { opacity: 0.85 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={[type.label, { color: fg }]}>{label}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, gap: 8 },
  middle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    // Avatar is 24 + a 5px ring each side.
    height: 36,
    paddingLeft: 1,
    paddingRight: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceHi,
  },
  chipName: { flexShrink: 1 },
  send: {
    backgroundColor: colors.accent,
    borderRadius: 22,
    paddingHorizontal: 20,
    height: 44,
    justifyContent: 'center',
    minWidth: 84,
    alignItems: 'center',
    marginRight: 4,
  },
});
