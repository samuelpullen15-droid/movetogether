import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Contacts from 'expo-contacts';
import {
  ChevronLeft,
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
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, FadeOut, SlideInUp, SlideOutDown, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import {
  ScoringType,
  WorkoutType,
  WorkoutMetric,
  RepeatOption,
  CompetitionSettings,
  SCORING_TYPES,
  WORKOUT_TYPES,
  WORKOUT_METRICS,
  REPEAT_OPTIONS,
  MOCK_FRIENDS,
  Friend,
} from '@/lib/competition-types';
import { useFitnessStore } from '@/lib/fitness-store';
import { useAuthStore } from '@/lib/auth-store';
import { createCompetition as createCompetitionService, fetchCompetition } from '@/lib/competition-service';
import { searchUsersByUsername, searchUsersByPhoneNumber, findUsersFromContacts, searchResultToFriend } from '@/lib/user-search-service';
import { normalizePhoneNumber } from '@/lib/phone-verification-service';
import { getAvatarUrl } from '@/lib/avatar-utils';
import { cn } from '@/lib/cn';

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
  const screenHeight = Dimensions.get('window').height;

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [repeat, setRepeat] = useState<RepeatOption>('none');
  const [isPublic, setIsPublic] = useState(false);
  const [scoringType, setScoringType] = useState<ScoringType>('ring_close');
  const [selectedWorkoutTypes, setSelectedWorkoutTypes] = useState<WorkoutType[]>([]);
  const [workoutMetric, setWorkoutMetric] = useState<WorkoutMetric>('distance');
  const [invitedFriends, setInvitedFriends] = useState<string[]>([]);

  // UI state
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState<ScoringType | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Animation values for modal
  const modalTranslateY = useSharedValue(screenHeight * 0.65);
  const overlayOpacity = useSharedValue(0);
  
  const handleCloseModal = useCallback(() => {
    // Prevent double-closing
    if (!isModalVisible || !showFriendPicker) {
      return;
    }

    // Validate screenHeight
    if (!screenHeight || typeof screenHeight !== 'number' || screenHeight <= 0) {
      console.error('Invalid screenHeight in handleCloseModal:', screenHeight);
      // Fallback: close immediately
      try {
        setShowFriendPicker(false);
        setIsModalVisible(false);
      } catch (e: any) {
        console.error('Error closing modal (fallback):', e);
      }
      return;
    }

    // Disable interactions immediately to prevent double-taps
    setIsModalVisible(false);
    
    // Animate out, then unmount after animation completes
    try {
      overlayOpacity.value = withTiming(0, { duration: 300 });
      modalTranslateY.value = withTiming(screenHeight * 0.65, { duration: 300 }, (finished) => {
        'worklet';
        if (finished) {
          runOnJS(setShowFriendPicker)(false);
        }
      });
    } catch (error: any) {
      console.error('Error in handleCloseModal animation:', error);
      // Fallback: close immediately if animation fails
      try {
        setShowFriendPicker(false);
      } catch (e: any) {
        console.error('Error closing modal (animation fallback):', e);
      }
    }
  }, [overlayOpacity, modalTranslateY, screenHeight, invitedFriends, showFriendPicker, isModalVisible]);
  
  useEffect(() => {
    if (showFriendPicker) {
      setIsModalVisible(true);
      // Start from off-screen below, then animate in
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
      // Reset when fully closed
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
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const selectedScoringInfo = SCORING_TYPES.find((s) => s.id === scoringType);

  const toggleWorkoutType = (type: WorkoutType) => {
    setSelectedWorkoutTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleFriend = (friendId: string) => {
    if (!friendId || typeof friendId !== 'string') {
      console.error('Invalid friendId in toggleFriend:', friendId);
      return;
    }

    setInvitedFriends((prev) => {
      const isSelected = prev.includes(friendId);
      const newList = isSelected 
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId];
      
      // If adding a friend from search results, add them to available friends
      if (!isSelected) {
        const friendFromSearch = searchResults.find(f => f && f.id === friendId);
        // Also check availableFriends in case friend was already added from contacts
        const friendFromAvailable = availableFriends.find(f => f && f.id === friendId);
        
        if (friendFromSearch && !friendFromAvailable) {
          // Validate friend object before adding
          if (friendFromSearch.id && friendFromSearch.name) {
            setAvailableFriends((prevFriends) => {
              const exists = prevFriends.find(f => f && f.id === friendId);
              if (!exists) {
                return [...prevFriends, friendFromSearch];
              }
              return prevFriends;
            });
          } else {
            console.error('Invalid friend object from search:', friendFromSearch);
          }
        }
      }
      
      return newList;
    });
  };

  // Search users by username or phone number
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Check if query looks like a phone number (contains digits)
      const hasDigits = /\d/.test(query);
      const cleanedQuery = query.replace(/\D/g, '');
      
      let results;
      if (hasDigits && cleanedQuery.length >= 3) {
        // Search by phone number
        const phoneResults = await searchUsersByPhoneNumber(query);
        // Also search by username in case user typed digits in username
        const usernameResults = await searchUsersByUsername(query);
        
        // Combine and deduplicate
        const allResults = [...phoneResults, ...usernameResults];
        const uniqueResults = Array.from(
          new Map(allResults.map(r => [r.id, r])).values()
        );
        results = uniqueResults;
      } else {
        // Search by username only
        results = await searchUsersByUsername(query);
      }
      
      // Filter out current user
      const filtered = results
        .filter(user => user.id !== currentUser?.id)
        .map(searchResultToFriend);
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [currentUser?.id]);

  // Find friends from contacts
  const handleFindFromContacts = useCallback(async () => {
    try {
      // Request contacts permission
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'We need access to your contacts to find friends who are using the app.',
          [{ text: 'OK' }]
        );
        return;
      }

      setIsLoadingContacts(true);

      // Get contacts
      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      // Extract emails and phone numbers
      const emails: string[] = [];
      const phoneNumbers: string[] = [];

      contacts.forEach((contact) => {
        if (contact.emails && contact.emails.length > 0) {
          contact.emails.forEach((email) => {
            if (email.email) {
              emails.push(email.email);
            }
          });
        }
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach((phone) => {
            if (phone.number) {
              // Normalize phone number using the service function
              const normalized = normalizePhoneNumber(phone.number);
              phoneNumbers.push(normalized);
            }
          });
        }
      });

      // Find users from contacts
      const foundUsers = await findUsersFromContacts(emails, phoneNumbers);
      
      // Filter out current user and convert to Friend format
      const friends = foundUsers
        .filter(user => user.id !== currentUser?.id)
        .map(searchResultToFriend);

      if (friends.length === 0) {
        Alert.alert(
          'No Friends Found',
          'None of your contacts are using MoveTogether yet. Invite them to join!',
          [{ text: 'OK' }]
        );
      } else {
        // Add found friends to available friends list
        setAvailableFriends((prev) => {
          const existingIds = new Set(prev.map(f => f.id));
          const newFriends = friends.filter(f => !existingIds.has(f.id));
          return [...prev, ...newFriends];
        });
      }
    } catch (error) {
      console.error('Error finding friends from contacts:', error);
      Alert.alert(
        'Error',
        'Failed to access contacts. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoadingContacts(false);
    }
  }, [currentUser?.id]);

  // Load available friends when modal opens
  useEffect(() => {
    if (showFriendPicker) {
      // Start with mock friends as fallback
      setAvailableFriends(MOCK_FRIENDS.filter(f => f.id !== currentUser?.id));
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [showFriendPicker, currentUser?.id]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    // Refresh profile data from Supabase to ensure we have latest data
    await refreshProfile();
    
    // Get friend details for invited friends
    const invitedFriendDetails = invitedFriends.map((friendId) => {
      // Try to find in available friends first, then search results, then mock friends
      const friend = availableFriends.find((f) => f.id === friendId) ||
                     searchResults.find((f) => f.id === friendId) ||
                     MOCK_FRIENDS.find((f) => f.id === friendId);
      if (friend) {
        return {
          id: friend.id,
          name: friend.name,
          avatar: friend.avatar,
        };
      }
      return null;
    }).filter((f): f is { id: string; name: string; avatar: string } => f !== null);
    
    // Get creator data from auth user
    let creatorData: { id: string; name: string; avatar: string } | undefined;
    if (currentUser) {
      // Log auth user data for debugging
      console.log('Auth user data:', {
        id: currentUser.id,
        fullName: currentUser.fullName,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        username: currentUser.username,
        avatarUrl: currentUser.avatarUrl,
      });
      
      // Construct display name - firstName is mandatory during onboarding, so prioritize it
      // Priority: firstName > fullName (first part) > username > 'User'
      let displayName = 'User'; // Fallback
      
      if (currentUser.firstName && currentUser.firstName.trim()) {
        displayName = currentUser.firstName.trim();
      } else if (currentUser.fullName && currentUser.fullName.trim()) {
        // Get first name from full name if firstName isn't set
        const firstPart = currentUser.fullName.trim().split(' ')[0];
        if (firstPart) {
          displayName = firstPart;
        }
      } else if (currentUser.username && currentUser.username.trim()) {
        displayName = currentUser.username.trim();
      }
      
      // Get avatar - use avatarUrl if available, otherwise generate initials-based avatar
      const avatarUrl = getAvatarUrl(
        currentUser.avatarUrl,
        displayName,
        currentUser.username
      );
      
      creatorData = {
        id: currentUser.id,
        name: displayName,
        avatar: avatarUrl,
      };
      
      console.log('Preparing to create competition with creator data:', {
        id: creatorData.id,
        name: creatorData.name,
        avatar: creatorData.avatar,
      });
      console.log('Raw auth user data:', {
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        fullName: currentUser.fullName,
        username: currentUser.username,
        avatarUrl: currentUser.avatarUrl,
      });
    } else {
      console.log('No current user found - competition will use fallback data');
      // Can't create competition without creator data
      Alert.alert('Error', 'You must be signed in to create a competition');
      return;
    }
    
    if (!creatorData) {
      Alert.alert('Error', 'Unable to get creator information');
      return;
    }

    // Build scoring config for workout scoring
    let scoringConfig: { workoutTypes?: string[]; workoutMetric?: string } | null = null;
    if (scoringType === 'workout') {
      scoringConfig = {
        workoutTypes: selectedWorkoutTypes,
        workoutMetric,
      };
    }

    // Create the competition in Supabase using the service
    const result = await createCompetitionService({
      name: name.trim(),
      startDate,
      endDate,
      scoringType,
      scoringConfig,
      isPublic,
      repeatOption: repeat,
      creatorId: creatorData.id,
      creatorName: creatorData.name,
      creatorAvatar: creatorData.avatar,
      invitedFriendIds: invitedFriends,
    });

    if (!result.success || !result.competitionId) {
      Alert.alert('Error', result.error || 'Failed to create competition');
      return;
    }

    // Fetch the created competition from Supabase to get full data with real UUID
    // Pass creatorId to fetch pending invitations
    const createdCompetition = await fetchCompetition(result.competitionId, creatorData.id);

    if (createdCompetition) {
      // Add to local store using the real competition data with UUID
      const { competitions } = useFitnessStore.getState();
      useFitnessStore.setState({
        competitions: [createdCompetition, ...competitions],
      });
    } else {
      console.error('Failed to fetch created competition from Supabase');
    }
    
    // Navigate back to compete tab
    router.back();
  };

  const isValid = name.trim().length > 0 && startDate < endDate;

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top, paddingHorizontal: 20, paddingBottom: 16 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center mb-2"
            >
              <ChevronLeft size={24} color="white" />
              <Text className="text-white text-base ml-1">Back</Text>
            </Pressable>
            <Text className="text-white text-3xl font-bold">Create Competition</Text>
            <Text className="text-gray-400 text-base mt-1">
              Set up a new challenge for your friends
            </Text>
          </Animated.View>
        </LinearGradient>

        {/* Competition Name */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-lg font-semibold mb-3">Competition Name</Text>
          <View className="bg-fitness-card rounded-2xl px-4 py-4">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., Weekend Warriors"
              placeholderTextColor="#6b7280"
              className="text-white text-base"
              maxLength={40}
            />
          </View>
        </Animated.View>

        {/* Dates */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(150)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-lg font-semibold mb-3">Schedule</Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {/* Start Date */}
            <Pressable
              onPress={() => setShowStartPicker(true)}
              className="flex-row items-center justify-between px-4 py-4 border-b border-white/5"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color="#92E82A" />
                <Text className="text-white ml-3">Start Date</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-400 mr-2">
                  {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <ChevronRight size={18} color="#6b7280" />
              </View>
            </Pressable>

            {/* End Date */}
            <Pressable
              onPress={() => setShowEndPicker(true)}
              className="flex-row items-center justify-between px-4 py-4 border-b border-white/5"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color="#FA114F" />
                <Text className="text-white ml-3">End Date</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-400 mr-2">
                  {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                <Text className="text-white ml-3">Repeat</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-400 mr-2">
                  {REPEAT_OPTIONS.find((r) => r.id === repeat)?.name}
                </Text>
                <ChevronRight size={18} color="#6b7280" />
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Visibility */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-lg font-semibold mb-3">Visibility</Text>
          <View className="bg-fitness-card rounded-2xl pl-4 pr-10 py-4">
            <View className="flex-row" style={{ alignItems: 'center' }}>
              <View className="flex-row flex-1" style={{ alignItems: 'center' }}>
                {isPublic ? (
                  <Globe size={20} color="#92E82A" />
                ) : (
                  <Lock size={20} color="#6b7280" />
                )}
                <View className="ml-3 flex-1">
                  <Text className="text-white">{isPublic ? 'Public' : 'Private'}</Text>
                  <Text className="text-gray-500 text-sm mt-0.5">
                    {isPublic
                      ? 'Anyone can find and join'
                      : 'Only invited friends can join'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: '#3a3a3c', true: '#92E82A40' }}
                thumbColor={isPublic ? '#92E82A' : '#f4f3f4'}
                style={{ alignSelf: 'center' }}
              />
            </View>
          </View>
        </Animated.View>

        {/* Scoring Type */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(250)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-lg font-semibold mb-3">Scoring Method</Text>
          <View className="space-y-2">
            {SCORING_TYPES.map((scoring, index) => {
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
                      backgroundColor: isSelected ? scoring.color + '15' : '#1C1C1E',
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
                      <Text className="text-white font-medium">{scoring.name}</Text>
                      <Text className="text-gray-500 text-sm mt-0.5">{scoring.description}</Text>
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
          <Animated.View
            entering={FadeIn.duration(400)}
            className="px-5 mb-6"
          >
            <Text className="text-white text-lg font-semibold mb-3">Workout Types</Text>
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
                        backgroundColor: isSelected ? '#FF6B3520' : '#1C1C1E',
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? '#FF6B3550' : 'transparent',
                      }}
                    >
                      <Icon size={18} color={isSelected ? '#FF6B35' : '#6b7280'} />
                      <Text
                        className={cn('ml-2 font-medium', isSelected ? 'text-white' : 'text-gray-400')}
                      >
                        {workout.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-white text-lg font-semibold mt-6 mb-3">Workout Metric</Text>
            <View className="bg-fitness-card rounded-2xl overflow-hidden">
              {WORKOUT_METRICS.map((metric, index) => {
                const isSelected = workoutMetric === metric.id;

                return (
                  <Pressable
                    key={metric.id}
                    onPress={() => setWorkoutMetric(metric.id)}
                    className="flex-row items-center justify-between px-4 py-4"
                    style={{
                      borderBottomWidth: index < WORKOUT_METRICS.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <View>
                      <Text className="text-white">{metric.name}</Text>
                      <Text className="text-gray-500 text-sm">{metric.description}</Text>
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

        {/* Invite Friends */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(300)}
          className="px-5 mb-6"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white text-lg font-semibold">Invite Friends</Text>
            <Pressable onPress={() => setShowFriendPicker(true)}>
              <Text className="text-fitness-accent font-medium">Add</Text>
            </Pressable>
          </View>

          {invitedFriends.length === 0 ? (
            <Pressable
              onPress={() => setShowFriendPicker(true)}
              className="active:opacity-80"
            >
              <View className="bg-fitness-card rounded-2xl p-6 items-center">
                <View className="w-16 h-16 rounded-full bg-white/5 items-center justify-center mb-3">
                  <Users size={28} color="#6b7280" />
                </View>
                <Text className="text-gray-400 text-center">
                  Tap to invite friends to compete
                </Text>
              </View>
            </Pressable>
          ) : (
            <View className="bg-fitness-card rounded-2xl p-4">
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ paddingVertical: 8, paddingTop: 12 }}
              >
                <View className="flex-row" style={{ gap: 12 }}>
                  {invitedFriends.map((friendId) => {
                    // Try to find friend in available friends first, then search results, then mock friends
                    const friend = availableFriends.find((f) => f.id === friendId) ||
                                   searchResults.find((f) => f.id === friendId) ||
                                   MOCK_FRIENDS.find((f) => f.id === friendId);
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
                            style={{ 
                              transform: [{ translateX: 4 }, { translateY: -4 }],
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 2,
                              elevation: 3,
                            }}
                          >
                            <X size={12} color="white" strokeWidth={3} />
                          </Pressable>
                        </View>
                        <Text className="text-white text-sm mt-1">{friend.name}</Text>
                      </View>
                    );
                  })}
                  <Pressable
                    onPress={() => setShowFriendPicker(true)}
                    className="items-center justify-center"
                  >
                    <View className="w-14 h-14 rounded-full bg-white/10 items-center justify-center">
                      <Users size={24} color="#6b7280" />
                    </View>
                    <Text className="text-gray-500 text-sm mt-1">Add</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Create Button */}
      <View
        className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.9)', paddingBottom: insets.bottom + 16 }}
      >
        <Pressable
          onPress={handleCreate}
          disabled={!isValid}
          className="active:opacity-80"
        >
          <LinearGradient
            colors={isValid ? ['#FA114F', '#D10040'] : ['#3a3a3c', '#2a2a2c']}
            style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
          >
            <Text className={cn('text-lg font-semibold', isValid ? 'text-white' : 'text-gray-500')}>
              Create Competition
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Date Pickers */}
      {showStartPicker && (
        <Modal transparent animationType="slide">
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setShowStartPicker(false)}
          />
          <View className="bg-fitness-card rounded-t-3xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
              <Pressable onPress={() => setShowStartPicker(false)}>
                <Text className="text-gray-400">Cancel</Text>
              </Pressable>
              <Text className="text-white font-semibold">Start Date</Text>
              <Pressable onPress={() => setShowStartPicker(false)}>
                <Text className="text-fitness-accent font-semibold">Done</Text>
              </Pressable>
            </View>
            <View className="items-center justify-center py-4">
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && setStartDate(date)}
                minimumDate={new Date()}
                themeVariant="dark"
                style={{ height: 200, width: '100%' }}
              />
            </View>
            <View style={{ height: insets.bottom }} />
          </View>
        </Modal>
      )}

      {showEndPicker && (
        <Modal transparent animationType="slide">
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setShowEndPicker(false)}
          />
          <View className="bg-fitness-card rounded-t-3xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
              <Pressable onPress={() => setShowEndPicker(false)}>
                <Text className="text-gray-400">Cancel</Text>
              </Pressable>
              <Text className="text-white font-semibold">End Date</Text>
              <Pressable onPress={() => setShowEndPicker(false)}>
                <Text className="text-fitness-accent font-semibold">Done</Text>
              </Pressable>
            </View>
            <View className="items-center justify-center py-4">
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && setEndDate(date)}
                minimumDate={new Date(startDate.getTime() + 24 * 60 * 60 * 1000)}
                themeVariant="dark"
                style={{ height: 200, width: '100%' }}
              />
            </View>
            <View style={{ height: insets.bottom }} />
          </View>
        </Modal>
      )}

      {/* Repeat Picker */}
      {showRepeatPicker && (
        <Modal transparent animationType="slide">
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setShowRepeatPicker(false)}
          />
          <View className="bg-fitness-card rounded-t-3xl" style={{ paddingBottom: insets.bottom }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
              <View />
              <Text className="text-white font-semibold">Repeat</Text>
              <Pressable onPress={() => setShowRepeatPicker(false)}>
                <Text className="text-fitness-accent font-semibold">Done</Text>
              </Pressable>
            </View>
            {REPEAT_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => {
                  setRepeat(option.id);
                  setShowRepeatPicker(false);
                }}
                className="flex-row items-center justify-between px-5 py-4 border-b border-white/5"
              >
                <Text className="text-white">{option.name}</Text>
                {repeat === option.id && (
                  <Check size={20} color="#FA114F" strokeWidth={3} />
                )}
              </Pressable>
            ))}
          </View>
        </Modal>
      )}

      {/* Learn More Modal */}
      {showLearnMore && (
        <Modal transparent animationType="fade">
          <Pressable
            className="flex-1 bg-black/70 items-center justify-center px-8"
            onPress={() => setShowLearnMore(null)}
          >
            <View className="bg-fitness-card rounded-3xl p-6 w-full">
              {(() => {
                const scoring = SCORING_TYPES.find((s) => s.id === showLearnMore);
                const Icon = scoringIcons[scoring?.icon || 'circle'] || Circle;

                return (
                  <>
                    <View className="flex-row items-center mb-4">
                      <View
                        className="w-12 h-12 rounded-full items-center justify-center"
                        style={{ backgroundColor: (scoring?.color || '#fff') + '20' }}
                      >
                        <Icon size={24} color={scoring?.color || '#fff'} />
                      </View>
                      <Text className="text-white text-xl font-bold ml-3">{scoring?.name}</Text>
                    </View>
                    <Text className="text-gray-300 text-base leading-6">{scoring?.learnMore}</Text>
                    <Pressable
                      onPress={() => setShowLearnMore(null)}
                      className="mt-6 bg-white/10 rounded-xl py-3 items-center"
                    >
                      <Text className="text-white font-semibold">Got it</Text>
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
        <Modal transparent animationType="none" onRequestClose={handleCloseModal}>
          <View className="flex-1" pointerEvents={isModalVisible ? 'auto' : 'box-none'}>
            <Animated.View
              className="absolute inset-0"
              style={[
                { backgroundColor: 'rgba(0,0,0,0.7)' },
                overlayAnimatedStyle
              ]}
              pointerEvents={isModalVisible ? 'auto' : 'none'}
            >
              {isModalVisible && (
                <Pressable
                  className="flex-1"
                  onPress={handleCloseModal}
                />
              )}
            </Animated.View>
            <Animated.View
              style={[
                { 
                  position: 'absolute',
                  top: screenHeight * 0.35,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: 'flex-start',
                },
                modalAnimatedStyle
              ]}
              pointerEvents={isModalVisible ? 'auto' : 'none'}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? -150 : 20}
                style={{ height: screenHeight * 0.65 }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={!isModalVisible}>
                  <View
                    className="bg-fitness-card rounded-t-3xl"
                    style={{ 
                      height: screenHeight * 0.65,
                      flexDirection: 'column',
                      backgroundColor: '#1C1C1E',
                    }}
                  >
                    <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
                      <Pressable onPress={handleCloseModal} disabled={!isModalVisible}>
                        <Text className="text-gray-400">Cancel</Text>
                      </Pressable>
                      <Text className="text-white font-semibold">Invite Friends</Text>
                      <Pressable onPress={handleCloseModal} disabled={!isModalVisible}>
                        <Text className="text-fitness-accent font-semibold">
                          Done ({Array.isArray(invitedFriends) ? invitedFriends.length : 0})
                        </Text>
                      </Pressable>
                    </View>

                    {/* Search Bar */}
                    <View className="px-5 pt-4 pb-3 border-b border-white/10">
                      <View className="bg-black/30 rounded-xl px-4 py-3 flex-row items-center">
                        <Search size={20} color="#6b7280" />
                        <TextInput
                          value={searchQuery}
                          onChangeText={handleSearch}
                          placeholder="Search by username or phone..."
                          placeholderTextColor="#6b7280"
                          className="flex-1 text-white ml-3"
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="default"
                          returnKeyType="search"
                          onSubmitEditing={Keyboard.dismiss}
                          blurOnSubmit={false}
                        />
                        {isSearching && (
                          <ActivityIndicator size="small" color="#6b7280" />
                        )}
                      </View>
                    </View>

                    {/* Find from Contacts Button */}
                    <View className="px-5 pt-4 pb-3">
                      <Pressable
                        onPress={handleFindFromContacts}
                        disabled={isLoadingContacts}
                        className="bg-white/5 rounded-xl px-4 py-3 flex-row items-center active:bg-white/10"
                      >
                        {isLoadingContacts ? (
                          <ActivityIndicator size="small" color="#FA114F" />
                        ) : (
                          <Phone size={20} color="#FA114F" />
                        )}
                        <Text className="text-white font-medium ml-3 flex-1">
                          {isLoadingContacts ? 'Finding friends...' : 'Find Friends from Contacts'}
                        </Text>
                        <UserPlus size={20} color="#6b7280" />
                      </Pressable>
                    </View>

                    <ScrollView 
                      style={{ flex: 1 }}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ 
                        paddingBottom: insets.bottom + 200,
                        flexGrow: 1,
                      }}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                      bounces={true}
                    >
                      {/* Search Results */}
                      {searchQuery.length >= 2 && searchResults.filter(f => f && f.id).length > 0 && (
                        <View className="px-5 py-2">
                          <Text className="text-gray-400 text-sm mb-2">Search Results</Text>
                          {searchResults.filter(f => f && f.id).map((friend) => {
                            if (!friend || !friend.id) {
                              console.error('Invalid friend object in searchResults:', friend);
                              return null;
                            }

                            const isSelected = invitedFriends.includes(friend.id);

                            return (
                              <Pressable
                                key={friend.id}
                                onPress={() => {
                                  try {
                                    if (friend && friend.id) {
                                      toggleFriend(friend.id);
                                    } else {
                                      console.error('Cannot toggle friend - invalid friend object:', friend);
                                    }
                                  } catch (error: any) {
                                    console.error('Error in friend selection:', error);
                                  }
                                }}
                                className="flex-row items-center px-5 py-3 border-b border-white/5 active:bg-white/5"
                              >
                                {friend.avatar ? (
                                  <Image
                                    source={{ uri: friend.avatar }}
                                    className="w-12 h-12 rounded-full"
                                    onError={(error) => {
                                      console.error('Error loading friend avatar:', friend.avatar, error);
                                    }}
                                  />
                                ) : (
                                  <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                    <Text className="text-white text-xs font-bold">{(friend.name || friend.username || 'U')[0]}</Text>
                                  </View>
                                )}
                                <View className="flex-1 ml-3">
                                  <Text className="text-white font-medium">{friend.name || 'User'}</Text>
                                  <Text className="text-gray-500 text-sm">{friend.username || ''}</Text>
                                </View>
                                <View
                                  className={cn(
                                    'w-6 h-6 rounded-full items-center justify-center',
                                    isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600'
                                  )}
                                >
                                  {isSelected && <Check size={14} color="white" strokeWidth={3} />}
                                </View>
                              </Pressable>
                            );
                          }).filter(Boolean)}
                        </View>
                      )}

                      {/* Available Friends */}
                      {searchQuery.length < 2 && availableFriends.filter(f => f && f.id).length > 0 && (
                        <View className="px-5 py-2">
                          <Text className="text-gray-400 text-sm mb-2">Friends</Text>
                          {availableFriends.filter(f => f && f.id).map((friend) => {
                            if (!friend || !friend.id) {
                              console.error('Invalid friend object in availableFriends:', friend);
                              return null;
                            }

                            const isSelected = invitedFriends.includes(friend.id);

                            return (
                              <Pressable
                                key={friend.id}
                                onPress={() => {
                                  try {
                                    if (friend && friend.id) {
                                      toggleFriend(friend.id);
                                    } else {
                                      console.error('Cannot toggle friend - invalid friend object:', friend);
                                    }
                                  } catch (error: any) {
                                    console.error('Error in friend selection:', error);
                                  }
                                }}
                                className="flex-row items-center px-5 py-3 border-b border-white/5 active:bg-white/5"
                              >
                                {friend.avatar ? (
                                  <Image
                                    source={{ uri: friend.avatar }}
                                    className="w-12 h-12 rounded-full"
                                    onError={(error) => {
                                      console.error('Error loading friend avatar:', friend.avatar, error);
                                    }}
                                  />
                                ) : (
                                  <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center">
                                    <Text className="text-white text-xs font-bold">{(friend.name || friend.username || 'U')[0]}</Text>
                                  </View>
                                )}
                                <View className="flex-1 ml-3">
                                  <Text className="text-white font-medium">{friend.name || 'User'}</Text>
                                  <Text className="text-gray-500 text-sm">{friend.username || ''}</Text>
                                </View>
                                <View
                                  className={cn(
                                    'w-6 h-6 rounded-full items-center justify-center',
                                    isSelected ? 'bg-fitness-accent' : 'border-2 border-gray-600'
                                  )}
                                >
                                  {isSelected && <Check size={14} color="white" strokeWidth={3} />}
                                </View>
                              </Pressable>
                            );
                          }).filter(Boolean)}
                        </View>
                      )}

                      {/* No Results */}
                      {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                        <View className="px-5 py-8 items-center">
                          <Text className="text-gray-400 text-center">
                            No users found matching "{searchQuery}"
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}
