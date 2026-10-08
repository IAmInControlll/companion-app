import { router, type Href } from 'expo-router';

/**
 * Back, or `fallback` when there's nothing to go back to. Screens opened straight from a widget
 * or a link (post, countdowns, privacy…) are the only screen in the stack, so plain back() is a
 * no-op. Signed-out screens must pass '/sign-in': Home is a protected route then, and navigating
 * to it is silently blocked.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
