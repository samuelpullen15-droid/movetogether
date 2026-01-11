import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useAuthStore } from '@/lib/auth-store';
import { useHealthStore } from '@/lib/health-service';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Custom dark theme for fitness app
const FitnessDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#1C1C1E',
    primary: '#FA114F',
  },
};

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const restoreProviderConnection = useHealthStore((s) => s.restoreProviderConnection);
  const loadWeightGoalFromSupabase = useHealthStore((s) => s.loadWeightGoalFromSupabase);
  const loadGoalsFromSupabase = useHealthStore((s) => s.loadGoalsFromSupabase);
  const [isReady, setIsReady] = useState(false);
  const [waitingForProfile, setWaitingForProfile] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    // Clear stale auth storage to fix profile data issues
    AsyncStorage.removeItem('auth-storage').then(() => {
      initializeAuth();
    });
  }, [initializeAuth]);

  useEffect(() => {
    // Wait for both stores to hydrate
    const timeout = setTimeout(() => {
      setIsReady(true);
      SplashScreen.hideAsync();
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

  // Don't automatically complete onboarding here - let the onboarding screen handle it
  // after the Apple Health step is shown

  // Restore health provider connection and load goals when user logs in
  useEffect(() => {
    if (isAuthenticated && isReady && isAuthInitialized && user?.id) {
      // Small delay to ensure stores are hydrated
      const timer = setTimeout(() => {
        restoreProviderConnection();
        // Load weight goal and activity goals from Supabase
        loadWeightGoalFromSupabase(user.id);
        loadGoalsFromSupabase(user.id);
      }, 1000); // Increased delay to ensure stores are fully hydrated
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id, restoreProviderConnection, loadWeightGoalFromSupabase, loadGoalsFromSupabase]);

  useEffect(() => {
    if (!isReady || !isAuthInitialized) return;

    const inSignIn = segments[0] === 'sign-in';
    const inOnboarding = segments[0] === '(onboarding)';
    
    // Onboarding is done only if it was explicitly marked as completed
    // Don't auto-complete based on fields - let onboarding screen handle completion after Apple Health step
    const onboardingDone = hasCompletedOnboarding;

    if (!isAuthenticated && !inSignIn) {
      // Not authenticated - go to sign in
      router.replace('/sign-in');
    } else if (isAuthenticated && onboardingDone && (inSignIn || inOnboarding)) {
      // Authenticated and explicitly completed onboarding - go to main app
      router.replace('/(tabs)');
    } else if (isAuthenticated && !onboardingDone && !inOnboarding) {
      // Authenticated but onboarding not done yet
      // Wait for profile to load before deciding
      if (!waitingForProfile) {
        setWaitingForProfile(true);
        // Give profile 1.5 seconds to load
        setTimeout(() => {
          const currentUser = useAuthStore.getState().user;
          const currentHasCompleted = useOnboardingStore.getState().hasCompletedOnboarding;
          
          // Check if user has legacy onboarding completion (username + firstName, before phone was required)
          const hasLegacyOnboarding = currentUser?.username && currentUser?.firstName;
          
          // If they have legacy completion but not the flag, mark it as complete
          if (hasLegacyOnboarding && !currentHasCompleted) {
            useOnboardingStore.getState().completeOnboarding();
          }
          
          // Show onboarding if not explicitly completed AND not legacy completed
          const shouldOnboard = !currentHasCompleted && !hasLegacyOnboarding;
          
          if (shouldOnboard) {
            router.replace('/(onboarding)');
          } else {
            router.replace('/(tabs)');
          }
        }, 1500);
      }
    }
  }, [isAuthenticated, hasCompletedOnboarding, user?.username, segments, isReady, isAuthInitialized, router, waitingForProfile]);

  return (
    <ThemeProvider value={FitnessDarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="(onboarding)"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="connect-health"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="create-competition"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="friends"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="friend-profile"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="competition-detail"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="activity-detail"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="upgrade"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <StatusBar style="light" />
          <RootLayoutNav />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
