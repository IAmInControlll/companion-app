// One emoji: a pictograph or a flag, with an optional variation selector / skin tone, and any
// zero-width-joined parts (👩🏽‍💻, ❤️‍🔥) or keycap.
const EMOJI =
  /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*(?:‍\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*)*)/gu;

/** The last emoji typed into `text`, or null if there isn't one. */
export function lastEmoji(text: string): string | null {
  const all = text.match(EMOJI);
  return all?.length ? all[all.length - 1] : null;
}
