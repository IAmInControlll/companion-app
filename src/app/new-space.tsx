
import { goBack } from '@/lib/nav';

import { SpaceFlow } from '@/components/SpaceFlow';

export default function NewSpace() {
  return <SpaceFlow mode="add" onCancel={() => goBack()} onFinish={() => goBack()} />;
}
