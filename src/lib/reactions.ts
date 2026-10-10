import AsyncStorage from '@react-native-async-storage/async-storage';

/** The quick row before you've reacted with anything else. */
export const DEFAULT_REACTIONS = ['❤️', '😍', '😂', '🥺', '🔥'];
export const QUICK_COUNT = 5;

const RECENT_KEY = 'reactions:recent';

// One emoji, however it's built: flags, keycaps, skin tones and ZWJ sequences (👨‍👩‍👧, 🧑🏾‍💻).
const EMOJI = /\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*/u;

/** The first emoji in what was typed, or null if there isn't one. The database allows 16 characters. */
export function firstEmoji(text: string): string | null {
  const e = text.match(EMOJI)?.[0];
  return e && e.length <= 16 ? e : null;
}

/** Your most recent reactions, newest first, topped up with the defaults. */
export async function quickReactions(): Promise<string[]> {
  let recent: string[] = [];
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? '[]');
    if (Array.isArray(raw)) recent = raw.filter((e): e is string => typeof e === 'string');
  } catch {
    // corrupt or unavailable: just the defaults
  }
  return [...new Set([...recent, ...DEFAULT_REACTIONS])].slice(0, QUICK_COUNT);
}

/** Move `emoji` to the front of your quick row. Returns the new row. */
export async function rememberReaction(emoji: string): Promise<string[]> {
  const row = [...new Set([emoji, ...(await quickReactions())])].slice(0, QUICK_COUNT);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(row)).catch(() => {});
  return row;
}
