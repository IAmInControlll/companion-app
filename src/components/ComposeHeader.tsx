import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSpace } from '@/lib/session';
import { colors, type } from '@/lib/theme';

import { Avatar, IconButton, Row } from './ui';

/** Who a new post goes to, from the active space: one person, the group, or nobody yet. */
export function useRecipient() {
  const { space, others } = useSpace();
  const name = others.length === 0 ? null : others.length === 1 ? others[0].profile.display_name : space.name;
  return { name, face: others.length === 1 ? others[0].profile : null };
}

/** Top bar for Draw / Note / Photo: close, "to Lina", and the send action. */
export function ComposeHeader({
  onClose,
  onSend,
  title,
  disabled,
  busy,
}: {
  onClose: () => void;
  onSend: () => void;
  /** Overrides "to <name>". */
  title?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { name, face } = useRecipient();
  const label = name ? 'Send' : 'Save';
  return (
    <View style={styles.header}>
      <IconButton icon="close" label="Close" variant="plain" onPress={onClose} />
      <Row gap={8} style={{ flex: 1, justifyContent: 'center' }}>
        {!title && face ? <Avatar emoji={face.avatar} color={face.color} size={28} /> : null}
        <Text style={type.headline} numberOfLines={1}>
          {title ?? (name ? <Text><Text style={{ color: colors.textDim }}>to </Text>{name}</Text> : 'Your board')}
        </Text>
      </Row>
      <Pressable
        onPress={onSend}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={name ? `Send to ${name}` : 'Save'}
        accessibilityState={{ disabled: !!disabled, busy: !!busy }}
        style={({ pressed }) => [styles.send, disabled && { backgroundColor: colors.surfaceHi }, pressed && { opacity: 0.85 }]}
      >
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[type.label, { color: disabled ? colors.textFaint : colors.onAccent }]}>{label}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, gap: 8 },
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
