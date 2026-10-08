import { router } from 'expo-router';

/**
 * Back, or Home when there's nothing to go back to. Screens opened straight from a widget or a
 * link (post, countdowns, privacy…) are the only screen in the stack, so plain back() is a no-op.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
