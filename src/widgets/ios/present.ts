import { BOARDS, type BoardId } from '@/drawing/model';
import { SHOW_QUESTIONS } from '@/lib/features';
import { NUDGES } from '@/lib/nudges';
import { formatDistance, plural, timeAgo } from '@/lib/util';

import {
  boardTag,
  type ChalkboardData,
  type CountdownData,
  type DistanceData,
  type MissYouData,
  type MoodData,
  type StreakData,
  type WidgetName,
  type WidgetPayload,
  type WidgetSpace,
} from '../data';
import type { Card, CardLine } from './types';

// Same tokens as the Android widgets (src/widgets/widgets.tsx).
const C = {
  surface: '#1A1E1C',
  board: '#2F4A3A',
  text: '#F4F1EA',
  dim: '#A3AAA6',
  faint: '#6B7370',
  accent: '#F7A8C4',
  onAccent: '#2B1520',
  yellow: '#F9D77E',
};

const SCHEME = 'chalkmates://';

const message = (symbol: CardLine['symbol'], text: string, path = ''): Card => ({
  url: SCHEME + path,
  bg: C.surface,
  lines: [
    { text: '', symbol, size: 28, color: C.dim },
    { text, size: 13, color: C.dim, maxLines: 3 },
  ],
});

/** Turn loaded widget data into what the iOS widget draws. `image` is the shared-container copy, if any. */
export function present(name: WidgetName, payload: WidgetPayload, image: string | null): Card {
  if (payload.status === 'signed-out') return message('lock.fill', 'Open Chalkmates to sign in');
  if (payload.status === 'no-space') return message('person.badge.plus', 'Open Chalkmates to invite your person');
  if (payload.status === 'error') return message('arrow.clockwise', 'Couldn’t refresh. Tap to open');
  const { space, data } = payload;
  switch (name) {
    case 'Chalkboard':
      return chalkboard(data, space, image);
    case 'Mood':
      return mood(data);
    case 'MissYou':
      return missYou(data, space.id);
    case 'Distance':
      return distance(data);
    case 'Countdown':
      return countdown(data);
    case 'Streak':
      return streak(data);
  }
}

function chalkboard({ post, author }: ChalkboardData, space: WidgetSpace, image: string | null): Card {
  if (!post || !image) {
    return {
      url: `${SCHEME}draw?space=${space.id}`,
      bg: C.board,
      lines: [
        { text: 'Nothing yet', size: 22, color: C.text, hand: true },
        { text: 'Tap to draw the first one', size: 12, color: '#C9D3CC', maxLines: 2 },
      ],
    };
  }
  return {
    url: `${SCHEME}post/${post.id}`,
    bg: post.bg_color ?? (BOARDS[post.board as BoardId] ?? BOARDS.classic).base,
    image,
    imageMode: 'fit',
    tag: boardTag(space, author, post.created_at),
    lines: [],
  };
}

function mood({ people }: MoodData): Card {
  if (!people.length) return message('person.badge.plus', 'Waiting for your person to join');
  const p = people[0];
  return {
    url: `${SCHEME}mood`,
    bg: C.surface,
    lines: ([
      { text: p.emoji ?? p.avatar, size: 40, color: C.text },
      { text: people.length > 1 ? `${p.name} +${people.length - 1}` : p.name, size: 15, color: p.color, weight: 'bold' },
      { text: p.text ?? (p.emoji ? '' : 'No mood yet'), size: 12, color: C.dim, maxLines: 2 },
      ...(p.at ? [{ text: timeAgo(p.at), size: 11, color: C.faint }] : []),
    ] satisfies CardLine[]).filter((l) => l.text !== ''),
    rows: people.length > 1 ? people.map((x) => ({ left: `${x.emoji ?? x.avatar}  ${x.name}${x.text ? ` · ${x.text}` : ''}` })) : undefined,
  };
}

