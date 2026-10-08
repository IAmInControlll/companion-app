export type SpaceKind = 'couple' | 'group';

export type Profile = {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  mood_emoji: string | null;
  mood_text: string | null;
  mood_updated_at: string | null;
  share_location: boolean;
  lat: number | null;
  lng: number | null;
  location_updated_at: string | null;
};

export type Space = {
  id: string;
  name: string;
  kind: SpaceKind;
  invite_code: string;
  timezone: string;
  anniversary: string | null;
  /** Null once the creator has deleted their account. */
  created_by: string | null;
  created_at: string;
};

export type PostKind = 'drawing' | 'note' | 'photo';

export type Post = {
  id: string;
  space_id: string;
  author_id: string;
  kind: PostKind;
  image_path: string;
  doc_path: string | null;
  body: string | null;
  board: string;
  bg_color: string | null;
  aspect: number;
  created_at: string;
};

export type Reaction = { post_id: string; user_id: string; emoji: string };

export type NudgeKind = 'miss_you' | 'hug' | 'kiss' | 'poke' | 'high_five' | 'love';

export type Nudge = { id: string; space_id: string; sender_id: string; kind: NudgeKind; created_at: string };

export type SpaceEvent = {
  id: string;
  space_id: string;
  title: string;
  emoji: string;
  date: string; // YYYY-MM-DD
  yearly: boolean;
  created_by: string;
};

export type DailyQuestion = { day: string; question_id: number; body: string; category: string };
export type Answer = { space_id: string; day: string; user_id: string; body: string; created_at: string };

export type TotPrompt = { id: number; option_a: string; option_b: string };
export type TotAnswer = { space_id: string; prompt_id: number; user_id: string; choice: 0 | 1 };

export type StreakInfo = { streak: number; best: number; today_complete: boolean; active_today: string[] };
