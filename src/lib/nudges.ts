import type { NudgeKind } from './types';

/** Every nudge, in the order they're offered. `did` reads "<who> did <whom>": "Z hugged you". */
export const NUDGES: { kind: NudgeKind; emoji: string; label: string; did: (whom: string) => string }[] = [
  { kind: 'miss_you', emoji: '💗', label: 'Miss you', did: (w) => `missed ${w}` },
  { kind: 'hug', emoji: '🤗', label: 'Hug', did: (w) => `hugged ${w}` },
  { kind: 'kiss', emoji: '😘', label: 'Kiss', did: (w) => `kissed ${w}` },
  { kind: 'love', emoji: '❤️', label: 'Love', did: (w) => `sent ${w} love` },
  { kind: 'high_five', emoji: '✋', label: 'High five', did: (w) => `high-fived ${w}` },
  { kind: 'poke', emoji: '👉', label: 'Poke', did: (w) => `poked ${w}` },
];

// Same wording as the server's notifications (supabase/functions/notify): [first one, the nth].
const NOTICE: Record<NudgeKind, [string, (n: number) => string]> = {
  miss_you: ['misses you 💗', (n) => `missed you ×${n} 💗`],
  hug: ['sent you a hug 🤗', (n) => `hugged you ×${n} 🤗`],
  kiss: ['sent you a kiss 😘', (n) => `kissed you ×${n} 😘`],
  poke: ['poked you 👉', (n) => `poked you ×${n} 👉`],
  high_five: ['high-fived you ✋', (n) => `high-fived you ×${n} ✋`],
  love: ['loves you ❤️', (n) => `sent you love ×${n} ❤️`],
};

/** Notification title: "Z misses you 💗", then "Z missed you ×3 💗". */
export const nudgeNotice = (name: string, kind: NudgeKind, n: number) => `${name} ${n > 1 ? NOTICE[kind][1](n) : NOTICE[kind][0]}`;

export const nudgeInfo =(kind: NudgeKind) => NUDGES.find((n) => n.kind === kind) ?? NUDGES[0];

export const isNudgeKind = (k: unknown): k is NudgeKind => NUDGES.some((n) => n.kind === k);
