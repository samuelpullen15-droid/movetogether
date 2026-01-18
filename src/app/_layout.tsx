import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View, Animated, StyleSheet, Text, Pressable } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Asset } from 'expo-asset';
import React from 'react';
import Constants from 'expo-constants';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useAuthStore } from '@/lib/auth-store';
import { CelebrationProvider } from '@/lib/celebration-context';
// Lazy import health store to prevent blocking app startup
// import { useHealthStore } from '@/lib/health-service';
import { registerBackgroundSync } from '@/lib/background-sync-service';
// TEMPORARILY DISABLED: Testing if OneSignal is causing the crash
// import { initializeOneSignal } from '@/lib/onesignal-service';
import { useEffect, useState, useRef } from 'react';

export const unstable_settings = {
  // Start at root index which redirects to sign-in - prevents flash to (onboarding)
  initialRouteName: 'index',
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
  const [isReady, setIsReady] = useState(false);
  const [waitingForProfile, setWaitingForProfile] = useState(false);
  const [profileLoadTimeout, setProfileLoadTimeout] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [navigationComplete, setNavigationComplete] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [forceRender, setForceRender] = useState(false);
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

  // Initialize auth on mount with error handling
  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        await initializeAuth();
      } catch (error) {
        console.error('[Layout] Auth initialization failed:', error);
        // Even if auth init fails, allow app to render after timeout
        if (mounted) {
          setTimeout(() => {
            setForceRender(true);
            setIsReady(true);
          }, 1000);
        }
      }
    };
    
    initAuth();
    
    return () => {
      mounted = false;
    };
  }, [initializeAuth]);

  useEffect(() => {
    // Wait for auth to initialize before hiding splash
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

    // Safety timeout: Force ready after 2.5 seconds (backup to the 1.5s timeout)
    // This ensures the app always renders, even if auth initialization hangs
    const safetyTimeout = setTimeout(() => {
      if (!isReady) {
        console.warn('[Layout] Auth safety timeout - forcing isReady');
        setIsReady(true);
      }
    }, 2500);

    return () => {
      clearTimeout(timeout);
      clearTimeout(safetyTimeout);
    };
  }, [isAuthInitialized]);

  // Don't automatically complete onboarding here - let the onboarding screen handle it
  // after the Apple Health step is shown

  // Safety timeout for profile loading - don't wait forever
  useEffect(() => {
    if (isAuthenticated && !isProfileLoaded && !profileLoadTimeout) {
      const timeout = setTimeout(() => {
        console.warn('[Layout] Profile load timeout after 1.5s - proceeding without profile');
        setProfileLoadTimeout(true);
        // Force navigation to proceed
        setNavigationComplete(true);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, isProfileLoaded, profileLoadTimeout]);

  // Restore health provider connection and load goals when user logs in
  // Use dynamic import to prevent blocking app startup
  useEffect(() => {
    if (isAuthenticated && isReady && isAuthInitialized && user?.id) {
      // Dynamically import health store to prevent blocking
      import('@/lib/health-service').then(({ useHealthStore }) => {
        const store = useHealthStore.getState();
        // Sync health data - already deferred internally
        store.restoreProviderConnection();
        // Load weight goal and activity goals from Supabase
        store.loadWeightGoalFromSupabase(user.id);
        store.loadGoalsFromSupabase(user.id);
      }).catch((e) => {
        console.error('[Layout] Failed to load health service:', e);
      });
    }
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id]);

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
  // Use useRef to track if we've already navigated to prevent duplicate navigations
  const hasNavigatedRef = useRef(false);
  const lastTargetSegmentRef = useRef<string | null>(null);

  useEffect(() => {
    // If forceRender is true, skip all checks and just navigate
    if (forceRender && !navigationComplete) {
      const onboardingDone = hasCompletedOnboarding;
      let targetSegment: string;
      if (!isAuthenticated) {
        targetSegment = 'sign-in';
      } else if (onboardingDone) {
        targetSegment = '(tabs)';
      } else {
        targetSegment = '(onboarding)';
      }
      
      // Only navigate if target changed
      if (lastTargetSegmentRef.current !== targetSegment) {
        if (targetSegment === 'sign-in') {
          router.replace('/sign-in');
        } else if (targetSegment === '(tabs)') {
          router.replace('/(tabs)');
        } else {
          router.replace('/(onboarding)');
        }
        lastTargetSegmentRef.current = targetSegment;
      }
      setNavigationComplete(true);
      return;
    }
    
    if (!isReady || !isAuthInitialized) {
      return;
    }

    // For authenticated users, wait for profile to be loaded before deciding onboarding
    // But don't wait forever - use the timeout flag as a fallback
    // Also proceed if we're already on the correct segment to prevent infinite loops
    const currentSegment = segments[0];
    if (isAuthenticated && !isProfileLoaded && !profileLoadTimeout) {
      // If we're already on a valid screen, set navigationComplete to stop the loop
      if (currentSegment === '(onboarding)' || currentSegment === '(tabs)') {
        if (!navigationComplete) {
          setNavigationComplete(true);
        }
      }
      return;
    }

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

    // If segments haven't loaded yet (undefined), navigate immediately
    if (currentSegment === undefined) {
      // Only navigate if target changed
      if (lastTargetSegmentRef.current !== targetSegment) {
        if (targetSegment === 'sign-in') {
          router.replace('/sign-in');
        } else if (targetSegment === '(tabs)') {
          router.replace('/(tabs)');
        } else {
          router.replace('/(onboarding)');
        }
        lastTargetSegmentRef.current = targetSegment;
        // Set navigationComplete after navigation
        setTimeout(() => {
          setNavigationComplete(true);
        }, 200);
      }
      return;
    }

    // Only enforce navigation for the main flow screens (index, sign-in, tabs, onboarding)
    // Don't redirect from other screens like settings, friends, etc.
    const mainFlowScreens = ['index', 'sign-in', '(tabs)', '(onboarding)', undefined];
    const isOnMainFlowScreen = mainFlowScreens.includes(currentSegment);

    // If we're on a main flow screen but not the correct one, navigate there
    if (isOnMainFlowScreen && currentSegment !== targetSegment) {
      // Only navigate if target changed
      if (lastTargetSegmentRef.current !== targetSegment) {
        // Navigate to the correct screen
        if (targetSegment === 'sign-in') {
          router.replace('/sign-in');
        } else if (targetSegment === '(tabs)') {
          router.replace('/(tabs)');
        } else {
          router.replace('/(onboarding)');
        }
        lastTargetSegmentRef.current = targetSegment;
        // Set navigationComplete after a short delay to allow navigation to happen
        setTimeout(() => {
          setNavigationComplete(true);
        }, 200);
      }
    } else {
      // segments[0] matches our target - we're actually on the correct screen now
      if (!navigationComplete) {
        setNavigationComplete(true);
      }
    }
  }, [isAuthenticated, hasCompletedOnboarding, segments, isReady, isAuthInitialized, isProfileLoaded, profileLoadTimeout, router, forceRender, navigationComplete]);

  // Safety timeout: Force render after 1.5 seconds to prevent permanent black screen
  // Only trigger if things haven't resolved naturally
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only force if not already complete
      if (!navigationComplete || !assetsLoaded) {
        console.warn('[Layout] Safety timeout - forcing render after 1.5 seconds');
        setForceRender(true);
        setIsReady(true);
        setNavigationComplete(true);
        setAssetsLoaded(true);
        setProfileLoadTimeout(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigationComplete, assetsLoaded]);

  // Calculate if we should show the content (either everything is ready OR we forced render)
  const shouldShowContent = forceRender || (navigationComplete && assetsLoaded);

  // Always render the Stack - opacity just controls visibility
  // If forceRender is true, always show content (don't wait for navigationComplete)
  const finalOpacity = forceRender ? 1 : (shouldShowContent ? 1 : 0);

  // Debug logging - MUST be before any conditional returns (Rules of Hooks)
  // Use useRef to track previous values and only log when they actually change
  const prevStateRef = useRef<{
    isReady: boolean;
    isAuthInitialized: boolean;
    forceRender: boolean;
    navigationComplete: boolean;
    assetsLoaded: boolean;
    currentSegment: string | undefined;
  } | null>(null);

  const prevFinalStateRef = useRef<{
    forceRender: boolean;
    shouldShowContent: boolean;
    finalOpacity: number;
    isReady: boolean;
    isAuthInitialized: boolean;
    navigationComplete: boolean;
    assetsLoaded: boolean;
  } | null>(null);

  useEffect(() => {
    if (__DEV__) {
      const currentState = {
        isReady,
        isAuthInitialized,
        forceRender,
        navigationComplete,
        assetsLoaded,
        currentSegment: segments[0],
      };

      // Only log if state actually changed
      if (!prevStateRef.current || 
          prevStateRef.current.isReady !== currentState.isReady ||
          prevStateRef.current.isAuthInitialized !== currentState.isAuthInitialized ||
          prevStateRef.current.forceRender !== currentState.forceRender ||
          prevStateRef.current.navigationComplete !== currentState.navigationComplete ||
          prevStateRef.current.assetsLoaded !== currentState.assetsLoaded ||
          prevStateRef.current.currentSegment !== currentState.currentSegment) {
        console.log('[Layout] Render state:', {
          ...currentState,
          shouldShowContent,
        });
        prevStateRef.current = currentState;
      }
    }
  }, [isReady, isAuthInitialized, forceRender, navigationComplete, assetsLoaded, shouldShowContent, segments]);

  useEffect(() => {
    if (__DEV__) {
      const currentFinalState = {
        forceRender,
        shouldShowContent,
        finalOpacity,
        isReady,
        isAuthInitialized,
        navigationComplete,
        assetsLoaded,
      };

      // Only log if final state actually changed
      if (!prevFinalStateRef.current ||
          prevFinalStateRef.current.forceRender !== currentFinalState.forceRender ||
          prevFinalStateRef.current.shouldShowContent !== currentFinalState.shouldShowContent ||
          prevFinalStateRef.current.finalOpacity !== currentFinalState.finalOpacity ||
          prevFinalStateRef.current.isReady !== currentFinalState.isReady ||
          prevFinalStateRef.current.isAuthInitialized !== currentFinalState.isAuthInitialized ||
          prevFinalStateRef.current.navigationComplete !== currentFinalState.navigationComplete ||
          prevFinalStateRef.current.assetsLoaded !== currentFinalState.assetsLoaded) {
        console.log('[Layout] Final render decision:', currentFinalState);
        prevFinalStateRef.current = currentFinalState;
      }
    }
  }, [forceRender, shouldShowContent, finalOpacity, isReady, isAuthInitialized, navigationComplete, assetsLoaded]);
  
  // Render if ready OR if we've hit the timeout
  // This prevents the app from being stuck on a black screen forever
  // IMPORTANT: All hooks must be called BEFORE this conditional return
  // After 1 second, always render (forceRender will be true)
  const shouldBlockRender = (!isAuthInitialized || !isReady) && !forceRender;
  
  if (shouldBlockRender) {
    // Show a loading screen with connection info instead of pure black
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 10, textAlign: 'center' }}>
          Loading MoveTogether...
        </Text>
        {__DEV__ && (
          <Text style={{ color: '#888888', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            If this persists, check Metro connection
          </Text>
        )}
      </View>
    );
  }
  
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, opacity: finalOpacity }}>
        <ThemeProvider value={FitnessDarkTheme}>
          <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            animation: 'none',
          }}
        />
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
        <Stack.Screen
          name="achievements"
          options={{
            headerShown: false,
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

// Error boundary component to catch crashes
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootLayout] Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 10, textAlign: 'center' }}>
            App Error
          </Text>
          <Text style={{ color: '#888888', fontSize: 12, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          {__DEV__ && (
            <Pressable
              onPress={() => this.setState({ hasError: false, error: null })}
              style={{ marginTop: 20, padding: 10, backgroundColor: '#FA114F', borderRadius: 8 }}
            >
              <Text style={{ color: '#FFFFFF' }}>Retry</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

export default function RootLayout() {
  // TEMPORARILY DISABLED: Testing if OneSignal is causing the crash
  // Initialize OneSignal when the app starts
  // useEffect(() => {
  //   initializeOneSignal();
  // }, []);

  return (
    <ErrorBoundary>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <CelebrationProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
            </CelebrationProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </KeyboardProvider>
    </ErrorBoundary>
  );
}
