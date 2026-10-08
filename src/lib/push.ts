import {
  deleteToken,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

import { refreshWidgets } from '@/widgets/task-handler';
import type { WidgetName } from '@/widgets/data';

import { registerDevice, unregisterDevice } from './api';

/**
 * Handles every push, foreground or background (registered in index.ts).
 * The server tells us which widgets changed, so we only redraw those.
 */
export async function handleRemoteMessage(message: RemoteMessage) {
  const raw = message.data?.widgets;
  if (typeof raw !== 'string' || raw === '') return;
  const names = raw === '*' ? '*' : (raw.split(',').filter(Boolean) as WidgetName[]);
  await refreshWidgets(names);
}

export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    // Widgets still update via data pushes even if notifications are denied, so keep going.
    void res;
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
    await handleRemoteMessage(message);
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
