import { router } from 'expo-router';
import { View } from 'react-native';

import { Body, H1, H2, IconButton, Row, Screen } from '@/components/ui';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/privacy';

export default function Privacy() {
  return (
    <Screen>
      <Row>
        <IconButton icon="←" label="Back" onPress={() => router.back()} />
        <H1>Privacy</H1>
      </Row>
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
