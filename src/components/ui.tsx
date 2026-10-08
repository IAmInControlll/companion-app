import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, colors, fonts, radius, type } from '@/lib/theme';
import { goBack } from '@/lib/nav';

import { ICON_GLYPHS, type IconName } from './icon-glyphs';

export type { IconName };

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** Material Symbols glyph (subset font, see scripts/build-icons.py). */
export function Icon({ name, size = 24, color = colors.text, filled }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  return (
    <Text
      accessible={false}
      allowFontScaling={false}
      style={{ fontFamily: filled ? fonts.iconsFilled : fonts.icons, fontSize: size, lineHeight: size, width: size, height: size, color, textAlign: 'center' }}
    >
      {ICON_GLYPHS[name]}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  style,
  padTop = true,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  padTop?: boolean;
  /** Enables pull-to-refresh; a rejected promise shows a "couldn't refresh" toast. */
  onRefresh?: () => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const pull = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      toast("Couldn't refresh", 'Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };
  const pad = { paddingTop: padTop ? insets.top + 8 : 8, paddingBottom: insets.bottom + 32 };
  if (!scroll) return <View style={[styles.screen, pad, style]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.screenContent, pad, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

/** Opaque strip behind the status bar so scrolled content doesn't run under the clock. */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }} />;
}

/** Screen header: back button, title, optional actions on the right. */
export function Header({ title, onBack = () => goBack(), right, back = true }: { title?: string; onBack?: () => void; right?: ReactNode; back?: boolean }) {
  return (
    <View style={styles.header}>
      {back ? <IconButton icon="arrow_back" label="Back" variant="plain" onPress={onBack} style={{ marginLeft: -10 }} /> : null}
      <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      {right ? <Row gap={4}>{right}</Row> : null}
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };

export function H1({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[type.title, style]}>
      {children}
    </Text>
  );
}

export function H2({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[type.headline, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, dim, style, numberOfLines }: TextProps & { dim?: boolean }) {
  return (
    <Text numberOfLines={numberOfLines} style={[type.body, dim && { color: colors.textDim }, style]}>
      {children}
    </Text>
  );
}

export function Caption({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[type.caption, style]}>
      {children}
    </Text>
  );
}

/** The hand font, for deliberate "written on the board" moments only. */
export function Chalk({ children, style, numberOfLines, size = 24 }: TextProps & { size?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[type.chalk, { fontSize: size, lineHeight: Math.round(size * 1.25) }, style]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const tap = () => Haptics.selectionAsync().catch(() => {});

/**
 * primary: the one main action on a screen. secondary: other actions.
 * ghost: low-emphasis text button. danger: destructive text button.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress?: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
}) {
  const off = disabled && !loading;
  const bg = variant === 'primary' ? (off ? colors.surfaceHi : colors.accent) : variant === 'secondary' ? colors.surfaceHi : 'transparent';
  const fg = off ? colors.textFaint : variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.button, variant === 'ghost' || variant === 'danger' ? styles.textButton : null, { backgroundColor: bg }, pressed && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={8}>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={[type.label, { color: fg, fontSize: variant === 'primary' ? 16 : 15 }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  onLongPress,
  label,
  variant = 'surface',
  size = 44,
  filled,
  disabled,
  color,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Spoken by screen readers; required because the button has no visible text. */
  label: string;
  /** surface: filled circle. plain: no background. inverse: light circle (an active tool). */
  variant?: 'surface' | 'plain' | 'inverse';
  size?: number;
  filled?: boolean;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'surface' ? colors.surfaceHi : variant === 'inverse' ? colors.text : 'transparent';
  const fg = color ?? (variant === 'inverse' ? colors.bg : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={size < 40 ? 8 : 0}
      onPress={() => {
        tap();
        onPress?.();
      }}
      onLongPress={onLongPress}
      // Dim the button itself: toggling opacity on an inner wrapper makes Fabric flatten/unflatten
      // it, re-parenting the icon mid-frame ("View already has a parent" crash on Android).
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        pressed && styles.pressed,
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} filled={filled} />
    </Pressable>
  );
}

/** For choosing between options. Never use a chip as an action button. */
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && { backgroundColor: colors.accentSoft, borderColor: colors.accent }, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={18} color={active ? colors.accent : colors.textDim} /> : null}
      <Text style={[type.label, { fontSize: 14, color: active ? colors.accent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Segmented control: a track with one selected segment (text and/or icon). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label?: string; icon?: IconName; a11y?: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segTrack, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.a11y ?? o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={[styles.seg, on && styles.segOn, !o.label && { flex: 0, width: 44 }]}
          >
            {o.icon ? <Icon name={o.icon} size={20} color={on ? colors.bg : colors.textDim} /> : null}
            {o.label ? (
              <Text numberOfLines={1} style={[type.label, { fontSize: 14, flexShrink: 1, color: on ? colors.bg : colors.textDim }]}>
                {o.label}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Rows grouped in one block, like a settings list. */
export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={[type.micro, { textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 4 }]}>{title}</Text> : null}
      <View style={styles.listGroup}>{children}</View>
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  danger,
  leading,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** Defaults to a chevron when the row is tappable; pass null for nothing. */
  right?: ReactNode;
  danger?: boolean;
  leading?: ReactNode;
}) {
  const content = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={22} color={danger ? colors.danger : colors.textDim} /> : null)}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.label, danger && { color: colors.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type.caption} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right !== undefined ? right : onPress && !danger ? <Icon name="chevron_right" size={22} color={colors.textFaint} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceHi }]}>
      {content}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textFaint} selectionColor={colors.accent} cursorColor={colors.accent} {...props} style={[styles.input, props.style]} />;
}

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<TextInputProps, 'secureTextEntry'>) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input {...props} secureTextEntry={!visible} style={[{ paddingRight: 52 }, props.style]} />
      <IconButton
        icon={visible ? 'visibility_off' : 'visibility'}
        label={visible ? 'Hide password' : 'Show password'}
        variant="plain"
        size={40}
        color={colors.textDim}
        onPress={() => setVisible((v) => !v)}
        style={{ position: 'absolute', right: 6 }}
      />
    </View>
  );
}

