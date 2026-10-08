import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';

import { listSpaces, type SpaceWithMembers } from '@/lib/api';
import { currentUserId } from '@/lib/supabase';
import { colors, radius, type } from '@/lib/theme';

import { loadWidget, setWidgetSpace, type WidgetName } from './data';
import { renderWidgetFor } from './widgets';

/** Shown when a widget is added (or reconfigured): pick which space it follows. */
export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [spaces, setSpaces] = useState<SpaceWithMembers[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  const choose = async (spaceId: string | null) => {
    if (spaceId) await setWidgetSpace(widgetInfo.widgetId, spaceId);
    const name = widgetInfo.widgetName as WidgetName;
    renderWidget(renderWidgetFor(name, await loadWidget(name, widgetInfo.widgetId), widgetInfo));
    setResult('ok');
  };

  useEffect(() => {
    (async () => {
      if (!(await currentUserId())) {
        setSignedIn(false);
        return;
      }
      const list = await listSpaces().catch(() => []);
      // Nothing to choose: finish immediately.
      if (list.length <= 1) {
        await choose(list[0]?.id ?? null);
        return;
      }
      setSpaces(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!signedIn) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Sign in first</Text>
        <Text style={styles.sub}>Open Chalkmates and sign in, then add the widget again.</Text>
        <Pressable style={styles.row} onPress={() => choose(null)}>
          <Text style={styles.rowText}>Add anyway</Text>
        </Pressable>
      </View>
    );
  }

  if (!spaces) {
    return (
      <View style={[styles.root, { alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ gap: 10 }}>
      <Text style={styles.title}>Which space should this widget show?</Text>
      {spaces.map((s) => (
        <Pressable key={s.id} style={styles.row} onPress={() => choose(s.id)}>
          <Text style={styles.rowText}>
            {s.name}
          </Text>
          <Text style={styles.sub}>{s.members.map((m) => m.profile.display_name).join(', ')}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => setResult('cancel')}>
        <Text style={[styles.sub, { textAlign: 'center', marginTop: 12 }]}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64, gap: 12 },
  title: { ...type.title, marginBottom: 12 },
  sub: { ...type.body, color: colors.textDim, marginBottom: 8 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 4 },
  rowText: type.headline,
});
