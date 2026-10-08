import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the config; this only injects secrets that can't be committed.
// On EAS, GOOGLE_SERVICES_JSON is a "file" environment variable (see SETUP.md).
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
  }) as ExpoConfig;
