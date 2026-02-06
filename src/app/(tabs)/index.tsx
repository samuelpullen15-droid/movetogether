import { View, ScrollView, Pressable, Dimensions, Modal, Image, Alert, RefreshControl, InteractionManager } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/Card';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useFitnessStore } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { fetchPendingInvitations, acceptInvitation, acceptInvitationWithoutBuyIn, declineInvitation, type CompetitionInvitation } from '@/lib/invitation-service';
import { syncAllActiveCompetitionsHealthData } from '@/lib/competition-service';
import { supabase } from '@/lib/supabase';
import { useFairPlay } from '@/hooks/useFairPlay';
import { SymbolView } from 'expo-symbols';
import { Watch, ChevronRight, X, Bell, CheckCircle, XCircle, Trophy, BellOff, Clock, Crown } from 'lucide-react-native';
import { StreakWidget, WeeklyChallengesWidget } from '@/components/home';
import { StreakCelebrationModal } from '@/components/StreakCelebrationModal';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { PrizeWinnerModal } from '@/components/PrizeWinnerModal';
import type { Milestone, StreakRewardType } from '@/hooks/useStreak';
import { usePrizeWins } from '@/hooks/usePrizeWins';
import { useTrialStatus } from '@/lib/trial-rewards';
import { checkNotificationPermission, requestNotificationPermission, isOneSignalConfigured } from '@/lib/onesignal-service';
import * as Haptics from 'expo-haptics';
import type { ImageSourcePropType } from 'react-native';

// Provider icon images (IDs use underscores: apple_health, fitbit, whoop, oura)
const PROVIDER_ICONS: Record<string, ImageSourcePropType> = {
  'apple_health': require('../../../assets/apple-health-icon.png'),
  'fitbit': require('../../../assets/fitbit-icon.png'),
  'whoop': require('../../../assets/whoop-icon.png'),
  'oura': require('../../../assets/oura-icon.png'),
};
import Animated, { FadeInDown, useSharedValue, useAnimatedScrollHandler, useAnimatedStyle } from 'react-native-reanimated';
import { heroEnter, sectionEnter, cardEnter, horizontalEnter, statEnter, staggerFade } from '@/lib/animations';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useThemeColors } from '@/lib/useThemeColors';
import { BottomSheetMethods } from '@gorhom/bottom-sheet';
import { BuyInPaymentSheet } from '@/components/BuyInPaymentSheet';
import { BuyInChoiceSheet } from '@/components/BuyInChoiceSheet';

const { width } = Dimensions.get('window');

// Competition card gradient colors
const COMPETITION_GRADIENTS = [
  ['#FA114F', '#FF6B9D'], // Red/Pink
  ['#3b82f6', '#60a5fa'], // Blue
  ['#8b5cf6', '#a78bfa'], // Purple
  ['#10b981', '#34d399'], // Green
  ['#f59e0b', '#fbbf24'], // Orange
  ['#ec4899', '#f472b6'], // Pink
  ['#14b8a6', '#2dd4bf'], // Teal
  ['#f43f5e', '#fb7185'], // Rose
];

