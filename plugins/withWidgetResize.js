// Listed before react-native-android-widget in app.json: mods run in reverse order, so this runs after it
// has written the widget provider XML. That plugin has no option for minResizeWidth/minResizeHeight, and
// without them Android won't let a widget shrink below its default (minWidth/minHeight) size. So this
// reads them from the same widget entries in app.json and adds them to each provider.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const withWidgetResize = (config) =>
  withDangerousMod(config, [
    'android',
    (config) => {
      const entry = config.plugins?.find((p) => Array.isArray(p) && p[0] === 'react-native-android-widget');
      const widgets = entry?.[1]?.widgets ?? [];
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      for (const w of widgets) {
        const attrs = [
          w.minResizeWidth && `android:minResizeWidth="${w.minResizeWidth}"`,
          w.minResizeHeight && `android:minResizeHeight="${w.minResizeHeight}"`,
        ].filter(Boolean);
        if (!attrs.length) continue;
        const file = path.join(dir, `widgetprovider_${w.name.toLowerCase()}.xml`);
        const xml = fs.readFileSync(file, 'utf8').replace(/\s+android:minResize(Width|Height)="[^"]*"/g, '');
        fs.writeFileSync(file, xml.replace(/(android:minHeight="[^"]*")/, `$1\n    ${attrs.join('\n    ')}`));
      }
      return config;
    },
  ]);

module.exports = withWidgetResize;
