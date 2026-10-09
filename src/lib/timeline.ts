import type { Activity } from './api';

/** One line on the timeline: an activity, or a run of the same nudge collapsed into one ("×12"). */
export type TimelineEntry = Activity & { count: number; firstAt: string };
export type TimelineDay = { title: string; data: TimelineEntry[] };

/**
 * Split newest-first activity into days, and collapse back-to-back identical nudges (same person,
 * same kind) into a single entry. `dayOf` names the day an ISO time falls on.
 */
export function groupActivity(items: Activity[], dayOf: (iso: string) => string): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const item of items) {
    const title = dayOf(item.at);
    let day = days[days.length - 1];
    if (day?.title !== title) {
      day = { title, data: [] };
      days.push(day);
    }
    const prev = day.data[day.data.length - 1];
    if (prev?.type === 'nudge' && item.type === 'nudge' && prev.actor === item.actor && prev.kind === item.kind) {
      prev.count++;
      prev.firstAt = item.at;
    } else {
      day.data.push({ ...item, count: 1, firstAt: item.at });
    }
  }
  return days;
}
