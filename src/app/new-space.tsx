import { router } from 'expo-router';

import { SpaceSetup } from '@/components/SpaceSetup';
import { Button, H1, Screen } from '@/components/ui';

export default function NewSpace() {
  return (
    <Screen>
      <H1>New space</H1>
      <SpaceSetup onDone={() => router.back()} />
      <Button variant="ghost" title="Cancel" onPress={() => router.back()} />
    </Screen>
  );
}
