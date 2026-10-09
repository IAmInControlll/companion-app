import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getDailyQuestion,
  getStreak,
  latestPost,
  listAnswers,
  listEvents,
  listSpaces,
  recentNudges,
  type SpaceWithMembers,
} from '@/lib/api';
import { SHOW_QUESTIONS } from '@/lib/features';
import { loadImageDataUri } from '@/lib/media';
import { NUDGES } from '@/lib/nudges';
import { currentUserId } from '@/lib/supabase';
import type { NudgeKind, Post } from '@/lib/types';
import { distanceKm, timeAgo, upcoming, daysTogether, type Countdown } from '@/lib/util';

export type WidgetName = 'Chalkboard' | 'Mood' | 'MissYou' | 'Distance' | 'Countdown' | 'Streak';
export const WIDGET_NAMES: WidgetName[] = ['Chalkboard', 'Mood', 'MissYou', 'Distance', 'Countdown', 'Streak'];

const ACTIVE_SPACE_KEY = 'activeSpaceId';
const widgetSpaceKey = (widgetId: number) => `widget-space:${widgetId}`;

export async function setWidgetSpace(widgetId: number, spaceId: string) {
  await AsyncStorage.setItem(widgetSpaceKey(widgetId), spaceId);
}

export async function clearWidgetSpace(widgetId: number) {
  await AsyncStorage.removeItem(widgetSpaceKey(widgetId));
}

export async function getActiveSpaceId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_SPACE_KEY);
}

export async function setActiveSpaceId(id: string) {
  await AsyncStorage.setItem(ACTIVE_SPACE_KEY, id);
}

// ---------------------------------------------------------------------------

type Person = { id: string; name: string; avatar: string; color: string };

export type ChalkboardData = { post: Post | null; image: string | null; author: Person | null };
export type MoodData = { people: (Person & { emoji: string | null; text: string | null; at: string | null })[] };
export type MissYouData = {
  names: string;
  fromThemToday: number;
  lastFrom: string | null;
  lastAt: string | null;
  /** Today's nudges from the others, per kind, most common first. */
  todayByKind?: { kind: NudgeKind; n: number }[];
};
export type DistanceData = { meSharing: boolean; people: (Person & { km: number | null })[] };
export type CountdownData = { next: Countdown | null; then: Countdown | null; together: number | null; couple: boolean };
export type StreakData = { couple: boolean; streak: number; best: number; todayComplete: boolean; answered: boolean; othersAnswered: number; question: string | null };

export type WidgetPayload =
  | { status: 'signed-out' }
  | { status: 'no-space' }
  | { status: 'error'; message: string }
  | { status: 'ok'; space: WidgetSpace; data: any };

export type WidgetSpace = { id: string; name: string; kind: string };

/** Corner tag on a board or photo: "Us · 5m ago", plus who drew it in a group. */
export function boardTag(space: WidgetSpace, author: Person | null, at: string) {
  return [space.name, space.kind === 'group' ? author?.name : null, timeAgo(at)].filter(Boolean).join(' · ');
}

/** Resolve which space a widget shows, falling back to the active space or the first one. */
async function resolveSpace(widgetId: number | undefined): Promise<SpaceWithMembers | null> {
  const spaces = await listSpaces();
  if (!spaces.length) return null;
  const wanted = (widgetId !== undefined && (await AsyncStorage.getItem(widgetSpaceKey(widgetId)))) || (await getActiveSpaceId());
  return spaces.find((s) => s.id === wanted) ?? spaces[0];
}

function person(m: SpaceWithMembers['members'][number]): Person {
  return { id: m.user_id, name: m.profile.display_name, avatar: m.profile.avatar, color: m.profile.color };
}

