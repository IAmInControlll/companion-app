import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { setLocation } from './api';

const LAST_KEY = 'location:last-sync';
const MIN_INTERVAL = 15 * 60 * 1000;

/** Push our (rounded) location when the app opens, at most every 15 min. Foreground only. */
export async function syncLocation(force = false): Promise<boolean> {
  const last = Number((await AsyncStorage.getItem(LAST_KEY)) ?? 0);
  if (!force && Date.now() - last < MIN_INTERVAL) return false;
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return false;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await setLocation(pos.coords.latitude, pos.coords.longitude);
  await AsyncStorage.setItem(LAST_KEY, String(Date.now()));
  return true;
}

export async function enableLocationSharing(): Promise<boolean> {
  const perm = await Location.requestForegroundPermissionsAsync();
  return perm.granted;
}

export function useLocationSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    syncLocation().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncLocation().catch(() => {});
    });
    return () => sub.remove();
  }, [enabled]);
}