function missYou(data: MissYouData, spaceId: string): Card {
  // iOS widgets can't make network calls on tap, so the app sends it (src/app/nudge.tsx).
  const send = (kind: string) => `${SCHEME}nudge?space=${spaceId}&kind=${kind}`;
  // Today's nudges each way, same as the Android widget's footer.
  const them = data.fromThemToday;
  const me = data.fromMeToday ?? 0;
  const today = them || me ? `${data.names} sent ${them} · You sent ${me} today` : null;
  return {
    // Small widgets have one tap target: "miss you". Medium ones get a button per nudge.
    url: send('miss_you'),
    bg: C.accent,
    gradient: ['#F7A8C4', '#D98BB0'],
    lines: [
      { text: '', symbol: 'heart.fill', size: 36, color: C.onAccent },
      { text: `Miss you, ${data.names}`, size: 14, color: C.onAccent, weight: 'bold', maxLines: 2 },
      ...(today ? [{ text: today, size: 11, color: '#5A2E44', maxLines: 2 }] : []),
    ],
    actions: {
      title: `Send ${data.names}…`,
      footer: today ?? 'Tap one to send it',
      buttons: NUDGES.map((n) => ({ emoji: n.emoji, url: send(n.kind) })),
    },
  };
}

function distance(data: DistanceData): Card {
  if (!data.meSharing) return message('location.fill', 'Turn on location sharing in the app', 'settings');
  const known = data.people.filter((p) => p.km !== null).sort((a, b) => a.km! - b.km!);
  if (!known.length) return message('location.fill', data.people.length ? 'Waiting for their location' : 'Waiting for your person');
  const p = known[0];
  return {
    url: SCHEME,
    bg: C.surface,
    lines: [
      { text: formatDistance(p.km!), size: 28, color: C.text, hand: true },
      { text: `you and ${p.avatar} ${p.name}`, size: 12, color: C.dim },
    ],
    rows: known.length > 1 ? known.map((x) => ({ left: `${x.avatar} ${x.name}`, right: formatDistance(x.km!) })) : undefined,
  };
}

function countdown({ next, then, together, couple }: CountdownData): Card {
  const since = couple === false ? 'since it started' : 'together';
  const url = `${SCHEME}countdowns`;
  if (!next) {
    if (together === null) return message('calendar', 'Add a countdown', 'countdowns');
    return {
      url,
      bg: C.surface,
      lines: [
        { text: String(together), size: 38, color: C.accent, hand: true },
        { text: `days ${since}`, size: 12, color: C.dim },
      ],
    };
  }
  const today = next.days === 0;
  return {
    url,
    bg: C.surface,
    lines: [
      { text: today ? 'Today' : String(next.days), size: today ? 30 : 40, color: C.accent, hand: true },
      { text: today ? `${next.emoji} ${next.title}` : `${next.days === 1 ? 'day' : 'days'} until ${next.emoji}`, size: 12, color: C.dim },
      ...(!today ? [{ text: next.title, size: 14, color: C.text, weight: 'bold' as const }] : []),
      ...(then ? [{ text: `then ${then.emoji} in ${plural(then.days, 'day')}`, size: 11, color: C.faint }] : []),
      ...(!then && together !== null ? [{ text: `${plural(together, 'day')} ${since}`, size: 11, color: C.faint }] : []),
    ],
  };
}

function streak(data: StreakData): Card {
  const status = !SHOW_QUESTIONS
    ? data.todayComplete
      ? null
      : 'Draw or nudge today to keep it'
    : data.answered
    ? data.othersAnswered > 0
      ? data.couple === false
        ? `${data.othersAnswered + 1} answered, tap to read`
        : 'Both answered, tap to read'
      : 'Answered, waiting on them'
    : 'Today’s question is waiting';
  const lit = data.streak > 0;
  return {
    url: `${SCHEME}together`,
    bg: C.surface,
    lines: [
      { text: '', symbol: 'flame.fill', size: 24, color: lit ? C.yellow : C.faint },
      { text: String(data.streak), size: 32, color: lit ? C.yellow : C.text, hand: true },
      { text: data.todayComplete ? 'streak kept today' : 'day streak', size: 12, color: C.dim },
      ...(data.question ? [{ text: `“${data.question}”`, size: 13, color: C.text, maxLines: 3, roomy: true }] : []),
      ...(status ? [{ text: status, size: 11, color: data.answered || !SHOW_QUESTIONS ? C.faint : C.accent, weight: 'bold' as const, maxLines: 2 }] : []),
    ],
  };
}
