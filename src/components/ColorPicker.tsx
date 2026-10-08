import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, Circle, LinearGradient, RoundedRect, SweepGradient, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { hexToHsv, hsvToHex, isHex, normalizeHex, type HSV } from '@/lib/color';
import { colors } from '@/lib/theme';

import { Input, Row } from './ui';

const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Full-spectrum picker: saturation/brightness square + hue bar + hex field.
 * Remount with a `key` to reset it to a new value.
 */
export function ColorPicker({ value, onChange, width }: { value: string; onChange: (hex: string) => void; width: number }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value.toUpperCase());
  const svH = Math.round(width * 0.5);
  const hueH = 28;

  const update = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  };

  const pickSV = (x: number, y: number) => update({ ...hsv, s: clamp01(x / width), v: 1 - clamp01(y / svH) });
  const pickHue = (x: number) => update({ ...hsv, h: clamp01(x / width) * 359.9 });

  const svGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => pickSV(e.x, e.y))
    .onUpdate((e) => pickSV(e.x, e.y));
  const hueGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => pickHue(e.x))
    .onUpdate((e) => pickHue(e.x));

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const current = hsvToHex(hsv);

  return (
    <View style={{ gap: 12 }}>
      <GestureDetector gesture={svGesture}>
        <Canvas style={{ width, height: svH }}>
          <RoundedRect x={0} y={0} width={width} height={svH} r={14}>
            <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={['#FFFFFF', pureHue]} />
          </RoundedRect>
          <RoundedRect x={0} y={0} width={width} height={svH} r={14}>
            <LinearGradient start={vec(0, 0)} end={vec(0, svH)} colors={['#00000000', '#000000']} />
          </RoundedRect>
          <Circle cx={hsv.s * width} cy={(1 - hsv.v) * svH} r={12} color={current} />
          <Circle cx={hsv.s * width} cy={(1 - hsv.v) * svH} r={12} color="#FFFFFF" style="stroke" strokeWidth={3} />
        </Canvas>
      </GestureDetector>
      <GestureDetector gesture={hueGesture}>
        <Canvas style={{ width, height: hueH }}>
          <RoundedRect x={0} y={4} width={width} height={hueH - 8} r={10}>
            <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={HUES} />
          </RoundedRect>
          <Circle cx={(hsv.h / 360) * width} cy={hueH / 2} r={12} color={pureHue} />
          <Circle cx={(hsv.h / 360) * width} cy={hueH / 2} r={12} color="#FFFFFF" style="stroke" strokeWidth={3} />
        </Canvas>
      </GestureDetector>
      <Row>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: current, borderWidth: 2, borderColor: colors.line }} />
        <Input
          value={hexText}
          onChangeText={(t) => {
            setHexText(t);
            if (isHex(t)) {
              const hex = normalizeHex(t);
              setHsv(hexToHsv(hex));
              onChange(hex);
            }
          }}
          autoCapitalize="characters"
          maxLength={7}
          style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 2 }}
        />
      </Row>
    </View>
  );
}

/** Small rainbow circle used as the "custom colour" button. */
export function RainbowSwatch({ size = 28 }: { size?: number }) {
  const r = size / 2;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={r} cy={r} r={r}>
        <SweepGradient c={vec(r, r)} colors={HUES} />
      </Circle>
      <Circle cx={r} cy={r} r={r * 0.42} color="#FFFFFF" />
      <Circle cx={r} cy={r} r={r * 0.42} color="#00000033" style="stroke" strokeWidth={1} />
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// Recently used custom colours (per device)
// ---------------------------------------------------------------------------

const RECENT_KEY = 'recentColors';
let recentCache: string[] | null = null;
const listeners = new Set<(c: string[]) => void>();

export function useRecentColors() {
  const [recent, setRecent] = useState<string[]>(recentCache ?? []);

  useEffect(() => {
    listeners.add(setRecent);
    if (!recentCache) {
      AsyncStorage.getItem(RECENT_KEY)
        .then((raw) => {
          recentCache = raw ? (JSON.parse(raw) as string[]) : [];
          listeners.forEach((l) => l(recentCache!));
        })
        .catch(() => {});
    }
    return () => {
      listeners.delete(setRecent);
    };
  }, []);

  const addRecent = useCallback((hex: string) => {
    const next = [hex.toUpperCase(), ...(recentCache ?? []).filter((c) => c.toUpperCase() !== hex.toUpperCase())].slice(0, 10);
    recentCache = next;
    listeners.forEach((l) => l(next));
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { recent, addRecent };
}

export function SwatchButton({ color, active, onPress }: { color: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Color ${color}`}
      style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: active ? colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, borderWidth: 1, borderColor: '#00000033' }} />
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={{ color: colors.textDim, fontSize: 14 }}>{children}</Text>;
}
