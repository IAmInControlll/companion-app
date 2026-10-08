"use no memo";
// Widget trees are plain functions evaluated by react-native-android-widget, so the React Compiler must stay off.

import { FlexWidget, ImageWidget, OverlapWidget, TextWidget, type WidgetInfo } from 'react-native-android-widget';

import { ICON_GLYPHS, type IconName } from '@/components/icon-glyphs';
import { BOARDS, type BoardId } from '@/drawing/model';
import { fonts } from '@/lib/theme';
import { formatDistance, plural, timeAgo } from '@/lib/util';

import type {
  ChalkboardData,
  CountdownData,
  DistanceData,
  MissYouData,
  MoodData,
  StreakData,
  WidgetName,
  WidgetPayload,
} from './data';

type Hex = `#${string}`;
const hex = (s: string) => s as Hex;

// Same tokens as the app (src/lib/theme.ts), typed for the widget renderer.
const C = {
  surface: hex('#1A1E1C'),
  board: hex('#2F4A3A'),
  text: hex('#F4F1EA'),
  dim: hex('#A3AAA6'),
  faint: hex('#6B7370'),
  accent: hex('#F7A8C4'),
  onAccent: hex('#2B1520'),
  yellow: hex('#F9D77E'),
  pill: hex('#00000080'),
};
const RADIUS = 24;

const SCHEME = 'chalkmates://';
const link = (path: string) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: SCHEME + path } }) as const;

type Font = 'hand' | 'regular' | 'semibold' | 'bold' | 'heavy';

function T({
  text,
  size = 14,
  color = C.text,
  align = 'left',
  lines = 1,
  font = 'semibold',
}: {
  text: string;
  size?: number;
  color?: Hex;
  align?: 'left' | 'center' | 'right';
  lines?: number;
  font?: Font;
}) {
  return <TextWidget text={text} maxLines={lines} truncate="END" style={{ fontSize: size, color, fontFamily: fonts[font], textAlign: align }} />;
}

/** Material Symbols glyph from the embedded icon font. */
function Glyph({ name, size = 24, color = C.text, filled }: { name: IconName; size?: number; color?: Hex; filled?: boolean }) {
  return <TextWidget text={ICON_GLYPHS[name]} style={{ fontSize: size, color, fontFamily: filled ? fonts.iconsFilled : fonts.icons, textAlign: 'center' }} />;
}

function Shell({ children, bg = C.surface, path = '' }: { children: any; bg?: Hex; path?: string }) {
  return (
    <FlexWidget
      {...link(path)}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: bg,
        borderRadius: RADIUS,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: 4,
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Message({ icon, text, path = '' }: { icon: IconName; text: string; path?: string }) {
  return (
    <Shell path={path}>
      <Glyph name={icon} size={30} color={C.dim} />
      <T text={text} size={13} align="center" lines={3} color={C.dim} />
    </Shell>
  );
}

export function renderWidgetFor(name: WidgetName, payload: WidgetPayload, info: WidgetInfo) {
  if (payload.status === 'signed-out') return <Message icon="lock" text="Open Chalkmates to sign in" />;
  if (payload.status === 'no-space') return <Message icon="person_add" text="Open Chalkmates to invite your person" />;
  if (payload.status === 'error') return <Message icon="refresh" text="Couldn’t refresh. Tap to open" />;
  const { space, data } = payload;
  switch (name) {
    case 'Chalkboard':
      return <ChalkboardWidget data={data} spaceId={space.id} info={info} />;
    case 'Photo':
      return <PhotoWidget data={data} spaceId={space.id} info={info} />;
    case 'Mood':
      return <MoodWidget data={data} />;
    case 'MissYou':
      return <MissYouWidget data={data} spaceId={space.id} />;
    case 'Distance':
      return <DistanceWidget data={data} info={info} />;
    case 'Countdown':
      return <CountdownWidget data={data} />;
    case 'Streak':
      return <StreakWidget data={data} info={info} />;
  }
}

/** Largest box of the given aspect that fits inside the widget. */
function fit(aspect: number, info: WidgetInfo) {
  const W = info.width;
  const H = info.height;
  return W / H > aspect ? { w: Math.round(H * aspect), h: H } : { w: W, h: Math.round(W / aspect) };
}

/** Small "who · when" tag in the corner of a board or photo. */
function Tag({ text }: { text: string }) {
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'flex-end', padding: 8 }}>
      <FlexWidget style={{ backgroundColor: C.pill, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
        <T text={text} size={11} color={hex('#FFFFFF')} font="bold" />
      </FlexWidget>
    </FlexWidget>
  );
}

// ---------------------------------------------------------------------------

export function ChalkboardWidget({ data, spaceId, info }: { data: ChalkboardData; spaceId: string; info: WidgetInfo }) {
  const { post, image, author } = data;
  if (!post || !image) {
    return (
      <Shell bg={C.board} path={`draw?space=${spaceId}`}>
        <T text="Nothing yet" size={22} align="center" font="hand" />
        <T text="Tap to draw the first one" size={12} align="center" color={hex('#C9D3CC')} />
      </Shell>
    );
  }
  const bg = post.bg_color ?? (BOARDS[post.board as BoardId] ?? BOARDS.classic).base;
  const box = fit(post.aspect, info);
  return (
    <OverlapWidget {...link(`post/${post.id}`)} style={{ height: 'match_parent', width: 'match_parent', borderRadius: RADIUS, backgroundColor: hex(bg) }}>
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}>
        <ImageWidget image={image as `data:image${string}`} imageWidth={box.w} imageHeight={box.h} radius={RADIUS} />
      </FlexWidget>
      <Tag text={`${author?.avatar ?? ''} ${timeAgo(post.created_at)}`.trim()} />
    </OverlapWidget>
  );
}