export function Avatar({
  emoji,
  color,
  size = 44,
  ring,
  badge,
}: {
  emoji: string;
  color: string;
  size?: number;
  /** Selected state: an accent ring with a gap. */
  ring?: boolean;
  /** Small emoji in the corner (e.g. their mood). */
  badge?: string | null;
}) {
  const inner = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '38', alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ fontSize: size * 0.48 }}>
        {emoji}
      </Text>
    </View>
  );
  return (
    <View>
      <View style={{ padding: 3, borderRadius: size, borderWidth: 2, borderColor: ring ? colors.accent : 'transparent' }}>{inner}</View>
      {badge ? (
        <View style={[styles.badge, { width: size * 0.42 + 6, height: size * 0.42 + 6, borderRadius: size }]}>
          <Text allowFontScaling={false} style={{ fontSize: size * 0.3 }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Bottom sheet: the backdrop fades while the sheet slides. The Modal itself doesn't animate, so
 * it stays mounted until the closing animation finishes. Modals render outside the app root on
 * Android, so gestures need their own root.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const anim = visible
      ? Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      : Animated.timing(progress, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, progress]);

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
          ]}
        >
          <View style={styles.grabber} />
          {title ? <Text style={[type.headline, { fontSize: 19 }]}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

const ToastCtx = createContext<(title: string, body?: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ title: string; body?: string } | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (title: string, body?: string) => {
      setToast({ title, body });
      if (timer.current) clearTimeout(timer.current);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 2800);
    },
    [anim],
  );

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { top: insets.top + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
          ]}
        >
          <Text style={type.label}>{toast.title}</Text>
          {toast.body ? <Text style={[type.caption, { marginTop: 2 }]}>{toast.body}</Text> : null}
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: GUTTER },
  screenContent: { paddingHorizontal: GUTTER, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 10 },
  pressed: { opacity: 0.75 },
  button: { minHeight: 52, borderRadius: radius.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: 44 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segTrack: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, gap: 4 },
  seg: { flex: 1, height: 36, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segOn: { backgroundColor: colors.text },
  listGroup: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  badge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: '#00000080' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: GUTTER, paddingTop: 10, gap: 14 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 4 },
  toast: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
  },
});
