import { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
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
} from 'lucide-react-native';
import {
  ScoringType,
  SCORING_TYPES,
} from '@/lib/competition-types';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore } from '@/lib/fitness-store';
import { fetchCompetition, updateCompetition } from '@/lib/competition-service';
import { useThemeColors } from '@/lib/useThemeColors';

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

  // UI state
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState<ScoringType | null>(null);

  // Determine which fields are editable based on status
  const canEditStartDate = competitionStatus === 'upcoming';
  const canEditScoringType = competitionStatus === 'upcoming';
  const canEdit = competitionStatus !== 'completed';

  // Load competition data
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

  const isValid = name.trim().length > 0 && startDate < endDate && canEdit;

  const selectedScoringInfo = SCORING_TYPES.find((s) => s.id === scoringType);

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
            style={{ flex: 1, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
            onPress={() => setShowLearnMore(null)}
          >
            <View style={{ backgroundColor: colors.card }} className="rounded-3xl p-6 w-full">
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
                      <Text className="text-black dark:text-white text-xl font-bold ml-3">{scoring?.name}</Text>
                    </View>
                    <Text className="text-gray-700 dark:text-gray-300 text-base leading-6">{scoring?.learnMore}</Text>
                    <Pressable
                      onPress={() => setShowLearnMore(null)}
                      style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                      className="mt-6 rounded-xl py-3 items-center"
                    >
                      <Text className="text-black dark:text-white font-semibold">Got it</Text>
                    </Pressable>
                  </>
                );
              })()}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
