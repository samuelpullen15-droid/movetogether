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
import { initializeOneSignal } from '@/lib/onesignal-service';
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
// Created inside a function to avoid module-level initialization issues in production builds
const getFitnessDarkTheme = () => {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:26',message:'getFitnessDarkTheme called',data:{darkThemeExists:!!DarkTheme,colorsExists:!!DarkTheme?.colors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  if (!DarkTheme || !DarkTheme.colors) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:29',message:'DarkTheme is null/undefined, using fallback',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Fallback theme if DarkTheme is not available
    return {
      dark: true,
      colors: {
        primary: '#FA114F',
        background: '#000000',
        card: '#1C1C1E',
        text: '#FFFFFF',
        border: '#38383A',
        notification: '#FA114F',
      },
    };
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:45',message:'Creating FitnessDarkTheme with spread',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  try {
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: '#000000',
        card: '#1C1C1E',
        primary: '#FA114F',
      },
    };
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:56',message:'Error creating theme with spread, using fallback',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Fallback if spread operator fails
    return {
      dark: true,
      colors: {
        primary: '#FA114F',
        background: '#000000',
        card: '#1C1C1E',
        text: '#FFFFFF',
        border: '#38383A',
        notification: '#FA114F',
      },
    };
  }
};

const FitnessDarkTheme = getFitnessDarkTheme();

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
    if (!isReady || !isAuthInitialized) {
      return;
    }

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
      // Wait for onboarding_completed check to complete before navigating
      // This prevents flashing the onboarding screen if the check completes quickly
      if (!waitingForProfile) {
        setWaitingForProfile(true);
        
        // Polling approach: Check hasCompletedOnboarding every 200ms for up to 3.5 seconds
        // This allows us to navigate as soon as the DB query completes
        // We ONLY rely on the onboarding_completed flag from the database, not firstName
        // (firstName can come from OAuth metadata for new users, so it's not a reliable indicator)
        const startTime = Date.now();
        const maxWaitTime = 3500; // 3.5 seconds max wait
        const pollInterval = 200; // Check every 200ms
        
        const pollForOnboarding = () => {
          const elapsed = Date.now() - startTime;
          const currentHasCompleted = useOnboardingStore.getState().hasCompletedOnboarding;
          
          if (currentHasCompleted) {
            // Onboarding completed - navigate immediately
            router.replace('/(tabs)');
          } else if (elapsed < maxWaitTime) {
            // Continue polling - wait for database query to complete
            setTimeout(pollForOnboarding, pollInterval);
          } else {
            // Timeout reached - if still not completed, send to onboarding
            router.replace('/(onboarding)');
          }
        };
        
        // Start polling after a short initial delay
        setTimeout(pollForOnboarding, pollInterval);
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
  // Initialize OneSignal when the app starts
  useEffect(() => {
    initializeOneSignal();
  }, []);

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
