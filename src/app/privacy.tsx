import { View } from 'react-native';

import { Body, H2, Header, Screen } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/privacy';
import { useSession } from '@/lib/session';

export default function Privacy() {
  // Also reachable from sign-in and onboarding, where Home is off limits.
  const { userId, spaces } = useSession();
  const home = !userId ? '/sign-in' : spaces.length ? '/' : '/onboarding';
  return (
    <Screen>
      <Header title="Privacy" onBack={() => goBack(home)} />
      <Body dim>Last updated {PRIVACY_UPDATED}</Body>
      {PRIVACY_SECTIONS.map((s) => (
        <View key={s.title} style={{ gap: 4 }}>
          <H2>{s.title}</H2>
          <Body>{s.body}</Body>
        </View>
      ))}
    </Screen>
  );
}