export function PhotoWidget({ data, spaceId, info }: { data: ChalkboardData; spaceId: string; info: WidgetInfo }) {
  const { post, image, author } = data;
  if (!post || !image) return <Message icon="add_photo_alternate" text="No photos yet. Tap to share one" path={`photo?space=${spaceId}`} />;
  return (
    <OverlapWidget {...link(`post/${post.id}`)} style={{ height: 'match_parent', width: 'match_parent', borderRadius: RADIUS, backgroundColor: C.surface }}>
      <ImageWidget image={image as `data:image${string}`} imageWidth={info.width} imageHeight={info.height} resizeMode="cover" radius={RADIUS} />
      <Tag text={`${author?.avatar ?? ''} ${author?.name ?? ''} · ${timeAgo(post.created_at)}`.trim()} />
    </OverlapWidget>
  );
}

export function MoodWidget({ data }: { data: MoodData }) {
  const people = data.people;
  if (!people.length) return <Message icon="person_add" text="Waiting for your person to join" />;
  if (people.length === 1) {
    const p = people[0];
    return (
      <Shell path="mood">
        <T text={p.emoji ?? p.avatar} size={44} align="center" />
        <T text={p.name} size={15} align="center" color={hex(p.color)} font="bold" />
        <T text={p.text ?? (p.emoji ? '' : 'No mood yet')} size={12} align="center" color={C.dim} lines={2} />
        {p.at ? <T text={timeAgo(p.at)} size={11} align="center" color={C.faint} /> : null}
      </Shell>
    );
  }
  return (
    <FlexWidget
      {...link('mood')}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.surface, borderRadius: RADIUS, padding: 12, flexDirection: 'column', flexGap: 6 }}
    >
      {people.slice(0, 5).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          <T text={p.emoji ?? p.avatar} size={20} />
          <T text={`${p.name}${p.text ? ` · ${p.text}` : ''}`} size={13} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

export function MissYouWidget({ data, spaceId, sent }: { data: MissYouData; spaceId: string; sent?: boolean }) {
  return (
    <FlexWidget
      clickAction="MISS_YOU"
      clickActionData={{ spaceId }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: RADIUS,
        padding: 12,
        backgroundGradient: { from: hex('#F7A8C4'), to: hex('#D98BB0'), orientation: 'TL_BR' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: 2,
      }}
    >
      <Glyph name={sent ? 'check' : 'favorite'} filled size={40} color={C.onAccent} />
      <T text={sent ? 'Sent' : `Miss you, ${data.names}`} size={14} align="center" color={C.onAccent} lines={2} font="bold" />
      {data.fromThemToday > 0 && !sent ? (
        <T
          text={`${data.lastFrom ?? 'They'} missed you ${data.fromThemToday === 1 ? 'once' : `${data.fromThemToday}×`} today`}
          size={11}
          align="center"
          color={hex('#5A2E44')}
          lines={2}
        />
      ) : null}
    </FlexWidget>
  );
}

export function DistanceWidget({ data, info }: { data: DistanceData; info: WidgetInfo }) {
  if (!data.meSharing) return <Message icon="location_on" text="Turn on location sharing in the app" path="settings" />;
  const known = data.people.filter((p) => p.km !== null).sort((a, b) => a.km! - b.km!);
  if (!known.length) {
    return <Message icon="location_on" text={data.people.length ? 'Waiting for their location' : 'Waiting for your person'} />;
  }
  const compact = info.height < 100;
  if (known.length === 1 || compact) {
    const p = known[0];
    return (
      <Shell>
        <T text={formatDistance(p.km!)} size={compact ? 20 : 28} align="center" font="hand" />
        <T text={`you and ${p.avatar} ${p.name}`} size={12} align="center" color={C.dim} />
      </Shell>
    );
  }
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.surface, borderRadius: RADIUS, padding: 12, flexDirection: 'column', flexGap: 4 }}>
      {known.slice(0, 5).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          <T text={`${p.avatar} ${p.name}`} size={13} />
          <T text={formatDistance(p.km!)} size={13} color={C.dim} font="bold" />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

export function CountdownWidget({ data }: { data: CountdownData }) {
  const { next, then, together } = data;
  const since = data.couple === false ? 'since it started' : 'together';
  if (!next) {
    return together !== null ? (
      <Shell path="countdowns">
        <T text={String(together)} size={38} align="center" color={C.accent} font="hand" />
        <T text={`days ${since}`} size={12} align="center" color={C.dim} />
      </Shell>
    ) : (
      <Message icon="event" text="Add a countdown" path="countdowns" />
    );
  }
  return (
    <Shell path="countdowns">
      <T text={next.days === 0 ? 'Today' : String(next.days)} size={next.days === 0 ? 30 : 40} align="center" color={C.accent} font="hand" />
      <T text={next.days === 0 ? `${next.emoji} ${next.title}` : `${next.days === 1 ? 'day' : 'days'} until ${next.emoji}`} size={12} align="center" color={C.dim} />
      {next.days !== 0 ? <T text={next.title} size={14} align="center" font="bold" /> : null}
      {then ? <T text={`then ${then.emoji} in ${plural(then.days, 'day')}`} size={11} align="center" color={C.faint} /> : null}
      {!then && together !== null ? <T text={`${plural(together, 'day')} ${since}`} size={11} align="center" color={C.faint} /> : null}
    </Shell>
  );
}

export function StreakWidget({ data, info }: { data: StreakData; info: WidgetInfo }) {
  const status = data.answered
    ? data.othersAnswered > 0
      ? data.couple === false
        ? `${data.othersAnswered + 1} answered, tap to read`
        : 'Both answered, tap to read'
      : 'Answered, waiting on them'
    : 'Today’s question is waiting';
  return (
    <Shell path="together">
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
        <Glyph name="local_fire_department" filled size={28} color={data.streak > 0 ? C.yellow : C.faint} />
        <T text={String(data.streak)} size={34} color={data.streak > 0 ? C.yellow : C.text} font="hand" />
      </FlexWidget>
      <T text={data.todayComplete ? 'streak kept today' : 'day streak'} size={12} align="center" color={C.dim} />
      {info.height > 150 && data.question ? <T text={`“${data.question}”`} size={13} align="center" lines={3} font="hand" /> : null}
      <T text={status} size={11} align="center" color={data.answered ? C.faint : C.accent} lines={2} font="bold" />
    </Shell>
  );
}
