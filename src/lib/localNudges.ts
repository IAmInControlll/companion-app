import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isNudgeKind, nudgeNotice } from './nudges';

/**
 * Android shows nudge notifications itself (the server sends them as data-only pushes to devices
 * registered with `local_nudges`). One notification per sender and kind; while it's still in the
 * tray, the next nudge bumps its count ("×3"). Once it's swiped away or opened, counting restarts.
 */
export const LOCAL_NUDGES = Platform.OS === 'android';

const CHANNEL = 'nudges';
let channelReady: Promise<unknown> | null = null;

// In the app: into the tray quietly; the in-app toast is the alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Show (or bump) the notification for a nudge push. Returns its title, or null if it isn't one. */
export async function presentNudge(data: Record<string, unknown> | undefined): Promise<string | null> {
  if (!LOCAL_NUDGES || data?.type !== 'nudge' || data.local !== '1' || !isNudgeKind(data.kind)) return null;
  const kind = data.kind;
  const id = `nudge-${String(data.space_id).slice(0, 8)}-${String(data.sender_id).slice(0, 8)}-${kind}`;

  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Nudges', importance: Notifications.AndroidImportance.HIGH });
  await channelReady;

  const shown = (await Notifications.getPresentedNotificationsAsync()).find((n) => n.request.identifier === id);
  const count = shown ? (Number(shown.request.content.data?.count) || 1) + 1 : 1;
  const title = nudgeNotice(String(data.sender_name || 'Someone'), kind, count);
  // Same identifier replaces the one in the tray.
  await Notifications.scheduleNotificationAsync({ identifier: id, content: { title, data: { count } }, trigger: { channelId: CHANNEL } });
  return title;
}
