import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useToast } from '@/components/ui';
import { sendNudge } from '@/lib/api';
import { useSpace } from '@/lib/session';
import { colors } from '@/lib/theme';
import { refreshWidgets } from '@/widgets/refresh';

/**
 * chalkmates://nudge?space=… — the iOS "Miss you" widget opens this, since iOS widgets can't
 * send anything themselves. Sends the nudge, then lands on Home.
 */
export default function Nudge() {
  const { space: spaceId } = useLocalSearchParams<{ space?: string }>();
  const { spaces } = useSpace();
  const toast = useToast();

  useEffect(() => {
    const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];
    router.replace('/');
    if (!space) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    sendNudge(space.id, 'miss_you')
      .then(() => {
        toast('💗 Sent', `They’ll know you miss them`);
        refreshWidgets(['MissYou']);
      })
      .catch(() => toast("Couldn't send", 'Check your connection and try again.'));
    // Runs once per open; the link is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
