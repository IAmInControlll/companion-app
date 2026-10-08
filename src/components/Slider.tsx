import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '@/lib/theme';

const THUMB = 24;

/**
 * Lightweight slider (no native module). `log` maps the track logarithmically,
 * which feels right for brush sizes: fine control at the small end.
 */
export function Slider({
  value,
  min,
  max,
  onChange,
  log = false,
  color = colors.pink,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  log?: boolean;
  color?: string;
}) {
  const [width, setWidth] = useState(0);
  const toT = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromT = (t: number) => (log ? min * Math.pow(max / min, t) : min + t * (max - min));
  const t = Math.min(1, Math.max(0, toT(value)));
  const track = Math.max(1, width - THUMB);

  const set = (x: number) => onChange(fromT(Math.min(1, Math.max(0, (x - THUMB / 2) / track))));
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .hitSlop({ vertical: 12 })
    .onBegin((e) => set(e.x))
    .onUpdate((e) => set(e.x));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ height: 40, justifyContent: 'center', flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, marginHorizontal: THUMB / 2 }}>
          <View style={{ width: t * track, height: 4, borderRadius: 2, backgroundColor: color }} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: t * track,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: colors.text,
            borderWidth: 3,
            borderColor: color,
          }}
        />
      </View>
    </GestureDetector>
  );
}
