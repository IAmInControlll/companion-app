import { supabase } from './supabase';
import type {
  Answer,
  DailyQuestion,
  Nudge,
  NudgeKind,
  Post,
  PostKind,
  Profile,
  Reaction,
  Space,
  SpaceEvent,
  SpaceKind,
  StreakInfo,
  TotAnswer,
  TotPrompt,
} from './types';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Profiles & spaces
// ---------------------------------------------------------------------------

export type Member = { user_id: string; joined_at: string; profile: Profile };
export type SpaceWithMembers = Space & { members: Member[] };

export async function getProfile(userId: string): Promise<Profile | null> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

export type ProfilePatch = Partial<
  Pick<Profile, 'display_name' | 'avatar' | 'color' | 'mood_emoji' | 'mood_text' | 'mood_updated_at' | 'share_location'>
>;

export async function updateProfile(userId: string, patch: ProfilePatch) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', userId));
}

export async function listSpaces(): Promise<SpaceWithMembers[]> {
  const rows = unwrap(
    await supabase
      .from('spaces')
      .select('*, members:space_members(user_id, joined_at, profile:profiles(*))')
      .order('created_at', { ascending: true }),
  ) as unknown as SpaceWithMembers[];
  return rows ?? [];
}

export async function createSpace(name: string, kind: SpaceKind): Promise<Space> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  return unwrap(await supabase.rpc('create_space', { p_name: name, p_kind: kind, p_timezone: tz }));
}

export async function joinSpace(code: string): Promise<Space> {
  // A wrong code comes back as an empty row (see join_space()), not an error.
  const space = unwrap(await supabase.rpc('join_space', { p_code: code })) as Space | null;
  if (!space?.id) throw new Error('No space found with that code. Check it with them?');
  return space;
}

export async function leaveSpace(spaceId: string) {
  unwrap(await supabase.rpc('leave_space', { p_space: spaceId }));
}

export async function updateSpace(spaceId: string, patch: Partial<Pick<Space, 'name' | 'anniversary'>>) {
  unwrap(await supabase.from('spaces').update(patch).eq('id', spaceId));
}

/** Permanently deletes the signed-in account and everything it posted. */
export async function deleteAccount() {
  unwrap(await supabase.rpc('delete_account'));
}

export async function regenerateInvite(spaceId: string): Promise<string> {
  return unwrap(await supabase.rpc('regenerate_invite_code', { p_space: spaceId }));
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type PostWithReactions = Post & { reactions: Reaction[] };

/** Whose posts: everyone's, only `author.is`, or everyone except `author.not`. */
export type AuthorFilter = { is?: string; not?: string };

export async function listPosts(
  spaceId: string,
  opts: { before?: string; limit?: number; kind?: PostKind; author?: AuthorFilter } = {},
) {
  let q = supabase
    .from('posts')
    .select('*, reactions(*)')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.author?.is) q = q.eq('author_id', opts.author.is);
  if (opts.author?.not) q = q.neq('author_id', opts.author.not);
  return (unwrap(await q) ?? []) as PostWithReactions[];
}

export async function getPost(postId: string): Promise<PostWithReactions | null> {
  return unwrap(await supabase.from('posts').select('*, reactions(*)').eq('id', postId).maybeSingle()) as PostWithReactions | null;
}

/** Latest post for a widget. Prefers posts from other people ("what they sent me"). */
export async function latestPost(spaceId: string, kinds: PostKind[], me: string | null): Promise<Post | null> {
  const base = () => supabase.from('posts').select('*').eq('space_id', spaceId).in('kind', kinds).order('created_at', { ascending: false }).limit(1);
  if (me) {
    const theirs = unwrap(await base().neq('author_id', me)) as Post[];
    if (theirs?.length) return theirs[0];
  }
  const any = unwrap(await base()) as Post[];
  return any?.[0] ?? null;
}

export async function createPost(input: {
  space_id: string;
  kind: PostKind;
  image_path: string;
  doc_path?: string | null;
  body?: string | null;
  board?: string;
  bg_color?: string | null;
  aspect?: number;
}): Promise<Post> {
  return unwrap(await supabase.from('posts').insert(input).select().single());
}

export async function deletePost(postId: string) {
  unwrap(await supabase.from('posts').delete().eq('id', postId));
}

