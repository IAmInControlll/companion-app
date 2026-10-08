import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Body, Button, H2, ToastProvider, useToast } from '@/components/ui';
import { FONT_SOURCES } from '@/lib/fonts';
import { useLocationSync } from '@/lib/location';
import { listenForForegroundMessages } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <RootStack />
          </ToastProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { ready, userId, profile, spaces, spacesLoaded, loadFailed, onboardingOpen } = useSession();
  const toast = useToast();
  // A missing font shouldn't brick the app: carry on (with fallbacks) if loading fails.
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);
  const signedIn = !!userId;
  // Mid-onboarding counts as "no space yet" so the last steps aren't swapped for Home.
  const hasSpace = spaces.length > 0 && !onboardingOpen;
  const loading = !ready || (!fontsLoaded && !fontError) || (signedIn && !spacesLoaded && !loadFailed);

  useLocationSync(signedIn && hasSpace && !!profile?.share_location);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  useEffect(() => listenForForegroundMessages((title, body) => toast(title, body)), [toast]);

  if (loading) return null;
  if (signedIn && loadFailed) return <Offline />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'ios_from_right' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasSpace}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasSpace}>
        <Stack.Screen name="index" />
        <Stack.Screen name="history" />
        <Stack.Screen name="together" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="draw" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="note" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="photo" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="mood" options={{ presentation: 'modal' }} />
        <Stack.Screen name="countdowns" />
        <Stack.Screen name="space/[id]" />
        <Stack.Screen name="new-space" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      {/* Open to everyone. Last on purpose: when the current route is off limits, Expo Router
          redirects to the first screen it may show, and that must never be Privacy. */}
      <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

/** First launch with no connection and nothing cached yet. */
function Offline() {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    await refresh().catch(() => {});
    setBusy(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 32, gap: 12 }}>
      <H2 style={{ textAlign: 'center' }}>Can’t reach Chalkmates</H2>
      <Body dim style={{ textAlign: 'center' }}>
        Check your connection and try again.
      </Body>
      <Button title="Try again" loading={busy} onPress={retry} />
    </View>
  );
}
