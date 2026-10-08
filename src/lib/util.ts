import type { SpaceEvent, SpaceKind } from './types';

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km: number): string {
  // Locations are rounded to ~1km, so anything closer reads as "together".
  if (km < 1.5) return 'Together 💞';
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/** YYYY-MM-DD in local time. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((parseDay(toDay).getTime() - parseDay(fromDay).getTime()) / 86400000);
}

/** Days until the next occurrence (0 = today). Past one-off events return negative. */
export function daysUntil(e: Pick<SpaceEvent, 'date' | 'yearly'>, today = localDay()): number {
  if (!e.yearly) return daysBetween(today, e.date);
  const t = parseDay(today);
  const [, m, d] = e.date.split('-').map(Number);
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}

export type Countdown = { id: string; title: string; emoji: string; days: number; yearly: boolean };

/** Upcoming countdowns including the space anniversary, soonest first. */
export function upcoming(events: SpaceEvent[], anniversary: string | null, kind: SpaceKind = 'couple'): Countdown[] {
  const list: Countdown[] = events
    .map((e) => ({ id: e.id, title: e.title, emoji: e.emoji, days: daysUntil(e), yearly: e.yearly }))
    .filter((c) => c.days >= 0);
  if (anniversary) {
    const a = anniversaryLabel(kind);
    list.push({ id: 'anniversary', title: a.title, emoji: a.emoji, days: daysUntil({ date: anniversary, yearly: true }), yearly: true });
  }
  return list.sort((a, b) => a.days - b.days);
}

export function anniversaryLabel(kind: SpaceKind) {
  return kind === 'couple'
    ? { title: 'Anniversary', emoji: '💍', together: 'together' }
    : { title: 'Our anniversary', emoji: '🎉', together: 'since it started' };
}

/** Days since the anniversary; null when unset or still in the future. */
export function daysTogether(anniversary: string | null): number | null {
  if (!anniversary) return null;
  const n = daysBetween(anniversary, localDay());
  return n >= 0 ? n : null;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
