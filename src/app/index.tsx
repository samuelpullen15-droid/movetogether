import { View } from 'react-native';

/**
 * Root index route - renders nothing.
 * Navigation logic in _layout.tsx handles all routing based on auth/onboarding state.
 * This prevents flashing the sign-in screen for authenticated users.
 */
export default function Index() {
  // Return empty view - _layout.tsx will handle navigation once auth state is confirmed
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
