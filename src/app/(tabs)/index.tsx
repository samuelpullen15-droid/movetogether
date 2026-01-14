import { View, Text, ScrollView, Pressable, Dimensions, Modal, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useFitnessStore } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { fetchPendingInvitations, acceptInvitation, declineInvitation, type CompetitionInvitation } from '@/lib/invitation-service';
import { Flame, Timer, Activity, TrendingUp, Watch, ChevronRight, X, Bell, CheckCircle, XCircle } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';

const { width } = Dimensions.get('window');

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
  const currentUser = useFitnessStore((s) => s.currentUser);
  const competitions = useFitnessStore((s) => s.competitions);
  const authUser = useAuthStore((s) => s.user);
  
  // Use a ref to "lock in" the display name once we have real data
  const confirmedNameRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  
  // Reset if user changed (different account)
  if (authUser?.id && authUser.id !== lastUserIdRef.current) {
    confirmedNameRef.current = null;
    lastUserIdRef.current = authUser.id;
  }
  
  // Get the display name, but once we have a real name, keep it
  const getDisplayName = () => {
    // If we've already confirmed a real name, use it
    if (confirmedNameRef.current) {
      return confirmedNameRef.current;
    }
    
    // Check for real user data
    const realName = authUser?.firstName || 
                     (authUser?.fullName ? authUser.fullName.split(' ')[0] : null) ||
                     authUser?.username;
    
    if (realName) {
      // Lock in the real name
      confirmedNameRef.current = realName;
      return realName;
    }
    
    // Fallback to mock data only if we have no real data
    return currentUser.name;
  };
  
  const displayName = getDisplayName();

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

  // Use health service data if available, otherwise fallback to user data
  // Validate and ensure values are valid numbers
  const rawMoveCalories = currentMetrics?.activeCalories ?? currentUser.moveCalories ?? 0;
  const rawExerciseMinutes = currentMetrics?.exerciseMinutes ?? currentUser.exerciseMinutes ?? 0;
  const rawStandHours = currentMetrics?.standHours ?? currentUser.standHours ?? 0;

  const moveCalories = (typeof rawMoveCalories === 'number' && isFinite(rawMoveCalories) && rawMoveCalories >= 0) ? rawMoveCalories : 0;
  const exerciseMinutes = (typeof rawExerciseMinutes === 'number' && isFinite(rawExerciseMinutes) && rawExerciseMinutes >= 0) ? rawExerciseMinutes : 0;
  const standHours = (typeof rawStandHours === 'number' && isFinite(rawStandHours) && rawStandHours >= 0) ? rawStandHours : 0;

  const moveGoal = (typeof goals.moveCalories === 'number' && goals.moveCalories > 0) ? goals.moveCalories : 500;
  const exerciseGoal = (typeof goals.exerciseMinutes === 'number' && goals.exerciseMinutes > 0) ? goals.exerciseMinutes : 30;
  const standGoal = (typeof goals.standHours === 'number' && goals.standHours > 0) ? goals.standHours : 12;

  // Calculate progress with defensive checks for division by zero and invalid values
  const moveProgress = moveGoal > 0 ? Math.max(0, moveCalories / moveGoal) : 0;
  const exerciseProgress = exerciseGoal > 0 ? Math.max(0, exerciseMinutes / exerciseGoal) : 0;
  const standProgress = standGoal > 0 ? Math.max(0, standHours / standGoal) : 0;

  const activeCompetitions = competitions.filter((c) => c.status === 'active');
  const [pendingInvitations, setPendingInvitations] = useState<CompetitionInvitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);
  const isFetchingInStore = useFitnessStore((s) => s.isFetchingCompetitions);

  // Calculate real stats from competitions
  const calculateUserStats = () => {
    const userId = authUser?.id || currentUser.id;
    
    // Calculate total points across all competitions
    let totalPoints = 0;
    
    competitions.forEach((competition) => {
      const userParticipant = competition.participants.find((p) => p.id === userId);
      if (userParticipant) {
        totalPoints += userParticipant.points;
      }
    });
    
    return totalPoints;
  };

  const realTotalPoints = calculateUserStats();
  const hasFetchedCompetitionsRef = useRef<string | null>(null);
  const isFetchingCompetitionsRef = useRef<boolean>(false);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);

  // Track competitions changes
  useEffect(() => {
    console.log('Home screen - competitions changed', { competitionsCount: competitions.length, activeCompetitionsCount: activeCompetitions.length });
  }, [competitions.length, activeCompetitions.length, isAuthenticated, authUser?.id]);

  // Load competitions when user is authenticated (only once per user)
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

    console.log('Home screen useEffect - checking auth state', { isAuthenticated, hasAuthUser: !!authUser, userId, competitionsCount: competitions.length, hasFetched, isFetching, hasActivePromise, isFetchingInStore });
    
    // Only fetch if we haven't already fetched for this user AND we're not currently fetching
    // Also check if we already have competitions loaded (from persistence)
    const hasCompetitions = competitions.length > 0;
    
    if (!hasFetched && !isFetching && !hasActivePromise && !hasCompetitions && !isFetchingInStore) {
      // Set all refs IMMEDIATELY to prevent concurrent fetches
      // Create a placeholder promise first so subsequent runs see it immediately
      const placeholderPromise = Promise.resolve();
      fetchPromiseRef.current = placeholderPromise;
      hasFetchedCompetitionsRef.current = userId;
      isFetchingCompetitionsRef.current = true;
      
      console.log('Home screen - fetching competitions for user', userId);
      
      // Replace placeholder with actual promise
      const fetchPromise = fetchUserCompetitions(userId).then(() => {
        isFetchingCompetitionsRef.current = false;
        fetchPromiseRef.current = null;
        console.log('Home screen - competitions fetch completed');
      }).catch((error) => {
        isFetchingCompetitionsRef.current = false;
        fetchPromiseRef.current = null;
        console.error('Home screen - competitions fetch error', error);
        // Reset ref on error so we can retry
        hasFetchedCompetitionsRef.current = null;
      });
      
      // Replace placeholder with actual promise
      fetchPromiseRef.current = fetchPromise;
    } else {
      console.log('Home screen - skipping fetch', { hasFetched, isFetching, hasActivePromise, hasCompetitions, isFetchingInStore });
    }
  }, [isAuthenticated, authUser?.id]);

  // Load pending invitations
  useEffect(() => {
    if (authUser?.id) {
      loadPendingInvitations();
    }
  }, [authUser?.id]);

  const loadPendingInvitations = async () => {
    if (!authUser?.id) return;
    setIsLoadingInvitations(true);
    try {
      const invitations = await fetchPendingInvitations(authUser.id);
      setPendingInvitations(invitations);
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  const handleAcceptInvitation = async (invitation: CompetitionInvitation) => {
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

  // Sync health data on mount if provider connected
  useEffect(() => {
    if (hasConnectedProvider) {
      syncHealthData(authUser?.id);
      calculateStreak();
    }
  }, [hasConnectedProvider, authUser?.id]);

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
    <View className="flex-1 bg-black">
      {/* Connect Prompt Modal */}
      <Modal
        visible={showConnectPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConnectPrompt(false)}
      >
        <View className="flex-1 bg-black/80 items-center justify-center px-6">
          <Animated.View
            entering={FadeInDown.duration(300)}
            className="bg-[#1C1C1E] rounded-3xl p-6 w-full max-w-sm"
          >
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-blue-500/20 items-center justify-center mb-4">
                <Watch size={32} color="#3b82f6" />
              </View>
              <Text className="text-white text-2xl font-bold text-center mb-2">
                Connect Your Device
              </Text>
              <Text className="text-gray-400 text-center text-base">
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
                className="bg-gray-800 rounded-2xl py-4 items-center active:opacity-80"
              >
                <Text className="text-gray-300 text-base font-medium">Maybe Later</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-gray-400 text-base">{getGreeting()}</Text>
            <Text className="text-white text-3xl font-bold mt-1">{displayName}</Text>
          </Animated.View>
        </LinearGradient>

        {/* Connect Device Card - Show if no provider connected */}
        {!hasConnectedProvider && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(50)}
            className="mx-5 -mt-2 mb-4"
          >
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-80"
            >
              <LinearGradient
                colors={['#1a2a3a', '#1C1C1E']}
                style={{ borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' }}
              >
                <View className="w-12 h-12 rounded-full bg-blue-500/20 items-center justify-center">
                  <Watch size={24} color="#3b82f6" />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-white text-base font-semibold">Connect Your Device</Text>
                  <Text className="text-gray-400 text-sm mt-0.5">
                    Sync Apple Watch, Fitbit, Garmin & more
                  </Text>
                </View>
                <ChevronRight size={20} color="#6b7280" />
              </LinearGradient>
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
                style={{ backgroundColor: connectedProvider.color + '15', borderWidth: 1, borderColor: connectedProvider.color + '30' }}
              >
                <View className="flex-row items-center">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{ backgroundColor: connectedProvider.color + '30' }}
                  >
                    <Watch size={16} color={connectedProvider.color} />
                  </View>
                  <Text className="text-white text-sm font-medium ml-3">
                    {connectedProvider.name} Connected
                  </Text>
                </View>
                {currentMetrics?.lastUpdated && (
                  <Text className="text-gray-500 text-xs">
                    {new Date(currentMetrics.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
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
              className="active:opacity-90"
            >
              <LinearGradient
                colors={['#1C1C1E', '#0D0D0D']}
                style={{ borderRadius: 24, padding: 24 }}
              >
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-white text-xl font-semibold">Activity</Text>
                  <ChevronRight size={20} color="#6b7280" />
                </View>

                <View className="flex-row items-center justify-between">
                  {/* Rings */}
                  <View className="items-center">
                    <TripleActivityRings
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
                          {moveCalories}/{moveGoal}
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
                          {exerciseMinutes}/{exerciseGoal}
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
                          {standHours}/{standGoal}
                        </Text>
                        <Text className="text-gray-500 text-sm">HRS</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="active:opacity-90"
            >
              <LinearGradient
                colors={['#1C1C1E', '#0D0D0D']}
                style={{ borderRadius: 24, padding: 24, opacity: 0.6 }}
              >
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-white text-xl font-semibold">Activity</Text>
                  <ChevronRight size={20} color="#6b7280" />
                </View>

                <View className="flex-row items-center justify-between">
                  {/* Blurred Rings */}
                  <View className="items-center opacity-30">
                    <TripleActivityRings
                      size={width * 0.4}
                      moveProgress={0}
                      exerciseProgress={0}
                      standProgress={0}
                    />
                  </View>

                  {/* Placeholder Message */}
                  <View className="flex-1 ml-6 items-center justify-center py-8">
                    <View className="w-16 h-16 rounded-full bg-gray-700/50 items-center justify-center mb-4">
                      <Watch size={32} color="#6b7280" />
                    </View>
                    <Text className="text-gray-400 text-center text-base font-medium">
                      Connect a service or device to see activity
                    </Text>
                  </View>
                </View>
              </LinearGradient>
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
              colors={['#2a1a1a', '#1C1C1E']}
              style={{ borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-full bg-orange-500/20 items-center justify-center">
                  <Flame size={24} color="#FF6B35" />
                </View>
                <View className="ml-4">
                  <Text className="text-white text-lg font-semibold">{activityStreak} Day Streak</Text>
                  <Text className="text-gray-400 text-sm">Keep it going!</Text>
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
                <Text className="text-white text-xl font-semibold">Invitations</Text>
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
                              {invitation.competition.name}
                            </Text>
                            <Text className="text-white/70 text-sm">
                              {invitation.competition.description}
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
            <Text className="text-white text-xl font-semibold">Active Competitions</Text>
            <Text className="text-gray-500 text-sm">{activeCompetitions.length} active</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {activeCompetitions.map((competition, index) => {
              const userRank = competition.participants.findIndex((p) => p.id === currentUser.id) + 1;
              const leader = competition.participants[0];
              const competitionPosition = index + 1;

              return (
                <Pressable
                  key={competition.id}
                  className="mr-4 active:opacity-80"
                  style={{ width: width * 0.7 }}
                  onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
                >
                  <LinearGradient
                    colors={index === 0 ? ['#2a1a2e', '#1C1C1E'] : ['#1a2a2e', '#1C1C1E']}
                    style={{ borderRadius: 20, padding: 20 }}
                  >
                    <View className="flex-row justify-between items-start mb-3">
                      <View className="flex-1">
                        <Text className="text-white text-lg font-semibold">{competition.name}</Text>
                        <Text className="text-gray-400 text-sm mt-1">{competition.description}</Text>
                      </View>
                      <View className="bg-white/10 px-3 py-1 rounded-full">
                        <Text className="text-white text-sm font-medium">#{competitionPosition}</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center mt-3">
                      <View className="flex-row -space-x-2">
                        {competition.participants.slice(0, 4).map((p, i) => (
                          <View
                            key={p.id}
                            className="w-8 h-8 rounded-full border-2 border-fitness-card overflow-hidden"
                            style={{ marginLeft: i > 0 ? -8 : 0 }}
                          >
                            {p.avatar ? (
                              <Image
                                source={{ uri: p.avatar }}
                                className="w-full h-full"
                                resizeMode="cover"
                              />
                            ) : (
                              <View className="w-full h-full bg-gray-600 items-center justify-center">
                                <Text className="text-white text-xs font-bold">{p.name[0]}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                      <Text className="text-gray-400 text-sm ml-3">
                        {competition.participants.length} competing
                      </Text>
                    </View>

                    <View className="mt-4 pt-4 border-t border-white/10">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-gray-400 text-sm">Leader: {leader.name}</Text>
                        <Text className="text-white font-semibold">{leader.points} pts</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Quick Stats */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(400)}
          className="mx-5 mt-6"
        >
          <Text className="text-white text-xl font-semibold mb-4">Your Stats</Text>
          <View className="flex-row space-x-3">
            <View className="flex-1 bg-fitness-card rounded-2xl p-4">
              <Text className="text-gray-400 text-sm">Total Points</Text>
              <Text className="text-white text-2xl font-bold mt-1">{realTotalPoints.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-fitness-card rounded-2xl p-4">
              <Text className="text-gray-400 text-sm">Competitions</Text>
              <Text className="text-white text-2xl font-bold mt-1">{competitions.length}</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
