import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View, Animated, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Asset } from 'expo-asset';
// TEMPORARILY DISABLED: Testing if KeyboardProvider is causing TurboModule crash
// import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useAuthStore } from '@/lib/auth-store';
import { useHealthStore } from '@/lib/health-service';
import { registerBackgroundSync } from '@/lib/background-sync-service';
// TEMPORARILY DISABLED: Testing if OneSignal is causing the crash
// import { initializeOneSignal } from '@/lib/onesignal-service';
import { useEffect, useState, useRef } from 'react';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'sign-in', // Start at sign-in to prevent flash - our navigation logic will redirect if needed
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Preload these assets while splash is showing (must be at module level for Metro bundler)
const PRELOAD_ASSETS = [
  require('../../assets/sign-in-background.png'),
];

// Custom dark theme for fitness app
// Created inside a function to avoid module-level initialization issues in production builds
const getFitnessDarkTheme = () => {
  if (!DarkTheme || !DarkTheme.colors) {
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
      fonts: DarkTheme?.fonts || {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '800' as const },
      },
    };
  }
  
  try {
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: '#000000',
        card: '#1C1C1E',
        primary: '#FA114F',
      },
      fonts: DarkTheme.fonts,
    };
  } catch (error) {
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
      fonts: DarkTheme?.fonts || {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '800' as const },
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
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const restoreProviderConnection = useHealthStore((s) => s.restoreProviderConnection);
  const loadWeightGoalFromSupabase = useHealthStore((s) => s.loadWeightGoalFromSupabase);
  const loadGoalsFromSupabase = useHealthStore((s) => s.loadGoalsFromSupabase);
  const [isReady, setIsReady] = useState(false);
  const [waitingForProfile, setWaitingForProfile] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [navigationComplete, setNavigationComplete] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Preload critical assets (like sign-in background) while splash is showing
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        await Asset.loadAsync(PRELOAD_ASSETS);
        setAssetsLoaded(true);
      } catch (e) {
        // If preloading fails, continue anyway
        console.log('Asset preload failed:', e);
        setAssetsLoaded(true);
      }
    };
    preloadAssets();
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    // Wait for both stores to hydrate AND auth to initialize before hiding splash
    // This prevents flashing the wrong screen on app load
    const checkReady = () => {
      if (isAuthInitialized) {
        setIsReady(true);
      } else {
        // Check again after a short delay
        setTimeout(checkReady, 50);
      }
    };
    
    // Start checking after a brief initial delay
    const timeout = setTimeout(checkReady, 100);
    return () => clearTimeout(timeout);
  }, [isAuthInitialized]);

  // Don't automatically complete onboarding here - let the onboarding screen handle it
  // after the Apple Health step is shown

  // Restore health provider connection and load goals when user logs in
  useEffect(() => {
    if (isAuthenticated && isReady && isAuthInitialized && user?.id) {
      // Sync health data immediately - no delay needed
      restoreProviderConnection();
      // Load weight goal and activity goals from Supabase
      loadWeightGoalFromSupabase(user.id);
      loadGoalsFromSupabase(user.id);
    }
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id, restoreProviderConnection, loadWeightGoalFromSupabase, loadGoalsFromSupabase]);

  // Register background sync when user is authenticated
  useEffect(() => {
    if (isAuthenticated && isAuthInitialized) {
      // Small delay to ensure everything is initialized
      const timer = setTimeout(() => {
        registerBackgroundSync();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isAuthInitialized]);

  // Handle smooth fade transition from splash to app
  useEffect(() => {
    if (isReady && isAuthInitialized && navigationComplete && assetsLoaded && !splashHidden) {
      // All ready - hide native splash and fade to content
      SplashScreen.hideAsync().then(() => {
        // No delay needed - assets are preloaded
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          setSplashHidden(true);
        });
      });
    }
  }, [isReady, isAuthInitialized, navigationComplete, assetsLoaded, splashHidden, fadeAnim]);

  // Navigation logic using useEffect to handle state changes
  useEffect(() => {
    if (!isReady || !isAuthInitialized) {
      return;
    }
    
    // For authenticated users, wait for profile to be loaded before deciding onboarding
    // This prevents the flash of onboarding screen while profile is being fetched
    if (isAuthenticated && !isProfileLoaded) {
      return;
    }

    const currentSegment = segments[0];
    const onboardingDone = hasCompletedOnboarding;
    
    // Determine where we SHOULD be for the MAIN flow screens
    let targetSegment: string;
    if (!isAuthenticated) {
      targetSegment = 'sign-in';
    } else if (onboardingDone) {
      targetSegment = '(tabs)';
    } else {
      targetSegment = '(onboarding)';
    }

    // Only enforce navigation for the main flow screens (sign-in, tabs, onboarding)
    // Don't redirect from other screens like settings, friends, etc.
    const mainFlowScreens = ['sign-in', '(tabs)', '(onboarding)', undefined];
    const isOnMainFlowScreen = mainFlowScreens.includes(currentSegment);

    // If we're on a main flow screen but not the correct one, navigate there
    if (isOnMainFlowScreen && currentSegment !== targetSegment) {
      // Navigate to the correct screen
      if (targetSegment === 'sign-in') {
        router.replace('/sign-in');
      } else if (targetSegment === '(tabs)') {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)');
      }
      // Do NOT set navigationComplete here - wait for segments to update
    } else {
      // segments[0] matches our target - we're actually on the correct screen now
      setNavigationComplete(true);
    }
  }, [isAuthenticated, hasCompletedOnboarding, segments, isReady, isAuthInitialized, isProfileLoaded, router]);

  // Prevent ANY navigation from rendering until auth is fully initialized AND ready
  // This prevents the router from rendering a default route before we know the auth state
  // Must be AFTER all hooks are called (React hooks rule)
  if (!isAuthInitialized || !isReady) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, opacity: (navigationComplete && assetsLoaded) ? 1 : 0 }}>
        <ThemeProvider value={FitnessDarkTheme}>
          <Stack>
        <Stack.Screen
          name="sign-in"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'none',
          }}
        />
        <Stack.Screen 
          name="(tabs)" 
          options={{ 
            headerShown: false,
            animation: 'none',
          }} 
        />
        <Stack.Screen
          name="(onboarding)"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'none',
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
      </View>
    
    {!splashHidden && (
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000000',
            opacity: fadeAnim,
          },
        ]}
        pointerEvents="none"
      />
    )}
    </View>
  );
}

export default function RootLayout() {
  // TEMPORARILY DISABLED: Testing if OneSignal is causing the crash
  // Initialize OneSignal when the app starts
  // useEffect(() => {
  //   initializeOneSignal();
  // }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <RootLayoutNav />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
