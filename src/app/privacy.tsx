import { View } from 'react-native';

import { Body, H2, Header, Screen } from '@/components/ui';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/privacy';

export default function Privacy() {
  return (
    <Screen>
      <Header title="Privacy" />
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