async function loaders(name: WidgetName, space: SpaceWithMembers, me: string) {
  const others = space.members.filter((m) => m.user_id !== me);
  switch (name) {
    case 'Chalkboard': {
      // Every board counts, including ones drawn on a photo.
      const post = await latestPost(space.id, ['drawing', 'note', 'photo'], me);
      const image = post ? await loadImageDataUri(post.image_path).catch(() => null) : null;
      const author = post ? space.members.find((m) => m.user_id === post.author_id) : null;
      return { post, image, author: author ? person(author) : null } satisfies ChalkboardData;
    }
    case 'Mood':
      return {
        people: others.map((m) => ({
          ...person(m),
          emoji: m.profile.mood_emoji,
          text: m.profile.mood_text,
          at: m.profile.mood_updated_at,
        })),
      } satisfies MoodData;
    case 'MissYou': {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const nudges = (await recentNudges(space.id, since.toISOString())).filter((n) => n.sender_id !== me);
      const last = nudges[0];
      const todayByKind = NUDGES.map((x) => ({ kind: x.kind, n: nudges.filter((n) => n.kind === x.kind).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n);
      return {
        names: others.length === 1 ? others[0].profile.display_name : space.name,
        fromThemToday: nudges.length,
        lastFrom: last ? (space.members.find((m) => m.user_id === last.sender_id)?.profile.display_name ?? null) : null,
        lastAt: last?.created_at ?? null,
        todayByKind,
      } satisfies MissYouData;
    }
    case 'Distance': {
      const mine = space.members.find((m) => m.user_id === me)?.profile;
      const here = mine?.lat != null && mine?.lng != null ? { lat: mine.lat, lng: mine.lng } : null;
      return {
        meSharing: !!mine?.share_location,
        people: others.map((m) => ({
          ...person(m),
          km: here && m.profile.lat != null && m.profile.lng != null ? distanceKm(here, { lat: m.profile.lat, lng: m.profile.lng }) : null,
        })),
      } satisfies DistanceData;
    }
    case 'Countdown': {
      const list = upcoming(await listEvents(space.id), space.anniversary, space.kind);
      return { next: list[0] ?? null, then: list[1] ?? null, together: daysTogether(space.anniversary), couple: space.kind === 'couple' } satisfies CountdownData;
    }
    case 'Streak': {
      const [streak, q] = await Promise.all([getStreak(space.id), SHOW_QUESTIONS ? getDailyQuestion(space.id) : null]);
      const answers = q ? await listAnswers(space.id, q.day) : [];
      return {
        couple: space.kind === 'couple',
        streak: streak.streak,
        best: streak.best,
        todayComplete: streak.today_complete,
        answered: answers.some((a) => a.user_id === me),
        // Others' answers are hidden by RLS until we answer, so count via activity instead.
        othersAnswered: answers.filter((a) => a.user_id !== me).length,
        question: q?.body ?? null,
      } satisfies StreakData;
    }
  }
}

/** Load a widget's data from the network, falling back to the last good copy when offline. */
export async function loadWidget(name: WidgetName, widgetId?: number): Promise<WidgetPayload> {
  const cacheKey = `wcache:${name}:${widgetId ?? 'any'}`;
  try {
    const me = await currentUserId();
    if (!me) return { status: 'signed-out' };
    const space = await resolveSpace(widgetId);
    if (!space) return { status: 'no-space' };
    const data = await loaders(name, space, me);
    const payload: WidgetPayload = { status: 'ok', space: { id: space.id, name: space.name, kind: space.kind }, data };
    // Don't cache the (large) image data URI; the image file itself is cached on disk.
    AsyncStorage.setItem(cacheKey, JSON.stringify({ ...payload, data: { ...data, image: undefined } })).catch(() => {});
    return payload;
  } catch (e) {
    const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
    if (cached) {
      const payload = JSON.parse(cached) as WidgetPayload;
      if (payload.status === 'ok' && payload.data?.post?.image_path) {
        payload.data.image = await loadImageDataUri(payload.data.post.image_path).catch(() => null);
      }
      return payload;
    }
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not load' };
  }
}
