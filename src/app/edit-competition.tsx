import { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
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
  Globe,
  Lock,
  Check,
  Info,
  AlertCircle,
  Users,
  X,
  Search,
  UserPlus,
  Phone,
  Trophy,
  Gift,
} from 'lucide-react-native';
import {
  ScoringType,
  SCORING_TYPES,
  Friend,
} from '@/lib/competition-types';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore } from '@/lib/fitness-store';
import { fetchCompetition, updateCompetition } from '@/lib/competition-service';
import { createCompetitionInvitations } from '@/lib/invitation-service';
import { searchUsersByUsername, searchUsersByPhoneNumber, findUsersFromContacts, searchResultToFriend } from '@/lib/user-search-service';
import { normalizePhoneNumber } from '@/lib/phone-verification-service';
import { useThemeColors } from '@/lib/useThemeColors';
import { cn } from '@/lib/cn';
import { PrizePoolPayment } from '@/components/PrizePoolPayment';
import { supabase } from '@/lib/supabase';

const scoringIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  circle: Circle,
  percent: Percent,
  hash: Hash,
  footprints: Footprints,
  dumbbell: Dumbbell,
};

export default function EditCompetitionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const currentUser = useAuthStore((s) => s.user);
  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Original values for comparison
  const [competitionStatus, setCompetitionStatus] = useState<'upcoming' | 'active' | 'completed'>('upcoming');

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [isPublic, setIsPublic] = useState(false);
  const [scoringType, setScoringType] = useState<ScoringType>('ring_close');

  // Prize pool state
  const [hasPrizePool, setHasPrizePool] = useState(false);
  const [prizeAmount, setPrizeAmount] = useState<number | null>(null);
  const [prizeStatus, setPrizeStatus] = useState<string | null>(null);
  const [showPrizePayment, setShowPrizePayment] = useState(false);

  // UI state
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState<ScoringType | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);

  // Friend invite state
  const [invitedFriends, setInvitedFriends] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [availableFriends, setAvailableFriends] = useState<Friend[]>([]);
  const [existingParticipantIds, setExistingParticipantIds] = useState<string[]>([]);
  const friendsFromStore = useAuthStore((s) => s.friends);
  const screenHeight = Dimensions.get('window').height;

  // Determine which fields are editable based on status
  const canEditStartDate = competitionStatus === 'upcoming';
  const canEditScoringType = competitionStatus === 'upcoming';
  const canEdit = competitionStatus !== 'completed';
  const canAddPrize = competitionStatus !== 'completed' && !hasPrizePool;

  // Toggle friend selection
  const toggleFriend = (friendId: string) => {
    if (!friendId || typeof friendId !== 'string') return;
    setInvitedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
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
      const hasDigits = /\d/.test(query);
      const cleanedQuery = query.replace(/\D/g, '');

      let results;
      if (hasDigits && cleanedQuery.length >= 3) {
        const phoneResults = await searchUsersByPhoneNumber(query);
        const usernameResults = await searchUsersByUsername(query);
        const allResults = [...phoneResults, ...usernameResults];
        const uniqueResults = Array.from(new Map(allResults.map(r => [r.id, r])).values());
        results = uniqueResults;
      } else {
        results = await searchUsersByUsername(query);
      }

      // Filter out current user and existing participants
      const filtered = results
        .filter(user => user.id !== currentUser?.id && !existingParticipantIds.includes(user.id))
        .map(searchResultToFriend);
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [currentUser?.id, existingParticipantIds]);

  // Find friends from contacts
  const handleFindFromContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need access to your contacts to find friends who are using the app.');
        return;
      }

      setIsLoadingContacts(true);
      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const emails: string[] = [];
      const phoneNumbers: string[] = [];

      contacts.forEach((contact) => {
        contact.emails?.forEach((email) => email.email && emails.push(email.email));
        contact.phoneNumbers?.forEach((phone) => {
          if (phone.number) phoneNumbers.push(normalizePhoneNumber(phone.number));
        });
      });

      const foundUsers = await findUsersFromContacts(emails, phoneNumbers);
      const friends = foundUsers
        .filter(user => user.id !== currentUser?.id && !existingParticipantIds.includes(user.id))
        .map(searchResultToFriend);

      if (friends.length === 0) {
        Alert.alert('No Friends Found', 'None of your contacts are using MoveTogether yet.');
      } else {
        setAvailableFriends((prev) => {
          const existingIds = new Set(prev.map(f => f.id));
          const newFriends = friends.filter(f => !existingIds.has(f.id));
          return [...prev, ...newFriends];
        });
      }
    } catch (error) {
      console.error('Error finding friends from contacts:', error);
      Alert.alert('Error', 'Failed to access contacts. Please try again.');
    } finally {
      setIsLoadingContacts(false);
    }
  }, [currentUser?.id, existingParticipantIds]);

  // Load existing friends from store when friend picker opens
  useEffect(() => {
    if (showFriendPicker && friendsFromStore.length > 0) {
      const existingFriends: Friend[] = friendsFromStore
        .filter(f => !existingParticipantIds.includes(f.id))
        .map(f => ({
          id: f.id,
          name: f.name,
          avatar: f.avatar,
          username: f.username,
        }));

      setAvailableFriends((prev) => {
        const existingIds = new Set(prev.map(f => f.id));
        const newFriends = existingFriends.filter(f => !existingIds.has(f.id));
        return [...prev, ...newFriends];
      });
    }
  }, [showFriendPicker, friendsFromStore, existingParticipantIds]);

  // Reset friend picker state when opened
  useEffect(() => {
    if (showFriendPicker) {
      setAvailableFriends([]);
      setSearchResults([]);
      setSearchQuery('');
      setInvitedFriends([]);
    }
  }, [showFriendPicker]);

  // Send invitations when done selecting friends
  const handleInviteFriends = async () => {
    if (invitedFriends.length > 0 && id && currentUser?.id) {
      try {
        const result = await createCompetitionInvitations(id, currentUser.id, invitedFriends);
        if (result.success) {
          Alert.alert('Success', `Invitation${invitedFriends.length > 1 ? 's' : ''} sent!`);
        } else {
          Alert.alert('Error', result.error || 'Failed to send invitations');
        }
      } catch (error) {
        console.error('Error sending invitations:', error);
        Alert.alert('Error', 'Failed to send invitations');
      }
    }
    setShowFriendPicker(false);
  };

  // Load competition data and prize pool info
  useEffect(() => {
    const loadCompetition = async () => {
      if (!id || !currentUser?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const competition = await fetchCompetition(id, currentUser.id);

        if (!competition) {
          Alert.alert('Error', 'Competition not found');
          router.back();
          return;
        }

        // Verify user is the creator
        if (competition.creatorId !== currentUser.id) {
          Alert.alert('Error', 'Only the creator can edit this competition');
          router.back();
          return;
        }

        // Parse dates - handle both YYYY-MM-DD and ISO string formats
        const parseDate = (dateStr: string): Date => {
          const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
          const [year, month, day] = datePart.split('-').map(Number);
          return new Date(year, month - 1, day);
        };

        // Populate form with existing data
        setName(competition.name);
        setStartDate(parseDate(competition.startDate));
        setEndDate(parseDate(competition.endDate));
        setIsPublic(competition.isPublic || false);
        setScoringType((competition.scoringType as ScoringType) || 'ring_close');
        setCompetitionStatus(competition.status as 'upcoming' | 'active' | 'completed');

        // Store existing participant IDs to filter them from invite options
        if (competition.participants) {
          setExistingParticipantIds(competition.participants.map(p => p.id));
        }

        // Fetch prize pool info
        const { data: prizeData } = await supabase
          .from('prize_pools')
          .select('amount, status')
          .eq('competition_id', id)
          .maybeSingle();

        if (prizeData) {
          setHasPrizePool(true);
          setPrizeAmount(prizeData.amount);
          setPrizeStatus(prizeData.status);
        }
      } catch (error) {
        console.error('Error loading competition:', error);
        Alert.alert('Error', 'Failed to load competition');
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    loadCompetition();
  }, [id, currentUser?.id]);

  const handleSave = async () => {
    if (!name.trim() || !id || !currentUser?.id) return;

    if (competitionStatus === 'completed') {
      Alert.alert('Error', 'Cannot edit a completed competition');
      return;
    }

    setIsSaving(true);

    try {
      const result = await updateCompetition(id, currentUser.id, {
        name: name.trim(),
        startDate: canEditStartDate ? startDate : undefined,
        endDate,
        scoringType: canEditScoringType ? scoringType : undefined,
        isPublic,
      });

      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to update competition');
        return;
      }

      // Refresh competitions in the store
      await fetchUserCompetitions(currentUser.id);

      // Navigate back
      router.back();
    } catch (error: any) {
      console.error('Error saving competition:', error);
      Alert.alert('Error', error?.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Prize pool handlers
  const handlePrizeSuccess = () => {
    setShowPrizePayment(false);
    setHasPrizePool(true);
    // Reload to get updated prize info
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  };

  const handlePrizeCancel = () => {
    setShowPrizePayment(false);
  };

  const isValid = name.trim().length > 0 && startDate < endDate && canEdit;

  const selectedScoringInfo = SCORING_TYPES.find((s) => s.id === scoringType);

  // Show prize payment flow
  if (showPrizePayment && id) {
    return (
      <PrizePoolPayment
        competitionId={id}
        onSuccess={handlePrizeSuccess}
        onCancel={handlePrizeCancel}
      />
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E0F2FE', colors.bg]}
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View className="mb-4">
            <LiquidGlassBackButton onPress={() => router.back()} />
          </View>
          <Text className="text-black dark:text-white text-3xl font-bold">Edit Competition</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
            Update your challenge details
          </Text>
        </LinearGradient>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#FA114F" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
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
            backgroundColor: colors.isDark ? '#1C1C1E' : '#E0F2FE',
          }}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E0F2FE', colors.bg]}
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          {/* Back Button */}
          <View className="mb-4">
            <LiquidGlassBackButton onPress={() => router.back()} />
          </View>

          <View>
            <Text className="text-black dark:text-white text-3xl font-bold">Edit Competition</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
              Update your challenge details
            </Text>
          </View>
        </LinearGradient>

        {/* Status Info Banner */}
        {competitionStatus === 'active' && (
          <View className="px-5 mb-4">
            <View
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(59, 130, 246, 0.3)',
              }}
              className="rounded-xl p-4 flex-row items-center"
            >
              <AlertCircle size={20} color="#3b82f6" />
              <Text className="text-blue-400 ml-3 flex-1 text-sm">
                This competition is active. Start date and scoring type cannot be changed.
              </Text>
            </View>
          </View>
        )}

        {/* Competition Name */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Competition Name</Text>
          <View style={{ backgroundColor: colors.card, minHeight: 56 }} className="rounded-2xl px-4 justify-center">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., Weekend Warriors"
              placeholderTextColor={colors.isDark ? "#6b7280" : "#9ca3af"}
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 20,
                paddingTop: 14,
                paddingBottom: 14,
              }}
              maxLength={40}
              editable={canEdit}
            />
          </View>
        </View>

        {/* Dates */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Schedule</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
            {/* Start Date */}
            <Pressable
              onPress={() => canEditStartDate && setShowStartPicker(true)}
              disabled={!canEditStartDate}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                opacity: canEditStartDate ? 1 : 0.5,
              }}
              className="flex-row items-center justify-between px-4 py-4"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color={canEditStartDate ? "#92E82A" : "#6b7280"} />
                <Text className="text-black dark:text-white ml-3">Start Date</Text>
                {!canEditStartDate && (
                  <Lock size={14} color="#6b7280" style={{ marginLeft: 8 }} />
                )}
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 mr-2">
                  {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                {canEditStartDate && <ChevronRight size={18} color="#6b7280" />}
              </View>
            </Pressable>

            {/* End Date */}
            <Pressable
              onPress={() => canEdit && setShowEndPicker(true)}
              disabled={!canEdit}
              style={{ opacity: canEdit ? 1 : 0.5 }}
              className="flex-row items-center justify-between px-4 py-4"
            >
              <View className="flex-row items-center">
                <Calendar size={20} color="#FA114F" />
                <Text className="text-black dark:text-white ml-3">End Date</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 mr-2">
                  {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                {canEdit && <ChevronRight size={18} color="#6b7280" />}
              </View>
            </Pressable>
          </View>
        </View>

        {/* Visibility */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Visibility</Text>
          <View style={{ backgroundColor: colors.card, opacity: canEdit ? 1 : 0.5 }} className="rounded-2xl pl-4 pr-10 py-4">
            <View className="flex-row" style={{ alignItems: 'center' }}>
              <View className="flex-row flex-1" style={{ alignItems: 'center' }}>
                {isPublic ? (
                  <Globe size={20} color="#92E82A" />
                ) : (
                  <Lock size={20} color="#6b7280" />
                )}
                <View className="ml-3 flex-1">
                  <Text className="text-black dark:text-white">{isPublic ? 'Public' : 'Private'}</Text>
                  <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">
                    {isPublic
                      ? 'Anyone can find and join'
                      : 'Only invited friends can join'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                disabled={!canEdit}
                trackColor={{ false: colors.isDark ? '#3a3a3c' : '#d1d5db', true: '#92E82A40' }}
                thumbColor={isPublic ? '#92E82A' : (colors.isDark ? '#f4f3f4' : '#ffffff')}
                style={{ alignSelf: 'center' }}
              />
            </View>
          </View>
        </View>

        {/* Scoring Type */}
        <View className="px-5 mb-6">
          <View className="flex-row items-center mb-3">
            <Text className="text-black dark:text-white text-lg font-semibold">Scoring Method</Text>
            {!canEditScoringType && (
              <View className="flex-row items-center ml-2">
                <Lock size={14} color="#6b7280" />
                <Text className="text-gray-500 dark:text-gray-400 text-sm ml-1">Locked</Text>
              </View>
            )}
          </View>
          <View className="space-y-2" style={{ opacity: canEditScoringType ? 1 : 0.5 }}>
            {SCORING_TYPES.map((scoring) => {
              const Icon = scoringIcons[scoring.icon] || Circle;
              const isSelected = scoringType === scoring.id;

              return (
                <Pressable
                  key={scoring.id}
                  onPress={() => canEditScoringType && setScoringType(scoring.id)}
                  disabled={!canEditScoringType}
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
                      <Text className="text-gray-600 dark:text-gray-500 text-sm mt-0.5">{scoring.description}</Text>
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
        </View>

        {/* Invite Friends */}
        {canEdit && (
          <View className="px-5 mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-black dark:text-white text-lg font-semibold">Invite Friends</Text>
              <Pressable onPress={() => setShowFriendPicker(true)}>
                <Text className="text-fitness-accent font-medium">Add</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setShowFriendPicker(true)}
              className="active:opacity-80"
            >
              <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-6 items-center">
                <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} className="w-16 h-16 rounded-full items-center justify-center mb-3">
                  <Users size={28} color="#6b7280" />
                </View>
                <Text className="text-gray-500 dark:text-gray-400 text-center">
                  Tap to invite more friends to compete
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Prize Pool Section */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Prize Pool</Text>
          
          {hasPrizePool ? (
            // Show existing prize pool info
            <View
              style={{
                backgroundColor: colors.isDark ? 'rgba(255,193,7,0.1)' : 'rgba(255,193,7,0.15)',
                borderWidth: 1,
                borderColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
              }}
              className="rounded-2xl p-4"
            >
              <View className="flex-row items-center">
                <View
                  style={{ backgroundColor: '#FFC10720' }}
                  className="w-12 h-12 rounded-full items-center justify-center"
                >
                  <Trophy size={24} color="#FFC107" />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-black dark:text-white text-xl font-bold">
                    ${prizeAmount?.toFixed(2)}
                  </Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                    {prizeStatus === 'funded' ? 'Prize pool active' : 
                     prizeStatus === 'distributed' ? 'Prize distributed' : 
                     prizeStatus === 'pending' ? 'Payment pending' : 'Prize pool'}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Gift size={18} color="#FFC107" />
                  <Text className="text-amber-500 text-sm font-medium ml-1">Active</Text>
                </View>
              </View>
              
              <View
                style={{
                  backgroundColor: colors.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                }}
                className="rounded-xl p-3 mt-3"
              >
                <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
                  Winner will receive the prize automatically when the competition ends
                </Text>
              </View>
              
              {/* Cannot remove notice */}
              <View className="flex-row items-center justify-center mt-3">
                <Lock size={12} color="#6b7280" />
                <Text className="text-gray-500 dark:text-gray-400 text-xs ml-1">
                  Prize pools cannot be removed once added
                </Text>
              </View>
            </View>
          ) : canAddPrize ? (
            // Show add prize option
            <>
              <Pressable onPress={() => setShowPrizePayment(true)} className="active:opacity-90">
                <LinearGradient
                  colors={['#FFC107', '#FF9800']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 16, padding: 20 }}
                >
                  <View className="flex-row items-center">
                    <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center">
                      <Trophy size={24} color="white" />
                    </View>
                    <View className="flex-1 ml-4">
                      <View className="flex-row items-center">
                        <Text className="text-white text-lg font-bold">Add Prize Pool</Text>
                        <View className="ml-2 px-1.5 py-0.5 bg-white/20 rounded">
                          <Text className="text-white text-xs font-medium">NEW</Text>
                        </View>
                      </View>
                      <Text className="text-white/80 text-sm mt-0.5">
                        Make it exciting with real rewards
                      </Text>
                    </View>
                    <ChevronRight size={24} color="white" />
                  </View>
                </LinearGradient>
              </Pressable>
              {/* Warning that prize cannot be removed */}
              <View className="flex-row items-center justify-center mt-3">
                <Lock size={12} color="#6b7280" />
                <Text className="text-gray-500 dark:text-gray-400 text-xs ml-1">
                  Prize pools cannot be removed once added
                </Text>
              </View>
            </>
          ) : (
            // Competition completed - can't add prize
            <View
              style={{
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              }}
              className="rounded-2xl p-4"
            >
              <View className="flex-row items-center">
                <View
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                  className="w-12 h-12 rounded-full items-center justify-center"
                >
                  <Trophy size={24} color="#6b7280" />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-gray-500 dark:text-gray-400 font-medium">No Prize Pool</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                    Competition has ended
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Save Button */}
        <View className="px-5 mb-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable
            onPress={handleSave}
            disabled={!isValid || isSaving}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={isValid && !isSaving ? ['#3b82f6', '#2563eb'] : (colors.isDark ? ['#3a3a3c', '#2a2a2c'] : ['#d1d5db', '#9ca3af'])}
              style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className={`text-lg font-semibold ${isValid ? 'text-white' : (colors.isDark ? 'text-gray-500' : 'text-gray-600')}`}>
                  Save Changes
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>

      {/* Date Pickers */}
      {showStartPicker && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
            onPress={() => setShowStartPicker(false)}
          >
            <View style={{ backgroundColor: colors.card, width: '100%' }} className="rounded-3xl overflow-hidden">
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row items-center justify-between px-5 py-4">
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
                  onChange={(_, date) => date && setStartDate(date)}
                  minimumDate={new Date()}
                  themeVariant={colors.isDark ? "dark" : "light"}
                  style={{ height: 200, width: '100%' }}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {showEndPicker && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
            onPress={() => setShowEndPicker(false)}
          >
            <View style={{ backgroundColor: colors.card, width: '100%' }} className="rounded-3xl overflow-hidden">
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row items-center justify-between px-5 py-4">
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
                  onChange={(_, date) => date && setEndDate(date)}
                  minimumDate={new Date(startDate.getTime() + 24 * 60 * 60 * 1000)}
                  themeVariant={colors.isDark ? "dark" : "light"}
                  style={{ height: 200, width: '100%' }}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Learn More Modal */}
      {showLearnMore && (
        <Modal transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
            onPress={() => setShowLearnMore(null)}
          >
            <View style={{ backgroundColor: colors.card, width: '100%' }} className="rounded-3xl overflow-hidden p-6">
              {(() => {
                const scoring = SCORING_TYPES.find((s) => s.id === showLearnMore);
                if (!scoring?.learnMore) return null;

                return (
                  <>
                    <Text className="text-black dark:text-white text-xl font-bold mb-2">{scoring.name}</Text>
                    <Text className="text-gray-600 dark:text-gray-400 text-base leading-relaxed">{scoring.learnMore}</Text>
                    <Pressable
                      onPress={() => setShowLearnMore(null)}
                      className="mt-6"
                    >
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
        <Modal transparent animationType="fade" onRequestClose={() => setShowFriendPicker(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <Pressable
              style={{ flex: 1, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
              onPress={() => setShowFriendPicker(false)}
            >
              <Pressable
                style={{ backgroundColor: colors.card, width: '100%', height: screenHeight * 0.75 }}
                className="rounded-3xl overflow-hidden"
                onPress={(e) => e.stopPropagation()}
              >
                <View className="px-5 pt-5 pb-4">
                  <View className="flex-row items-center justify-between mb-1">
                    <LiquidGlassBackButton onPress={() => setShowFriendPicker(false)} />
                    <Pressable
                      onPress={handleInviteFriends}
                      className="rounded-full px-5 py-2 active:opacity-80"
                      style={{ backgroundColor: '#FA114F' }}
                    >
                      <Text className="text-white font-semibold">
                        Done ({invitedFriends.length})
                      </Text>
                    </Pressable>
                  </View>
                  <Text className="text-black dark:text-white text-2xl font-bold mt-2">Invite Friends</Text>
                </View>

                {/* Search Bar */}
                <View className="px-5 pb-3">
                  <View
                    className="flex-row items-center rounded-full"
                    style={{
                      backgroundColor: colors.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)',
                      minHeight: 48,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Search size={20} color="#6b7280" />
                    <TextInput
                      value={searchQuery}
                      onChangeText={handleSearch}
                      placeholder="Search by username or phone..."
                      placeholderTextColor="#6b7280"
                      className="flex-1 ml-3"
                      style={{
                        color: colors.text,
                        fontSize: 16,
                        lineHeight: 20,
                        paddingTop: 14,
                        paddingBottom: 14,
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                      returnKeyType="search"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    {isSearching && <ActivityIndicator size="small" color="#6b7280" />}
                  </View>
                </View>

                {/* Find from Contacts Button */}
                <View className="px-5 pt-1 pb-3">
                  <Pressable
                    onPress={handleFindFromContacts}
                    disabled={isLoadingContacts}
                    style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                    className="rounded-xl px-4 py-3 flex-row items-center active:opacity-80"
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

                <ScrollView
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={true}
                >
                  {/* Search Results */}
                  {searchQuery.length >= 2 && searchResults.filter(f => f && f.id).length > 0 && (
                    <View className="py-2">
                      <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">Search Results</Text>
                      {searchResults.filter(f => f && f.id).map((friend) => {
                        const isSelected = invitedFriends.includes(friend.id);
                        return (
                          <Pressable
                            key={friend.id}
                            onPress={() => toggleFriend(friend.id)}
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                            className="flex-row items-center px-5 py-3 active:opacity-80"
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
                      })}
                    </View>
                  )}

                  {/* Available Friends */}
                  {searchQuery.length < 2 && availableFriends.filter(f => f && f.id).length > 0 && (
                    <View className="py-2">
                      <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2 px-5">Friends</Text>
                      {availableFriends.filter(f => f && f.id).map((friend) => {
                        const isSelected = invitedFriends.includes(friend.id);
                        return (
                          <Pressable
                            key={friend.id}
                            onPress={() => toggleFriend(friend.id)}
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                            className="flex-row items-center px-5 py-3 active:opacity-80"
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
              </Pressable>
            </Pressable>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}