// Copies the white notification icon into the Android project as @drawable/notification_icon
// and defines @color/notification_icon_color. @react-native-firebase/messaging's plugin (given
// `android.notificationIcon`) points FCM's default notification icon/color meta-data at these.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidColors, withDangerousMod } = require('expo/config-plugins');

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

const withNotificationIcon = (config, { iconDir, color }) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const res = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const d of DENSITIES) {
        const src = path.join(config.modRequest.projectRoot, iconDir, `drawable-${d}`, 'notification_icon.png');
        const dest = path.join(res, `drawable-${d}`);
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(src, path.join(dest, 'notification_icon.png'));
      }
      return config;
    },
  ]);
  return withAndroidColors(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, { name: 'notification_icon_color', value: color });
    return config;
  });
};

module.exports = withNotificationIcon;
