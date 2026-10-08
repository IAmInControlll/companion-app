import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the config; this only injects secrets that can't be committed.
// On EAS, GOOGLE_SERVICES_JSON and GOOGLE_SERVICE_INFO_PLIST are "file" environment variables (see SETUP.md).
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
    ios: {
      ...config.ios,
      googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist',
    },
  }) as ExpoConfig;
