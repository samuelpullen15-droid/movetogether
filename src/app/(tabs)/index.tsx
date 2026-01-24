import { View, ScrollView, Pressable, Dimensions, Modal, Image, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useFitnessStore } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { fetchPendingInvitations, acceptInvitation, declineInvitation, type CompetitionInvitation } from '@/lib/invitation-service';
import { supabase } from '@/lib/supabase';
import { useFairPlay } from '@/hooks/useFairPlay';
import { Flame, Timer, Activity, TrendingUp, Watch, ChevronRight, X, Bell, CheckCircle, XCircle, Trophy, RefreshCw } from 'lucide-react-native';
import type { ImageSourcePropType } from 'react-native';

// Provider icon images (IDs use underscores: apple_health, fitbit, whoop, oura)
const PROVIDER_ICONS: Record<string, ImageSourcePropType> = {
  'apple_health': require('../../../assets/apple-health-icon.png'),
  'fitbit': require('../../../assets/fitbit-icon.png'),
  'whoop': require('../../../assets/whoop-icon.png'),
  'oura': require('../../../assets/oura-icon.png'),
};
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useThemeColors } from '@/lib/useThemeColors';

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
  const activityStreak = useHealthStore((s) => s.activityStreak);
  const calculateStreak = useHealthStore((s) => s.calculateStreak);

  const connectedProvider = providers.find((p) => p.id === activeProvider);
  const hasConnectedProvider = activeProvider !== null;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  
  // Show connect prompt modal when user is authenticated but no provider connected
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const hasShownPromptRef = useRef(false);

  // Use health service data ONLY when provider is connected
  // Don't fall back to stale currentUser data - show 0 until fresh data loads
  const rawMoveCalories = hasConnectedProvider 
    ? (currentMetrics?.activeCalories ?? 0)  // Only use health store data
    : (currentUser.moveCalories ?? 0);        // Only use currentUser if no provider
  const rawExerciseMinutes = hasConnectedProvider 
    ? (currentMetrics?.exerciseMinutes ?? 0)
    : (currentUser.exerciseMinutes ?? 0);
  const rawStandHours = hasConnectedProvider 
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

  // Memoize active competitions filter
  const activeCompetitions = useMemo(() => competitions.filter((c) => c.status === 'active'), [competitions]);
  
  const [pendingInvitations, setPendingInvitations] = useState<CompetitionInvitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);
  const isFetchingInStore = useFitnessStore((s) => s.isFetchingCompetitions);

  // Fair play acknowledgement for competition joining
  const { checkFairPlay, FairPlayModal } = useFairPlay();

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
  useFocusEffect(
    useCallback(() => {
      if (authUser?.id) {
        loadPendingInvitations();
        // Also refresh competitions to ensure we have the latest data
        fetchUserCompetitions(authUser.id);
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

  // Sync health data when tab comes into focus (on mount, tab switch, or return from background)
  // Use ref to prevent repeated calls if already syncing
  const isSyncingRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasConnectedProvider && authUser?.id && !isSyncingRef.current) {
        console.log('[HomeScreen] Tab focused - starting health data sync');
        isSyncingRef.current = true;
        syncHealthData(authUser.id).finally(() => {
          console.log('[HomeScreen] Health data sync completed');
          isSyncingRef.current = false;
        });
        calculateStreak();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <Image
        source={require('../../../assets/AppHomeScreen.png')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: width,
          height: width,
        }}
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
        pointerEvents="none"
      />

      {/* Content Layer - Scrollable */}
      <View style={{ flex: 1 }}>
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

      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent', zIndex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-gray-500 dark:text-gray-300 text-base">{getGreeting()}</Text>
            <Text className="text-black dark:text-white text-3xl font-bold mt-1">{displayName}</Text>
          </Animated.View>
        </View>

        {/* Connect Device Card - Show if no provider connected */}
        {!hasConnectedProvider && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(50)}
            className="mx-5 -mt-2 mb-4"
          >
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-80 overflow-hidden rounded-2xl"
            >
              <BlurView
                intensity={colors.isDark ? 30 : 80}
                tint={colors.isDark ? 'dark' : 'light'}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                  borderWidth: colors.isDark ? 0 : 1,
                  borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
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
              </BlurView>
            </Pressable>
          </Animated.View>
        )}

        {/* Connected Device Badge - Show if provider connected */}
        {hasConnectedProvider && connectedProvider && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(50)}
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
          entering={FadeInDown.duration(600).delay(100)}
          className="mx-5"
        >
          {hasConnectedProvider ? (
            <Pressable
              onPress={() => router.push('/activity-detail')}
              className="active:opacity-90 overflow-hidden rounded-3xl"
            >
              <BlurView
                intensity={colors.isDark ? 30 : 80}
                tint={colors.isDark ? 'dark' : 'light'}
                style={{
                  borderRadius: 24,
                  overflow: 'hidden',
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                  borderWidth: colors.isDark ? 0 : 1,
                  borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
                  padding: 24,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-black dark:text-white text-xl font-semibold">Activity</Text>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={handleManualSync}
                      disabled={isManualSyncing}
                      className="w-8 h-8 rounded-full items-center justify-center mr-2 active:opacity-70"
                      style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                    >
                      <RefreshCw
                        size={16}
                        color={colors.text}
                        style={{ transform: [{ rotate: isManualSyncing ? '360deg' : '0deg' }] }}
                      />
                    </Pressable>
                    <ChevronRight size={20} color="#6b7280" />
                  </View>
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
                        <Flame size={20} color="#FA114F" />
                      </View>
                      <View className="ml-3">
                        <Text className="text-ring-move text-lg font-bold">
                          {Math.round(moveCalories)}/{Math.round(moveGoal)}
                        </Text>
                        <Text className="text-gray-500 text-sm">CAL</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-ring-exercise/20 items-center justify-center">
                        <Timer size={20} color="#92E82A" />
                      </View>
                      <View className="ml-3">
                        <Text className="text-ring-exercise text-lg font-bold">
                          {Math.round(exerciseMinutes)}/{Math.round(exerciseGoal)}
                        </Text>
                        <Text className="text-gray-500 text-sm">MIN</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-ring-stand/20 items-center justify-center">
                        <Activity size={20} color="#00D4FF" />
                      </View>
                      <View className="ml-3">
                        <Text className="text-ring-stand text-lg font-bold">
                          {Math.round(standHours)}/{Math.round(standGoal)}
                        </Text>
                        <Text className="text-gray-500 text-sm">HRS</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </BlurView>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-90 overflow-hidden rounded-3xl"
            >
              <BlurView
                intensity={colors.isDark ? 30 : 80}
                tint={colors.isDark ? 'dark' : 'light'}
                style={{
                  borderRadius: 24,
                  overflow: 'hidden',
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                  borderWidth: colors.isDark ? 0 : 1,
                  borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
                  padding: 24,
                  opacity: 0.6,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-black dark:text-white text-xl font-semibold">Activity</Text>
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
              </BlurView>
            </Pressable>
          )}
        </Animated.View>

        {/* Streak Card - Only show if user has a real streak (2+ days) */}
        {activityStreak >= 2 && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(200)}
            className="mx-5 mt-4"
          >
            <LinearGradient
              colors={colors.isDark ? ['#2a1a1a', '#1C1C1E'] : ['#FFF5F0', '#FFE8DC']}
              style={{ borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-full bg-orange-500/20 items-center justify-center">
                  <Flame size={24} color="#FF6B35" />
                </View>
                <View className="ml-4">
                  <Text className="text-black dark:text-white text-lg font-semibold">{activityStreak} Day Streak</Text>
                  <Text className="text-gray-600 dark:text-gray-400 text-sm">Keep it going!</Text>
                </View>
              </View>
              <TrendingUp size={24} color="#FF6B35" />
            </LinearGradient>
          </Animated.View>
        )}

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(300)}
            className="mt-6"
          >
            <View className="px-5 flex-row justify-between items-center mb-4">
              <View className="flex-row items-center">
                <View className="mr-2">
                  <Bell size={20} color="#FA114F" />
                </View>
                <Text className="text-black dark:text-white text-xl font-semibold">Invitations</Text>
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
          entering={FadeInDown.duration(600).delay(pendingInvitations.length > 0 ? 400 : 300)}
          className="mt-6"
        >
          <View className="px-5 flex-row justify-between items-center mb-4">
            <Text className="text-black dark:text-white text-xl font-semibold">Active Competitions</Text>
            {activeCompetitions.length > 0 && (
              <Text className="text-gray-400 dark:text-gray-500 text-sm">{activeCompetitions.length} active</Text>
            )}
          </View>

          {activeCompetitions.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/compete')}
              className="mx-5 active:opacity-80 overflow-hidden rounded-3xl"
            >
              <BlurView
                intensity={colors.isDark ? 30 : 80}
                tint={colors.isDark ? 'dark' : 'light'}
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                  borderWidth: colors.isDark ? 0 : 1,
                  borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
                  padding: 24,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
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
              </BlurView>
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

                return (
                  <Pressable
                    key={competition.id}
                    className="mr-4 active:opacity-80"
                    style={{ width: width * 0.7 }}
                    onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
                  >
                    <BlurView
                      intensity={colors.isDark ? 30 : 80}
                      tint={colors.isDark ? 'dark' : 'light'}
                      style={{
                        borderRadius: 20,
                        overflow: 'hidden',
                        backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                        borderWidth: colors.isDark ? 0 : 1,
                        borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
                        padding: 0,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 8,
                        elevation: 3,
                      }}
                    >
                      {/* Gradient Header */}
                      <LinearGradient
                        colors={[gradientColors[0], gradientColors[1]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          height: 4,
                          width: '100%',
                          borderTopLeftRadius: 20,
                          borderTopRightRadius: 20,
                        }}
                      />

                      <View style={{ padding: 20 }}>
                        <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1">
                          <Text className="text-black dark:text-white text-lg font-semibold">{competition.name || 'Unnamed Competition'}</Text>
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
                    </BlurView>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* Quick Stats */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(400)}
          className="mx-5 mt-6"
        >
          <Text className="text-black dark:text-white text-xl font-semibold mb-4">Your Stats</Text>
          <View className="flex-row space-x-3">
            <View style={{ backgroundColor: colors.card }} className="flex-1 rounded-2xl p-4">
              <Text className="text-gray-500 dark:text-gray-400 text-sm">Total Points</Text>
              <Text className="text-black dark:text-white text-2xl font-bold mt-1">{realTotalPoints.toLocaleString()}</Text>
            </View>
            <View style={{ backgroundColor: colors.card }} className="flex-1 rounded-2xl p-4">
              <Text className="text-gray-500 dark:text-gray-400 text-sm">Competitions</Text>
              <Text className="text-black dark:text-white text-2xl font-bold mt-1">{competitions.length}</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
      </View>

      {/* Fair Play Modal for first competition join */}
      <FairPlayModal />
    </View>
  );
}
