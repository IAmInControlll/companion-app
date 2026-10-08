import 'expo-router/entry';

import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';

import { handleRemoteMessage } from './src/lib/push';
import { WidgetConfigScreen } from './src/widgets/ConfigScreen';
import { widgetTaskHandler } from './src/widgets/task-handler';

// Headless entry points: these run even when the app UI isn't open.
registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(WidgetConfigScreen);
setBackgroundMessageHandler(getMessaging(), handleRemoteMessage);
