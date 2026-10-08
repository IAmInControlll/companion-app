import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { DocView } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARDS, type BoardId, type Doc } from '@/drawing/model';
import type { Post } from '@/lib/types';
import { colors, radius } from '@/lib/theme';

import { Icon } from './ui';

/** Background behind a post's image: the board it was drawn on, or neutral for photos. */
export function postBackground(post: Pick<Post, 'bg_color' | 'board' | 'kind'>): string {
  if (post.kind === 'photo') return colors.surface;
  return post.bg_color ?? (BOARDS[post.board as BoardId] ?? BOARDS.classic).base;
}

/** A chalk message on an empty classic board, drawn with the real engine. */
function chalkDoc(lines: string[]): Doc {
  const n = lines.length;
  return {
    v: 1,
    board: 'classic',
    style: { frame: 'none' },
    aspect: 1,
    items: [
      ...lines.map((text, i) => ({
        t: 'text' as const,
        id: `l${i}`,
        text,
        color: i === 0 ? '#F4F1E8' : '#C9D3CC',
        x: 0.5,
        y: 0.46 + (i - (n - 1) / 2) * 0.13,
        size: i === 0 ? 0.1 : 0.075,
        rot: -2,
        seed: 11 + i,
      })),
      { t: 'stamp' as const, id: 'h', shape: 'heart', color: '#F7A8C4', x: 0.5, y: 0.46 + ((n + 1) / 2) * 0.13 + 0.03, size: 0.09, rot: 8, seed: 3 },
    ],
  };
}

/**
 * The square board: the latest post, or a chalk empty state. Always the same size, so the
 * screen never jumps between posts. Tap opens it; double-tap sends a heart.
 */
export function BoardStage({
  size,
  post,
  url,
  empty,
  label,
  onPress,
  onDoubleTap,
}: {
  size: number;
  post: Pick<Post, 'bg_color' | 'board' | 'kind'> | null;
  url: string | null;
  /** Lines of chalk shown when there's no post. */
  empty: string[];
  /** Screen-reader description of what's on the board. */
  label: string;
  onPress?: () => void;
  onDoubleTap?: () => void;
}) {
  const typeface = useHandTypeface();
  const env = useMemo(() => ({ typeface }), [typeface]);
  const emptyDoc = useMemo(() => chalkDoc(empty), [empty]);
  const [heart] = useState(() => new Animated.Value(0));

  const burst = () => {
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }),
      Animated.timing(heart, { toValue: 2, duration: 260, delay: 280, useNativeDriver: true }),
    ]).start();
  };

  const single = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, ok) => ok && onPress?.());
  const double = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd((_e, ok) => {
      if (!ok) return;
      burst();
      onDoubleTap?.();
    });
  const gesture = onDoubleTap ? Gesture.Exclusive(double, single) : single;

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={onDoubleTap ? [{ name: 'activate' }, { name: 'heart', label: 'Send a heart' }] : [{ name: 'activate' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'heart' ? onDoubleTap?.() : onPress?.())}
        style={[styles.stage, { width: size, height: size, backgroundColor: post ? postBackground(post) : colors.board }]}
      >
        {post && url ? (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={180} recyclingKey={url} />
        ) : post ? null : (
          <DocView doc={emptyDoc} env={env} width={size} />
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heart,
            {
              opacity: heart.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] }),
              transform: [{ scale: heart.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.25] }) }],
            },
          ]}
        >
          <Icon name="favorite" filled size={104} color={colors.accent} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: radius.board, overflow: 'hidden', alignSelf: 'center' },
  heart: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
