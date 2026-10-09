import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useToast } from '@/components/ui';
import { sendNudge } from '@/lib/api';
import { isNudgeKind, nudgeInfo } from '@/lib/nudges';
import { useSpace } from '@/lib/session';
import { colors } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/refresh';

/**
 * chalkmates://nudge?space=…&kind=hug — the iOS "Miss you" widget opens this, since iOS widgets
 * can't send anything themselves. Sends the nudge (a "miss you" by default), then lands on Home.
 */
export default function Nudge() {
  const { space: spaceId, kind: kindParam } = useLocalSearchParams<{ space?: string; kind?: string }>();
  const { spaces } = useSpace();
  const toast = useToast();

  useEffect(() => {
    const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];
    router.replace('/');
    if (!space) return;
    const kind = isNudgeKind(kindParam) ? kindParam : 'miss_you';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    sendNudge(space.id, kind)
      .then(() => {
        toast(`${nudgeInfo(kind).emoji} ${nudgeInfo(kind).label} sent`);
        refreshWidgets(['MissYou']);
      })
      .catch(() => toast("Couldn't send", 'Check your connection and try again.'));
    // Runs once per open; the link is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
