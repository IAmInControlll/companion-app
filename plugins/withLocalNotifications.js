// Listed before expo-notifications in app.json: mods run in reverse order, so this runs after its own.
// expo-notifications is only used to show notifications from the app (nudges, see
// src/lib/localNudges.ts); pushes arrive through @react-native-firebase/messaging. So:
// - drop expo-notifications' own FCM service, so it can never take messages from Firebase's;
// - point its default icon/colour at the ones withNotificationIcon already adds.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const EXPO_FCM_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';

const withLocalNotifications = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== EXPO_FCM_SERVICE);
    app.service.push({ $: { 'android:name': EXPO_FCM_SERVICE, 'tools:node': 'remove' } });

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'expo.modules.notifications.default_notification_icon', '@drawable/notification_icon', 'resource');
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'expo.modules.notifications.default_notification_color', '@color/notification_icon_color', 'resource');
    return config;
  });

module.exports = withLocalNotifications;
