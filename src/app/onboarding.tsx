import { View } from 'react-native';

import { ChalkTitle } from '@/components/ChalkTitle';
import { SpaceSetup } from '@/components/SpaceSetup';
import { Body, Button, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function Onboarding() {
  const { profile, signOut } = useSession();
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <ChalkTitle text={`Hi ${profile?.display_name ?? 'there'}!`} />
        <Body dim style={{ textAlign: 'center' }}>
          Start a space and share the code with your person, or join theirs.
        </Body>
      </View>
      <SpaceSetup />
      <Button variant="ghost" title="Sign out" onPress={signOut} />
    </Screen>
  );
}
