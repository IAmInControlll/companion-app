"use no memo";
// The 'widget' function below is serialized into the iOS widget extension, so the React Compiler must stay off.

import { HStack, Image, Link, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  multilineTextAlignment,
  padding,
  resizable,
  aspectRatio,
  background,
  clipShape,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { Card } from './types';

/**
 * One layout for every Chalkmates widget; present.ts decides what goes in it.
 * Runs in the widget extension's isolated runtime: no hooks, no imports beyond @expo/ui,
 * and nothing from module scope (everything it needs is declared inside).
 */
const ChalkWidget = (card: Card, env: WidgetEnvironment) => {
  'widget';
  const small = env.widgetFamily === 'systemSmall';
  const fill = card.gradient
    ? { type: 'linearGradient' as const, colors: card.gradient, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }
    : card.bg;
  const outer = [containerBackground(fill, 'widget'), widgetURL(card.url)];

  if (card.image) {
    const img =
      card.imageMode === 'fill'
        ? [resizable(), aspectRatio({ contentMode: 'fill' }), frame({ maxWidth: 10000, maxHeight: 10000 }), clipShape('rectangle')]
        : [resizable(), aspectRatio({ contentMode: 'fit' }), padding({ all: 6 })];
    return (
      <ZStack alignment="bottomLeading" modifiers={outer}>
        <Image uiImage={card.image} modifiers={img} />
        {card.tag ? (
          <Text
            modifiers={[
              font({ size: 11, weight: 'bold', design: 'rounded' }),
              foregroundStyle('#FFFFFF'),
              lineLimit(1),
              padding({ horizontal: 8, vertical: 3 }),
              background('#00000080'),
              clipShape('capsule'),
              padding({ all: 8 }),
            ]}
          >
            {card.tag}
          </Text>
        ) : null}
      </ZStack>
    );
  }

  if (card.actions && !small) {
    return (
      <VStack spacing={10} modifiers={[...outer, padding({ all: 14 })]}>
        <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), foregroundStyle('#2B1520'), lineLimit(1)]}>{card.actions.title}</Text>
        <HStack spacing={8}>
          {card.actions.buttons.map((b, i) => (
            <Link key={i} destination={b.url}>
              <Text modifiers={[font({ size: 26 }), frame({ width: 44, height: 44 }), background('#FFFFFF59'), clipShape('circle')]}>{b.emoji}</Text>
            </Link>
          ))}
        </HStack>
        <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle('#5A2E44'), lineLimit(1), minimumScaleFactor(0.7)]}>
          {card.actions.footer}
        </Text>
      </VStack>
    );
  }

  if (card.rows?.length && !small) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[...outer, padding({ all: 14 })]}>
        {card.rows.slice(0, 5).map((r, i) => (
          <HStack key={i} spacing={8}>
            <Text modifiers={[font({ size: 14, weight: 'semibold', design: 'rounded' }), foregroundStyle(r.color ?? '#F4F1EA'), lineLimit(1)]}>{r.left}</Text>
            <Spacer />
            {r.right ? <Text modifiers={[font({ size: 14, weight: 'bold', design: 'rounded' }), foregroundStyle('#A3AAA6'), lineLimit(1)]}>{r.right}</Text> : null}
          </HStack>
        ))}
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack spacing={4} modifiers={[...outer, padding({ all: 14 })]}>
      {card.lines
        .filter((l) => !l.roomy || !small)
        .map((l, i) =>
          l.symbol ? (
            <Image key={i} systemName={l.symbol} size={l.size} color={l.color} />
          ) : (
            <Text
              key={i}
              modifiers={[
                font({ size: l.size, weight: l.weight ?? (l.hand ? 'bold' : 'semibold'), design: 'rounded' }),
                foregroundStyle(l.color),
                lineLimit(l.maxLines ?? 1),
                minimumScaleFactor(0.6),
                multilineTextAlignment('center'),
              ]}
            >
              {l.text}
            </Text>
          ),
        )}
    </VStack>
  );
};

export const IOS_WIDGETS = {
  Chalkboard: createWidget('Chalkboard', ChalkWidget),
  Mood: createWidget('Mood', ChalkWidget),
  MissYou: createWidget('MissYou', ChalkWidget),
  Distance: createWidget('Distance', ChalkWidget),
  Countdown: createWidget('Countdown', ChalkWidget),
  Streak: createWidget('Streak', ChalkWidget),
};
