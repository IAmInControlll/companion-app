"use no memo";
// Widget trees are plain functions evaluated by react-native-android-widget, so the React Compiler must stay off.

import { FlexWidget, ImageWidget, OverlapWidget, TextWidget, type WidgetInfo } from 'react-native-android-widget';

import { BOARDS, type BoardId } from '@/drawing/model';
import { HAND_FONT } from '@/lib/theme';
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

const C = {
  board: hex('#2F4A3A'),
  card: hex('#24312B'),
  text: hex('#F4EFE6'),
  dim: hex('#B5BDB5'),
  pink: hex('#F7A8C4'),
  yellow: hex('#F9D77E'),
  pill: hex('#00000066'),
};

const SCHEME = 'chalkmates://';
const link = (path: string) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: SCHEME + path } }) as const;

function T({
  text,
  size = 14,
  color = C.text,
  align = 'left',
  lines = 1,
}: {
  text: string;
  size?: number;
  color?: Hex;
  align?: 'left' | 'center' | 'right';
  lines?: number;
}) {
  return (
    <TextWidget
      text={text}
      maxLines={lines}
      truncate="END"
      style={{ fontSize: size, color, fontFamily: HAND_FONT, textAlign: align }}
    />
  );
}

function Shell({ children, bg = C.card, path = '' }: { children: any; bg?: Hex; path?: string }) {
  return (
    <FlexWidget
      {...link(path)}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: bg,
        borderRadius: 22,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Message({ emoji, text, path = '' }: { emoji: string; text: string; path?: string }) {
  return (
    <Shell bg={C.board} path={path}>
      <T text={emoji} size={30} align="center" />
      <T text={text} size={15} align="center" lines={3} color={C.dim} />
    </Shell>
  );
}

export function renderWidgetFor(name: WidgetName, payload: WidgetPayload, info: WidgetInfo) {
  if (payload.status === 'signed-out') return <Message emoji="🖍️" text="Open Chalkmates to sign in" />;
  if (payload.status === 'no-space') return <Message emoji="💌" text="Invite your person in Chalkmates" />;
  if (payload.status === 'error') return <Message emoji="☁️" text="Couldn't refresh. Tap to open" />;
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

// ---------------------------------------------------------------------------

export function ChalkboardWidget({ data, spaceId, info }: { data: ChalkboardData; spaceId: string; info: WidgetInfo }) {
  const { post, image, author } = data;
  const bg = post?.bg_color ?? (BOARDS[(post?.board as BoardId) ?? 'classic'] ?? BOARDS.classic).base;
  if (!post || !image) {
    return <Message emoji="✏️" text="Nothing yet. Tap to draw the first one!" path={`draw?space=${spaceId}`} />;
  }
  const box = fit(post.aspect, info);
  return (
    <OverlapWidget style={{ height: 'match_parent', width: 'match_parent', borderRadius: 22, backgroundColor: hex(bg) }}>
      <FlexWidget
        {...link(`post/${post.id}`)}
        style={{ height: 'match_parent', width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
      >
        <ImageWidget image={image as `data:image${string}`} imageWidth={box.w} imageHeight={box.h} radius={20} />
      </FlexWidget>
      <FlexWidget
        style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'flex-end', padding: 8 }}
      >
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <FlexWidget style={{ backgroundColor: C.pill, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T text={`${author?.avatar ?? ''} ${timeAgo(post.created_at)}`} size={12} />
          </FlexWidget>
          <FlexWidget
            {...link(`draw?space=${spaceId}`)}
            style={{ backgroundColor: C.pill, borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
          >
            <T text="✏️" size={15} align="center" />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}

export function PhotoWidget({ data, spaceId, info }: { data: ChalkboardData; spaceId: string; info: WidgetInfo }) {
  const { post, image, author } = data;
  if (!post || !image) return <Message emoji="📷" text="No photos yet. Tap to share one" path={`photo?space=${spaceId}`} />;
  return (
    <OverlapWidget {...link(`post/${post.id}`)} style={{ height: 'match_parent', width: 'match_parent', borderRadius: 22, backgroundColor: C.card }}>
      <ImageWidget
        image={image as `data:image${string}`}
        imageWidth={info.width}
        imageHeight={info.height}
        resizeMode="cover"
        radius={22}
      />
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', justifyContent: 'flex-end', padding: 8 }}>
        <FlexWidget style={{ backgroundColor: C.pill, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
          <T text={`${author?.avatar ?? ''} ${author?.name ?? ''} · ${timeAgo(post.created_at)}`} size={12} />
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}

export function MoodWidget({ data }: { data: MoodData }) {
  const people = data.people;
  if (!people.length) return <Message emoji="🫶" text="Waiting for your person to join" />;
  if (people.length === 1) {
    const p = people[0];
    return (
      <Shell path="mood">
        <T text={p.emoji ?? p.avatar} size={44} align="center" />
        <T text={p.name} size={16} align="center" color={hex(p.color)} />
        <T text={p.text ?? (p.emoji ? '' : 'No mood yet')} size={13} align="center" color={C.dim} lines={2} />
        {p.at ? <T text={timeAgo(p.at)} size={11} align="center" color={C.dim} /> : null}
      </Shell>
    );
  }
  return (
    <FlexWidget
      {...link('mood')}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.card, borderRadius: 22, padding: 10, flexDirection: 'column', flexGap: 4 }}
    >
      {people.slice(0, 5).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
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
        borderRadius: 22,
        padding: 10,
        backgroundGradient: { from: hex('#F7A8C4'), to: hex('#C779A0'), orientation: 'TL_BR' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <T text={sent ? '💞' : '💗'} size={40} align="center" />
      <T text={sent ? 'Sent!' : `Miss you, ${data.names}`} size={15} align="center" color={hex('#3A1F2C')} lines={2} />
      {data.fromThemToday > 0 ? (
        <T
          text={`${data.lastFrom ?? 'They'} missed you ${data.fromThemToday === 1 ? 'once' : `${data.fromThemToday}×`} today`}
          size={12}
          align="center"
          color={hex('#5A2E44')}
          lines={2}
        />
      ) : null}
    </FlexWidget>
  );
}

export function DistanceWidget({ data, info }: { data: DistanceData; info: WidgetInfo }) {
  if (!data.meSharing) return <Message emoji="📍" text="Turn on location sharing in the app" path="settings" />;
  const known = data.people.filter((p) => p.km !== null).sort((a, b) => a.km! - b.km!);
  if (!known.length) {
    return <Message emoji="📍" text={data.people.length ? 'Waiting for their location' : 'Waiting for your person'} />;
  }
  const compact = info.height < 100;
  if (known.length === 1 || compact) {
    const p = known[0];
    return (
      <Shell path="">
        <T text={formatDistance(p.km!)} size={compact ? 20 : 26} align="center" color={C.yellow} />
        <T text={`you ↔ ${p.avatar} ${p.name}`} size={13} align="center" color={C.dim} />
      </Shell>
    );
  }
  return (
    <FlexWidget
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.card, borderRadius: 22, padding: 10, flexDirection: 'column', flexGap: 3 }}
    >
      {known.slice(0, 5).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          <T text={`${p.avatar} ${p.name}`} size={13} />
          <T text={formatDistance(p.km!)} size={13} color={C.yellow} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

export function CountdownWidget({ data }: { data: CountdownData }) {
  const { next, then, together } = data;
  const since = data.couple === false ? 'since it started' : 'together';
  if (!next) {
    return (
      <Shell path="countdowns">
        <T text={together !== null ? String(together) : '📅'} size={together !== null ? 36 : 30} align="center" color={C.pink} />
        <T text={together !== null ? `days ${since}` : 'Add a countdown'} size={14} align="center" color={C.dim} />
      </Shell>
    );
  }
  return (
    <Shell path="countdowns">
      <T text={next.days === 0 ? 'Today!' : String(next.days)} size={next.days === 0 ? 28 : 38} align="center" color={C.pink} />
      <T text={next.days === 0 ? `${next.emoji} ${next.title}` : `${next.days === 1 ? 'day' : 'days'} until ${next.emoji}`} size={13} align="center" color={C.dim} />
      {next.days !== 0 ? <T text={next.title} size={15} align="center" /> : null}
      {then ? <T text={`then ${then.emoji} in ${plural(then.days, 'day')}`} size={11} align="center" color={C.dim} /> : null}
      {!then && together !== null ? <T text={`${plural(together, 'day')} ${since}`} size={11} align="center" color={C.dim} /> : null}
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
    : "Today's question is waiting";
  return (
    <Shell path="together">
      <T text={`🔥 ${data.streak}`} size={34} align="center" color={data.todayComplete ? C.yellow : C.text} />
      <T text={data.todayComplete ? 'streak kept today!' : 'day streak'} size={13} align="center" color={C.dim} />
      {info.height > 150 && data.question ? <T text={`“${data.question}”`} size={13} align="center" lines={3} /> : null}
      <T text={status} size={12} align="center" color={data.answered ? C.dim : C.pink} lines={2} />
    </Shell>
  );
}