// Get greeting based on time of day
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Good morning,';
  } else if (hour >= 12 && hour < 18) {
    return 'Good afternoon,';
  } else {
    return 'Good evening,';
  }
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const currentUser = useFitnessStore((s) => s.currentUser);
  const competitions = useFitnessStore((s) => s.competitions);
  // Use specific selectors to avoid re-renders when user object reference changes
  const userFirstName = useAuthStore((s) => s.user?.firstName);
  const userFullName = useAuthStore((s) => s.user?.fullName);
  const userUsername = useAuthStore((s) => s.user?.username);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const authUser = useAuthStore((s) => s.user);
  
  // Get display name - extract firstName from fullName (combined during onboarding) with fallbacks
  // Use a ref to maintain stable value and prevent flickering during profile load
  const displayNameRef = useRef<string | null>(null);
  
  const displayName = useMemo(() => {
    const computedName = userFirstName || 
                         (userFullName?.split(' ')[0]) || 
                         userUsername || 
                         null;
    
    // Once we have a non-null name, store it in the ref and keep using it
    // This prevents flickering back to "User" if the value temporarily becomes null
    if (computedName) {
      displayNameRef.current = computedName;
      return computedName;
    }
    
    // If we have a stored value, use it (prevents flicker to "User")
    if (displayNameRef.current) {
      return displayNameRef.current;
    }
    
    // Only show "User" as a last resort
    return 'User';
  }, [userFirstName, userFullName, userUsername]);

  // Health store integration
  const currentMetrics = useHealthStore((s) => s.currentMetrics);
  const goals = useHealthStore((s) => s.goals);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  const providers = useHealthStore((s) => s.providers);
  const syncHealthData = useHealthStore((s) => s.syncHealthData);
  const calculateStreak = useHealthStore((s) => s.calculateStreak);
  const pendingStreakMilestones = useHealthStore((s) => s.pendingStreakMilestones);
  const clearPendingStreakMilestones = useHealthStore((s) => s.clearPendingStreakMilestones);

  // Scroll-driven parallax for background image
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const bgParallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * 0.2 }],
  }));

  const connectedProvider = providers.find((p) => p.id === activeProvider);
  const hasConnectedProvider = activeProvider !== null;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  
  // Show connect prompt modal when user is authenticated but no provider connected
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const hasShownPromptRef = useRef(false);

  // Notification permission state
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean | null>(null);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);

  // Check if metrics are from today (in local timezone)
  // Persisted metrics from yesterday should not be displayed as today's activity
  const isMetricsFromToday = useMemo(() => {
    if (!currentMetrics?.lastUpdated) return false;
    const metricsDate = new Date(currentMetrics.lastUpdated);
    const now = new Date();
    return (
      metricsDate.getFullYear() === now.getFullYear() &&
      metricsDate.getMonth() === now.getMonth() &&
      metricsDate.getDate() === now.getDate()
    );
  }, [currentMetrics?.lastUpdated]);

  // Use health service data ONLY when provider is connected AND metrics are from today
  // Don't fall back to stale currentUser data - show 0 until fresh data loads
  const rawMoveCalories = hasConnectedProvider && isMetricsFromToday
    ? (currentMetrics?.activeCalories ?? 0)  // Only use health store data
    : (currentUser.moveCalories ?? 0);        // Only use currentUser if no provider
  const rawExerciseMinutes = hasConnectedProvider && isMetricsFromToday
    ? (currentMetrics?.exerciseMinutes ?? 0)
    : (currentUser.exerciseMinutes ?? 0);
  const rawStandHours = hasConnectedProvider && isMetricsFromToday
    ? (currentMetrics?.standHours ?? 0)
    : (currentUser.standHours ?? 0);

  const moveCalories = (typeof rawMoveCalories === 'number' && isFinite(rawMoveCalories) && rawMoveCalories >= 0) ? rawMoveCalories : 0;
  const exerciseMinutes = (typeof rawExerciseMinutes === 'number' && isFinite(rawExerciseMinutes) && rawExerciseMinutes >= 0) ? rawExerciseMinutes : 0;
  const standHours = (typeof rawStandHours === 'number' && isFinite(rawStandHours) && rawStandHours >= 0) ? rawStandHours : 0;

  // Memoize goals to prevent unnecessary recalculations
  const moveGoal = useMemo(() => 
    (typeof goals.moveCalories === 'number' && goals.moveCalories > 0) ? goals.moveCalories : 500,
    [goals.moveCalories]
  );
  const exerciseGoal = useMemo(() => 
    (typeof goals.exerciseMinutes === 'number' && goals.exerciseMinutes > 0) ? goals.exerciseMinutes : 30,
    [goals.exerciseMinutes]
  );
  const standGoal = useMemo(() => 
    (typeof goals.standHours === 'number' && goals.standHours > 0) ? goals.standHours : 12,
    [goals.standHours]
  );

  // Memoize progress calculations
  const moveProgress = useMemo(() => moveGoal > 0 ? Math.max(0, moveCalories / moveGoal) : 0, [moveCalories, moveGoal]);
  const exerciseProgress = useMemo(() => exerciseGoal > 0 ? Math.max(0, exerciseMinutes / exerciseGoal) : 0, [exerciseMinutes, exerciseGoal]);
  const standProgress = useMemo(() => standGoal > 0 ? Math.max(0, standHours / standGoal) : 0, [standHours, standGoal]);

  // Today's date string for end-date comparison (YYYY-MM-DD lexicographic)
  // This ensures competitions whose end_date has passed move to "Past" immediately,
  // even before the server cron job updates their status to "completed".
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Memoize active competitions filter — exclude ended competitions and seasonal events
  const activeCompetitions = useMemo(() =>
    competitions.filter((c) => c.status === 'active' && c.endDate >= todayStr && !c.isSeasonalEvent),
    [competitions, todayStr]
  );

  // 3-day cutoff for auto-archiving past competitions from the home screen
  const threeDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  }, []);

  // Memoize completed competitions (most recent first)
  // Includes server-confirmed completed AND locally-detected ended competitions
  // Excludes seasonal events and competitions that ended more than 3 days ago
  const completedCompetitions = useMemo(() =>
    competitions
      .filter((c) => (c.status === 'completed' || (c.status === 'active' && c.endDate < todayStr)) && !c.isSeasonalEvent && c.endDate >= threeDaysAgoStr)
      .sort((a, b) => b.endDate.localeCompare(a.endDate)),
    [competitions, todayStr, threeDaysAgoStr]
  );
  
  const [pendingInvitations, setPendingInvitations] = useState<CompetitionInvitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const buyInSheetRef = useRef<BottomSheetMethods>(null);
  const choiceSheetRef = useRef<BottomSheetMethods>(null);
  const [buyInData, setBuyInData] = useState<{
    competitionId: string;
    competitionName: string;
    buyInAmount: number;
    invitationId?: string;
  } | null>(null);
  const [choiceData, setChoiceData] = useState<{
    competitionId: string;
    competitionName: string;
    buyInAmount: number;
    invitationId: string;
  } | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Streak celebration modal state
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const [celebrationMilestone, setCelebrationMilestone] = useState<Milestone | null>(null);
  const [celebrationStreak, setCelebrationStreak] = useState(0);

  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);
  const isFetchingInStore = useFitnessStore((s) => s.isFetchingCompetitions);

  // Fair play acknowledgement for competition joining
  const { checkFairPlay, FairPlayModal } = useFairPlay();

  // Trial status for expired trial upgrade prompts
  const { recentlyExpiredTrial, dismissExpiredPrompt } = useTrialStatus();

  // Prize wins for showing celebration modal when user wins
  const { currentWin, dismissCurrentWin, claimPrize } = usePrizeWins();

  // Memoize user stats calculation
  const realTotalPoints = useMemo(() => {
    const userId = authUser?.id || currentUser.id;
    let totalPoints = 0;
    competitions.forEach((competition) => {
      const userParticipant = competition.participants.find((p) => p.id === userId);
      if (userParticipant) {
        totalPoints += userParticipant.points;
      }
    });
    return totalPoints;
  }, [competitions, authUser?.id, currentUser.id]);

  const hasFetchedCompetitionsRef = useRef<string | null>(null);
  const isFetchingCompetitionsRef = useRef<boolean>(false);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);

  // Track competitions changes - only in development
  useEffect(() => {
    if (__DEV__) {
      console.log('Home screen - competitions changed', { competitionsCount: competitions.length, activeCompetitionsCount: activeCompetitions.length });
    }
  }, [competitions.length, activeCompetitions.length]);

  // Load competitions when user is authenticated (only once per user)
  // Note: Auth store already fetches competitions on SIGNED_IN, so this is just a fallback
  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) {
      // Reset refs when user logs out
      hasFetchedCompetitionsRef.current = null;
      isFetchingCompetitionsRef.current = false;
      fetchPromiseRef.current = null;
      return;
    }

    const userId = authUser.id;
    const hasFetched = hasFetchedCompetitionsRef.current === userId;
    const isFetching = isFetchingCompetitionsRef.current;
    const hasActivePromise = fetchPromiseRef.current !== null;
    const hasCompetitions = competitions.length > 0;
    
    // Skip if already fetched, currently fetching, has competitions, or store is fetching
    if (hasFetched || isFetching || hasActivePromise || hasCompetitions || isFetchingInStore) {
      return;
    }

    // Set all refs IMMEDIATELY to prevent concurrent fetches
    fetchPromiseRef.current = Promise.resolve();
    hasFetchedCompetitionsRef.current = userId;
    isFetchingCompetitionsRef.current = true;
    
    fetchUserCompetitions(userId)
      .then(() => {
        isFetchingCompetitionsRef.current = false;
        fetchPromiseRef.current = null;
      })
      .catch((error) => {
        isFetchingCompetitionsRef.current = false;
        fetchPromiseRef.current = null;
        hasFetchedCompetitionsRef.current = null; // Allow retry on error
        console.error('Home screen - competitions fetch error', error);
      });
  }, [isAuthenticated, authUser?.id, competitions.length, isFetchingInStore, fetchUserCompetitions]);

  // Load pending invitations and refresh competitions when screen focuses
  const isInitialFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (authUser?.id) {
        const doFetch = () => {
          loadPendingInvitations();
          // Also refresh competitions to ensure we have the latest data
          fetchUserCompetitions(authUser.id);
        };

        if (isInitialFocusRef.current) {
          // On first mount, defer data fetching until UI is interactive
          isInitialFocusRef.current = false;
          InteractionManager.runAfterInteractions(() => {
            doFetch();
          });
        } else {
          doFetch();
        }
      }
    }, [authUser?.id, fetchUserCompetitions])
  );

  // Real-time subscription for competition invitations
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`invitations-${authUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competition_invitations',
          filter: `invitee_id=eq.${authUser.id}`,
        },
        (payload) => {
          console.log('[Home] Real-time invitation update:', payload.eventType);
          loadPendingInvitations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser?.id]);

  const loadPendingInvitations = async () => {
    if (!authUser?.id) return;
    setIsLoadingInvitations(true);
    try {
      const invitations = await fetchPendingInvitations(authUser.id);
      // Deduplicate by competition_id - keep only the most recent invitation per competition
      const uniqueInvitations = invitations.reduce((acc, inv) => {
        const existing = acc.find(i => i.competitionId === inv.competitionId);
        if (!existing) {
          acc.push(inv);
        }
        return acc;
      }, [] as CompetitionInvitation[]);
      setPendingInvitations(uniqueInvitations);
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  const handleAcceptInvitation = async (invitation: CompetitionInvitation) => {
    // Check fair play acknowledgement before joining first competition
    const canProceed = await checkFairPlay();
    if (!canProceed) {
      // User closed the modal without agreeing - don't proceed
      return;
    }

    const result = await acceptInvitation(invitation.id);

    if (result.requiresBuyIn && result.buyInAmount) {
      // Competition requires buy-in — show choice sheet (pay or join without)
      setChoiceData({
        competitionId: result.competitionId || '',
        competitionName: invitation.competition?.name || 'Competition',
        buyInAmount: result.buyInAmount,
        invitationId: invitation.id,
      });
      choiceSheetRef.current?.snapToIndex(0);
      return;
    }

    if (result.success) {
      // Remove invitation from list immediately for better UX
      setPendingInvitations(prev => prev.filter(inv => inv.id !== invitation.id));

      // Refresh competitions to show the new one
      if (authUser?.id) {
        const fetchUserCompetitions = useFitnessStore.getState().fetchUserCompetitions;
        await fetchUserCompetitions(authUser.id);
      }

      // Navigate to competition if competitionId is available
      if (result.competitionId) {
        router.push(`/competition-detail?id=${result.competitionId}`);
      }
    } else {
      Alert.alert('Error', result.error || 'Failed to accept invitation');
      // Reload invitations to ensure consistency
      await loadPendingInvitations();
    }
  };

  const handleBuyInSuccess = useCallback(() => {
    if (buyInData) {
      // Remove invitation from list
      if (buyInData.invitationId) {
        setPendingInvitations(prev => prev.filter(inv => inv.id !== buyInData.invitationId));
      }
      // Refresh competitions
      if (authUser?.id) {
        const fetchUserCompetitions = useFitnessStore.getState().fetchUserCompetitions;
        fetchUserCompetitions(authUser.id);
      }
      Alert.alert('Success', 'Payment complete! You have joined the competition.');
      if (buyInData.competitionId) {
        router.push(`/competition-detail?id=${buyInData.competitionId}`);
      }
      setBuyInData(null);
    }
  }, [buyInData, authUser?.id, router]);

  const handlePayToJoin = useCallback(() => {
    if (choiceData) {
      choiceSheetRef.current?.close();
      setBuyInData({
        ...choiceData,
      });
      setTimeout(() => buyInSheetRef.current?.snapToIndex(0), 300);
    }
  }, [choiceData]);

  const handleJoinWithout = useCallback(async () => {
    if (!choiceData) return;
    const result = await acceptInvitationWithoutBuyIn(choiceData.invitationId);
    choiceSheetRef.current?.close();
    setChoiceData(null);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingInvitations(prev => prev.filter(inv => inv.id !== choiceData.invitationId));
      if (authUser?.id) {
        const fetchUserCompetitions = useFitnessStore.getState().fetchUserCompetitions;
        fetchUserCompetitions(authUser.id);
      }
      Alert.alert('Joined!', 'You joined without the prize pool. You can opt in later from the competition page.');
      if (result.competitionId) {
        router.push(`/competition-detail?id=${result.competitionId}`);
      }
    } else {
      Alert.alert('Error', result.error || 'Failed to accept invitation');
    }
  }, [choiceData, authUser?.id, router]);

  const handleDeclineInvitation = async (invitation: CompetitionInvitation) => {
    const result = await declineInvitation(invitation.id);
    if (result.success) {
      // Remove from list
      setPendingInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
    } else {
      Alert.alert('Error', result.error || 'Failed to decline invitation');
    }
  };

  const handleManualSync = async () => {
    if (!hasConnectedProvider || !authUser?.id || isManualSyncing) {
      return;
    }

    console.log('[HomeScreen] Manual sync triggered');
    setIsManualSyncing(true);
    try {
      await syncHealthData(authUser.id, { showSpinner: true });
      await calculateStreak();
      console.log('[HomeScreen] Manual sync completed successfully');
    } catch (error) {
      console.error('[HomeScreen] Manual sync failed:', error);
      Alert.alert('Sync Error', 'Failed to sync health data. Please try again.');
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Pull-to-refresh handler - always shows indicator and refreshes all data
  const handlePullToRefresh = useCallback(async () => {
    if (isRefreshing) return;

    console.log('[HomeScreen] Pull-to-refresh triggered');
    setIsRefreshing(true);

    try {
      const refreshPromises: Promise<void>[] = [];

      // Refresh health data if provider is connected
      if (hasConnectedProvider && authUser?.id) {
        refreshPromises.push(
          syncHealthData(authUser.id, { showSpinner: false })
            .then(() => calculateStreak())
            .catch((e) => console.error('[HomeScreen] Health sync failed:', e))
        );

        // Also sync competition health data
        refreshPromises.push(
          syncAllActiveCompetitionsHealthData(authUser.id)
            .catch((e) => console.error('[HomeScreen] Competition health sync failed:', e))
        );
      }

      // Always refresh competitions and invitations
      if (authUser?.id) {
        refreshPromises.push(
          fetchUserCompetitions(authUser.id)
            .catch((e) => console.error('[HomeScreen] Competitions refresh failed:', e))
        );
        refreshPromises.push(
          loadPendingInvitations()
            .catch((e) => console.error('[HomeScreen] Invitations refresh failed:', e))
        );
      }

      // Ensure minimum refresh time so spinner is visible
      await Promise.all([
        Promise.all(refreshPromises),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
      console.log('[HomeScreen] Pull-to-refresh completed');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, hasConnectedProvider, authUser?.id, syncHealthData, calculateStreak, fetchUserCompetitions]);

  // Sync health data when tab comes into focus (on mount, tab switch, or return from background)
  // Use ref to prevent repeated calls if already syncing
  const isSyncingRef = useRef(false);
  const isInitialMountRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (hasConnectedProvider && authUser?.id && !isSyncingRef.current) {
        const doSync = () => {
          console.log('[HomeScreen] Tab focused - starting health data sync');
          isSyncingRef.current = true;

          // Sync personal health data
          syncHealthData(authUser.id).finally(() => {
            console.log('[HomeScreen] Health data sync completed');
            isSyncingRef.current = false;
          });
          calculateStreak();

          // Sync health data for all active competitions in background
          // This ensures leaderboard data is up to date when app opens
          syncAllActiveCompetitionsHealthData(authUser.id).catch((error) => {
            console.error('[HomeScreen] Competition health sync failed:', error);
          });
        };

        if (isInitialMountRef.current) {
          // On first mount, defer heavy sync until UI animations/interactions complete
          // This prevents the app from freezing for several seconds on startup
          isInitialMountRef.current = false;
          InteractionManager.runAfterInteractions(() => {
            setTimeout(doSync, 300);
          });
        } else {
          doSync();
        }
      }
    }, [hasConnectedProvider, authUser?.id, syncHealthData, calculateStreak])
  );

  // Debug: Log current metrics whenever they change
  useEffect(() => {
    if (hasConnectedProvider && currentMetrics) {
      console.log('[HomeScreen] Current metrics updated:', {
        activeCalories: currentMetrics.activeCalories,
        exerciseMinutes: currentMetrics.exerciseMinutes,
        standHours: currentMetrics.standHours,
        lastUpdated: currentMetrics.lastUpdated,
      });
      console.log('[HomeScreen] Calculated values for display:', {
        moveCalories,
        exerciseMinutes,
        standHours,
        moveProgress,
        exerciseProgress,
        standProgress,
      });
    }
  }, [currentMetrics, moveCalories, exerciseMinutes, standHours, moveProgress, exerciseProgress, standProgress, hasConnectedProvider]);

  // Show connect prompt when authenticated but no provider connected
  useEffect(() => {
    if (isAuthenticated && !hasConnectedProvider && !hasShownPromptRef.current) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        setShowConnectPrompt(true);
        hasShownPromptRef.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Reset prompt flag if provider gets connected
    if (hasConnectedProvider && hasShownPromptRef.current) {
      setShowConnectPrompt(false);
    }
  }, [isAuthenticated, hasConnectedProvider]);

  // Watch for streak milestones earned and show celebration modal
  useEffect(() => {
    if (pendingStreakMilestones && pendingStreakMilestones.length > 0) {
      // Show celebration for the first milestone (in case multiple were earned)
      const milestone = pendingStreakMilestones[0];
      setCelebrationMilestone({
        id: milestone.milestone_id,
        day_number: milestone.day_number,
        name: milestone.name,
        description: milestone.description,
        reward_type: milestone.reward_type as StreakRewardType,
        reward_value: milestone.reward_value || {},
        icon_name: milestone.icon_name,
        celebration_type: milestone.celebration_type,
        is_repeatable: false,
        repeat_interval: null,
      });
      setCelebrationStreak(milestone.day_number);
      setShowStreakCelebration(true);
    }
  }, [pendingStreakMilestones]);

  const handleCloseCelebration = useCallback(() => {
    setShowStreakCelebration(false);
    setCelebrationMilestone(null);
    clearPendingStreakMilestones();
  }, [clearPendingStreakMilestones]);

  // Check notification permission when screen focuses
  useFocusEffect(
    useCallback(() => {
      const checkPermission = async () => {
        if (isOneSignalConfigured()) {
          // Small delay to ensure OneSignal is initialized
          setTimeout(async () => {
            const hasPermission = await checkNotificationPermission();
            setHasNotificationPermission(hasPermission);
          }, 500);
        }
      };
      checkPermission();
    }, [])
  );

  const handleEnableNotifications = async () => {
    setIsRequestingNotifications(true);
    try {
      const granted = await requestNotificationPermission();
      setHasNotificationPermission(granted);
    } catch (error) {
      console.error('[HomeScreen] Error requesting notification permission:', error);
    } finally {
      setIsRequestingNotifications(false);
    }
  };

  // Handle upgrade prompt from expired trial
  const handleUpgradeFromTrial = useCallback(() => {
    dismissExpiredPrompt();
    router.push('/subscription');
  }, [dismissExpiredPrompt, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} pointerEvents="none">
        <Animated.Image
          source={require('../../../assets/AppHomeScreen.png')}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: width,
              height: width,
            },
            bgParallaxStyle,
          ]}
          resizeMode="cover"
        />
        {/* Fill color below image to handle scroll bounce */}
        <View
          style={{
            position: 'absolute',
            top: width,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.bg,
          }}
        />
      </View>

      {/* Content Layer - Scrollable */}
      <View style={{ flex: 1, zIndex: 1 }}>
        {/* Connect Prompt Modal */}
        <Modal
          visible={showConnectPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowConnectPrompt(false)}
        >
        <View className="flex-1 bg-black/80 dark:bg-black/80 items-center justify-center px-6">
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={{ backgroundColor: colors.card }}
            className="rounded-3xl p-6 w-full max-w-sm"
          >
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-blue-500/20 items-center justify-center mb-4">
                <Watch size={32} color="#3b82f6" />
              </View>
              <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">
                Connect Your Device
              </Text>
              <Text className="text-gray-600 dark:text-gray-400 text-center text-base">
                Connect Apple Health, Fitbit, Garmin, or other fitness devices to track your activity and compete with friends.
              </Text>
            </View>

            <View className="gap-3">
              <Pressable
                onPress={() => {
                  setShowConnectPrompt(false);
                  router.push('/connect-health');
                }}
                className="bg-blue-500 rounded-2xl py-4 items-center active:opacity-80"
              >
                <Text className="text-white text-base font-semibold">Connect Now</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowConnectPrompt(false)}
                className="bg-gray-200 dark:bg-gray-800 rounded-2xl py-4 items-center active:opacity-80"
              >
                <Text className="text-gray-700 dark:text-gray-300 text-base font-medium">Maybe Later</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Animated.ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.isDark ? '#FFFFFF' : '#000000'}
            colors={['#FA114F']}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
          <Animated.View entering={heroEnter}>
            <Text className="text-gray-500 dark:text-gray-300 text-base">{getGreeting()}</Text>
            <DisplayText className="text-black dark:text-white text-3xl font-bold mt-1">{displayName}</DisplayText>
          </Animated.View>
        </View>

        {/* Notification Permission Strip - Show if notifications not enabled */}
        {hasNotificationPermission === false && (
          <Animated.View
            entering={cardEnter(0)}
            className="mx-5 -mt-2 mb-4"
          >
            <Pressable
              onPress={handleEnableNotifications}
              disabled={isRequestingNotifications}
              className="active:opacity-80 overflow-hidden rounded-2xl"
            >
              <View
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(249, 115, 22, 0.3)',
                  borderWidth: 1.5,
                  borderColor: 'rgba(249, 115, 22, 0.5)',
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View className="w-9 h-9 rounded-full bg-orange-500/20 items-center justify-center">
                  <BellOff size={18} color="#f97316" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-black dark:text-white text-sm font-semibold">Enable Notifications</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-xs">
                    Get alerts for competitions & updates
                  </Text>
                </View>
                <ChevronRight size={18} color="#f97316" />
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* Connect Device Card - Show if no provider connected */}
        {!hasConnectedProvider && (
          <Animated.View
            entering={cardEnter(1)}
            className="mx-5 -mt-2 mb-4"
          >
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-80 overflow-hidden rounded-2xl"
            >
              <Card variant="elevated" radius={16} padding={16} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View className="w-12 h-12 rounded-full bg-blue-500/20 items-center justify-center">
                  <Watch size={24} color="#3b82f6" />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-black dark:text-white text-base font-semibold">Connect Your Device</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                    Sync Apple Watch, Fitbit, Garmin & more
                  </Text>
                </View>
                <ChevronRight size={20} color="#6b7280" />
              </Card>
            </Pressable>
          </Animated.View>
        )}

        {/* Connected Device Badge - Show if provider connected */}
        {hasConnectedProvider && connectedProvider && (
          <Animated.View
            entering={cardEnter(1)}
            className="mx-5 -mt-2 mb-4"
          >
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-80"
            >
              <View
                className="rounded-2xl px-4 py-3 flex-row items-center justify-between"
                style={{
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.5)',
                }}
              >
                <View className="flex-row items-center">
                  {PROVIDER_ICONS[connectedProvider.id] ? (
                    <Image
                      source={PROVIDER_ICONS[connectedProvider.id]}
                      className="w-8 h-8 rounded-lg"
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: connectedProvider.color + '20' }}
                    >
                      <Watch size={16} color={connectedProvider.color} />
                    </View>
                  )}
                  <View className="ml-3">
                    <Text className="text-black dark:text-white text-sm font-semibold">
                      {connectedProvider.name} Connected
                    </Text>
                    {currentMetrics?.lastUpdated && (
                      <Text className="text-gray-500 dark:text-gray-400 text-xs">
                        Last synced {new Date(currentMetrics.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                </View>
                <ChevronRight size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* Activity Rings Card */}
        <Animated.View
          entering={heroEnter}
          className="mx-5"
        >
          {hasConnectedProvider ? (
            <Pressable
              onPress={() => router.push('/activity-detail')}
              className="active:scale-[0.98] overflow-hidden rounded-3xl"
            >
              <Card variant="elevated" radius={24}>
                {/* Ring-colored accent strip */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <LinearGradient
                    colors={['#FA114F', '#92E82A', '#00D4FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: 3 }}
                  />
                </View>
                <View className="flex-row items-center justify-between mb-6">
                  <DisplayText className="text-black dark:text-white text-xl font-semibold">Today's Activity</DisplayText>
                  <ChevronRight size={20} color="#6b7280" />
                </View>

                <View className="flex-row items-center justify-between">
                  {/* Rings */}
                  <View className="items-center">
                    <TripleActivityRings
                      key="activity-rings-main"
                      size={width * 0.4}
                      moveProgress={moveProgress}
                      exerciseProgress={exerciseProgress}
                      standProgress={standProgress}
                      moveGoal={moveGoal}
                      exerciseGoal={exerciseGoal}
                      standGoal={standGoal}
                    />
                  </View>

                  {/* Stats */}
                  <View className="flex-1 ml-6 space-y-4">
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-ring-move/20 items-center justify-center">
                        <SymbolView name="figure.walk" size={20} tintColor="#FA114F" />
                      </View>
                      <View className="ml-3">
                        <AnimatedNumber
                          value={Math.floor(moveCalories)}
                          format={(n) => `${n}/${Math.floor(moveGoal)}`}
                          className="text-ring-move text-lg font-bold"
                        />
                        <Text className="text-gray-500 text-sm">MOVE</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-ring-exercise/20 items-center justify-center">
                        <SymbolView name="figure.run" size={20} tintColor="#92E82A" />
                      </View>
                      <View className="ml-3">
                        <AnimatedNumber
                          value={Math.round(exerciseMinutes)}
                          format={(n) => `${n}/${Math.round(exerciseGoal)}`}
                          className="text-ring-exercise text-lg font-bold"
                        />
                        <Text className="text-gray-500 text-sm">EXERCISE</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-ring-stand/20 items-center justify-center">
                        <SymbolView name="figure.stand" size={20} tintColor="#00D4FF" />
                      </View>
                      <View className="ml-3">
                        <AnimatedNumber
                          value={Math.round(standHours)}
                          format={(n) => `${n}/${Math.round(standGoal)}`}
                          className="text-ring-stand text-lg font-bold"
                        />
                        <Text className="text-gray-500 text-sm">STAND</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:scale-[0.98] overflow-hidden rounded-3xl"
            >
              <Card variant="elevated" radius={24} style={{ opacity: 0.6 }}>
                <View className="flex-row items-center justify-between mb-6">
                  <DisplayText className="text-black dark:text-white text-xl font-semibold">Today's Activity</DisplayText>
                  <ChevronRight size={20} color="#6b7280" />
                </View>

                <View className="flex-row items-center justify-between">
                  {/* Blurred Rings */}
                  <View className="items-center opacity-30">
                    <TripleActivityRings
                      key="activity-rings-placeholder"
                      size={width * 0.4}
                      moveProgress={0}
                      exerciseProgress={0}
                      standProgress={0}
                      showPercentage={false}
                    />
                  </View>

                  {/* Placeholder Message */}
                  <View className="flex-1 ml-6 items-center justify-center py-8">
                    <View className="w-16 h-16 rounded-full bg-gray-300/50 dark:bg-gray-700/50 items-center justify-center mb-4">
                      <Watch size={32} color="#6b7280" />
                    </View>
                    <Text className="text-gray-500 dark:text-gray-400 text-center text-base font-medium">
                      Connect a service or device to see activity
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        </Animated.View>

        {/* Movement Trail Streak Widget - DEV ONLY for now */}
        {__DEV__ && (
          <Animated.View
            entering={staggerFade(0, 200)}
            className="mx-5 mt-4"
          >
            <StreakWidget />
          </Animated.View>
        )}

        {/* Weekly Challenges Widget - Dev only until launch */}
        {__DEV__ && (
          <Animated.View
            entering={staggerFade(1, 200)}
            className="mx-5 mt-4"
          >
            <WeeklyChallengesWidget />
          </Animated.View>
        )}

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <Animated.View
            entering={sectionEnter}
            className="mt-6"
          >
            <View className="px-5 flex-row justify-between items-center mb-4">
              <View className="flex-row items-center">
                <View className="mr-2">
                  <Bell size={20} color="#FA114F" />
                </View>
                <DisplayText className="text-black dark:text-white text-xl font-semibold">Invitations</DisplayText>
              </View>
              <View className="bg-fitness-accent/20 px-3 py-1 rounded-full">
                <Text className="text-fitness-accent text-sm font-medium">{pendingInvitations.length}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {pendingInvitations.map((invitation, index) => (
                <Pressable
                  key={invitation.id}
                  className="mr-4 active:opacity-80"
                  style={{ width: width * 0.85 }}
                >
                  <LinearGradient
                    colors={['#FA114F', '#D10040']}
                    style={{ borderRadius: 20, padding: 20 }}
                  >
                    <View className="flex-row items-start justify-between mb-3">
                      <View className="flex-1">
                        <Text className="text-white text-lg font-semibold mb-1">
                          Competition Invitation
                        </Text>
                        {invitation.competition && (
                          <>
                            <Text className="text-white/90 text-base font-bold mb-1">
                              {invitation.competition.name || 'Unnamed Competition'}
                            </Text>
                            <Text className="text-white/70 text-sm">
                              {invitation.competition.description || ''}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>

                    <View className="flex-row items-center mb-4">
                      <Image
                        source={{ uri: invitation.inviterAvatar }}
                        className="w-10 h-10 rounded-full border-2 border-white/30"
                      />
                      <Text className="text-white/90 text-sm ml-3 flex-1">
                        <Text className="font-semibold">{invitation.inviterName}</Text> invited you
                      </Text>
                    </View>

                    <View className="flex-row" style={{ gap: 12 }}>
                      <Pressable
                        onPress={() => handleAcceptInvitation(invitation)}
                        className="flex-1 bg-white rounded-xl py-3 items-center active:opacity-80"
                      >
                        <CheckCircle size={20} color="#FA114F" />
                        <Text className="text-fitness-accent font-semibold mt-1">Accept</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeclineInvitation(invitation)}
                        className="flex-1 bg-white/20 rounded-xl py-3 items-center active:opacity-80"
                        style={{ marginLeft: 12 }}
                      >
                        <XCircle size={20} color="white" />
                        <Text className="text-white font-semibold mt-1">Decline</Text>
                      </Pressable>
                    </View>
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Active Competitions */}
        <Animated.View
          entering={sectionEnter}
          className="mt-6"
        >
          <View className="px-5 flex-row justify-between items-center mb-4">
            <DisplayText className="text-black dark:text-white text-xl font-semibold">Active Competitions</DisplayText>
            {activeCompetitions.length > 0 && (
              <Text className="text-gray-400 dark:text-gray-500 text-sm">{activeCompetitions.length} active</Text>
            )}
          </View>

          {activeCompetitions.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/compete')}
              className="mx-5 active:scale-[0.98] overflow-hidden rounded-3xl"
            >
              <Card variant="elevated">
                <View className="items-center">
                  <View className="w-16 h-16 rounded-full bg-gray-300/50 dark:bg-gray-700/50 items-center justify-center mb-4">
                    <Trophy size={32} color="#6b7280" />
                  </View>
                  <Text className="text-gray-500 dark:text-gray-400 text-center text-base font-medium mb-1">
                    No active competitions
                  </Text>
                  <View className="flex-row items-center mt-2">
                    <Text className="text-blue-500 dark:text-blue-400 text-base font-semibold">
                      Join one today
                    </Text>
                    <ChevronRight size={18} color="#60a5fa" className="ml-1" />
                  </View>
                </View>
              </Card>
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {activeCompetitions.map((competition, index) => {
                const userRank = competition.participants.findIndex((p) => p.id === currentUser.id) + 1;
                const leader = competition.participants[0] || null;
                const competitionPosition = index + 1;
                const gradientColors = COMPETITION_GRADIENTS[index % COMPETITION_GRADIENTS.length];

                // Calculate days remaining for "Ending soon" badge
                const endDateParts = (competition.endDate.includes('T') ? competition.endDate.split('T')[0] : competition.endDate).split('-').map(Number);
                const endLocal = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2], 23, 59, 59, 999);
                const daysLeft = Math.max(0, Math.ceil((endLocal.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const isEndingSoon = daysLeft > 0 && daysLeft <= 2;

                return (
                  <Pressable
                    key={competition.id}
                    className="mr-4 active:scale-[0.97]"
                    style={{ width: width * 0.7 }}
                    onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
                  >
                    <Card variant="elevated" noPadding accentGradient={[gradientColors[0], gradientColors[1]] as [string, string]} style={{ flex: 1 }}>
                      <View style={{ padding: 20, flex: 1, minHeight: 195 }}>
                        {isEndingSoon && (
                          <View className="flex-row items-center mb-2">
                            <View style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)' }} className="px-2.5 py-1 rounded-full flex-row items-center">
                              <Clock size={11} color="#f97316" />
                              <Text className="text-orange-500 text-xs font-semibold ml-1">Ending soon!</Text>
                            </View>
                          </View>
                        )}
                        <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1">
                          <DisplayText className="text-black dark:text-white text-lg font-semibold">{competition.name || 'Unnamed Competition'}</DisplayText>
                          <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">{competition.description || ''}</Text>
                        </View>
                        <View style={{ backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} className="px-3 py-1 rounded-full">
                          <Text className="text-black dark:text-white text-sm font-medium">#{competitionPosition}</Text>
                        </View>
                      </View>

                      <View className="flex-row items-center mt-3">
                        <View className="flex-row -space-x-2">
                          {competition.participants.slice(0, 4).map((p, i) => (
                            <View
                              key={p.id}
                              style={{ borderColor: colors.card, marginLeft: i > 0 ? -8 : 0 }}
                              className="w-8 h-8 rounded-full border-2 overflow-hidden"
                            >
                              {p.avatar ? (
                                <Image
                                  source={{ uri: p.avatar }}
                                  className="w-full h-full"
                                  resizeMode="cover"
                                />
                              ) : (
                                <View className="w-full h-full bg-gray-400 dark:bg-gray-600 items-center justify-center">
                                  <Text className="text-white text-xs font-bold">{(p.name || 'U')[0]}</Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                        <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">
                          {competition.participants.length} competing
                        </Text>
                      </View>

                      {leader && (
                        <View style={{ borderTopColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} className="mt-4 pt-4 border-t">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-gray-500 dark:text-gray-400 text-sm">Leader: {leader.name || 'Unknown'}</Text>
                            <Text className="text-black dark:text-white font-semibold">{leader.points || 0} pts</Text>
                          </View>
                        </View>
                      )}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* Past Competitions */}
        {completedCompetitions.length > 0 && (
          <Animated.View
            entering={sectionEnter}
            className="mt-6"
          >
            <View className="px-5 flex-row justify-between items-center mb-4">
              <DisplayText className="text-black dark:text-white text-xl font-semibold">Past Competitions</DisplayText>
              {completedCompetitions.length > 3 && (
                <Pressable onPress={() => router.push('/competition-history')}>
                  <Text className="text-blue-500 dark:text-blue-400 text-sm font-medium">View All</Text>
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {completedCompetitions.slice(0, 5).map((competition, index) => {
                const leader = competition.participants[0] || null;
                const userId = authUser?.id || currentUser.id;
                const userRank = competition.participants.findIndex((p) => p.id === userId) + 1;
                const gradientColors = COMPETITION_GRADIENTS[index % COMPETITION_GRADIENTS.length];
                const isConfirmedCompleted = competition.status === 'completed';

                return (
                  <Pressable
                    key={competition.id}
                    className="mr-4 active:scale-[0.97]"
                    style={{ width: width * 0.6 }}
                    onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
                  >
                    <Card variant="elevated" noPadding accentGradient={[gradientColors[0], gradientColors[1]] as [string, string]}>
                      <View style={{ padding: 16 }}>
                        {/* Status badge */}
                        <View className="flex-row items-center mb-2">
                          {isConfirmedCompleted ? (
                            <View style={{ backgroundColor: 'rgba(107, 114, 128, 0.15)' }} className="px-2.5 py-1 rounded-full flex-row items-center">
                              <Trophy size={11} color="#6b7280" />
                              <Text style={{ color: '#6b7280' }} className="text-xs font-semibold ml-1">Completed</Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)' }} className="px-2.5 py-1 rounded-full flex-row items-center">
                              <Clock size={11} color="#f97316" />
                              <Text className="text-orange-500 text-xs font-semibold ml-1">Calculating results...</Text>
                            </View>
                          )}
                        </View>

                        <View className="flex-row justify-between items-start">
                          <View className="flex-1">
                            <Text className="text-black dark:text-white text-base font-semibold" numberOfLines={1}>{competition.name || 'Unnamed Competition'}</Text>
                          </View>
                          {isConfirmedCompleted && userRank > 0 && (
                            <View style={{ backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} className="px-3 py-1 rounded-full ml-2">
                              <Text className="text-black dark:text-white text-sm font-medium">#{userRank}</Text>
                            </View>
                          )}
                        </View>

                        <View className="flex-row items-center mt-3">
                          <View className="flex-row -space-x-2">
                            {competition.participants.slice(0, 4).map((p, i) => (
                              <View
                                key={p.id}
                                style={{ borderColor: colors.card, marginLeft: i > 0 ? -8 : 0 }}
                                className="w-7 h-7 rounded-full border-2 overflow-hidden"
                              >
                                {p.avatar ? (
                                  <Image
                                    source={{ uri: p.avatar }}
                                    className="w-full h-full"
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <View className="w-full h-full bg-gray-400 dark:bg-gray-600 items-center justify-center">
                                    <Text className="text-white text-xs font-bold">{(p.name || 'U')[0]}</Text>
                                  </View>
                                )}
                              </View>
                            ))}
                          </View>
                          <Text className="text-gray-500 dark:text-gray-400 text-xs ml-3">
                            {competition.participants.length} competed
                          </Text>
                        </View>

                        {isConfirmedCompleted && leader && (
                          <View style={{ borderTopColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} className="mt-3 pt-3 border-t">
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center">
                                <Crown size={13} color="#FFD700" />
                                <Text className="text-gray-500 dark:text-gray-400 text-sm ml-1.5">
                                  {leader.id === userId ? 'You won!' : leader.name || 'Unknown'}
                                </Text>
                              </View>
                              <Text className="text-black dark:text-white text-sm font-semibold">{leader.points || 0} pts</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {/* Quick Stats */}
        <Animated.View
          entering={statEnter(300)}
          className="mx-5 mt-6"
        >
          <DisplayText className="text-black dark:text-white text-xl font-semibold mb-4">Your Stats</DisplayText>
          <View className="flex-row space-x-3">
            <Card variant="surface" style={{ flex: 1 }}>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">Total Points</Text>
              <AnimatedNumber value={realTotalPoints} className="text-black dark:text-white text-2xl font-bold mt-1" />
            </Card>
            <Card variant="surface" style={{ flex: 1 }}>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">Competitions</Text>
              <AnimatedNumber value={competitions.length} className="text-black dark:text-white text-2xl font-bold mt-1" />
            </Card>
          </View>
        </Animated.View>
      </Animated.ScrollView>
      </View>

      {/* Fair Play Modal for first competition join */}
      <FairPlayModal />

      {/* Streak Celebration Modal */}
      <StreakCelebrationModal
        visible={showStreakCelebration}
        milestone={celebrationMilestone}
        currentStreak={celebrationStreak}
        onClose={handleCloseCelebration}
        onClaimReward={handleCloseCelebration}
      />

      {/* Expired Trial Upgrade Prompt */}
      {recentlyExpiredTrial && (
        <UpgradePromptModal
          visible={!!recentlyExpiredTrial}
          expiredTrialType={recentlyExpiredTrial.type}
          onUpgrade={handleUpgradeFromTrial}
          onDismiss={dismissExpiredPrompt}
        />
      )}

      {/* Prize Winner Celebration Modal */}
      <PrizeWinnerModal
        visible={!!currentWin}
        prizeWin={currentWin}
        onClose={dismissCurrentWin}
        onClaim={claimPrize}
        onViewDetails={currentWin ? () => {
          dismissCurrentWin();
          router.push(`/competition-detail?id=${currentWin.competitionId}`);
        } : undefined}
      />

      {choiceData && (
        <BuyInChoiceSheet
          sheetRef={choiceSheetRef}
          competitionName={choiceData.competitionName}
          buyInAmount={choiceData.buyInAmount}
          onPayToJoin={handlePayToJoin}
          onJoinWithout={handleJoinWithout}
          onCancel={() => setChoiceData(null)}
        />
      )}

      {buyInData && (
        <BuyInPaymentSheet
          sheetRef={buyInSheetRef}
          competitionId={buyInData.competitionId}
          competitionName={buyInData.competitionName}
          buyInAmount={buyInData.buyInAmount}
          invitationId={buyInData.invitationId}
          onSuccess={handleBuyInSuccess}
          onCancel={() => setBuyInData(null)}
        />
      )}
    </View>
  );
}
