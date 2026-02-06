import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  Stack,
  useRouter,
  useSegments,
  useNavigationContainerRef,
} from "expo-router";
import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Animated,
  StyleSheet,
  Text,
  Pressable,
  useColorScheme,
  Image,
  Alert,
} from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Asset } from "expo-asset";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import Constants from "expo-constants";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StripeProvider } from '@stripe/stripe-react-native';
import {
  useFonts,
  StackSansText_400Regular,
  StackSansText_500Medium,
  StackSansText_600SemiBold,
  StackSansText_700Bold,
} from "@expo-google-fonts/stack-sans-text";
import {
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useAuthStore } from "@/lib/auth-store";
import { CelebrationProvider } from "@/lib/celebration-context";
// Lazy import health store to prevent blocking app startup
// import { useHealthStore } from '@/lib/health-store';
import { registerBackgroundSync } from "@/lib/background-sync-service";
import { initializeOneSignal } from "@/lib/onesignal-service";
import { initMixpanel } from "@/lib/coach-feedback-service";
import { useEffect, useState, useRef } from "react";
// Trust & Safety imports
import { ModerationProvider, useModeration } from "@/lib/moderation-context";
import { referralApi } from "@/lib/edge-functions";
import { BannedScreen } from "@/components/moderation/BannedScreen";
import { WarningBanner } from "@/components/moderation/WarningBanner";
import { startPresence, stopPresence } from "@/lib/presence-service";

// Stripe configuration
const STRIPE_PUBLISHABLE_KEY = "pk_test_51SuDdNAAYQ2JCjZHOfewyy7SrDJxxwYo3MKx6u80klCgXWDeNNWHO2mS81HXf7Qab20hWWqmNwR8W6YLMbvFgWDA003TGe7dxG"; // Replace with your actual key

export const unstable_settings = {
  // Start at root index which redirects to sign-in - prevents flash to (onboarding)
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Sentry navigation integration for performance tracing
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

// Initialize Sentry for error tracking and performance monitoring
Sentry.init({
  dsn: "https://bd6b7517f2c9e675912a619c8f3b8b25@o4510765508722688.ingest.us.sentry.io/4510765511278592",
  tracesSampleRate: 1.0,
  // Session Replay: 100% for testing (lower to 0.1 in production), 100% of sessions with errors
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    navigationIntegration,
    Sentry.feedbackIntegration({
      styles: {
        submitButton: {
          backgroundColor: "#FA114F",
        },
      },
      namePlaceholder: "Your name",
      emailPlaceholder: "your@email.com",
      messagePlaceholder: "Describe what happened or share your feedback...",
      submitButtonLabel: "Send Feedback",
      formTitle: "Send Feedback",
      successMessage: "Thank you for your feedback!",
    }),
    // Mobile Session Replay - masks all sensitive content by default
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
  ],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

const queryClient = new QueryClient();

// Preload these assets while splash is showing (must be at module level for Metro bundler)
const PRELOAD_ASSETS = [
  require("../../assets/sign-in-background.png"),
  require("../../assets/splash.png"),
];

// Custom themes for fitness app
// Created inside a function to avoid module-level initialization issues in production builds
const getFitnessThemes = () => {
  const darkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: "#000000",
      card: "#1C1C1E",
      primary: "#FA114F",
    },
  };

  const lightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#FFFFFF",
      card: "#FFFFFF",
      primary: "#FA114F",
    },
  };

  return { darkTheme, lightTheme };
};

