import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Contacts from 'expo-contacts';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import {
  ChevronRight,
  Circle,
  Percent,
  Hash,
  Footprints,
  Dumbbell,
  Calendar,
  Users,
  Globe,
  Lock,
  Check,
  X,
  Info,
  Bike,
  Waves,
  Repeat,
  Search,
  UserPlus,
  Phone,
  Trophy,
  DollarSign,
  Wallet,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  ScoringType,
  WorkoutType,
  WorkoutMetric,
  RepeatOption,
  SCORING_TYPES,
  WORKOUT_TYPES,
  WORKOUT_METRICS,
  REPEAT_OPTIONS,
  Friend,
  DEFAULT_TEAMS,
  TeamDefinition,
} from '@/lib/competition-types';
import { useFitnessStore } from '@/lib/fitness-store';
import { useAuthStore } from '@/lib/auth-store';
import {
  createCompetition as createCompetitionService,
  finalizeDraftCompetition,
  deleteDraftCompetition,
  fetchCompetition,
} from '@/lib/competition-service';
import {
  searchUsersByUsername,
  searchUsersByPhoneNumber,
  findUsersFromContacts,
  searchResultToFriend,
} from '@/lib/user-search-service';
import { normalizePhoneNumber } from '@/lib/phone-verification-service';
import { getAvatarUrl } from '@/lib/avatar-utils';
import { cn } from '@/lib/cn';
import { useThemeColors } from '@/lib/useThemeColors';
import { useFairPlay } from '@/hooks/useFairPlay';
import { friendsApi } from '@/lib/edge-functions';
import { usePrizePoolPayment } from '@/lib/use-prize-pool-payment';
import { usePlatformPay } from '@stripe/stripe-react-native';

const scoringIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  circle: Circle,
  percent: Percent,
  hash: Hash,
  footprints: Footprints,
  dumbbell: Dumbbell,
};

const workoutIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  bike: Bike,
  running: Footprints,
  waves: Waves,
  footprints: Footprints,
};

