import { Redirect } from 'expo-router';

/**
 * Root index route - immediately redirects to sign-in.
 * Navigation logic in _layout.tsx handles proper routing based on auth/onboarding state.
 * This prevents Expo Router from defaulting to (onboarding) for unauthenticated users.
 */
export default function Index() {
  return <Redirect href="/sign-in" />;
}
