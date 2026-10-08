import { requestPinWidget } from 'react-native-android-widget';

import type { WidgetName } from './data';

// Android. iOS has its own version in refresh.ios.ts.
export { refreshWidgets } from './task-handler';

export const ADD_WIDGET_HINT = 'Long-press an empty spot → Widgets → Chalkmates';

/** Ask the launcher to pin a widget; false when it can't (then show ADD_WIDGET_HINT). */
export const pinWidget = (name: WidgetName) => requestPinWidget({ widgetName: name }).catch(() => false);