export default function CreateCompetitionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { public: publicParam } = useLocalSearchParams<{ public?: string }>();
  const screenHeight = Dimensions.get('window').height;
  const colors = useThemeColors();

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [repeat, setRepeat] = useState<RepeatOption>('none');
  const [isPublic, setIsPublic] = useState(publicParam === 'true');
  const [scoringType, setScoringType] = useState<ScoringType>('ring_close');
  const [selectedWorkoutTypes, setSelectedWorkoutTypes] = useState<WorkoutType[]>([]);
  const [workoutMetric, setWorkoutMetric] = useState<WorkoutMetric>('distance');
  const [invitedFriends, setInvitedFriends] = useState<string[]>([]);

  // Team competition state
  const [isTeamCompetition, setIsTeamCompetition] = useState(false);
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<TeamDefinition[]>(DEFAULT_TEAMS.slice(0, 2));

  // Multi-step flow state
  // Individual: info → prize → invite → review (4 steps)
  // Team:      info → teams → prize → invite → review (5 steps)
  const [currentStep, setCurrentStep] = useState<'info' | 'teams' | 'prize' | 'invite' | 'review'>('info');
  const [isCreating, setIsCreating] = useState(false);
  const [draftCompetitionId, setDraftCompetitionId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const isFinalized = useRef(false);

  // Keep ref in sync with state so cleanup can access latest value
  useEffect(() => {
    draftIdRef.current = draftCompetitionId;
  }, [draftCompetitionId]);

  // Cleanup: delete draft competition on unmount if not finalized
  useEffect(() => {
    return () => {
      if (draftIdRef.current && !isFinalized.current) {
        deleteDraftCompetition(draftIdRef.current, currentUser?.id || '').catch(() => {});
      }
    };
  }, []);

  // Payment hooks
  const { isPlatformPaySupported } = usePlatformPay();
  const { payWithApplePay, payWithCard } = usePrizePoolPayment();
  const [canUsePlatformPay, setCanUsePlatformPay] = useState(false);

  // Check if Apple Pay / Google Pay is available
  useEffect(() => {
    const checkPlatformPay = async () => {
      try {
        const supported = await isPlatformPaySupported();
        setCanUsePlatformPay(supported);
      } catch {
        setCanUsePlatformPay(false);
      }
    };
    checkPlatformPay();
  }, [isPlatformPaySupported]);

  // Prize pool configuration state
  const [wantsPrizePool, setWantsPrizePool] = useState(false);
  const [prizePoolMode, setPrizePoolMode] = useState<'creator_funded' | 'buy_in'>('creator_funded');
  const [prizeAmount, setPrizeAmount] = useState(25);
  const [customPrizeAmount, setCustomPrizeAmount] = useState('');
  const [buyInAmount, setBuyInAmount] = useState(10);
  const [customBuyInAmount, setCustomBuyInAmount] = useState('');
  const [payoutStructure, setPayoutStructure] = useState<Record<string, number>>({ first: 100 });

  // UI state
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState<ScoringType | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Animation values for friend picker modal
  const modalTranslateY = useSharedValue(screenHeight * 0.65);
  const overlayOpacity = useSharedValue(0);

  const handleCloseModal = useCallback(() => {
    if (!isModalVisible || !showFriendPicker) return;
    setIsModalVisible(false);
    overlayOpacity.value = withTiming(0, { duration: 300 });
    modalTranslateY.value = withTiming(screenHeight * 0.65, { duration: 300 }, (finished) => {
      'worklet';
      if (finished) runOnJS(setShowFriendPicker)(false);
    });
  }, [overlayOpacity, modalTranslateY, screenHeight, showFriendPicker, isModalVisible]);

  useEffect(() => {
    if (showFriendPicker) {
      setIsModalVisible(true);
      modalTranslateY.value = screenHeight * 0.65;
      overlayOpacity.value = 0;
      setTimeout(() => {
        modalTranslateY.value = withTiming(0, { duration: 300 });
        overlayOpacity.value = withTiming(0.7, { duration: 300 });
      }, 50);
    }
  }, [showFriendPicker]);

  useEffect(() => {
    if (!showFriendPicker && !isModalVisible) {
      modalTranslateY.value = screenHeight * 0.65;
      overlayOpacity.value = 0;
    }
  }, [showFriendPicker, isModalVisible]);

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalTranslateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Friend search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [availableFriends, setAvailableFriends] = useState<Friend[]>([]);

  const currentUser = useAuthStore((s) => s.user);
  const friendsFromStore = useAuthStore((s) => s.friends);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { checkFairPlay, FairPlayModal } = useFairPlay();

  // Load existing friends from auth store when friend picker opens, filtering out blocked users
  useEffect(() => {
    if (showFriendPicker && friendsFromStore.length > 0) {
      (async () => {
        // Fetch blocked user IDs to filter them out
        let blockedIds = new Set<string>();
        try {
          const { data: blockedFriendships } = await friendsApi.getMyBlockedFriendships();
          if (blockedFriendships && Array.isArray(blockedFriendships)) {
            blockedFriendships.forEach((b: any) => {
              if (b.user_id) blockedIds.add(b.user_id);
              if (b.friend_id) blockedIds.add(b.friend_id);
            });
            // Remove current user's own ID from the set
            if (currentUser?.id) blockedIds.delete(currentUser.id);
          }
        } catch (e) {
          console.error('Failed to fetch blocked users for invite picker:', e);
        }

        const existingFriends: Friend[] = friendsFromStore
          .filter((f) => !blockedIds.has(f.id))
          .map((f) => ({
            id: f.id,
            name: f.name,
            avatar: f.avatar,
            username: f.username,
          }));
        setAvailableFriends((prev) => {
          const existingIds = new Set(prev.map((f) => f.id));
          return [...prev, ...existingFriends.filter((f) => !existingIds.has(f.id))];
        });
      })();
    }
  }, [showFriendPicker, friendsFromStore]);

  const toggleWorkoutType = (type: WorkoutType) => {
    setSelectedWorkoutTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleFriend = (friendId: string) => {
    if (!friendId) return;
    setInvitedFriends((prev) => {
      const isSelected = prev.includes(friendId);
      if (!isSelected) {
        const friendFromSearch = searchResults.find((f) => f?.id === friendId);
        if (friendFromSearch && !availableFriends.find((f) => f?.id === friendId)) {
          setAvailableFriends((prevFriends) =>
            prevFriends.find((f) => f?.id === friendId)
              ? prevFriends
              : [...prevFriends, friendFromSearch]
          );
        }
      }
      return isSelected ? prev.filter((id) => id !== friendId) : [...prev, friendId];
    });
  };

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const hasDigits = /\d/.test(query);
        let results;
        if (hasDigits && query.replace(/\D/g, '').length >= 3) {
          const [phoneResults, usernameResults] = await Promise.all([
            searchUsersByPhoneNumber(query),
            searchUsersByUsername(query),
          ]);
          results = Array.from(
            new Map([...phoneResults, ...usernameResults].map((r) => [r.id, r])).values()
          );
        } else {
          results = await searchUsersByUsername(query);
        }
        setSearchResults(
          results.filter((user) => user.id !== currentUser?.id).map(searchResultToFriend)
        );
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentUser?.id]
  );

  const handleFindFromContacts = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your contacts.');
      return;
    }
    setIsLoadingContacts(true);
    try {
      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const emails: string[] = [];
      const phoneNumbers: string[] = [];
      contacts.forEach((c) => {
        c.emails?.forEach((e) => e.email && emails.push(e.email));
        c.phoneNumbers?.forEach((p) => p.number && phoneNumbers.push(normalizePhoneNumber(p.number)));
      });
      const friends = (await findUsersFromContacts(emails, phoneNumbers))
        .filter((u) => u.id !== currentUser?.id)
        .map(searchResultToFriend);
      if (friends.length === 0) {
        Alert.alert('No Friends Found', 'None of your contacts are using MoveTogether yet.');
      } else {
        setAvailableFriends((prev) => [
          ...prev,
          ...friends.filter((f) => !prev.find((p) => p.id === f.id)),
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to access contacts.');
    } finally {
      setIsLoadingContacts(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (showFriendPicker) {
      setAvailableFriends([]);
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [showFriendPicker]);

  // Step navigation handlers
  const handleNextFromInfo = async () => {
    if (!name.trim()) return;

    // Create draft competition to get an ID for prize pool payment
    setIsCreating(true);
    try {
      await refreshProfile();
      if (!currentUser) {
        Alert.alert('Error', 'You must be signed in.');
        setIsCreating(false);
        return;
      }

      const displayName =
        currentUser.firstName?.trim() ||
        currentUser.fullName?.trim()?.split(' ')[0] ||
        currentUser.username?.trim() ||
        'User';

      const creatorData = {
        id: currentUser.id,
        name: displayName,
        avatar: getAvatarUrl(currentUser.avatarUrl, displayName, currentUser.username),
      };

      const result = await createCompetitionService({
        name: name.trim(),
        startDate,
        endDate,
        scoringType,
        scoringConfig:
          scoringType === 'workout'
            ? { type: 'workout', workoutTypes: selectedWorkoutTypes, workoutMetric }
            : null,
        isPublic,
        repeatOption: repeat,
        creatorId: creatorData.id,
        creatorName: creatorData.name,
        creatorAvatar: creatorData.avatar,
        invitedFriendIds: [], // Don't send invitations for draft
        isDraft: true, // Create as draft
        isTeamCompetition,
        teamCount: isTeamCompetition ? teamCount : undefined,
        teams: isTeamCompetition ? teams.slice(0, teamCount) : undefined,
      });

      if (!result.success || !result.competitionId) {
        Alert.alert('Error', result.error || 'Failed to create competition');
        setIsCreating(false);
        return;
      }

      setDraftCompetitionId(result.competitionId);
      setCurrentStep(isTeamCompetition ? 'teams' : 'prize');
    } catch (error) {
      console.error('Error creating draft competition:', error);
      Alert.alert('Error', 'Failed to create competition. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleNextFromTeams = () => {
    setCurrentStep('prize');
  };

  const handleNextFromPrize = () => {
    setCurrentStep('invite');
  };

  const handleBackToTeams = () => {
    setCurrentStep('teams');
  };

  const handleBackToPrize = () => {
    setCurrentStep('prize');
  };

  const handleBackToInfo = async () => {
    // Delete the draft competition when going back to step 1
    if (draftCompetitionId && currentUser) {
      await deleteDraftCompetition(draftCompetitionId, currentUser.id);
      setDraftCompetitionId(null);
    }
    setCurrentStep('info');
  };

  const handleNextFromInvite = () => {
    setCurrentStep('review');
  };

  const handleBackToInvite = () => {
    setCurrentStep('invite');
  };

  // Final step: Finalize competition and process payment (called from Review screen)
  const handleCreateCompetition = async () => {
    if (!draftCompetitionId) {
      Alert.alert('Error', 'Competition not found. Please start over.');
      return;
    }

    const canProceed = await checkFairPlay();
    if (!canProceed) return;
    setIsCreating(true);

    try {
      await refreshProfile();
      if (!currentUser) {
        Alert.alert('Error', 'You must be signed in.');
        setIsCreating(false);
        return;
      }

      // If prize pool was configured, process payment first
      if (wantsPrizePool) {
        const effectiveBuyInFinal = customBuyInAmount ? parseFloat(customBuyInAmount) || 0 : buyInAmount;
        const effectiveAmount = prizePoolMode === 'buy_in'
          ? effectiveBuyInFinal
          : (customPrizeAmount ? parseFloat(customPrizeAmount) || 0 : prizeAmount);

        // Use Apple Pay / Google Pay if available, otherwise card
        const paymentFn = canUsePlatformPay ? payWithApplePay : payWithCard;
        const paymentResult = await paymentFn({
          competitionId: draftCompetitionId,
          prizeAmount: effectiveAmount,
          payoutStructure,
          poolType: prizePoolMode,
          buyInAmount: prizePoolMode === 'buy_in' ? effectiveBuyInFinal : undefined,
        });

        if (paymentResult.cancelled) {
          // User cancelled payment - stay on review screen to try again
          setIsCreating(false);
          return;
        }

        if (!paymentResult.success) {
          // Payment failed - stay on review screen to try again
          setIsCreating(false);
          Alert.alert(
            'Payment Failed',
            paymentResult.error || 'Unable to process payment. Please try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      // Payment succeeded (or no prize pool) - finalize the draft competition
      const finalizeResult = await finalizeDraftCompetition(draftCompetitionId, currentUser.id);
      if (!finalizeResult.success) {
        Alert.alert('Error', finalizeResult.error || 'Failed to finalize competition');
        setIsCreating(false);
        return;
      }
      isFinalized.current = true;

      // Send invitations now that competition is finalized
      if (invitedFriends.length > 0) {
        const { createCompetitionInvitations } = await import('@/lib/invitation-service');
        await createCompetitionInvitations(draftCompetitionId, currentUser.id, invitedFriends);
      }

      // Add to local store and navigate
      const created = await fetchCompetition(draftCompetitionId, currentUser.id);
      if (created) {
        useFitnessStore.setState({
          competitions: [created, ...useFitnessStore.getState().competitions],
        });
      }

      router.replace(`/competition-detail?id=${draftCompetitionId}`);
    } catch {
      Alert.alert('Error', 'Failed to create competition.');
    } finally {
      setIsCreating(false);
    }
  };

  const isValid = name.trim().length > 0 && startDate < endDate;

  // Dynamic step numbering for team vs individual flow
  const totalSteps = isTeamCompetition ? 5 : 4;
  const stepNumber = (step: string) => {
    const stepsOrder = isTeamCompetition
      ? ['info', 'teams', 'prize', 'invite', 'review']
      : ['info', 'prize', 'invite', 'review'];
    return stepsOrder.indexOf(step) + 1;
  };

  // ============================================================
  // STEP 4: Review & Pay
  // ============================================================
  if (currentStep === 'review') {
    const effectiveBuyInReview = customBuyInAmount ? parseFloat(customBuyInAmount) || 0 : buyInAmount;
    const effectiveAmount = prizePoolMode === 'buy_in'
      ? effectiveBuyInReview
      : (customPrizeAmount ? parseFloat(customPrizeAmount) || 0 : prizeAmount);
    const stripeFee = effectiveAmount > 0 ? (effectiveAmount * 0.029 + 0.30) : 0;
    const totalCharge = effectiveAmount + stripeFee;
    const scoringInfo = SCORING_TYPES.find((s) => s.id === scoringType);

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
        >
          {/* Overscroll background */}
          <View
            style={{
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
              height: 1000,
              backgroundColor: colors.isDark ? '#1C1C1E' : '#E3F2FD',
            }}
          />

          {/* Header */}
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E3F2FD', colors.bg]}
            style={{
              paddingTop: 24,
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View className="mb-4">
              <LiquidGlassBackButton onPress={handleBackToInvite} />
            </View>

            {/* Step Indicator */}
            <View className="flex-row items-center mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-blue-500 items-center justify-center">
                  <Text className="text-white font-bold text-xs">4</Text>
                </View>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">Step {stepNumber('review')} of {totalSteps}</Text>
            </View>

            <Animated.View entering={FadeInDown.duration(600)}>
              <Text className="text-black dark:text-white text-3xl font-bold">
                Review & {wantsPrizePool ? (prizePoolMode === 'buy_in' ? 'Buy In' : 'Pay') : 'Create'}
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
                Confirm your competition details
              </Text>
            </Animated.View>
          </LinearGradient>

          {/* Competition Details Card */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)} className="px-5 mb-4">
            <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-4">
              {/* Name */}
              <View className="mb-4">
                <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Competition Name</Text>
                <Text className="text-black dark:text-white text-xl font-bold">{name}</Text>
              </View>

              {/* Schedule */}
              <View className="flex-row mb-4">
                <View className="flex-1">
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Start Date</Text>
                  <View className="flex-row items-center">
                    <Calendar size={16} color="#92E82A" />
                    <Text className="text-black dark:text-white ml-2">
                      {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">End Date</Text>
                  <View className="flex-row items-center">
                    <Calendar size={16} color="#FA114F" />
                    <Text className="text-black dark:text-white ml-2">
                      {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Visibility & Scoring */}
              <View className="flex-row mb-4">
                <View className="flex-1">
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Visibility</Text>
                  <View className="flex-row items-center">
                    {isPublic ? <Globe size={16} color="#92E82A" /> : <Lock size={16} color="#6b7280" />}
                    <Text className="text-black dark:text-white ml-2">{isPublic ? 'Public' : 'Private'}</Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Scoring</Text>
                  <Text className="text-black dark:text-white">{scoringInfo?.name || 'Ring Close'}</Text>
                </View>
              </View>

              {/* Team Info */}
              <View className="flex-row">
                <View className="flex-1">
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Mode</Text>
                  <View className="flex-row items-center">
                    <Users size={16} color={isTeamCompetition ? '#8B5CF6' : '#6b7280'} />
                    <Text className="text-black dark:text-white ml-2">
                      {isTeamCompetition ? `Team (${teamCount} teams)` : 'Individual'}
                    </Text>
                  </View>
                </View>
                {isTeamCompetition && (
                  <View className="flex-1">
                    <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Teams</Text>
                    <Text className="text-black dark:text-white">
                      {teams.slice(0, teamCount).map(t => t.emoji).join(' ')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Prize Pool Card */}
          {wantsPrizePool && (
            <Animated.View entering={FadeInDown.duration(500).delay(150)} className="px-5 mb-4">
              <View
                style={{
                  backgroundColor: colors.isDark ? 'rgba(255,193,7,0.1)' : 'rgba(255,193,7,0.15)',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
                }}
                className="rounded-2xl p-4"
              >
                <View className="flex-row items-center mb-3">
                  <Trophy size={20} color="#FFC107" />
                  <Text className="text-black dark:text-white font-semibold ml-2">
                    {prizePoolMode === 'buy_in' ? 'Buy-In Prize Pool' : 'Prize Pool'}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-2">
                  <Text className="text-gray-600 dark:text-gray-400">
                    {prizePoolMode === 'buy_in' ? 'Your buy-in' : 'Prize amount'}
                  </Text>
                  <Text className="text-black dark:text-white font-medium">${effectiveAmount.toFixed(2)}</Text>
                </View>
                {prizePoolMode === 'buy_in' && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-600 dark:text-gray-400">Pool grows to</Text>
                    <Text className="text-amber-600 dark:text-amber-400 font-medium">
                      ${effectiveAmount.toFixed(0)} per player
                    </Text>
                  </View>
                )}
                <View className="flex-row justify-between">
                  <Text className="text-gray-600 dark:text-gray-400">Processing fee</Text>
                  <Text className="text-gray-500 dark:text-gray-400">${stripeFee.toFixed(2)}</Text>
                </View>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
                    paddingVertical: 10,
                    marginTop: 10,
                    marginBottom: 10,
                  }}
                  className="flex-row justify-between items-center"
                >
                  <Text className="text-black dark:text-white font-bold">Total to pay</Text>
                  <Text className="text-amber-600 dark:text-amber-400 font-bold text-lg">${totalCharge.toFixed(2)}</Text>
                </View>

                <View>
                  <Text className="text-gray-600 dark:text-gray-400 text-sm">
                    Payout: {Object.entries(payoutStructure).map(([place, pct]) => `${place === 'first' ? '1st' : place === 'second' ? '2nd' : '3rd'}: ${pct}%`).join(' • ')}
                  </Text>
                  {prizePoolMode === 'buy_in' && (
                    <Text className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                      Other participants will be charged ${effectiveAmount.toFixed(2)} + fee when they join
                    </Text>
                  )}
                </View>
              </View>
            </Animated.View>
          )}

          {/* No Prize Pool Note */}
          {!wantsPrizePool && (
            <Animated.View entering={FadeInDown.duration(500).delay(150)} className="px-5 mb-4">
              <View
                style={{
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                }}
                className="rounded-2xl p-4 flex-row items-center"
              >
                <Trophy size={20} color="#6b7280" />
                <Text className="text-gray-500 dark:text-gray-400 ml-3">No prize pool configured</Text>
              </View>
            </Animated.View>
          )}

          {/* Invited Friends Card */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)} className="px-5 mb-4">
            <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-4">
              <View className="flex-row items-center mb-3">
                <Users size={20} color="#FA114F" />
                <Text className="text-black dark:text-white font-semibold ml-2">
                  Invited Friends ({invitedFriends.length})
                </Text>
              </View>

              {invitedFriends.length === 0 ? (
                <Text className="text-gray-500 dark:text-gray-400">
                  No friends invited yet. You can invite them after creating.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row" style={{ gap: 12 }}>
                    {invitedFriends.map((friendId) => {
                      const friend = availableFriends.find((f) => f.id === friendId) || searchResults.find((f) => f.id === friendId);
                      if (!friend) return null;
                      return (
                        <View key={friend.id} className="items-center">
                          <Image source={{ uri: friend.avatar }} className="w-12 h-12 rounded-full" />
                          <Text className="text-black dark:text-white text-xs mt-1">{friend.name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </View>
          </Animated.View>

          {/* Create Button */}
          <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
            <Pressable
              onPress={handleCreateCompetition}
              disabled={isCreating}
              className="active:opacity-80"
            >
              <LinearGradient
                colors={
                  !isCreating
                    ? wantsPrizePool
                      ? ['#FFC107', '#FF9800']
                      : ['#22C55E', '#16A34A']
                    : colors.isDark
                    ? ['#3a3a3c', '#2a2a2c']
                    : ['#d1d5db', '#9ca3af']
                }
                style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
              >
                {isCreating ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator color="white" size="small" />
                    <Text className="text-white text-lg font-semibold ml-2">Creating...</Text>
                  </View>
                ) : (
                  <Text className="text-white text-lg font-semibold">
                    {wantsPrizePool
                      ? prizePoolMode === 'buy_in'
                        ? `Confirm & Pay $${totalCharge.toFixed(2)} Buy-In`
                        : `Confirm & Pay $${totalCharge.toFixed(2)}`
                      : 'Create Competition'
                    }
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {wantsPrizePool && (
              <Text className="text-gray-400 dark:text-gray-500 text-xs text-center mt-3">
                {prizePoolMode === 'buy_in'
                  ? `Payment processed securely via Stripe.\nOther players pay their buy-in when joining.`
                  : `Payment processed securely via Stripe.\nWinner receives the full $${effectiveAmount.toFixed(2)} prize.`
                }
              </Text>
            )}
          </View>
        </ScrollView>

        <FairPlayModal />
      </View>
    );
  }

  // ============================================================
  // STEP 3: Invite Friends
  // ============================================================
  if (currentStep === 'invite') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Overscroll background */}
          <View
            style={{
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
              height: 1000,
              backgroundColor: colors.isDark ? '#1C1C1E' : '#E8F5E9',
            }}
          />

          {/* Header */}
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E8F5E9', colors.bg]}
            style={{
              paddingTop: 24,
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View className="mb-4">
              <LiquidGlassBackButton onPress={handleBackToPrize} />
            </View>

            {/* Step Indicator */}
            <View className="flex-row items-center mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-blue-500 items-center justify-center">
                  <Text className="text-white font-bold text-xs">3</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">4</Text>
                </View>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">Step {stepNumber('invite')} of {totalSteps}</Text>
            </View>

            <Animated.View entering={FadeInDown.duration(600)}>
              <Text className="text-black dark:text-white text-3xl font-bold">Invite Friends</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
                Add competitors to your challenge
              </Text>
            </Animated.View>
          </LinearGradient>

          {/* Invite Friends Content */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)} className="px-5 mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-black dark:text-white text-lg font-semibold">
                {invitedFriends.length > 0 ? `${invitedFriends.length} friend${invitedFriends.length > 1 ? 's' : ''} selected` : 'Select friends'}
              </Text>
              <Pressable onPress={() => setShowFriendPicker(true)}>
                <Text className="text-fitness-accent font-medium">Add</Text>
              </Pressable>
            </View>

            {invitedFriends.length === 0 ? (
              <Pressable onPress={() => setShowFriendPicker(true)} className="active:opacity-80">
                <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-6 items-center">
                  <View
                    style={{
                      backgroundColor: colors.isDark
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.05)',
                    }}
                    className="w-16 h-16 rounded-full items-center justify-center mb-3"
                  >
                    <Users size={28} color="#6b7280" />
                  </View>
                  <Text className="text-gray-500 dark:text-gray-400 text-center">
                    Tap to invite friends to compete
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                    You can also skip this and invite later
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-4">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8, paddingTop: 12 }}
                >
                  <View className="flex-row" style={{ gap: 12 }}>
                    {invitedFriends.map((friendId) => {
                      const friend =
                        availableFriends.find((f) => f.id === friendId) ||
                        searchResults.find((f) => f.id === friendId);
                      if (!friend) return null;

                      return (
                        <View key={friend.id} className="items-center">
                          <View className="relative" style={{ overflow: 'visible' }}>
                            <Image
                              source={{ uri: friend.avatar }}
                              className="w-14 h-14 rounded-full"
                            />
                            <Pressable
                              onPress={() => toggleFriend(friend.id)}
                              className="absolute top-0 right-0 w-5 h-5 rounded-full bg-red-500 items-center justify-center"
                              style={{ transform: [{ translateX: 4 }, { translateY: -4 }] }}
                            >
                              <X size={12} color="white" strokeWidth={3} />
                            </Pressable>
                          </View>
                          <Text className="text-black dark:text-white text-sm mt-1">
                            {friend.name}
                          </Text>
                        </View>
                      );
                    })}
                    <Pressable
                      onPress={() => setShowFriendPicker(true)}
                      className="items-center justify-center"
                    >
                      <View
                        style={{
                          backgroundColor: colors.isDark
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(0,0,0,0.1)',
                        }}
                        className="w-14 h-14 rounded-full items-center justify-center"
                      >
                        <Users size={24} color="#6b7280" />
                      </View>
                      <Text className="text-gray-600 dark:text-gray-500 text-sm mt-1">Add</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            )}
          </Animated.View>

          {/* Public Competition Note */}
          {isPublic && (
            <Animated.View entering={FadeInDown.duration(500).delay(200)} className="px-5 mb-6">
              <View
                style={{
                  backgroundColor: colors.isDark ? 'rgba(146,232,42,0.1)' : 'rgba(146,232,42,0.15)',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(146,232,42,0.2)' : 'rgba(146,232,42,0.3)',
                }}
                className="rounded-xl p-4 flex-row items-center"
              >
                <Globe size={20} color="#92E82A" />
                <Text className="text-gray-600 dark:text-gray-400 text-sm ml-3 flex-1">
                  This is a public competition. Anyone can find and join it.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Next Button */}
          <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
            <Pressable
              onPress={handleNextFromInvite}
              className="active:opacity-80"
            >
              <LinearGradient
                colors={['#FA114F', '#D10040']}
                style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
              >
                <Text className="text-white text-lg font-semibold">
                  Review & {wantsPrizePool ? 'Pay' : 'Create'}
                </Text>
              </LinearGradient>
            </Pressable>

            <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-3">
              You can invite more friends later
            </Text>
          </View>
        </ScrollView>

        {/* Friend Picker Modal - same as before */}
        {showFriendPicker && (
          <Modal transparent animationType="none" visible={showFriendPicker}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <Pressable style={{ flex: 1 }} onPress={handleCloseModal}>
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'black',
                    },
                    overlayAnimatedStyle,
                  ]}
                />
                <Pressable
                  style={{ flex: 1, justifyContent: 'flex-end' }}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Animated.View
                    style={[
                      {
                        backgroundColor: colors.card,
                        height: screenHeight * 0.65,
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                      },
                      modalAnimatedStyle,
                    ]}
                  >
                    <View
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      }}
                      className="flex-row items-center justify-between px-5 py-4"
                    >
                      <Pressable onPress={handleCloseModal}>
                        <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
                      </Pressable>
                      <Text className="text-black dark:text-white font-semibold">Invite Friends</Text>
                      <Pressable onPress={handleCloseModal}>
                        <Text className="text-fitness-accent font-semibold">Done</Text>
                      </Pressable>
                    </View>

                    <View className="px-5 py-3">
                      <View
                        style={{
                          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        }}
                        className="rounded-xl px-4 flex-row items-center"
                      >
                        <Search size={18} color="#6b7280" />
                        <TextInput
                          value={searchQuery}
                          onChangeText={handleSearch}
                          placeholder="Search by username or phone"
                          placeholderTextColor="#6b7280"
                          style={{
                            color: colors.text,
                            fontSize: 16,
                            paddingVertical: 14,
                            flex: 1,
                            marginLeft: 8,
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {isSearching && <ActivityIndicator size="small" color="#6b7280" />}
                      </View>
                    </View>

                    <View className="px-5 pb-3">
                      <Pressable
                        onPress={handleFindFromContacts}
                        disabled={isLoadingContacts}
                        style={{
                          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        }}
                        className="rounded-xl px-4 py-3 flex-row items-center"
                      >
                        {isLoadingContacts ? (
                          <ActivityIndicator size="small" color="#FA114F" />
                        ) : (
                          <Phone size={20} color="#FA114F" />
                        )}
                        <Text className="text-black dark:text-white font-medium ml-3 flex-1">
                          {isLoadingContacts ? 'Finding friends...' : 'Find Friends from Contacts'}
                        </Text>
                        <UserPlus size={20} color="#6b7280" />
                      </Pressable>
                    </View>

                    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                      {searchQuery.length >= 2 && searchResults.filter((f) => f?.id).length > 0 && (
                        <View className="py-2">
                          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">Search Results</Text>
                          {searchResults.filter((f) => f?.id).map((friend) => {
                            const isSelected = invitedFriends.includes(friend.id);
                            return (
                              <Pressable
                                key={friend.id}
                                onPress={() => toggleFriend(friend.id)}
                                style={{
                                  borderBottomWidth: 1,
                                  borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                }}
                                className="flex-row items-center px-5 py-3"
                              >
                                {friend.avatar ? (
                                  <Image source={{ uri: friend.avatar }} className="w-12 h-12 rounded-full" />
                                ) : (
                                  <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                    <Text className="text-white text-xs font-bold">{(friend.name || 'U')[0]}</Text>
                                  </View>
                                )}
                                <View className="flex-1 ml-3">
                                  <Text className="text-black dark:text-white font-medium">{friend.name || 'User'}</Text>
                                  <Text className="text-gray-600 dark:text-gray-500 text-sm">{friend.username || ''}</Text>
                                </View>
                                <View className={cn('w-6 h-6 rounded-full items-center justify-center', isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600')}>
                                  {isSelected && <Check size={14} color="white" strokeWidth={3} />}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {searchQuery.length < 2 && availableFriends.filter((f) => f?.id).length > 0 && (
                        <View className="py-2">
                          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">Friends</Text>
                          {availableFriends.filter((f) => f?.id).map((friend) => {
                            const isSelected = invitedFriends.includes(friend.id);
                            return (
                              <Pressable
                                key={friend.id}
                                onPress={() => toggleFriend(friend.id)}
                                style={{
                                  borderBottomWidth: 1,
                                  borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                }}
                                className="flex-row items-center px-5 py-3"
                              >
                                {friend.avatar ? (
                                  <Image source={{ uri: friend.avatar }} className="w-12 h-12 rounded-full" />
                                ) : (
                                  <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                    <Text className="text-white text-xs font-bold">{(friend.name || 'U')[0]}</Text>
                                  </View>
                                )}
                                <View className="flex-1 ml-3">
                                  <Text className="text-black dark:text-white font-medium">{friend.name || 'User'}</Text>
                                  <Text className="text-gray-600 dark:text-gray-500 text-sm">{friend.username || ''}</Text>
                                </View>
                                <View className={cn('w-6 h-6 rounded-full items-center justify-center', isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600')}>
                                  {isSelected && <Check size={14} color="white" strokeWidth={3} />}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                        <View className="px-5 py-8 items-center">
                          <Text className="text-gray-500 dark:text-gray-400 text-center">No users found matching "{searchQuery}"</Text>
                        </View>
                      )}
                    </ScrollView>
                  </Animated.View>
                </Pressable>
              </Pressable>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        <FairPlayModal />
      </View>
    );
  }

  // ============================================================
  // STEP 2 (team only): Team Setup
  // ============================================================
  if (currentStep === 'teams') {
    const TEAM_COLORS = [
      { name: 'Red', hex: '#EF4444' },
      { name: 'Blue', hex: '#3B82F6' },
      { name: 'Green', hex: '#22C55E' },
      { name: 'Purple', hex: '#8B5CF6' },
      { name: 'Orange', hex: '#F97316' },
      { name: 'Teal', hex: '#14B8A6' },
    ];

    const TEAM_EMOJIS = ['🔴', '🔵', '🟢', '🟣', '🟠', '🟤'];

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Overscroll background */}
          <View
            style={{
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
              height: 1000,
              backgroundColor: colors.isDark ? '#1C1C1E' : '#F3E8FF',
            }}
          />

          {/* Header */}
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#F3E8FF', colors.bg]}
            style={{
              paddingTop: 24,
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View className="mb-4">
              <LiquidGlassBackButton onPress={handleBackToInfo} />
            </View>

            {/* Step Indicator */}
            <View className="flex-row items-center mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-blue-500 items-center justify-center">
                  <Text className="text-white font-bold text-xs">2</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">3</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">4</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">5</Text>
                </View>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">Step {stepNumber('teams')} of {totalSteps}</Text>
            </View>

            <Animated.View entering={FadeInDown.duration(600)}>
              <Text className="text-black dark:text-white text-3xl font-bold">Set Up Teams</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
                Customize your {teamCount} teams
              </Text>
            </Animated.View>
          </LinearGradient>

          {/* Team Cards */}
          {teams.slice(0, teamCount).map((team, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.duration(500).delay(100 + index * 80)}
              className="px-5 mb-4"
            >
              <View
                style={{
                  backgroundColor: team.color + '10',
                  borderWidth: 1,
                  borderColor: team.color + '30',
                }}
                className="rounded-2xl p-4"
              >
                {/* Team Header */}
                <View className="flex-row items-center mb-4">
                  <Text style={{ fontSize: 28 }}>{team.emoji}</Text>
                  <View className="flex-1 ml-3">
                    <Text className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                      Team {index + 1}
                    </Text>
                    <View
                      style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)', minHeight: 44 }}
                      className="rounded-xl px-3 justify-center"
                    >
                      <TextInput
                        value={team.name}
                        onChangeText={(text) => {
                          const updated = [...teams];
                          updated[index] = { ...updated[index], name: text };
                          setTeams(updated);
                        }}
                        placeholder={`Team ${index + 1} name`}
                        placeholderTextColor={colors.isDark ? '#6b7280' : '#9ca3af'}
                        style={{ color: colors.text, fontSize: 16, paddingVertical: 8 }}
                        maxLength={20}
                      />
                    </View>
                  </View>
                </View>

                {/* Color Swatches */}
                <Text className="text-gray-500 dark:text-gray-400 text-xs mb-2">Team Color</Text>
                <View className="flex-row" style={{ gap: 10 }}>
                  {TEAM_COLORS.map((tc) => (
                    <Pressable
                      key={tc.hex}
                      onPress={() => {
                        const updated = [...teams];
                        const colorIndex = TEAM_COLORS.findIndex(c => c.hex === tc.hex);
                        updated[index] = {
                          ...updated[index],
                          color: tc.hex,
                          emoji: TEAM_EMOJIS[colorIndex] || team.emoji,
                        };
                        setTeams(updated);
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: tc.hex,
                          borderWidth: team.color === tc.hex ? 3 : 0,
                          borderColor: colors.isDark ? 'white' : '#1f2937',
                        }}
                        className="items-center justify-center"
                      >
                        {team.color === tc.hex && (
                          <Check size={16} color="white" strokeWidth={3} />
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Animated.View>
          ))}

          {/* Continue Button */}
          <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
            <Pressable onPress={handleNextFromTeams} className="active:opacity-80">
              <LinearGradient
                colors={['#8B5CF6', '#7C3AED']}
                style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
              >
                <Text className="text-white text-lg font-bold">Continue</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ============================================================
  // STEP 2/3: Prize Pool Configuration
  // ============================================================
  if (currentStep === 'prize') {
    const PRIZE_AMOUNTS = [10, 25, 50, 100];
    const BUY_IN_AMOUNTS = [5, 10, 25, 50];
    const PAYOUT_OPTIONS: { label: string; value: Record<string, number> }[] = [
      { label: 'Winner takes all', value: { first: 100 } },
      { label: '70/30 split', value: { first: 70, second: 30 } },
      { label: '50/30/20 split', value: { first: 50, second: 30, third: 20 } },
    ];

    // Compute effective amounts based on mode
    const effectiveBuyIn = customBuyInAmount ? parseFloat(customBuyInAmount) || 0 : buyInAmount;
    const effectiveAmount = prizePoolMode === 'buy_in'
      ? effectiveBuyIn
      : (customPrizeAmount ? parseFloat(customPrizeAmount) || 0 : prizeAmount);
    const stripeFee = effectiveAmount > 0 ? (effectiveAmount * 0.029 + 0.30) : 0;
    const totalCharge = effectiveAmount + stripeFee;

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Overscroll background */}
          <View
            style={{
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
              height: 1000,
              backgroundColor: colors.isDark ? '#1C1C1E' : '#FFF8E1',
            }}
          />

          {/* Header */}
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#FFF8E1', colors.bg]}
            style={{
              paddingTop: 24,
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View className="mb-4">
              <LiquidGlassBackButton onPress={isTeamCompetition ? handleBackToTeams : handleBackToInfo} />
            </View>

            {/* Step Indicator */}
            <View className="flex-row items-center mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
                <View className="w-6 h-0.5 bg-green-500" />
                <View className="w-7 h-7 rounded-full bg-blue-500 items-center justify-center">
                  <Text className="text-white font-bold text-xs">2</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">3</Text>
                </View>
                <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">4</Text>
                </View>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">Step {stepNumber('prize')} of {totalSteps}</Text>
            </View>

            <Animated.View entering={FadeInDown.duration(600)}>
              <Text className="text-black dark:text-white text-3xl font-bold">Prize Pool</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
                Add a cash prize to make it exciting (optional)
              </Text>
            </Animated.View>
          </LinearGradient>

          {/* Enable Prize Pool Toggle */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)} className="px-5 mb-6">
            <View style={{ backgroundColor: colors.card }} className="rounded-2xl px-4 py-4">
              <View className="flex-row items-center">
                <View className="flex-row flex-1 items-center">
                  <Trophy size={20} color="#FFC107" />
                  <View className="ml-3 flex-1">
                    <Text className="text-black dark:text-white font-medium">Add Prize Pool</Text>
                    <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                      Winner gets paid automatically
                    </Text>
                  </View>
                </View>
                <Switch
                  value={wantsPrizePool}
                  onValueChange={setWantsPrizePool}
                  trackColor={{
                    false: colors.isDark ? '#3a3a3c' : '#d1d5db',
                    true: '#FFC10740',
                  }}
                  thumbColor={wantsPrizePool ? '#FFC107' : colors.isDark ? '#f4f3f4' : '#ffffff'}
                />
              </View>
            </View>
          </Animated.View>

          {/* Prize Configuration (shown when enabled) */}
          {wantsPrizePool && (
            <>
              {/* Funding Mode Selector */}
              <Animated.View entering={FadeIn.duration(400)} className="px-5 mb-6">
                <Text className="text-black dark:text-white text-lg font-semibold mb-3">
                  Funding Type
                </Text>
                <View style={{ gap: 10 }}>
                  {/* Creator Funded Option */}
                  <Pressable
                    onPress={() => setPrizePoolMode('creator_funded')}
                    className="active:opacity-80"
                  >
                    <View
                      style={{
                        backgroundColor: prizePoolMode === 'creator_funded'
                          ? colors.isDark ? 'rgba(255,193,7,0.12)' : 'rgba(255,193,7,0.1)'
                          : colors.card,
                        borderWidth: prizePoolMode === 'creator_funded' ? 1 : 0,
                        borderColor: 'rgba(255,193,7,0.4)',
                      }}
                      className="rounded-2xl p-4 flex-row items-center"
                    >
                      <View
                        className="w-11 h-11 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(255,193,7,0.15)' }}
                      >
                        <Wallet size={22} color="#FFC107" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="text-black dark:text-white font-medium">I'll Fund It</Text>
                        <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                          You pay the full prize. Participants join free.
                        </Text>
                      </View>
                      {prizePoolMode === 'creator_funded' && (
                        <View className="w-6 h-6 rounded-full bg-amber-500 items-center justify-center">
                          <Check size={14} color="white" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                  </Pressable>

                  {/* Buy-In Option */}
                  <Pressable
                    onPress={() => setPrizePoolMode('buy_in')}
                    className="active:opacity-80"
                  >
                    <View
                      style={{
                        backgroundColor: prizePoolMode === 'buy_in'
                          ? colors.isDark ? 'rgba(255,193,7,0.12)' : 'rgba(255,193,7,0.1)'
                          : colors.card,
                        borderWidth: prizePoolMode === 'buy_in' ? 1 : 0,
                        borderColor: 'rgba(255,193,7,0.4)',
                      }}
                      className="rounded-2xl p-4 flex-row items-center"
                    >
                      <View
                        className="w-11 h-11 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(255,193,7,0.15)' }}
                      >
                        <DollarSign size={22} color="#FFC107" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="text-black dark:text-white font-medium">Everyone Buys In</Text>
                        <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                          Each participant pays to join. Pool grows with players.
                        </Text>
                      </View>
                      {prizePoolMode === 'buy_in' && (
                        <View className="w-6 h-6 rounded-full bg-amber-500 items-center justify-center">
                          <Check size={14} color="white" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              </Animated.View>

              {/* Creator-Funded: Prize Amount */}
              {prizePoolMode === 'creator_funded' && (
                <Animated.View entering={FadeIn.duration(400)} className="px-5 mb-6">
                  <Text className="text-black dark:text-white text-lg font-semibold mb-3">
                    Prize Amount
                  </Text>
                  <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                    {PRIZE_AMOUNTS.map((amt) => (
                      <Pressable
                        key={amt}
                        onPress={() => {
                          setPrizeAmount(amt);
                          setCustomPrizeAmount('');
                        }}
                        className="active:opacity-80"
                      >
                        <View
                          style={{
                            backgroundColor: prizeAmount === amt && !customPrizeAmount ? '#FFC10720' : colors.card,
                            borderWidth: prizeAmount === amt && !customPrizeAmount ? 1 : 0,
                            borderColor: '#FFC10750',
                            minWidth: 70,
                          }}
                          className="px-4 py-3 rounded-xl items-center"
                        >
                          <Text
                            className={cn(
                              'font-semibold text-lg',
                              prizeAmount === amt && !customPrizeAmount
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-black dark:text-white'
                            )}
                          >
                            ${amt}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>

                  {/* Custom Amount */}
                  <View
                    style={{ backgroundColor: colors.card }}
                    className="rounded-xl px-4 mt-3 flex-row items-center"
                  >
                    <Text className="text-gray-500 dark:text-gray-400 text-lg mr-1">$</Text>
                    <TextInput
                      value={customPrizeAmount}
                      onChangeText={(text) => {
                        setCustomPrizeAmount(text.replace(/[^0-9.]/g, ''));
                      }}
                      placeholder="Custom amount (5-500)"
                      placeholderTextColor="#6b7280"
                      keyboardType="decimal-pad"
                      style={{
                        color: colors.text,
                        fontSize: 16,
                        paddingVertical: 14,
                        flex: 1,
                      }}
                    />
                  </View>
                </Animated.View>
              )}

              {/* Buy-In: Buy-In Amount */}
              {prizePoolMode === 'buy_in' && (
                <>
                  <Animated.View entering={FadeIn.duration(400)} className="px-5 mb-6">
                    <Text className="text-black dark:text-white text-lg font-semibold mb-3">
                      Buy-In Amount
                    </Text>
                    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                      {BUY_IN_AMOUNTS.map((amt) => (
                        <Pressable
                          key={amt}
                          onPress={() => {
                            setBuyInAmount(amt);
                            setCustomBuyInAmount('');
                          }}
                          className="active:opacity-80"
                        >
                          <View
                            style={{
                              backgroundColor: buyInAmount === amt && !customBuyInAmount ? '#FFC10720' : colors.card,
                              borderWidth: buyInAmount === amt && !customBuyInAmount ? 1 : 0,
                              borderColor: '#FFC10750',
                              minWidth: 70,
                            }}
                            className="px-4 py-3 rounded-xl items-center"
                          >
                            <Text
                              className={cn(
                                'font-semibold text-lg',
                                buyInAmount === amt && !customBuyInAmount
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-black dark:text-white'
                              )}
                            >
                              ${amt}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>

                    {/* Custom Buy-In Amount */}
                    <View
                      style={{ backgroundColor: colors.card }}
                      className="rounded-xl px-4 mt-3 flex-row items-center"
                    >
                      <Text className="text-gray-500 dark:text-gray-400 text-lg mr-1">$</Text>
                      <TextInput
                        value={customBuyInAmount}
                        onChangeText={(text) => {
                          setCustomBuyInAmount(text.replace(/[^0-9.]/g, ''));
                        }}
                        placeholder="Custom amount (1-100)"
                        placeholderTextColor="#6b7280"
                        keyboardType="decimal-pad"
                        style={{
                          color: colors.text,
                          fontSize: 16,
                          paddingVertical: 14,
                          flex: 1,
                        }}
                      />
                    </View>
                  </Animated.View>

                  {/* Buy-In: Pool Preview */}
                  <Animated.View entering={FadeIn.duration(400).delay(50)} className="px-5 mb-6">
                    <View
                      style={{
                        backgroundColor: colors.isDark ? 'rgba(255,193,7,0.08)' : 'rgba(255,193,7,0.1)',
                        borderWidth: 1,
                        borderColor: colors.isDark ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.25)',
                      }}
                      className="rounded-xl p-4"
                    >
                      <Text className="text-amber-600 dark:text-amber-400 font-semibold text-sm mb-3">
                        Prize Pool Preview
                      </Text>
                      {[4, 8, 12].map((count) => (
                        <View key={count} className="flex-row justify-between mb-1.5">
                          <Text className="text-gray-600 dark:text-gray-400 text-sm">
                            {count} players
                          </Text>
                          <Text className="text-black dark:text-white font-medium text-sm">
                            ${(effectiveBuyIn * count).toFixed(0)} total
                          </Text>
                        </View>
                      ))}
                      <Text className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                        You'll pay your ${effectiveBuyIn.toFixed(0)} buy-in as the first participant
                      </Text>
                    </View>
                  </Animated.View>
                </>
              )}

              {/* Payout Structure */}
              <Animated.View entering={FadeIn.duration(400).delay(100)} className="px-5 mb-6">
                <Text className="text-black dark:text-white text-lg font-semibold mb-3">
                  Payout Structure
                </Text>
                <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
                  {PAYOUT_OPTIONS.map((option, index) => {
                    const isSelected = JSON.stringify(payoutStructure) === JSON.stringify(option.value);
                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => setPayoutStructure(option.value)}
                        className="flex-row items-center justify-between px-4 py-4"
                        style={{
                          borderBottomWidth: index < PAYOUT_OPTIONS.length - 1 ? 1 : 0,
                          borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        }}
                      >
                        <Text className="text-black dark:text-white">{option.label}</Text>
                        {isSelected && (
                          <View className="w-6 h-6 rounded-full bg-amber-500 items-center justify-center">
                            <Check size={14} color="white" strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* Fee Breakdown */}
              <Animated.View entering={FadeIn.duration(400).delay(200)} className="px-5 mb-6">
                <View
                  style={{
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderWidth: 1,
                    borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  }}
                  className="rounded-xl p-4"
                >
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-500 dark:text-gray-400">
                      {prizePoolMode === 'buy_in' ? 'Your buy-in' : 'Prize amount'}
                    </Text>
                    <Text className="text-black dark:text-white font-medium">
                      ${effectiveAmount.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-500 dark:text-gray-400">Processing fee</Text>
                    <Text className="text-gray-500 dark:text-gray-400">
                      ${stripeFee.toFixed(2)}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                    className="flex-row justify-between"
                  >
                    <Text className="text-black dark:text-white font-semibold">Total charge</Text>
                    <Text className="text-black dark:text-white font-semibold">
                      ${totalCharge.toFixed(2)}
                    </Text>
                  </View>
                </View>
                <Text className="text-gray-400 dark:text-gray-500 text-xs text-center mt-2">
                  {prizePoolMode === 'buy_in'
                    ? `Each participant pays $${effectiveAmount.toFixed(2)} + fee to join`
                    : `Winner receives the full $${effectiveAmount.toFixed(2)} prize`
                  }
                </Text>
              </Animated.View>
            </>
          )}

          {/* Continue Button */}
          <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
            <Pressable onPress={handleNextFromPrize} className="active:opacity-80">
              <LinearGradient
                colors={wantsPrizePool ? ['#FFC107', '#FF9800'] : ['#FA114F', '#D10040']}
                style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
              >
                <Text className="text-white text-lg font-semibold">
                  {wantsPrizePool ? 'Continue with Prize' : 'Continue without Prize'}
                </Text>
              </LinearGradient>
            </Pressable>

            {!wantsPrizePool && (
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-3">
                You can add a prize pool later from competition settings
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ============================================================
  // STEP 1: Competition Setup Form
  // ============================================================
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Overscroll background */}
        <View
          style={{
            position: 'absolute',
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: colors.isDark ? '#1C1C1E' : '#FFE0B2',
          }}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#FFE0B2', colors.bg]}
          style={{
            paddingTop: 24,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View className="mb-4">
            <LiquidGlassBackButton onPress={() => router.back()} />
          </View>

          {/* Step Indicator */}
          <View className="flex-row items-center mb-4">
            <View className="flex-row items-center">
              <View className="w-7 h-7 rounded-full bg-blue-500 items-center justify-center">
                <Text className="text-white font-bold text-xs">1</Text>
              </View>
              <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">2</Text>
              </View>
              <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">3</Text>
              </View>
              <View className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-center justify-center">
                <Text className="text-gray-500 dark:text-gray-400 font-bold text-xs">4</Text>
              </View>
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-sm ml-3">Step {stepNumber('info')} of {totalSteps}</Text>
          </View>

          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-black dark:text-white text-3xl font-bold">
              Competition Info
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
              Set up your challenge details
            </Text>
          </Animated.View>
        </LinearGradient>

        {/* Competition Name */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">
            Competition Name
          </Text>
          <View
            style={{ backgroundColor: colors.card, minHeight: 56 }}
            className="rounded-2xl px-4 justify-center"
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., Weekend Warriors"
              placeholderTextColor={colors.isDark ? '#6b7280' : '#9ca3af'}
              style={{
                color: colors.text,
                fontSize: 16,
                paddingTop: 14,
                paddingBottom: 14,
              }}
              maxLength={40}
            />
          </View>
        </Animated.View>

        {/* Schedule */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)} className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Schedule</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
            {/* Start Date */}
            <Pressable
              onPress={() => setShowStartPicker(true)}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              }}
              className="flex-row items-center justify-between px-4 py-4"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color="#92E82A" />
                <Text className="text-black dark:text-white ml-3">Start Date</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 mr-2">
                  {startDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <ChevronRight size={18} color="#6b7280" />
              </View>
            </Pressable>

            {/* End Date */}
            <Pressable
              onPress={() => setShowEndPicker(true)}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              }}
              className="flex-row items-center justify-between px-4 py-4"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color="#FA114F" />
                <Text className="text-black dark:text-white ml-3">End Date</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 mr-2">
                  {endDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <ChevronRight size={18} color="#6b7280" />
              </View>
            </Pressable>

            {/* Repeat */}
            <Pressable
              onPress={() => setShowRepeatPicker(true)}
              className="flex-row items-center justify-between px-4 py-4"
            >
              <View className="flex-row items-center">
                <Repeat size={20} color="#00D4FF" />
                <Text className="text-black dark:text-white ml-3">Repeat</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 mr-2">
                  {REPEAT_OPTIONS.find((r) => r.id === repeat)?.name}
                </Text>
                <ChevronRight size={18} color="#6b7280" />
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Visibility */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Visibility</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl pl-4 pr-10 py-4">
            <View className="flex-row items-center">
              <View className="flex-row flex-1 items-center">
                {isPublic ? (
                  <Globe size={20} color="#92E82A" />
                ) : (
                  <Lock size={20} color="#6b7280" />
                )}
                <View className="ml-3 flex-1">
                  <Text className="text-black dark:text-white">
                    {isPublic ? 'Public' : 'Private'}
                  </Text>
                  <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                    {isPublic ? 'Anyone can find and join' : 'Only invited friends can join'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{
                  false: colors.isDark ? '#3a3a3c' : '#d1d5db',
                  true: '#92E82A40',
                }}
                thumbColor={isPublic ? '#92E82A' : colors.isDark ? '#f4f3f4' : '#ffffff'}
              />
            </View>
          </View>
        </Animated.View>

        {/* Scoring Type */}
        <Animated.View entering={FadeInDown.duration(500).delay(250)} className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">
            Scoring Method
          </Text>
          <View className="space-y-2">
            {SCORING_TYPES.map((scoring) => {
              const Icon = scoringIcons[scoring.icon] || Circle;
              const isSelected = scoringType === scoring.id;

              return (
                <Pressable
                  key={scoring.id}
                  onPress={() => setScoringType(scoring.id)}
                  className="active:opacity-80"
                >
                  <View
                    className="rounded-2xl p-4 flex-row items-center"
                    style={{
                      backgroundColor: isSelected ? scoring.color + '15' : colors.card,
                      borderWidth: isSelected ? 1 : 0,
                      borderColor: isSelected ? scoring.color + '50' : 'transparent',
                    }}
                  >
                    <View
                      className="w-12 h-12 rounded-full items-center justify-center"
                      style={{ backgroundColor: scoring.color + '20' }}
                    >
                      <Icon size={24} color={scoring.color} />
                    </View>
                    <View className="flex-1 ml-4">
                      <Text className="text-black dark:text-white font-medium">{scoring.name}</Text>
                      <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                        {scoring.description}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      {scoring.learnMore && (
                        <Pressable
                          onPress={() => setShowLearnMore(scoring.id)}
                          className="p-2 mr-2"
                          hitSlop={8}
                        >
                          <Info size={18} color="#6b7280" />
                        </Pressable>
                      )}
                      {isSelected && (
                        <View
                          className="w-6 h-6 rounded-full items-center justify-center"
                          style={{ backgroundColor: scoring.color }}
                        >
                          <Check size={14} color="white" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Workout Options (if workout scoring selected) */}
        {scoringType === 'workout' && (
          <Animated.View entering={FadeIn.duration(400)} className="px-5 mb-6">
            <Text className="text-black dark:text-white text-lg font-semibold mb-3">
              Workout Types
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {WORKOUT_TYPES.map((workout) => {
                const Icon = workoutIcons[workout.icon] || Footprints;
                const isSelected = selectedWorkoutTypes.includes(workout.id);

                return (
                  <Pressable
                    key={workout.id}
                    onPress={() => toggleWorkoutType(workout.id)}
                    className="active:opacity-80"
                  >
                    <View
                      className="px-4 py-3 rounded-xl flex-row items-center"
                      style={{
                        backgroundColor: isSelected ? '#FF6B3520' : colors.card,
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? '#FF6B3550' : 'transparent',
                      }}
                    >
                      <Icon size={18} color={isSelected ? '#FF6B35' : '#6b7280'} />
                      <Text
                        className={cn(
                          'ml-2 font-medium',
                          isSelected
                            ? 'text-black dark:text-white'
                            : 'text-gray-500 dark:text-gray-400'
                        )}
                      >
                        {workout.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-black dark:text-white text-lg font-semibold mt-6 mb-3">
              Workout Metric
            </Text>
            <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
              {WORKOUT_METRICS.map((metric, index) => {
                const isSelected = workoutMetric === metric.id;

                return (
                  <Pressable
                    key={metric.id}
                    onPress={() => setWorkoutMetric(metric.id)}
                    className="flex-row items-center justify-between px-4 py-4"
                    style={{
                      borderBottomWidth: index < WORKOUT_METRICS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.isDark
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <View>
                      <Text className="text-black dark:text-white">{metric.name}</Text>
                      <Text className="text-gray-600 dark:text-gray-500 text-sm">
                        {metric.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-6 h-6 rounded-full bg-fitness-accent items-center justify-center">
                        <Check size={14} color="white" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Team Competition Toggle */}
        <Animated.View entering={FadeInDown.duration(500).delay(300)} className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Team Mode</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
            <View className="pl-4 pr-4 py-4">
              <View className="flex-row items-center">
                <View className="flex-row flex-1 items-center">
                  <Users size={20} color={isTeamCompetition ? '#8B5CF6' : '#6b7280'} />
                  <View className="ml-3 flex-1">
                    <Text className="text-black dark:text-white">
                      {isTeamCompetition ? 'Team Competition' : 'Individual'}
                    </Text>
                    <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                      {isTeamCompetition ? 'Participants join teams' : 'Everyone competes solo'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isTeamCompetition}
                  onValueChange={(val) => {
                    setIsTeamCompetition(val);
                    if (val) {
                      setTeams(DEFAULT_TEAMS.slice(0, teamCount));
                    }
                  }}
                  trackColor={{
                    false: colors.isDark ? '#3a3a3c' : '#d1d5db',
                    true: '#8B5CF640',
                  }}
                  thumbColor={isTeamCompetition ? '#8B5CF6' : colors.isDark ? '#f4f3f4' : '#ffffff'}
                />
              </View>
            </View>

            {/* Team Count Selector */}
            {isTeamCompetition && (
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                }}
                className="px-4 py-4"
              >
                <Text className="text-gray-600 dark:text-gray-400 text-sm mb-3">Number of Teams</Text>
                <View className="flex-row" style={{ gap: 10 }}>
                  {[2, 3, 4].map((count) => (
                    <Pressable
                      key={count}
                      onPress={() => {
                        setTeamCount(count);
                        setTeams(DEFAULT_TEAMS.slice(0, count));
                      }}
                      className="flex-1 active:opacity-80"
                    >
                      <View
                        className="py-3 rounded-xl items-center justify-center"
                        style={{
                          backgroundColor: teamCount === count ? '#8B5CF615' : colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          borderWidth: teamCount === count ? 1 : 0,
                          borderColor: teamCount === count ? '#8B5CF650' : 'transparent',
                        }}
                      >
                        <Text
                          className="font-bold text-lg"
                          style={{ color: teamCount === count ? '#8B5CF6' : colors.isDark ? '#9ca3af' : '#6b7280' }}
                        >
                          {count}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: teamCount === count ? '#8B5CF6' : colors.isDark ? '#6b7280' : '#9ca3af' }}
                        >
                          teams
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Continue Button */}
        <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable
            onPress={handleNextFromInfo}
            disabled={!isValid}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={
                isValid
                  ? ['#FA114F', '#D10040']
                  : colors.isDark
                  ? ['#3a3a3c', '#2a2a2c']
                  : ['#d1d5db', '#9ca3af']
              }
              style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
            >
              <Text
                className={cn(
                  'text-lg font-semibold',
                  isValid ? 'text-white' : colors.isDark ? 'text-gray-500' : 'text-gray-600'
                )}
              >
                Next: Prize Pool
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>

      {/* ============ MODALS ============ */}

      {/* Start Date Picker */}
      {showStartPicker && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
            onPress={() => setShowStartPicker(false)}
          >
            <View
              style={{ backgroundColor: colors.card, width: '100%' }}
              className="rounded-3xl overflow-hidden"
            >
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)',
                }}
                className="flex-row items-center justify-between px-5 py-4"
              >
                <Pressable onPress={() => setShowStartPicker(false)}>
                  <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
                </Pressable>
                <Text className="text-black dark:text-white font-semibold">Start Date</Text>
                <Pressable onPress={() => setShowStartPicker(false)}>
                  <Text className="text-fitness-accent font-semibold">Done</Text>
                </Pressable>
              </View>
              <View className="items-center justify-center py-4">
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(e, date) => date && setStartDate(date)}
                  textColor={colors.text}
                  style={{ height: 200, width: '100%' }}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* End Date Picker */}
      {showEndPicker && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
            onPress={() => setShowEndPicker(false)}
          >
            <View
              style={{ backgroundColor: colors.card, width: '100%' }}
              className="rounded-3xl overflow-hidden"
            >
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)',
                }}
                className="flex-row items-center justify-between px-5 py-4"
              >
                <Pressable onPress={() => setShowEndPicker(false)}>
                  <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
                </Pressable>
                <Text className="text-black dark:text-white font-semibold">End Date</Text>
                <Pressable onPress={() => setShowEndPicker(false)}>
                  <Text className="text-fitness-accent font-semibold">Done</Text>
                </Pressable>
              </View>
              <View className="items-center justify-center py-4">
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date(startDate.getTime() + 24 * 60 * 60 * 1000)}
                  onChange={(e, date) => date && setEndDate(date)}
                  textColor={colors.text}
                  style={{ height: 200, width: '100%' }}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Repeat Picker */}
      {showRepeatPicker && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
            onPress={() => setShowRepeatPicker(false)}
          >
            <View
              style={{ backgroundColor: colors.card, width: '100%' }}
              className="rounded-3xl overflow-hidden"
            >
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)',
                }}
                className="flex-row items-center justify-between px-5 py-4"
              >
                <Pressable onPress={() => setShowRepeatPicker(false)}>
                  <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
                </Pressable>
                <Text className="text-black dark:text-white font-semibold">Repeat</Text>
                <Pressable onPress={() => setShowRepeatPicker(false)}>
                  <Text className="text-fitness-accent font-semibold">Done</Text>
                </Pressable>
              </View>
              <View className="py-2">
                {REPEAT_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setRepeat(option.id);
                      setShowRepeatPicker(false);
                    }}
                    className="flex-row items-center justify-between px-5 py-4"
                  >
                    <Text className="text-black dark:text-white">{option.name}</Text>
                    {repeat === option.id && (
                      <View className="w-6 h-6 rounded-full bg-fitness-accent items-center justify-center">
                        <Check size={14} color="white" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Learn More Modal */}
      {showLearnMore && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
            onPress={() => setShowLearnMore(null)}
          >
            <View
              style={{ backgroundColor: colors.card, width: '100%' }}
              className="rounded-3xl overflow-hidden p-6"
            >
              {(() => {
                const scoring = SCORING_TYPES.find((s) => s.id === showLearnMore);
                if (!scoring?.learnMore) return null;

                return (
                  <>
                    <Text className="text-black dark:text-white text-xl font-bold mb-2">
                      {scoring.name}
                    </Text>
                    <Text className="text-gray-600 dark:text-gray-400 text-base leading-relaxed">
                      {scoring.learnMore}
                    </Text>
                    <Pressable onPress={() => setShowLearnMore(null)} className="mt-6">
                      <LinearGradient
                        colors={[scoring.color, scoring.color + 'CC']}
                        style={{ borderRadius: 12, padding: 14, alignItems: 'center' }}
                      >
                        <Text className="text-white font-semibold">Got it</Text>
                      </LinearGradient>
                    </Pressable>
                  </>
                );
              })()}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Friend Picker Modal */}
      {showFriendPicker && (
        <Modal transparent animationType="none" visible={showFriendPicker}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <Pressable style={{ flex: 1 }} onPress={handleCloseModal}>
              {/* Overlay */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'black',
                  },
                  overlayAnimatedStyle,
                ]}
              />

              {/* Modal Content */}
              <Pressable
                style={{ flex: 1, justifyContent: 'flex-end' }}
                onPress={(e) => e.stopPropagation()}
              >
                <Animated.View
                  style={[
                    {
                      backgroundColor: colors.card,
                      height: screenHeight * 0.65,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 24,
                    },
                    modalAnimatedStyle,
                  ]}
                >
                  {/* Header */}
                  <View
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: colors.isDark
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(0,0,0,0.1)',
                    }}
                    className="flex-row items-center justify-between px-5 py-4"
                  >
                    <Pressable onPress={handleCloseModal}>
                      <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
                    </Pressable>
                    <Text className="text-black dark:text-white font-semibold">Invite Friends</Text>
                    <Pressable onPress={handleCloseModal}>
                      <Text className="text-fitness-accent font-semibold">Done</Text>
                    </Pressable>
                  </View>

                  {/* Search Input */}
                  <View className="px-5 py-3">
                    <View
                      style={{
                        backgroundColor: colors.isDark
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(0,0,0,0.05)',
                      }}
                      className="rounded-xl px-4 flex-row items-center"
                    >
                      <Search size={18} color="#6b7280" />
                      <TextInput
                        value={searchQuery}
                        onChangeText={handleSearch}
                        placeholder="Search by username or phone"
                        placeholderTextColor="#6b7280"
                        style={{
                          color: colors.text,
                          fontSize: 16,
                          paddingVertical: 14,
                          flex: 1,
                          marginLeft: 8,
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {isSearching && <ActivityIndicator size="small" color="#6b7280" />}
                    </View>
                  </View>

                  {/* Find from Contacts */}
                  <View className="px-5 pb-3">
                    <Pressable
                      onPress={handleFindFromContacts}
                      disabled={isLoadingContacts}
                      style={{
                        backgroundColor: colors.isDark
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(0,0,0,0.05)',
                      }}
                      className="rounded-xl px-4 py-3 flex-row items-center"
                    >
                      {isLoadingContacts ? (
                        <ActivityIndicator size="small" color="#FA114F" />
                      ) : (
                        <Phone size={20} color="#FA114F" />
                      )}
                      <Text className="text-black dark:text-white font-medium ml-3 flex-1">
                        {isLoadingContacts ? 'Finding friends...' : 'Find Friends from Contacts'}
                      </Text>
                      <UserPlus size={20} color="#6b7280" />
                    </Pressable>
                  </View>

                  {/* Friends List */}
                  <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 20 }}
                  >
                    {/* Search Results */}
                    {searchQuery.length >= 2 &&
                      searchResults.filter((f) => f?.id).length > 0 && (
                        <View className="py-2">
                          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">
                            Search Results
                          </Text>
                          {searchResults
                            .filter((f) => f?.id)
                            .map((friend) => {
                              const isSelected = invitedFriends.includes(friend.id);
                              return (
                                <Pressable
                                  key={friend.id}
                                  onPress={() => toggleFriend(friend.id)}
                                  style={{
                                    borderBottomWidth: 1,
                                    borderBottomColor: colors.isDark
                                      ? 'rgba(255,255,255,0.05)'
                                      : 'rgba(0,0,0,0.05)',
                                  }}
                                  className="flex-row items-center px-5 py-3"
                                >
                                  {friend.avatar ? (
                                    <Image
                                      source={{ uri: friend.avatar }}
                                      className="w-12 h-12 rounded-full"
                                    />
                                  ) : (
                                    <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                      <Text className="text-white text-xs font-bold">
                                        {(friend.name || 'U')[0]}
                                      </Text>
                                    </View>
                                  )}
                                  <View className="flex-1 ml-3">
                                    <Text className="text-black dark:text-white font-medium">
                                      {friend.name || 'User'}
                                    </Text>
                                    <Text className="text-gray-600 dark:text-gray-500 text-sm">
                                      {friend.username || ''}
                                    </Text>
                                  </View>
                                  <View
                                    className={cn(
                                      'w-6 h-6 rounded-full items-center justify-center',
                                      isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600'
                                    )}
                                  >
                                    {isSelected && (
                                      <Check size={14} color="white" strokeWidth={3} />
                                    )}
                                  </View>
                                </Pressable>
                              );
                            })}
                        </View>
                      )}

                    {/* Available Friends */}
                    {searchQuery.length < 2 &&
                      availableFriends.filter((f) => f?.id).length > 0 && (
                        <View className="py-2">
                          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">
                            Friends
                          </Text>
                          {availableFriends
                            .filter((f) => f?.id)
                            .map((friend) => {
                              const isSelected = invitedFriends.includes(friend.id);
                              return (
                                <Pressable
                                  key={friend.id}
                                  onPress={() => toggleFriend(friend.id)}
                                  style={{
                                    borderBottomWidth: 1,
                                    borderBottomColor: colors.isDark
                                      ? 'rgba(255,255,255,0.05)'
                                      : 'rgba(0,0,0,0.05)',
                                  }}
                                  className="flex-row items-center px-5 py-3"
                                >
                                  {friend.avatar ? (
                                    <Image
                                      source={{ uri: friend.avatar }}
                                      className="w-12 h-12 rounded-full"
                                    />
                                  ) : (
                                    <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                      <Text className="text-white text-xs font-bold">
                                        {(friend.name || 'U')[0]}
                                      </Text>
                                    </View>
                                  )}
                                  <View className="flex-1 ml-3">
                                    <Text className="text-black dark:text-white font-medium">
                                      {friend.name || 'User'}
                                    </Text>
                                    <Text className="text-gray-600 dark:text-gray-500 text-sm">
                                      {friend.username || ''}
                                    </Text>
                                  </View>
                                  <View
                                    className={cn(
                                      'w-6 h-6 rounded-full items-center justify-center',
                                      isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600'
                                    )}
                                  >
                                    {isSelected && (
                                      <Check size={14} color="white" strokeWidth={3} />
                                    )}
                                  </View>
                                </Pressable>
                              );
                            })}
                        </View>
                      )}

                    {/* No Results */}
                    {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                      <View className="px-5 py-8 items-center">
                        <Text className="text-gray-500 dark:text-gray-400 text-center">
                          No users found matching "{searchQuery}"
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </Animated.View>
              </Pressable>
            </Pressable>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Fair Play Modal */}
      <FairPlayModal />
    </View>
  );
}