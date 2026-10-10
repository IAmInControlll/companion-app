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

/**
 * Every widget can be resized down to a single cell (see plugins/withWidgetResize.js). A cell is roughly
 * 60–110dp depending on the launcher (two are 150dp+), so under 120dp on a side means one cell that way.
 */
function sizeOf(info: WidgetInfo) {
  const narrow = info.width < 120;
  const short = info.height < 120;
  return { narrow, short, tiny: narrow && short, wide: info.width >= info.height * 1.7 };
}

function Shell({ children, bg = C.surface, path = '', tight, row }: { children: any; bg?: Hex; path?: string; tight?: boolean; row?: boolean }) {
  return (
    <FlexWidget
      {...link(path)}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: bg,
        borderRadius: RADIUS,
        padding: tight ? 6 : 14,
        flexDirection: row ? 'row' : 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: row ? 10 : tight ? 2 : 4,
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** Left-aligned stack of text, for the right-hand side of a wide, one-row layout. */
function Col({ children }: { children: any }) {
  return <FlexWidget style={{ flexDirection: 'column', flex: 1, flexGap: 1 }}>{children}</FlexWidget>;
}

function Message({ icon, text, path = '', info }: { icon: IconName; text: string; path?: string; info: WidgetInfo }) {
  const { narrow, short, tiny } = sizeOf(info);
  if (short && !narrow) {
    return (
      <Shell path={path} row>
        <Glyph name={icon} size={24} color={C.dim} />
        <Col>
          <T text={text} size={12} lines={2} color={C.dim} />
        </Col>
      </Shell>
    );
  }
  return (
    <Shell path={path} tight={narrow || short}>
      <Glyph name={icon} size={tiny ? 26 : 30} color={C.dim} />
      {tiny ? null : <T text={text} size={narrow ? 11 : 13} align="center" lines={narrow ? 4 : 3} color={C.dim} />}
    </Shell>
  );
}

export function renderWidgetFor(name: WidgetName, payload: WidgetPayload, info: WidgetInfo) {
  if (payload.status === 'signed-out') return <Message icon="lock" text="Open Chalkmates to sign in" info={info} />;
  if (payload.status === 'no-space') return <Message icon="person_add" text="Open Chalkmates to invite your person" info={info} />;
  if (payload.status === 'error') return <Message icon="refresh" text="Couldn’t refresh. Tap to open" info={info} />;
  const { space, data } = payload;
  switch (name) {
    case 'Chalkboard':
      return <ChalkboardWidget data={data} space={space} info={info} />;
    case 'Mood':
      return <MoodWidget data={data} info={info} />;
    case 'MissYou':
      return <MissYouWidget data={data} spaceId={space.id} info={info} />;
    case 'Distance':
      return <DistanceWidget data={data} info={info} />;
    case 'Countdown':
      return <CountdownWidget data={data} info={info} />;
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
  const { narrow, short, tiny } = sizeOf(info);
  if (!post || !image) {
    return (
      <Shell bg={C.board} path={`draw?space=${space.id}`} tight={narrow || short}>
        {tiny ? <Glyph name="draw" size={26} color={hex('#C9D3CC')} /> : <T text="Nothing yet" size={narrow || short ? 17 : 22} align="center" font="hand" />}
        {tiny ? null : <T text="Tap to draw the first one" size={11} align="center" lines={2} color={hex('#C9D3CC')} />}
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
      {/* A one-cell board is all drawing: the tag would cover most of it. */}
      {narrow || short ? null : <Tag text={boardTag(space, author, post.created_at)} />}
    </OverlapWidget>
  );
}

export function MoodWidget({ data, info }: { data: MoodData; info: WidgetInfo }) {
  const people = data.people;
  const { narrow, short, tiny } = sizeOf(info);
  if (!people.length) return <Message icon="person_add" text="Waiting for your person to join" info={info} />;
  if (people.length === 1) {
    const p = people[0];
    const mood = p.text ?? (p.emoji ? '' : 'No mood yet');
    if (tiny) {
      return (
        <Shell path="mood" tight>
          <T text={p.emoji ?? p.avatar} size={32} align="center" />
        </Shell>
      );
    }
    if (short) {
      return (
        <Shell path="mood" row>
          <T text={p.emoji ?? p.avatar} size={30} />
          <Col>
            <T text={p.name} size={14} color={hex(p.color)} font="bold" />
            <T text={[mood, p.at ? timeAgo(p.at) : ''].filter(Boolean).join(' · ')} size={11} color={C.dim} />
          </Col>
        </Shell>
      );
    }
    return (
      <Shell path="mood" tight={narrow}>
        <T text={p.emoji ?? p.avatar} size={narrow ? 32 : 44} align="center" />
        <T text={p.name} size={narrow ? 13 : 15} align="center" color={hex(p.color)} font="bold" />
        <T text={mood} size={narrow ? 11 : 12} align="center" color={C.dim} lines={2} />
        {p.at && !narrow ? <T text={timeAgo(p.at)} size={11} align="center" color={C.faint} /> : null}
      </Shell>
    );
  }
  // Too short for a list: everyone's mood side by side.
  if (short) {
    return (
      <Shell path="mood" row tight>
        {people.slice(0, Math.max(1, Math.floor((info.width - 12) / 34))).map((p) => (
          <T key={p.id} text={p.emoji ?? p.avatar} size={24} />
        ))}
      </Shell>
    );
  }
  return (
    <FlexWidget
      {...link('mood')}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.surface, borderRadius: RADIUS, padding: 12, flexDirection: 'column', flexGap: 6 }}
    >
      {people.slice(0, Math.max(1, Math.floor((info.height - 24) / 32))).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          <T text={p.emoji ?? p.avatar} size={20} />
          {narrow ? null : <T text={`${p.name}${p.text ? ` · ${p.text}` : ''}`} size={13} />}
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

/** Ways to lay out the nudge buttons (cols × rows). Smaller grids show the first few nudges, "miss you" first. */
const NUDGE_GRIDS: [number, number][] = [[3, 2], [2, 3], [6, 1], [1, 6], [3, 1], [1, 3], [2, 1], [1, 2], [1, 1]];
const GAP = 6;
const MIN_CELL = 36;

/** The grid that shows the most buttons at a tappable size in a w × h area, then the one with the biggest buttons. */
function nudgeGrid(w: number, h: number) {
  let best: { cols: number; rows: number; cell: number } | null = null;
  for (const [cols, rows] of NUDGE_GRIDS) {
    const cell = Math.min(88, Math.floor(Math.min((w - (cols - 1) * GAP) / cols, (h - (rows - 1) * GAP) / rows)));
    if (cell < MIN_CELL) continue;
    if (!best || cols * rows > best.cols * best.rows || (cols * rows === best.cols * best.rows && cell > best.cell)) best = { cols, rows, cell };
  }
  return best ?? { cols: 1, rows: 1, cell: Math.max(24, Math.min(w, h)) };
}

/** A small count in the corner of a nudge button, like an unread badge. */
function Badge({ n }: { n: number }) {
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
      <FlexWidget style={{ backgroundColor: MISS.ink, borderRadius: 9, paddingHorizontal: 5, paddingVertical: 1 }}>
        <T text={n > 99 ? '99+' : String(n)} size={10} color={hex('#FFFFFF')} font="heavy" />
      </FlexWidget>
    </FlexWidget>
  );
}

/** "Z sent 46" / "You sent 12": today's nudges each way. The side with more gets the stronger pill. */
function Tally({ label, n, strong }: { label: string; n: number; strong: boolean }) {
  return (
    <FlexWidget style={{ backgroundColor: strong ? hex('#FFFFFF8C') : hex('#FFFFFF40'), borderRadius: 11, paddingHorizontal: 8, paddingVertical: 3 }}>
      <T text={`${label} ${n}`} size={11} color={MISS.ink} font={strong ? 'heavy' : 'bold'} />
    </FlexWidget>
  );
}

/**
 * One round button per nudge, in whatever grid fits the widget's shape; one cell gets a single "miss you".
 * Each button shows how many of that kind they've sent you today, and the footer compares totals both ways.
 */
export function MissYouWidget({ data, spaceId, info }: { data: MissYouData; spaceId: string; info: WidgetInfo }) {
  const w = info.width - 20;
  const h = info.height - 20;
  // Title line, the tally pills with "today" under them, and the gaps around the buttons.
  const textH = 18 + 22 + 15 + 2 * GAP;
  // The title and tally show only if all six buttons still fit around them.
  const withText = nudgeGrid(w, h - textH);
  const roomy = withText.cols * withText.rows === NUDGES.length;
  const { cols, rows, cell } = roomy ? withText : nudgeGrid(w, h);
  const received = new Map((data.todayByKind ?? []).map((x) => [x.kind, x.n]));
  const them = data.fromThemToday;
  const me = data.fromMeToday ?? 0;
  return (
    <MissShell tappable>
      {roomy ? <T text={`Send ${data.names}…`} size={13} align="center" color={C.onAccent} font="heavy" /> : null}
      {Array.from({ length: rows }, (_, r) => (
        <FlexWidget key={r} style={{ flexDirection: 'row', flexGap: GAP }}>
          {NUDGES.slice(r * cols, r * cols + cols).map((n) => (
            <OverlapWidget key={n.kind} clickAction="NUDGE" clickActionData={{ spaceId, kind: n.kind }} style={{ width: cell, height: cell }}>
              <FlexWidget style={{ width: cell, height: cell, borderRadius: cell / 2, backgroundColor: MISS.button, justifyContent: 'center', alignItems: 'center' }}>
                <TextWidget text={n.emoji} style={{ fontSize: Math.round(cell * 0.48), textAlign: 'center' }} />
              </FlexWidget>
              {received.get(n.kind) ? <Badge n={received.get(n.kind)!} /> : null}
            </OverlapWidget>
          ))}
        </FlexWidget>
      ))}
      {roomy && (them || me) ? (
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'center', flexGap: 1 }}>
          <FlexWidget style={{ flexDirection: 'row', flexGap: GAP }}>
            <Tally label={`${data.names} sent`} n={them} strong={them >= me} />
            <Tally label="You sent" n={me} strong={me > them} />
          </FlexWidget>
          <T text="today" size={10} align="center" color={MISS.ink} font="bold" />
        </FlexWidget>
      ) : null}
      {roomy && !them && !me ? <T text="Tap one to send it" size={11} align="center" color={MISS.ink} font="bold" /> : null}
    </MissShell>
  );
}

/** Shown for a moment after a tap. It has no tap target, so tapping again doesn't resend. */
export function NudgeSentWidget({ kind, failed, info }: { kind: NudgeKind; failed?: boolean; info: WidgetInfo }) {
  const n = nudgeInfo(kind);
  const { narrow, short } = sizeOf(info);
  const small = narrow || short;
  return (
    <MissShell>
      {failed ? <Glyph name="refresh" size={small ? 26 : 36} color={C.onAccent} /> : <TextWidget text={n.emoji} style={{ fontSize: small ? 28 : 40, textAlign: 'center' }} />}
      {narrow && short ? null : <T text={failed ? 'Couldn’t send' : `${n.label} sent`} size={small ? 12 : 15} align="center" color={C.onAccent} font="heavy" />}
    </MissShell>
  );
}

export function DistanceWidget({ data, info }: { data: DistanceData; info: WidgetInfo }) {
  if (!data.meSharing) return <Message icon="location_on" text="Turn on location sharing in the app" path="settings" info={info} />;
  const known = data.people.filter((p) => p.km !== null).sort((a, b) => a.km! - b.km!);
  if (!known.length) {
    return <Message icon="location_on" text={data.people.length ? 'Waiting for their location' : 'Waiting for your person'} info={info} />;
  }
  const { narrow, short } = sizeOf(info);
  if (known.length === 1 || short || narrow) {
    const p = known[0];
    return (
      <Shell tight={narrow}>
        <T text={formatDistance(p.km!)} size={narrow ? 16 : short ? 20 : 28} align="center" font="hand" />
        <T text={narrow ? p.avatar : `you and ${p.avatar} ${p.name}`} size={12} align="center" color={C.dim} />
      </Shell>
    );
  }
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.surface, borderRadius: RADIUS, padding: 12, flexDirection: 'column', flexGap: 4 }}>
      {known.slice(0, Math.max(1, Math.floor((info.height - 24) / 22))).map((p) => (
        <FlexWidget key={p.id} style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          <T text={`${p.avatar} ${p.name}`} size={13} />
          <T text={formatDistance(p.km!)} size={13} color={C.dim} font="bold" />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

export function CountdownWidget({ data, info }: { data: CountdownData; info: WidgetInfo }) {
  const { next, then, together } = data;
  const since = data.couple === false ? 'since it started' : 'together';
  const { narrow, short, tiny } = sizeOf(info);
  if (!next) {
    return together !== null ? (
      <Shell path="countdowns" tight={narrow || short} row={short && !narrow}>
        <T text={String(together)} size={tiny ? 26 : short ? 30 : 38} align="center" color={C.accent} font="hand" />
        <T text={tiny ? 'days' : `days ${since}`} size={tiny ? 11 : 12} align="center" color={C.dim} />
      </Shell>
    ) : (
      <Message icon="event" text="Add a countdown" path="countdowns" info={info} />
    );
  }
  const big = next.days === 0 ? 'Today' : String(next.days);
  if (tiny || narrow) {
    return (
      <Shell path="countdowns" tight>
        <T text={big} size={next.days === 0 ? 18 : tiny ? 26 : 32} align="center" color={C.accent} font="hand" />
        <T text={next.emoji} size={tiny ? 14 : 18} align="center" />
        {tiny ? null : <T text={next.title} size={11} align="center" lines={2} font="bold" />}
      </Shell>
    );
  }
  if (short) {
    return (
      <Shell path="countdowns" row>
        <T text={big} size={next.days === 0 ? 22 : 32} color={C.accent} font="hand" />
        <Col>
          <T text={next.days === 0 ? 'is the day' : `${next.days === 1 ? 'day' : 'days'} until ${next.emoji}`} size={11} color={C.dim} />
          <T text={next.days === 0 ? `${next.emoji} ${next.title}` : next.title} size={14} font="bold" />
        </Col>
      </Shell>
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
  const { narrow, short, tiny } = sizeOf(info);
  const flame = (size: number) => (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
      <Glyph name="local_fire_department" filled size={size} color={data.streak > 0 ? C.yellow : C.faint} />
      <T text={String(data.streak)} size={Math.round(size * 1.2)} color={data.streak > 0 ? C.yellow : C.text} font="hand" />
    </FlexWidget>
  );
  if (tiny || narrow) {
    return (
      <Shell path="together" tight>
        {flame(tiny ? 20 : 24)}
        {tiny ? null : <T text={data.todayComplete ? 'kept today' : 'day streak'} size={11} align="center" color={C.dim} />}
      </Shell>
    );
  }
  if (short) {
    return (
      <Shell path="together" row>
        {flame(24)}
        <Col>
          <T text={data.todayComplete ? 'streak kept today' : 'day streak'} size={12} color={C.dim} />
          {status ? <T text={status} size={11} color={data.answered || !SHOW_QUESTIONS ? C.faint : C.accent} font="bold" /> : null}
        </Col>
      </Shell>
    );
  }
  return (
    <Shell path="together">
      {flame(28)}
      <T text={data.todayComplete ? 'streak kept today' : 'day streak'} size={12} align="center" color={C.dim} />
      {info.height > 150 && data.question ? <T text={`“${data.question}”`} size={13} align="center" lines={3} font="hand" /> : null}
      {status ? <T text={status} size={11} align="center" color={data.answered || !SHOW_QUESTIONS ? C.faint : C.accent} lines={2} font="bold" /> : null}
    </Shell>
  );
}