export async function react(postId: string, userId: string, emoji: string) {
  unwrap(await supabase.from('reactions').upsert({ post_id: postId, user_id: userId, emoji }));
}

export async function unreact(postId: string, userId: string) {
  unwrap(await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId));
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------

export async function sendNudge(spaceId: string, kind: NudgeKind) {
  unwrap(await supabase.from('nudges').insert({ space_id: spaceId, kind }));
}

export async function recentNudges(spaceId: string, sinceIso: string): Promise<Nudge[]> {
  return (
    unwrap(
      await supabase
        .from('nudges')
        .select('*')
        .eq('space_id', spaceId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(200),
    ) ?? []
  );
}

// ---------------------------------------------------------------------------
// Events / countdowns
// ---------------------------------------------------------------------------

export async function listEvents(spaceId: string): Promise<SpaceEvent[]> {
  return unwrap(await supabase.from('events').select('*').eq('space_id', spaceId)) ?? [];
}

export async function createEvent(e: Pick<SpaceEvent, 'space_id' | 'title' | 'emoji' | 'date' | 'yearly'>) {
  unwrap(await supabase.from('events').insert(e));
}

export async function deleteEvent(id: string) {
  unwrap(await supabase.from('events').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Daily question, This-or-That, streaks
// ---------------------------------------------------------------------------

export async function getDailyQuestion(spaceId: string): Promise<DailyQuestion | null> {
  const rows = unwrap(await supabase.rpc('get_daily_question', { p_space: spaceId })) as DailyQuestion[];
  return rows?.[0] ?? null;
}

export async function listAnswers(spaceId: string, day: string): Promise<Answer[]> {
  return unwrap(await supabase.from('answers').select('*').eq('space_id', spaceId).eq('day', day)) ?? [];
}

export async function submitAnswer(spaceId: string, day: string, userId: string, body: string) {
  unwrap(await supabase.from('answers').upsert({ space_id: spaceId, day, user_id: userId, body }));
}

export type PastQuestion = { day: string; body: string; answers: Answer[] };

export async function questionHistory(spaceId: string, limit = 30): Promise<PastQuestion[]> {
  const days = unwrap(
    await supabase
      .from('daily_questions')
      .select('day, question:questions(body)')
      .eq('space_id', spaceId)
      .order('day', { ascending: false })
      .limit(limit),
  ) as unknown as { day: string; question: { body: string } }[];
  if (!days?.length) return [];
  const answers = (unwrap(
    await supabase.from('answers').select('*').eq('space_id', spaceId).in('day', days.map((d) => d.day)),
  ) ?? []) as Answer[];
  return days.map((d) => ({ day: d.day, body: d.question.body, answers: answers.filter((a) => a.day === d.day) }));
}

export async function nextTotPrompt(spaceId: string): Promise<TotPrompt | null> {
  const rows = unwrap(await supabase.rpc('next_tot_prompt', { p_space: spaceId })) as TotPrompt[];
  return rows?.[0] ?? null;
}

export async function answerTot(spaceId: string, promptId: number, userId: string, choice: 0 | 1) {
  unwrap(await supabase.from('tot_answers').insert({ space_id: spaceId, prompt_id: promptId, user_id: userId, choice }));
}

export async function totAnswers(spaceId: string, promptId?: number): Promise<TotAnswer[]> {
  let q = supabase.from('tot_answers').select('*').eq('space_id', spaceId);
  if (promptId !== undefined) q = q.eq('prompt_id', promptId);
  return unwrap(await q.order('created_at', { ascending: false }).limit(500)) ?? [];
}

export async function getStreak(spaceId: string): Promise<StreakInfo> {
  return unwrap(await supabase.rpc('get_streak', { p_space: spaceId })) as StreakInfo;
}

// ---------------------------------------------------------------------------
// Location & devices
// ---------------------------------------------------------------------------

export async function setLocation(lat: number, lng: number) {
  unwrap(await supabase.rpc('set_location', { p_lat: lat, p_lng: lng }));
}

export async function registerDevice(token: string) {
  unwrap(await supabase.rpc('register_device', { p_token: token, p_platform: 'android' }));
}

export async function unregisterDevice(token: string) {
  await supabase.from('devices').delete().eq('token', token);
}
