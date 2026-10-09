import {
  deleteToken,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

import { refreshWidgets } from '@/widgets/refresh';
import { WIDGET_NAMES, type WidgetName } from '@/widgets/data';

import { registerDevice, unregisterDevice } from './api';
import { presentNudge } from './localNudges';

/**
 * Handles every push, foreground or background (registered in index.ts): shows nudges we display
 * ourselves, and redraws the widgets the server says changed. Returns the nudge's title, if any.
 */
export async function handleRemoteMessage(message: RemoteMessage): Promise<string | null> {
  const nudge = presentNudge(message.data).catch((e) => {
    console.warn('Nudge notification failed', e);
    return null;
  });
  const raw = message.data?.widgets;
  if (typeof raw === 'string' && raw !== '') {
    // Ignore widgets this version doesn't have (e.g. the old Photo widget).
    const names = raw === '*' ? '*' : raw.split(',').filter((n): n is WidgetName => WIDGET_NAMES.includes(n as WidgetName));
    await refreshWidgets(names);
  }
  return nudge;
}

export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    // Widgets still update via data pushes even if notifications are denied, so keep going.
    void res;
  }
  if (Platform.OS === 'ios') {
    // Same as Android: a "no" only silences alerts; silent pushes still refresh widgets.
    await requestPermission(getMessaging()).catch(() => {});
  }
  try {
    const token = await getToken(getMessaging());
    await registerDevice(token);
    return token;
  } catch (e) {
    console.warn('Push registration failed', e);
    return null;
  }
}

export function listenForTokenRefresh() {
  return onTokenRefresh(getMessaging(), (token) => {
    registerDevice(token).catch(() => {});
  });
}

export function listenForForegroundMessages(onToast: (title: string, body: string) => void) {
  return onMessage(getMessaging(), async (message) => {
    if (message.notification?.title) onToast(message.notification.title, message.notification.body ?? '');
    const nudge = await handleRemoteMessage(message);
    if (nudge) onToast(nudge, '');
  });
}

export async function unregisterPush() {
  try {
    const token = await getToken(getMessaging());
    await unregisterDevice(token);
    await deleteToken(getMessaging());
  } catch {
    // best effort on sign-out
  }
}