const { darkTheme: FitnessDarkTheme, lightTheme: FitnessLightTheme } =
  getFitnessThemes();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const hasCompletedOnboarding = useOnboardingStore(
    (s) => s.hasCompletedOnboarding,
  );
  const onboardingHydrated = useOnboardingStore((s) => s._hasHydrated);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const hasAcceptedLegalTerms = useAuthStore((s) => s.hasAcceptedLegalTerms);
  const hasUnacknowledgedWarning = useAuthStore(
    (s) => s.hasUnacknowledgedWarning,
  );
  const hasActiveSuspension = useAuthStore((s) => s.hasActiveSuspension);
  const checkAccountStatus = useAuthStore((s) => s.checkAccountStatus);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const [isReady, setIsReady] = useState(false);
  const [waitingForProfile, setWaitingForProfile] = useState(false);
  const [profileLoadTimeout, setProfileLoadTimeout] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [navigationComplete, setNavigationComplete] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [forceRender, setForceRender] = useState(false);
  const [minSplashTimeElapsed, setMinSplashTimeElapsed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Trust & Safety: Get moderation status
  const { isRestricted, isLoading: isModerationLoading } = useModeration();

  // Select theme based on color scheme
  const theme = colorScheme === "dark" ? FitnessDarkTheme : FitnessLightTheme;

  // Preload critical assets (like sign-in background) while splash is showing
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        await Asset.loadAsync(PRELOAD_ASSETS);
        setAssetsLoaded(true);
      } catch (e) {
        // If preloading fails, continue anyway
        if (__DEV__) console.log("Asset preload failed:", e);
        setAssetsLoaded(true);
      }
    };
    preloadAssets();
  }, []);

  // Ensure minimum splash display time so the animated overlay has time to render
  // This prevents instant disappearance when auth state is persisted and conditions are met quickly
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinSplashTimeElapsed(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Initialize auth on mount with error handling
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        await initializeAuth();
      } catch (error) {
        console.error("[Layout] Auth initialization failed:", error);
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

  // Check account status (warnings/suspensions) when user is authenticated
  const accountStatusCheckedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isAuthInitialized &&
      user?.id &&
      !accountStatusCheckedRef.current
    ) {
      accountStatusCheckedRef.current = true;
      checkAccountStatus().catch((e) => {
        console.error("[Layout] Account status check failed:", e);
      });
    }
    // Reset when user logs out
    if (!isAuthenticated) {
      accountStatusCheckedRef.current = false;
    }
  }, [isAuthenticated, isAuthInitialized, user?.id, checkAccountStatus]);

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
        console.warn("[Layout] Auth safety timeout - forcing isReady");
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
        console.warn(
          "[Layout] Profile load timeout after 3s - proceeding without profile",
        );
        setProfileLoadTimeout(true);
        // Force navigation to proceed
        setNavigationComplete(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, isProfileLoaded, profileLoadTimeout]);

  // Initialize subscription when user logs in (check RevenueCat)
  // Note: Auth listener also calls initializeSubscription, but we call it here as a fallback
  // The subscription store handles idempotency internally
  // DEFERRED: Wait 2 seconds to avoid blocking keyboard/input interactions
  const subscriptionInitializedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isReady &&
      isAuthInitialized &&
      user?.id &&
      !subscriptionInitializedRef.current
    ) {
      subscriptionInitializedRef.current = true;
      // Delay subscription init to avoid blocking UI interactions
      const timer = setTimeout(() => {
        import("@/lib/subscription-store")
          .then(({ useSubscriptionStore }) => {
            try {
              const store = useSubscriptionStore.getState();
              Promise.resolve(store.initializeSubscription()).catch((e) =>
                console.error("[Layout] initializeSubscription failed:", e),
              );
            } catch (e) {
              console.error(
                "[Layout] Subscription store initialization failed:",
                e,
              );
            }
          })
          .catch((e) => {
            console.error("[Layout] Failed to load subscription store:", e);
          });
      }, 2000);
      return () => clearTimeout(timer);
    }
    // Reset ref when user logs out
    if (!isAuthenticated) {
      subscriptionInitializedRef.current = false;
    }
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id]);

  // Identify user to Mixpanel when authenticated
  // DEFERRED: Wait 3 seconds to avoid blocking UI interactions
  const mixpanelIdentifiedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isReady &&
      isAuthInitialized &&
      user?.id &&
      !mixpanelIdentifiedRef.current
    ) {
      mixpanelIdentifiedRef.current = true;
      const timer = setTimeout(() => {
        import("@/lib/coach-feedback-service")
          .then(({ identifyUser }) => {
            identifyUser(user.id, {
              $email: user.email,
              $name: user.fullName,
            });
          })
          .catch((e) => {
            console.error("[Layout] Failed to identify user to Mixpanel:", e);
          });
      }, 3000);
      return () => clearTimeout(timer);
    }
    if (!isAuthenticated) {
      mixpanelIdentifiedRef.current = false;
    }
  }, [
    isAuthenticated,
    isReady,
    isAuthInitialized,
    user?.id,
    user?.email,
    user?.fullName,
  ]);

  // Presence heartbeat system - sends updates every 30s while app is active
  // This powers real-time "Online" / "5m ago" status for friends
  const presenceStartedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isReady &&
      isAuthInitialized &&
      user?.id &&
      !presenceStartedRef.current
    ) {
      presenceStartedRef.current = true;
      // Start presence heartbeat (handles app state changes internally)
      startPresence();
    }

    if (!isAuthenticated && presenceStartedRef.current) {
      // User logged out - stop presence
      presenceStartedRef.current = false;
      stopPresence();
    }

    return () => {
      // Cleanup on unmount
      if (presenceStartedRef.current) {
        stopPresence();
      }
    };
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id]);

  // Load goals immediately when user logs in (lightweight operation)
  useEffect(() => {
    if (isAuthenticated && isReady && isAuthInitialized && user?.id) {
      // Goals load is fast - do it immediately so home screen shows correct values
      import("@/lib/health-service")
        .then(({ useHealthStore }) => {
          const store = useHealthStore.getState();
          Promise.resolve(store.loadGoals(user.id)).catch((e) =>
            console.error("[Layout] loadGoals failed:", e),
          );
        })
        .catch((e) => {
          console.error("[Layout] Failed to load goals:", e);
        });
    }
  }, [isAuthenticated, isReady, isAuthInitialized, user?.id]);

  // Restore health provider connection and other heavy operations when user logs in
  // Use dynamic import to prevent blocking app startup
  // DEFERRED: Wait 2.5 seconds to avoid blocking UI interactions
  useEffect(() => {
    if (isAuthenticated && isReady && isAuthInitialized && user?.id) {
      // Dynamically import health store to prevent blocking
      // Wrap in timeout to prevent freezing the app
      const healthInitTimeout = setTimeout(() => {
        import("@/lib/health-service")
          .then(({ useHealthStore }) => {
            try {
              const store = useHealthStore.getState();
              // Sync health data - already deferred internally
              // Wrap each call in try-catch to prevent crashes
              Promise.resolve(store.restoreProviderConnection()).catch((e) =>
                console.error("[Layout] restoreProviderConnection failed:", e),
              );
              Promise.resolve(store.loadWeightGoal(user.id)).catch((e) =>
                console.error("[Layout] loadWeightGoal failed:", e),
              );
              Promise.resolve(store.loadCustomStartWeight(user.id)).catch((e) =>
                console.error("[Layout] loadCustomStartWeight failed:", e),
              );
            } catch (e) {
              console.error("[Layout] Health store initialization failed:", e);
            }
          })
          .catch((e) => {
            console.error("[Layout] Failed to load health service:", e);
          });
      }, 2500); // Delay health initialization to let UI interactions work first

      return () => clearTimeout(healthInitTimeout);
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

  // Check for pending invite codes after authentication
  const pendingInviteCheckedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isAuthInitialized &&
      isReady &&
      hasCompletedOnboarding &&
      !pendingInviteCheckedRef.current
    ) {
      pendingInviteCheckedRef.current = true;
      // Check for pending invite code from deep link
      const checkPendingInvite = async () => {
        try {
          const pendingCode = await AsyncStorage.getItem('pending_invite_code');
          if (pendingCode) {
            // Clear the pending invite
            await AsyncStorage.removeItem('pending_invite_code');
            // Navigate to join screen after a short delay to ensure navigation is ready
            setTimeout(() => {
              router.push(`/join/${pendingCode}`);
            }, 500);
          }
        } catch (e) {
          console.error('[Layout] Error checking pending invite:', e);
        }
      };
      checkPendingInvite();
    }
    if (!isAuthenticated) {
      pendingInviteCheckedRef.current = false;
    }
  }, [isAuthenticated, isAuthInitialized, isReady, hasCompletedOnboarding, router]);

  // Check for pending referral codes after authentication + onboarding
  const pendingReferralCheckedRef = useRef(false);
  useEffect(() => {
    if (
      isAuthenticated &&
      isAuthInitialized &&
      isReady &&
      hasCompletedOnboarding &&
      !pendingReferralCheckedRef.current
    ) {
      pendingReferralCheckedRef.current = true;
      const checkPendingReferral = async () => {
        try {
          const pendingCode = await AsyncStorage.getItem('pending_referral_code');
          if (pendingCode) {
            await AsyncStorage.removeItem('pending_referral_code');

            // Register the referral
            const { data, error } = await referralApi.registerReferral(pendingCode);
            if (!error && data?.success) {
              // Process rewards immediately since onboarding is complete
              const { data: rewardData } = await referralApi.processReferralRewards();
              if (rewardData?.rewards_granted?.referee_reward) {
                Alert.alert(
                  'Referral Accepted!',
                  'Your 7-day Mover trial has been activated. Enjoy unlimited competitions!',
                  [{ text: 'Great!' }]
                );
              }
            }
          }
        } catch (e) {
          console.error('[Layout] Error checking pending referral:', e);
        }
      };
      checkPendingReferral();
    }
    if (!isAuthenticated) {
      pendingReferralCheckedRef.current = false;
    }
  }, [isAuthenticated, isAuthInitialized, isReady, hasCompletedOnboarding]);

  // Handle smooth fade transition from splash to app
  useEffect(() => {
    if (
      isReady &&
      isAuthInitialized &&
      navigationComplete &&
      assetsLoaded &&
      minSplashTimeElapsed &&
      !splashHidden
    ) {
      // All ready - hide native splash and fade to content
      SplashScreen.hideAsync().then(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          setSplashHidden(true);
        });
      });
    }
  }, [
    isReady,
    isAuthInitialized,
    navigationComplete,
    assetsLoaded,
    minSplashTimeElapsed,
    splashHidden,
    fadeAnim,
  ]);

  // Navigation logic using useEffect to handle state changes
  // Use useRef to track if we've already navigated to prevent duplicate navigations
  const hasNavigatedRef = useRef(false);
  const lastTargetSegmentRef = useRef<string | null>(null);
  const isNavigatingRef = useRef(false);
  const prevIsAuthenticatedRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Reset navigation tracking when auth state changes
    // This ensures navigation can proceed after sign-in/sign-out
    if (
      prevIsAuthenticatedRef.current !== null &&
      prevIsAuthenticatedRef.current !== isAuthenticated
    ) {
      if (__DEV__) console.log("[Layout] Auth state changed, resetting navigation refs");
      lastTargetSegmentRef.current = null;
      isNavigatingRef.current = false;
    }
    prevIsAuthenticatedRef.current = isAuthenticated;

    // Prevent concurrent navigation attempts
    if (isNavigatingRef.current) {
      return;
    }

    // If forceRender is true, skip most checks and just navigate
    // For authenticated users, always assume onboarding is complete (safer for existing users)
    if (forceRender && !navigationComplete) {
      // For authenticated users, always go to tabs (not onboarding) to prevent redirect issues
      const onboardingDone = isAuthenticated ? true : hasCompletedOnboarding;
      const legalAccepted = hasAcceptedLegalTerms;
      let targetSegment: string;
      if (!isAuthenticated) {
        targetSegment = "sign-in";
      } else if (!legalAccepted) {
        targetSegment = "legal-agreement";
      } else if (hasActiveSuspension) {
        targetSegment = "account-suspended";
      } else if (hasUnacknowledgedWarning) {
        targetSegment = "account-warning";
      } else if (onboardingDone) {
        targetSegment = "(tabs)";
      } else {
        targetSegment = "(onboarding)";
      }

      if (__DEV__) console.log("[Layout] Force render navigation:", {
        isAuthenticated,
        legalAccepted,
        hasActiveSuspension,
        hasUnacknowledgedWarning,
        onboardingDone,
        targetSegment,
      });

      // Only navigate if target changed
      if (lastTargetSegmentRef.current !== targetSegment) {
        isNavigatingRef.current = true;
        if (targetSegment === "sign-in") {
          router.replace("/sign-in");
        } else if (targetSegment === "legal-agreement") {
          router.replace("/legal-agreement");
        } else if (targetSegment === "account-suspended") {
          router.replace("/account-suspended");
        } else if (targetSegment === "account-warning") {
          router.replace("/account-warning");
        } else if (targetSegment === "(tabs)") {
          router.replace("/(tabs)");
        } else {
          router.replace("/(onboarding)");
        }
        lastTargetSegmentRef.current = targetSegment;
        // Reset navigation flag after a delay
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 300);
      }
      setNavigationComplete(true);
      return;
    }

    if (!isReady || !isAuthInitialized) {
      return;
    }

    // For authenticated users, wait for profile to be loaded before deciding onboarding
    // But don't wait forever - use the timeout flag as a fallback
    const currentSegment = segments[0];

    if (isAuthenticated && !isProfileLoaded && !profileLoadTimeout) {
      // Still waiting for profile - don't navigate yet
      return;
    }

    // Wait for onboarding store to hydrate from AsyncStorage before making navigation decisions
    // This prevents using the default value (false) before the persisted value is loaded
    if (!onboardingHydrated && !profileLoadTimeout) {
      if (__DEV__) console.log('[Layout] Waiting for onboarding store to hydrate...');
      return;
    }

    // For authenticated users, default to assuming onboarding is complete
    // This prevents existing users from being incorrectly redirected to onboarding
    // when there are profile load errors or state sync issues
    const onboardingDone = isAuthenticated ? (hasCompletedOnboarding || !onboardingHydrated) : hasCompletedOnboarding;
    if (__DEV__) console.log('[Layout] Onboarding state:', { hasCompletedOnboarding, onboardingHydrated, isAuthenticated, onboardingDone });
    const legalAccepted = hasAcceptedLegalTerms;

    // Determine where we SHOULD be for the MAIN flow screens
    // Flow: sign-in → legal-agreement → account-suspended/account-warning → (onboarding) → (tabs)
    let targetSegment: string;
    if (!isAuthenticated) {
      targetSegment = "sign-in";
    } else if (!legalAccepted) {
      targetSegment = "legal-agreement";
    } else if (hasActiveSuspension) {
      targetSegment = "account-suspended";
    } else if (hasUnacknowledgedWarning) {
      targetSegment = "account-warning";
    } else if (onboardingDone) {
      targetSegment = "(tabs)";
    } else {
      targetSegment = "(onboarding)";
    }

    // If segments haven't loaded yet (undefined), navigate immediately
    if (currentSegment === undefined) {
      // Only navigate if target changed
      if (lastTargetSegmentRef.current !== targetSegment) {
        isNavigatingRef.current = true;
        if (targetSegment === "sign-in") {
          router.replace("/sign-in");
        } else if (targetSegment === "legal-agreement") {
          router.replace("/legal-agreement");
        } else if (targetSegment === "account-suspended") {
          router.replace("/account-suspended");
        } else if (targetSegment === "account-warning") {
          router.replace("/account-warning");
        } else if (targetSegment === "(tabs)") {
          router.replace("/(tabs)");
        } else {
          router.replace("/(onboarding)");
        }
        lastTargetSegmentRef.current = targetSegment;
        setTimeout(() => {
          isNavigatingRef.current = false;
          setNavigationComplete(true);
        }, 300);
      }
      return;
    }

    // Only enforce navigation for the main flow screens (index, sign-in, legal-agreement, account screens, tabs, onboarding)
    // Don't redirect from other screens like settings, friends, etc.
    const mainFlowScreens = [
      "index",
      "sign-in",
      "legal-agreement",
      "account-warning",
      "account-suspended",
      "(tabs)",
      "(onboarding)",
      undefined,
    ];
    const isOnMainFlowScreen = mainFlowScreens.includes(currentSegment);

    // If we're on a main flow screen but not the correct one, navigate there
    if (isOnMainFlowScreen && currentSegment !== targetSegment) {
      // Only navigate if target changed to prevent loops
      if (lastTargetSegmentRef.current !== targetSegment) {
        if (__DEV__) console.log(
          "[Layout] Navigating from",
          currentSegment,
          "to",
          targetSegment,
        );
        isNavigatingRef.current = true;
        if (targetSegment === "sign-in") {
          router.replace("/sign-in");
        } else if (targetSegment === "legal-agreement") {
          router.replace("/legal-agreement");
        } else if (targetSegment === "account-suspended") {
          router.replace("/account-suspended");
        } else if (targetSegment === "account-warning") {
          router.replace("/account-warning");
        } else if (targetSegment === "(tabs)") {
          router.replace("/(tabs)");
        } else {
          router.replace("/(onboarding)");
        }
        lastTargetSegmentRef.current = targetSegment;
        setTimeout(() => {
          isNavigatingRef.current = false;
          setNavigationComplete(true);
        }, 300);
      }
      // If lastTargetSegmentRef matches but we're still not on the right screen,
      // just wait - the navigation is probably still in progress
    } else if (currentSegment === targetSegment) {
      // We're on the correct screen
      if (!navigationComplete) {
        setNavigationComplete(true);
      }
    }
  }, [
    isAuthenticated,
    hasCompletedOnboarding,
    hasAcceptedLegalTerms,
    hasUnacknowledgedWarning,
    hasActiveSuspension,
    segments,
    isReady,
    isAuthInitialized,
    isProfileLoaded,
    profileLoadTimeout,
    router,
    forceRender,
  ]);

  // Safety timeout: Force render after 3 seconds to prevent permanent black screen
  // Increased from 1.5s to 3s to give profile API time to complete
  // Only trigger if things haven't resolved naturally
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only force if not already complete
      if (!navigationComplete || !assetsLoaded) {
        console.warn(
          "[Layout] Safety timeout - forcing render after 3 seconds",
        );
        setForceRender(true);
        setIsReady(true);
        setNavigationComplete(true);
        setAssetsLoaded(true);
        setMinSplashTimeElapsed(true);
        setProfileLoadTimeout(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigationComplete, assetsLoaded]);

  // Calculate if we should show the content (either everything is ready OR we forced render)
  const shouldShowContent = forceRender || (navigationComplete && assetsLoaded);

  // Always render the Stack - opacity just controls visibility
  // If forceRender is true, always show content (don't wait for navigationComplete)
  const finalOpacity = forceRender ? 1 : shouldShowContent ? 1 : 0;

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
      if (
        !prevStateRef.current ||
        prevStateRef.current.isReady !== currentState.isReady ||
        prevStateRef.current.isAuthInitialized !==
          currentState.isAuthInitialized ||
        prevStateRef.current.forceRender !== currentState.forceRender ||
        prevStateRef.current.navigationComplete !==
          currentState.navigationComplete ||
        prevStateRef.current.assetsLoaded !== currentState.assetsLoaded ||
        prevStateRef.current.currentSegment !== currentState.currentSegment
      ) {
        if (__DEV__) console.log("[Layout] Render state:", {
          ...currentState,
          shouldShowContent,
        });
        prevStateRef.current = currentState;
      }
    }
  }, [
    isReady,
    isAuthInitialized,
    forceRender,
    navigationComplete,
    assetsLoaded,
    shouldShowContent,
    segments,
  ]);

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
      if (
        !prevFinalStateRef.current ||
        prevFinalStateRef.current.forceRender !==
          currentFinalState.forceRender ||
        prevFinalStateRef.current.shouldShowContent !==
          currentFinalState.shouldShowContent ||
        prevFinalStateRef.current.finalOpacity !==
          currentFinalState.finalOpacity ||
        prevFinalStateRef.current.isReady !== currentFinalState.isReady ||
        prevFinalStateRef.current.isAuthInitialized !==
          currentFinalState.isAuthInitialized ||
        prevFinalStateRef.current.navigationComplete !==
          currentFinalState.navigationComplete ||
        prevFinalStateRef.current.assetsLoaded !==
          currentFinalState.assetsLoaded
      ) {
        if (__DEV__) console.log("[Layout] Final render decision:", currentFinalState);
        prevFinalStateRef.current = currentFinalState;
      }
    }
  }, [
    forceRender,
    shouldShowContent,
    finalOpacity,
    isReady,
    isAuthInitialized,
    navigationComplete,
    assetsLoaded,
  ]);

  // Render if ready OR if we've hit the timeout
  // This prevents the app from being stuck on a black screen forever
  // IMPORTANT: All hooks must be called BEFORE this conditional return
  // After 1 second, always render (forceRender will be true)
  const shouldBlockRender = (!isAuthInitialized || !isReady) && !forceRender;

  if (shouldBlockRender) {
    // Show a loading screen with connection info instead of pure black
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 18,
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          Loading MoveTogether...
        </Text>
        {__DEV__ && (
          <Text
            style={{
              color: "#888888",
              fontSize: 12,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            If this persists, check Metro connection
          </Text>
        )}
      </View>
    );
  }

  // Trust & Safety: BannedScreen is now shown as an overlay below, not a blocking return
  // This allows the moderation check to happen in the background while the user logs in

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, opacity: finalOpacity }}>
        <ThemeProvider value={theme}>
          <Stack>
            <Stack.Screen
              name="index"
              options={{
                headerShown: false,
                animation: "none",
              }}
            />
            <Stack.Screen
              name="sign-in"
              options={{
                headerShown: false,
                gestureEnabled: false,
                animation: "none",
              }}
            />
            <Stack.Screen
              name="legal-agreement"
              options={{
                headerShown: false,
                gestureEnabled: false,
                animation: "none",
              }}
            />
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
                animation: "none",
              }}
            />
            <Stack.Screen
              name="(onboarding)"
              options={{
                headerShown: false,
                gestureEnabled: false,
                animation: "none",
              }}
            />
            <Stack.Screen name="modal" options={{ presentation: "modal" }} />
            <Stack.Screen
              name="connect-health"
              options={{
                headerShown: false,
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="create-competition"
              options={{
                headerShown: false,
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="edit-competition"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="discover-competitions"
              options={{
                headerShown: false,
                presentation: "modal",
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
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="achievements"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="challenges"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="notification-settings"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="privacy-settings"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="blocked-users"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="data-export"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="delete-account"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="help-support"
              options={{
                headerShown: false,
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="join/[code]"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="referral/[code]"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="competition-history"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="messages"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="conversation"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="store"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="coin-bundles"
              options={{
                headerShown: false,
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="coin-history"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="inventory"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="weekly-recap"
              options={{
                headerShown: false,
                presentation: "fullScreenModal",
                animation: "fade",
              }}
            />
          </Stack>
        </ThemeProvider>
      </View>

      {/* Warning Banner for users with warnings */}
      <WarningBanner />

      {/* Trust & Safety: Show BannedScreen overlay if user is restricted (banned or suspended) */}
      {/* This shows after login completes, not blocking the initial navigation */}
      {isAuthenticated && !isModerationLoading && isRestricted && (
        <View style={StyleSheet.absoluteFill}>
          <BannedScreen />
        </View>
      )}

      {!splashHidden && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fadeAnim,
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={require("../../assets/splash.png")}
            style={{
              width: "100%",
              height: "100%",
              resizeMode: "cover",
            }}
          />
        </Animated.View>
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
    console.error("[RootLayout] Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "#000000",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 18,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            App Error
          </Text>
          <Text style={{ color: "#888888", fontSize: 12, textAlign: "center" }}>
            {this.state.error?.message || "Unknown error"}
          </Text>
          {__DEV__ && (
            <Pressable
              onPress={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: 20,
                padding: 10,
                backgroundColor: "#FA114F",
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#FFFFFF" }}>Retry</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

function RootLayout() {
  const colorScheme = useColorScheme();
  const navigationRef = useNavigationContainerRef();

  const [fontsLoaded] = useFonts({
    StackSansText_400Regular,
    StackSansText_500Medium,
    StackSansText_600SemiBold,
    StackSansText_700Bold,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  // Register navigation container with Sentry for performance tracing
  useEffect(() => {
    if (navigationRef) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  // Initialize OneSignal when the app starts
  useEffect(() => {
    initializeOneSignal();
  }, []);

  // Initialize Mixpanel for analytics
  useEffect(() => {
    initMixpanel();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
              <StripeProvider
                publishableKey={STRIPE_PUBLISHABLE_KEY}
                merchantIdentifier="merchant.studio.designspark.movetogether"
                urlScheme="movetogether"
              >
                <CelebrationProvider>
                  <ModerationProvider>
                    <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
                    <RootLayoutNav />
                  </ModerationProvider>
                </CelebrationProvider>
              </StripeProvider>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </KeyboardProvider>
    </ErrorBoundary>
  );
}

// Wrap with Sentry for error boundary and performance monitoring
export default Sentry.wrap(RootLayout);