import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useLocationSync } from '@/lib/location';
import { useSession } from '@/lib/session';
import { HAND_FONT, colors } from '@/lib/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const { profile } = useSession();
  useLocationSync(!!profile?.share_location);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarActiveTintColor: colors.pink,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontFamily: HAND_FONT, fontSize: 14 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('🏡') }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: icon('🖼️') }} />
      <Tabs.Screen name="together" options={{ title: 'Together', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="settings" options={{ title: 'Me', tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
