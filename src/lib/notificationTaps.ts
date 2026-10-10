import { getInitialNotification, getMessaging, onNotificationOpenedApp, type RemoteMessage } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';

type Data = Record<string, unknown>;

/**
 * The screen a notification opens, from the data the server attaches (supabase/functions/notify)
 * or that presentNudge() adds to the nudges Android shows itself. `spaceId` is the space to switch to first.
 */
export function notificationTarget(data: Data): { href: Href; push?: boolean; spaceId?: string } | null {
  const spaceId = typeof data.space_id === 'string' && data.space_id ? data.space_id : undefined;
  const postId = typeof data.post_id === 'string' && data.post_id ? data.post_id : undefined;
  switch (data.type) {
    case 'post':
    case 'reaction':
      return postId ? { href: `/post/${postId}`, push: true } : { href: '/', spaceId };
    case 'nudge':
      return { href: '/timeline', spaceId };
    case 'answer':
      return { href: '/together', spaceId };
    case 'event':
      return { href: '/countdowns', spaceId };
    case 'member':
    case 'profile':
      return { href: '/', spaceId };
    default:
      return null;
  }
}

/** Data of a notification tapped via expo-notifications: our own nudges, or (on iOS) a push it intercepted. */
function responseData(response: Notifications.NotificationResponse): Data {
  const { content, trigger } = response.notification.request;
  const remote = trigger as { payload?: Data; remoteMessage?: { data?: Data } } | null;
  return { ...remote?.payload, ...remote?.remoteMessage?.data, ...content.data };
}

/** Taps already opened. Module-wide: the launch notification is still reported if listening restarts. */
const seen = new Set<string>();

/**
 * Calls `open` with the data of the notification that launched the app, then of each one tapped
 * while it runs. Pushes the system shows come through Firebase; nudges Android shows itself come
 * through expo-notifications, which on iOS can also be the one that sees taps on pushes. A tap
 * seen by both is only opened once.
 */
export function listenForNotificationTaps(open: (data: Data) => void) {
  const once = (key: string | undefined, data: Data) => {
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    open(data);
  };
  const fromPush = (m: RemoteMessage | null) => m && once(m.messageId, m.data ?? {});
  const fromResponse = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = responseData(r);
    // The same push seen by Firebase has the message ID APNs/FCM gave it.
    const id = (data['gcm.message_id'] ?? data['google.message_id']) as string | undefined;
    once(id ?? `${r.notification.request.identifier}@${r.notification.date}`, data);
  };

  getInitialNotification(getMessaging()).then(fromPush, () => {});
  fromResponse(Notifications.getLastNotificationResponse());

  const offPush = onNotificationOpenedApp(getMessaging(), fromPush);
  const responses = Notifications.addNotificationResponseReceivedListener(fromResponse);
  return () => {
    offPush();
    responses.remove();
  };
}
