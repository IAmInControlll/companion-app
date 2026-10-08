import { SpaceFlow } from '@/components/SpaceFlow';

/** Signed in with no space yet. Finishing the flow swaps this screen for Home. */
export default function Onboarding() {
  return <SpaceFlow mode="onboarding" />;
}
