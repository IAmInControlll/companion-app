"use no memo";
// Widget trees are plain functions evaluated by react-native-android-widget, so the React Compiler must stay off.

import { FlexWidget, ImageWidget, OverlapWidget, TextWidget, type WidgetInfo } from 'react-native-android-widget';

import { ICON_GLYPHS, type IconName } from '@/components/icon-glyphs';
import { BOARDS, type BoardId } from '@/drawing/model';
import { SHOW_QUESTIONS } from '@/lib/features';
import { NUDGES, nudgeInfo } from '@/lib/nudges';
import { fonts } from '@/lib/theme';
import type { NudgeKind } from '@/lib/types';
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
      return <ChalkboardWidget data={data} space={space} info={info} />;
    case 'Mood':
      return <MoodWidget data={data} />;
    case 'MissYou':
      return <MissYouWidget data={data} spaceId={space.id} info={info} />;
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

export function ChalkboardWidget({ data, space, info }: { data: ChalkboardData; space: WidgetSpace; info: WidgetInfo }) {
  const { post, image, author } = data;
  if (!post || !image) {
    return (
      <Shell bg={C.board} path={`draw?space=${space.id}`}>
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
      <Tag text={boardTag(space, author, post.created_at)} />
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

const MISS = { from: hex('#F7A8C4'), to: hex('#D98BB0'), ink: hex('#5A2E44'), button: hex('#FFFFFF59') };

function MissShell({ children, tappable }: { children: any; tappable?: boolean }) {
  return (
    <FlexWidget
      // The background opens the app, except while "Sent" shows: then taps do nothing, so one tap is one nudge.
      {...(tappable ? link('') : {})}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: RADIUS,
        padding: 10,
        backgroundGradient: { from: MISS.from, to: MISS.to, orientation: 'TL_BR' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: 6,
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** One round button per nudge: 3×2 on a square widget, a single row when it's wide. */
export function MissYouWidget({ data, spaceId, info }: { data: MissYouData; spaceId: string; info: WidgetInfo }) {
  const wide = info.width >= info.height * 1.7;
  const cols = wide ? 6 : 3;
  const rows = NUDGES.length / cols;
  const roomy = info.height >= 150 || (wide && info.height >= 100);
  const textH = roomy ? 36 : 0;
  const cell = Math.max(28, Math.floor(Math.min((info.width - 20 - (cols - 1) * 6) / cols, (info.height - 20 - textH - rows * 6) / rows)));
  const today = data.todayByKind?.length
    ? `${data.lastFrom ?? 'They'} today: ${data.todayByKind.map((x) => `${nudgeInfo(x.kind).emoji}${x.n > 1 ? `×${x.n}` : ''}`).join(' ')}`
    : null;
  return (
    <MissShell tappable>
      {roomy ? <T text={`Send ${data.names}…`} size={13} align="center" color={C.onAccent} font="heavy" /> : null}
      {Array.from({ length: rows }, (_, r) => (
        <FlexWidget key={r} style={{ flexDirection: 'row', flexGap: 6 }}>
          {NUDGES.slice(r * cols, r * cols + cols).map((n) => (
            <FlexWidget
              key={n.kind}
              clickAction="NUDGE"
              clickActionData={{ spaceId, kind: n.kind }}
              style={{ width: cell, height: cell, borderRadius: cell / 2, backgroundColor: MISS.button, justifyContent: 'center', alignItems: 'center' }}
            >
              <TextWidget text={n.emoji} style={{ fontSize: Math.round(cell * 0.48), textAlign: 'center' }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ))}
      {roomy ? <T text={today ?? 'Tap one to send it'} size={11} align="center" color={MISS.ink} font="bold" /> : null}
    </MissShell>
  );
}

/** Shown for a moment after a tap. It has no tap target, so tapping again doesn't resend. */
export function NudgeSentWidget({ kind, failed }: { kind: NudgeKind; failed?: boolean }) {
  const n = nudgeInfo(kind);
  return (
    <MissShell>
      {failed ? <Glyph name="refresh" size={36} color={C.onAccent} /> : <TextWidget text={n.emoji} style={{ fontSize: 40, textAlign: 'center' }} />}
      <T text={failed ? 'Couldn’t send' : `${n.label} sent`} size={15} align="center" color={C.onAccent} font="heavy" />
    </MissShell>
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
  return (
    <Shell path="together">
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
        <Glyph name="local_fire_department" filled size={28} color={data.streak > 0 ? C.yellow : C.faint} />
        <T text={String(data.streak)} size={34} color={data.streak > 0 ? C.yellow : C.text} font="hand" />
      </FlexWidget>
      <T text={data.todayComplete ? 'streak kept today' : 'day streak'} size={12} align="center" color={C.dim} />
      {info.height > 150 && data.question ? <T text={`“${data.question}”`} size={13} align="center" lines={3} font="hand" /> : null}
      {status ? <T text={status} size={11} align="center" color={data.answered || !SHOW_QUESTIONS ? C.faint : C.accent} lines={2} font="bold" /> : null}
    </Shell>
  );
}
