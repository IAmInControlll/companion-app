import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { nudgeScores, type NudgeScore, type SpaceWithMembers } from '@/lib/api';
import { NUDGES } from '@/lib/nudges';
import { HAND_FONT, colors, radius, type } from '@/lib/theme';
import { useSpaceRealtime } from '@/lib/useRealtime';

import { Avatar, Segmented } from './ui';

export type ScorePeriod = 'today' | 'week' | 'all';

function since(period: ScorePeriod): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Nudge counts for a space over a period, kept live. `null` until loaded (or if it can't load). */
export function useNudgeScores(spaceId: string, period: ScorePeriod, enabled = true) {
  const [scores, setScores] = useState<NudgeScore[] | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    nudgeScores(spaceId, since(period))
      .then(setScores)
      .catch(() => setScores(null));
  }, [spaceId, period, enabled]);
  useFocusEffect(load);
  useSpaceRealtime(spaceId, ['nudges'], load);
  return scores;
}

export type Standing = { id: string; name: string; avatar: string; color: string; total: number; byKind: { emoji: string; n: number }[] };

/** Everyone in the space, most nudges first. */
export function standings(space: SpaceWithMembers, userId: string, scores: NudgeScore[]): Standing[] {
  return space.members
    .map((m) => {
      const mine = scores.filter((s) => s.sender_id === m.user_id);
      return {
        id: m.user_id,
        name: m.user_id === userId ? 'You' : m.profile.display_name,
        avatar: m.profile.avatar,
        color: m.profile.color,
        total: mine.reduce((sum, s) => sum + s.n, 0),
        byKind: NUDGES.map((x) => ({ emoji: x.emoji, n: mine.find((s) => s.kind === x.kind)?.n ?? 0 }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n),
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** "Today: You 24 · Z 335 👑" */
export function scoreLine(rows: Standing[]): string {
  const lead = rows.length > 1 && rows[0].total > rows[1].total ? rows[0].id : null;
  return rows.map((r) => `${r.name} ${r.total}${r.id === lead ? ' 👑' : ''}`).join('  ·  ');
}

/** Who's sent the most nudges: a tug-of-war bar and one row per person. */
export function Scoreboard({ space, userId }: { space: SpaceWithMembers; userId: string }) {
  const [period, setPeriod] = useState<ScorePeriod>('today');
  const scores = useNudgeScores(space.id, period);
  if (!scores) return null;
  const rows = standings(space, userId, scores);
  const sum = rows.reduce((n, r) => n + r.total, 0);
  const lead = rows.length > 1 && rows[0].total > rows[1].total ? rows[0].id : null;
  const tied = sum > 0 && !lead;

  return (
    <View style={styles.card}>
      <Text style={type.headline}>Who’s winning</Text>
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'all', label: 'Ever' },
        ]}
        style={{ backgroundColor: colors.surfaceHi }}
      />

      {sum > 0 ? (
        <View style={styles.bar}>
          {rows
            .filter((r) => r.total > 0)
            .map((r) => (
              <View key={r.id} style={{ flex: r.total, backgroundColor: r.color }} />
            ))}
        </View>
      ) : null}

      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <Avatar emoji={r.avatar} color={r.color} size={34} badge={r.id === lead ? '👑' : null} />
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{r.name}</Text>
            <Text style={type.caption} numberOfLines={1}>
              {r.byKind.length ? r.byKind.map((k) => `${k.emoji}${k.n}`).join('  ') : 'Nothing yet'}
            </Text>
          </View>
          <Text style={[styles.total, { color: r.id === lead ? colors.accent : colors.text }]}>{r.total}</Text>
        </View>
      ))}

      <Text style={[type.caption, { textAlign: 'center' }]}>
        {sum === 0 ? 'Nobody’s nudged yet. Go first!' : tied ? 'Dead even. Someone break the tie!' : `${rows[0].name === 'You' ? 'You’re' : `${rows[0].name}’s`} ahead`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12 },
  bar: { flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  total: { fontFamily: HAND_FONT, fontSize: 30, lineHeight: 34 },
});
