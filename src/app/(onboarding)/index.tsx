import { View, Pressable, TextInput, ActivityIndicator, Image, Alert, Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Modal, Dimensions, NativeModules } from 'react-native';
import { Text } from '@/components/Text';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useHealthStore } from '@/lib/health-service';
import Animated, { FadeIn, FadeOut, Layout, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ArrowRight, Apple, Check, X, AtSign, User, Phone, Camera, Image as ImageIcon, Watch, Activity, Flame, Timer, Target, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { requestNotificationPermission } from '@/lib/onesignal-service';
import { useSubscriptionStore } from '@/lib/subscription-store';
import * as ImagePicker from 'expo-image-picker';
import debounce from 'lodash/debounce';
import { getAvatarUrl } from '@/lib/avatar-utils';
import * as ImageUploadService from '@/lib/image-upload-service';
import { isUsernameClean, getUsernameProfanityError } from '@/lib/username-utils';
import { useProviderOAuth, type OAuthProvider } from '@/lib/use-provider-oauth';
import { useThemeColors } from '@/lib/useThemeColors';
import { PhotoGuidelinesReminder } from '@/components/PhotoGuidelinesReminder';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

// Get Supabase URL for AI moderation
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

// AI Photo Review function - checks photo against community guidelines before upload
async function reviewPhotoWithAI(imageUri: string, userId: string): Promise<{ approved: boolean; reason?: string }> {
  try {
    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      // If no session, skip moderation (fail open)
      return { approved: true };
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/review-photo`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          photo_url: `temp://${userId}/avatar`,
          photo_base64: base64,
        }),
      }
    );

    if (!response.ok) {
      // If moderation fails, allow upload (fail open)
      console.log('[PhotoReview] Moderation check failed, allowing upload');
      return { approved: true };
    }

    const result = await response.json();
    return {
      approved: result.approved,
      reason: result.reason,
    };
  } catch (error) {
    console.error('[PhotoReview] Error:', error);
    // Fail open - allow upload if moderation fails
    return { approved: true };
  }
}

// Native module for fetching Apple Watch activity goals
const { ActivitySummaryModule } = NativeModules;

interface OnboardingStep {
  id: number;
  title: string;
  subtitle: string;
  render: () => React.ReactNode;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUsername = useAuthStore((s) => s.updateUsername);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updatePhoneNumber = useAuthStore((s) => s.updatePhoneNumber);
  const updatePrimaryDevice = useAuthStore((s) => s.updatePrimaryDevice);
  const checkUsernameAvailable = useAuthStore((s) => s.checkUsernameAvailable);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const connectProvider = useHealthStore((s) => s.connectProvider);
  const syncHealthData = useHealthStore((s) => s.syncHealthData);
  const goals = useHealthStore((s) => s.goals);
  const updateGoals = useHealthStore((s) => s.updateGoals);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  
  // OAuth hooks for third-party providers
  const fitbitOAuth = useProviderOAuth('fitbit');
  const garminOAuth = useProviderOAuth('garmin');
  const whoopOAuth = useProviderOAuth('whoop');
  const ouraOAuth = useProviderOAuth('oura');
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSubscriptionTier, setSelectedSubscriptionTier] = useState<'mover' | 'crusher'>('mover');
  const [tabContainerWidth, setTabContainerWidth] = useState(0);
  const tabSwitcherWidth = useSharedValue(0);
  const tabSwitcherPosition = useSharedValue(0);
  const progressValue = useSharedValue(0);

  // Tab switcher animation
  useEffect(() => {
    tabSwitcherWidth.value = tabContainerWidth;
  }, [tabContainerWidth]);

  useEffect(() => {
    const targetPosition = selectedSubscriptionTier === 'mover' ? 0 : 1;
    tabSwitcherPosition.value = withSpring(targetPosition, {
      damping: 25,
      stiffness: 300,
      overshootClamping: true,
    });
  }, [selectedSubscriptionTier]);

  const animatedTabIndicatorStyle = useAnimatedStyle(() => {
    'worklet';
    if (tabSwitcherWidth.value > 0) {
      const padding = 4; // Match the outer container padding
      const availableWidth = tabSwitcherWidth.value - (padding * 2);
      const tabWidth = availableWidth / 2;
      const translateX = tabSwitcherPosition.value * tabWidth;
      return {
        width: tabWidth,
        transform: [{ translateX: translateX + padding }],
      } as any;
    }
    return {
      transform: [{ translateX: tabSwitcherPosition.value * 200 }],
    } as any;
  });
  
  // Helper function to calculate age from birthday
  const calculateAge = (birthDate: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  // Subscription state
  const { packages, purchasePackage, loadOfferings } = useSubscriptionStore();
  const [isPurchasing, setIsPurchasing] = useState(false);
  
  // Load offerings on mount
  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);
  
  // Check if OAuth connection succeeded and auto-advance
  // We detect this by checking if the provider is now connected in the health store
  const providers = useHealthStore((s) => s.providers);
  useEffect(() => {
    // If we're on step 5 and waiting for OAuth, check if it completed
    if (currentStep === 5 && ['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice || '')) {
      const provider = providers.find((p) => p.id === selectedDevice);
      if (provider?.connected && !oauthConnected) {
        setOauthConnected(true);
        // Auto-advance to goal setting after a brief delay for user feedback
        setTimeout(() => {
          setCurrentStep(6);
        }, 500);
      }
    }
  }, [currentStep, selectedDevice, providers, oauthConnected]);

  // Fetch Apple Watch goals when entering the goals step (step 7)
  // This runs AFTER the notifications step (step 6), giving HealthKit authorization time to settle
  useEffect(() => {
    if (currentStep === 7 && selectedDevice === 'apple_watch' && appleHealthConnected && !goalsSyncedFromWatch && !isSyncingGoals) {
      console.log('[Onboarding] Entering goals step - fetching Apple Watch goals...');

      if (Platform.OS === 'ios' && ActivitySummaryModule) {
        setIsSyncingGoals(true);

        // Small delay to ensure HealthKit is fully ready
        setTimeout(() => {
          ActivitySummaryModule.getActivityGoals()
            .then((result: { moveGoal: number; exerciseGoal: number; standGoal: number; hasData: boolean }) => {
              console.log('[Onboarding] Apple Watch goals result:', result);
              if (result.hasData) {
                // Update goals with values from Apple Watch
                if (result.moveGoal > 0) setMoveGoal(String(Math.round(result.moveGoal)));
                if (result.exerciseGoal > 0) setExerciseGoal(String(Math.round(result.exerciseGoal)));
                if (result.standGoal > 0) setStandGoal(String(Math.round(result.standGoal)));
                setGoalsSyncedFromWatch(true);
                setHasAppleWatchGoals(true);
                console.log('[Onboarding] Goals synced from Apple Watch:', {
                  move: result.moveGoal,
                  exercise: result.exerciseGoal,
                  stand: result.standGoal,
                });
              } else {
                console.log('[Onboarding] No Apple Watch goals data available');
              }
            })
            .catch((err: Error) => {
              console.error('[Onboarding] Failed to fetch Apple Watch goals:', err);
            })
            .finally(() => {
              setIsSyncingGoals(false);
            });
        }, 500); // 500ms delay to let HealthKit settle
      }
    }
  }, [currentStep, selectedDevice, appleHealthConnected, goalsSyncedFromWatch, isSyncingGoals]);

  // Device selection state
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [otherDeviceName, setOtherDeviceName] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // Goal setting state
  const [moveGoal, setMoveGoal] = useState('400');
  const [exerciseGoal, setExerciseGoal] = useState('30');
  const [standGoal, setStandGoal] = useState('12');
  const [stepsGoal, setStepsGoal] = useState('10000');

  // Format number with commas (e.g., 10000 -> "10,000")
  const formatNumberWithCommas = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString('en-US');
  };

  // Parse formatted number back to raw digits
  const parseFormattedNumber = (value: string) => {
    return value.replace(/[^0-9]/g, '');
  };
  const [hasAppleWatchGoals, setHasAppleWatchGoals] = useState(false);
  const [goalsSyncedFromWatch, setGoalsSyncedFromWatch] = useState(false);
  const [isSyncingGoals, setIsSyncingGoals] = useState(false);

  // Form state for profile step
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pronouns, setPronouns] = useState<string>('');
  
  // Photo upload state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Phone verification state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Username step state
  const [username, setUsername] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const usernameInputRef = useRef<TextInput>(null);
  const isFocused = useIsFocused();
  const [hasAutoFocused, setHasAutoFocused] = useState(false);
  
  // Redirect to tabs immediately if onboarding is already complete
  // This prevents the username screen from briefly showing for existing users
  // NOTE: Only check hasCompletedOnboarding, NOT username existence
  // Username is set during step 1, before onboarding is complete
  useEffect(() => {
    if (hasCompletedOnboarding) {
      router.replace('/(tabs)');
    }
  }, [hasCompletedOnboarding, router]);

  // Focus username input only when screen is actually focused and visible
  // Don't focus if onboarding is already complete (prevents keyboard flash on app reopen)
  useEffect(() => {
    if (isFocused && currentStep === 0 && !hasAutoFocused && !hasCompletedOnboarding) {
      // Short delay to ensure navigation has completed
      const timeout = setTimeout(() => {
        if (isFocused && !hasCompletedOnboarding) {
          usernameInputRef.current?.focus();
          setHasAutoFocused(true);
        }
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [isFocused, currentStep, hasAutoFocused, hasCompletedOnboarding]);

  // Debounced username availability check (network request only)
  const checkUsernameAvailability = useCallback(
    debounce(async (value: string) => {
      // Final validation before network request
      if (value.length < 3) {
        setIsCheckingUsername(false);
        return;
      }

      setIsCheckingUsername(true);
      try {
        const available = await checkUsernameAvailable(value);
        setIsUsernameAvailable(available);
        setUsernameError(available ? null : 'Username is already taken');
      } catch {
        setUsernameError('Error checking username');
      } finally {
        setIsCheckingUsername(false);
      }
    }, 400),
    [checkUsernameAvailable]
  );

  const handleUsernameChange = (value: string) => {
    // Remove spaces and special characters as they type
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);

    // Reset states
    setIsUsernameAvailable(null);
    setIsCheckingUsername(false);

    if (cleaned.length < 3) {
      setUsernameError(cleaned.length > 0 ? 'Username must be at least 3 characters' : null);
      return;
    }

    // Validate format immediately (no network call needed)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(cleaned)) {
      setUsernameError('Only letters, numbers, and underscores allowed');
      setIsUsernameAvailable(false);
      return;
    }

    // Check for profanity immediately (no network call needed)
    if (!isUsernameClean(cleaned)) {
      setUsernameError(getUsernameProfanityError(cleaned) || 'Username contains inappropriate content');
      setIsUsernameAvailable(false);
      return;
    }

    // Clear error and trigger debounced availability check
    setUsernameError(null);
    checkUsernameAvailability(cleaned);
  };

  const steps: OnboardingStep[] = [
    {
      id: 0,
      title: 'Choose a Username',
      subtitle: 'This is how friends will find you',
      render: () => (
        <View className="px-6">
          <View className="mb-8 pt-8">
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="flex-row items-center rounded-2xl px-4 py-4"
              style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
            >
              <AtSign size={24} color={theme.textSecondary} />
              <TextInput
                ref={usernameInputRef}
                placeholder="username"
                placeholderTextColor={theme.textSecondary}
                value={username}
                onChangeText={handleUsernameChange}
                className="flex-1 text-xl ml-3"
                style={{ color: theme.text, fontFamily: 'StackSansText_400Regular' }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                editable={!isLoading}
                maxLength={20}
              />
              {isCheckingUsername && (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              )}
              {!isCheckingUsername && isUsernameAvailable === true && (
                <View className="w-6 h-6 rounded-full bg-green-500 items-center justify-center">
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
              )}
              {!isCheckingUsername && isUsernameAvailable === false && (
                <View className="w-6 h-6 rounded-full bg-red-500 items-center justify-center">
                  <X size={14} color="white" strokeWidth={3} />
                </View>
              )}
            </Pressable>

            {usernameError && (
              <Text className="text-red-400 text-sm mt-2 ml-1">{usernameError}</Text>
            )}

            {isUsernameAvailable && (
              <Text className="text-green-400 text-sm mt-2 ml-1">Username is available!</Text>
            )}
          </View>

          <View className="rounded-2xl p-4" style={{ backgroundColor: theme.isDark ? 'rgba(28, 28, 30, 0.5)' : 'rgba(0, 0, 0, 0.05)' }}>
            <Text className="text-sm" style={{ color: theme.textSecondary }}>
              • 3-20 characters{'\n'}
              • Letters, numbers, and underscores only{'\n'}
              • Cannot be changed later
            </Text>
          </View>
        </View>
      ),
    },
    {
      id: 1,
      title: 'Your Profile',
      subtitle: 'Help us know you better',
      render: () => (
        <View className="px-6">
          {/* First Name */}
          <View className="mb-6">
            <Text className="text-lg font-semibold mb-3" style={{ color: theme.text }}>First Name</Text>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="flex-row items-center rounded-2xl px-4 py-4"
              style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
            >
              <TextInput
                placeholder="Enter your first name"
                placeholderTextColor={theme.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
                className="flex-1 text-xl"
                style={{ color: theme.text }}
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Last Name */}
          <View className="mb-6">
            <Text className="text-lg font-semibold mb-3" style={{ color: theme.text }}>Last Name</Text>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="flex-row items-center rounded-2xl px-4 py-4"
              style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
            >
              <TextInput
                placeholder="Enter your last name"
                placeholderTextColor={theme.textSecondary}
                value={lastName}
                onChangeText={setLastName}
                className="flex-1 text-xl"
                style={{ color: theme.text }}
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Birthday */}
          <View className="mb-6">
            <Text className="text-lg font-semibold mb-3" style={{ color: theme.text }}>Birthday</Text>
            <Pressable
              onPress={() => {
                setShowDatePicker(true);
              }}
              className="flex-row items-center rounded-2xl px-4 py-4"
              style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
            >
              <Calendar size={24} color={theme.textSecondary} />
              <View className="flex-1 ml-3">
                <Text className="text-xl" style={{ color: birthday ? theme.text : theme.textSecondary }}>
                  {birthday
                    ? birthday.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Select your birthday'
                  }
                </Text>
                {birthday && (
                  <Text className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                    {calculateAge(birthday)} years old
                  </Text>
                )}
              </View>
            </Pressable>

            <Modal
              visible={showDatePicker}
              transparent
              animationType="fade"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <Pressable
                className="flex-1 justify-center items-center px-6"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                onPress={() => setShowDatePicker(false)}
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  className="rounded-3xl w-full"
                  style={{ backgroundColor: theme.card }}
                >
                  <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text className="font-medium" style={{ color: theme.textSecondary }}>Cancel</Text>
                    </Pressable>
                    <Text className="font-semibold text-lg" style={{ color: theme.text }}>Select Birthday</Text>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text className="text-fitness-accent font-semibold">Done</Text>
                    </Pressable>
                  </View>
                  <View className="items-center justify-center py-4">
                    <DateTimePicker
                      value={birthday || new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          setShowDatePicker(false);
                          if (event.type === 'set' && selectedDate) {
                            setBirthday(selectedDate);
                          }
                        } else {
                          // iOS: update date as user scrolls, but don't close
                          if (selectedDate) {
                            setBirthday(selectedDate);
                          }
                        }
                      }}
                      maximumDate={new Date()} // Can't be born in the future
                      minimumDate={new Date(1900, 0, 1)} // Reasonable minimum
                      themeVariant={theme.isDark ? 'dark' : 'light'}
                      style={Platform.OS === 'ios' ? { height: 200, width: '100%' } : undefined}
                    />
                  </View>
                  <View className="pb-4" />
                </Pressable>
              </Pressable>
            </Modal>
          </View>

          {/* Pronouns */}
          <View className="mb-6">
            <Text className="text-lg font-semibold mb-3" style={{ color: theme.text }}>Pronouns</Text>
            <View className="flex-row flex-wrap gap-3">
              {['he/him', 'she/her', 'they/them', 'other', 'prefer not to say'].map((option) => {
                const isSelected = pronouns === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPronouns(isSelected ? '' : option)}
                    className={`px-4 py-3 rounded-2xl border-2 ${
                      isSelected ? 'border-fitness-accent bg-fitness-accent/10' : ''
                    }`}
                    style={!isSelected ? { borderColor: theme.border, backgroundColor: theme.card } : undefined}
                  >
                    <Text className={`text-base ${isSelected ? 'font-semibold' : ''}`} style={{ color: isSelected ? theme.text : theme.textSecondary }}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

        </View>
      ),
    },
    {
      id: 2,
      title: 'Profile Photo',
      subtitle: 'Add a photo so friends can recognize you',
      render: () => (
        <View className="px-6">
          <View className="items-center mb-8">
            {/* Avatar Preview */}
            <Pressable
              onPress={async () => {
                try {
                  // Request permissions first
                  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert(
                      'Permission Required',
                      'We need access to your photos to upload a profile picture.',
                      [{ text: 'OK' }]
                    );
                    return;
                  }

                  // Launch image picker
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                  });

                  if (!result.canceled && result.assets[0]) {
                    const asset = result.assets[0];
                    console.log('[Onboarding] Image picked:', {
                      uri: asset.uri?.substring(0, 80),
                      mimeType: asset.mimeType,
                      type: asset.type,
                      width: asset.width,
                      height: asset.height,
                      fileName: asset.fileName,
                    });
                    setSelectedImage(asset.uri);
                    // Use mimeType from asset, or infer from fileName if available
                    let mimeType = asset.mimeType;
                    if (!mimeType && asset.fileName) {
                      const ext = asset.fileName.split('.').pop()?.toLowerCase();
                      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                      else if (ext === 'png') mimeType = 'image/png';
                      else if (ext === 'webp') mimeType = 'image/webp';
                    }
                    // Default to jpeg if still no mimeType (most common for photos)
                    setSelectedImageMimeType(mimeType || 'image/jpeg');
                    setUploadError(null);
                  }
                } catch (error) {
                  console.error('Error picking image:', error);
                  setUploadError('Failed to pick image. Please try again.');
                }
              }}
              className="active:opacity-80"
              disabled={isUploadingImage}
            >
              {selectedImage ? (
                <Image
                  source={{ uri: selectedImage }}
                  className="w-32 h-32 rounded-full border-4 border-fitness-accent"
                />
              ) : (
                <View className="w-32 h-32 rounded-full border-4 border-fitness-accent items-center justify-center" style={{ backgroundColor: theme.card }}>
                  <View className="w-24 h-24 rounded-full items-center justify-center border-2 border-dashed" style={{ backgroundColor: theme.isDark ? '#1f2937' : '#E5E7EB', borderColor: theme.border }}>
                    <Camera size={32} color={theme.textSecondary} />
                  </View>
                </View>
              )}
              {selectedImage && (
                <View className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-fitness-accent items-center justify-center border-4" style={{ borderColor: theme.bg }}>
                  <Camera size={16} color="white" />
                </View>
              )}
            </Pressable>

            <Text className="text-lg font-semibold mt-4" style={{ color: theme.text }}>
              {firstName || 'Your'} {lastName || 'Name'}
            </Text>
            <Text className="mt-1" style={{ color: theme.textSecondary }}>@{username}</Text>

            {uploadError && (
              <Text className="text-red-400 text-sm mt-4">{uploadError}</Text>
            )}

            {isUploadingImage && (
              <View className="mt-4 flex-row items-center">
                <ActivityIndicator size="small" color="#FA114F" />
                <Text className="text-sm ml-2" style={{ color: theme.textSecondary }}>Uploading...</Text>
              </View>
            )}
          </View>

          <View className="rounded-2xl p-4" style={{ backgroundColor: theme.isDark ? 'rgba(28, 28, 30, 0.5)' : 'rgba(0, 0, 0, 0.05)' }}>
            <Text className="text-sm" style={{ color: theme.textSecondary }}>
              • Tap the circle above to add a photo{'\n'}
              • You can skip this and add one later{'\n'}
              • Square photos work best
            </Text>
          </View>

          {/* Photo Guidelines Reminder */}
          <PhotoGuidelinesReminder className="mt-4" />
        </View>
      ),
    },
    {
      id: 3,
      title: 'Phone Number',
      subtitle: 'Verify your phone to help friends find you',
      render: () => (
        <View className="px-6 pb-8">
          {!codeSent ? (
            <>
              <View className="mb-6">
                <Text className="text-lg font-semibold mb-3" style={{ color: theme.text }}>Phone Number</Text>
                <View className="flex-row items-center rounded-2xl px-4 py-4" style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
                  <Phone size={24} color={theme.textSecondary} />
                  <TextInput
                    placeholder="(555) 123-4567"
                    placeholderTextColor={theme.textSecondary}
                    value={phoneNumber}
                    onChangeText={(text) => {
                      // Format phone number as user types
                      const cleaned = text.replace(/\D/g, '');
                      let formatted = '';
                      if (cleaned.length > 0) {
                        if (cleaned.length <= 3) {
                          formatted = `(${cleaned}`;
                        } else if (cleaned.length <= 6) {
                          formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
                        } else {
                          formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
                        }
                      }
                      setPhoneNumber(formatted);
                      setPhoneError(null);
                    }}
                    className="flex-1 text-xl ml-3"
                    style={{ color: theme.text }}
                    keyboardType="phone-pad"
                    editable={!isLoading && !isVerifying}
                    maxLength={14}
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onSubmitEditing={() => {
                      // Dismiss keyboard when done is pressed
                      Keyboard.dismiss();
                    }}
                  />
                </View>
                {phoneError && (
                  <Text className="text-red-400 text-sm mt-2 ml-1">{phoneError}</Text>
                )}
              </View>

              <View className="rounded-2xl p-4 mb-8" style={{ backgroundColor: theme.isDark ? 'rgba(28, 28, 30, 0.5)' : 'rgba(0, 0, 0, 0.05)' }}>
                <Text className="text-sm" style={{ color: theme.textSecondary }}>
                  • Required to verify your identity{'\n'}
                  • Helps friends find you in their contacts{'\n'}
                  • We'll send a verification code via SMS{'\n'}
                  • Tap outside to dismiss keyboard
                </Text>
              </View>
            </>
          ) : (
            <>
              <View className="mb-6">
                <Text className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Enter Verification Code</Text>
                <Text className="text-sm mb-4" style={{ color: theme.textSecondary }}>
                  We sent a code to {phoneNumber}
                </Text>
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  className="flex-row items-center rounded-2xl px-4 py-4"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
                >
                  <TextInput
                    placeholder="123456"
                    placeholderTextColor={theme.textSecondary}
                    value={verificationCode}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/\D/g, '').slice(0, 6);
                      setVerificationCode(cleaned);
                      setPhoneError(null);
                    }}
                    className="flex-1 text-xl text-center"
                    style={{ color: theme.text }}
                    keyboardType="number-pad"
                    editable={!isLoading && !isVerifying}
                    maxLength={6}
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onSubmitEditing={() => {
                      // Dismiss keyboard when done is pressed
                      Keyboard.dismiss();
                    }}
                  />
                </Pressable>
                {phoneError && (
                  <Text className="text-red-400 text-sm mt-2 ml-1">{phoneError}</Text>
                )}
              </View>

              <Pressable
                onPress={async () => {
                  setCodeSent(false);
                  setVerificationCode('');
                  setPhoneVerified(false);
                  setPhoneError(null);
                }}
                className="mb-8"
              >
                <Text className="text-fitness-accent text-center">Change phone number</Text>
              </Pressable>
            </>
          )}
        </View>
      ),
    },
    // Step 4: Device Selection (MOVED UP - now before health connection)
    {
      id: 4,
      title: 'What do you use to track fitness?',
      subtitle: 'Select your primary fitness device',
      render: () => {
        const devices = [
          { id: 'apple_watch', label: 'Apple Watch', icon: Watch },
          { id: 'fitbit', label: 'Fitbit', icon: Activity },
          { id: 'whoop', label: 'Whoop', icon: Activity },
          { id: 'oura', label: 'Oura Ring', icon: Activity },
        ];

        return (
          <ScrollView className="px-6" showsVerticalScrollIndicator={false}>
            <View className="space-y-3">
              {devices.map((device) => {
                const isSelected = selectedDevice === device.id;
                const DeviceIcon = device.icon;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => setSelectedDevice(device.id)}
                    className={`flex-row items-center rounded-2xl px-4 py-4 ${
                      isSelected ? 'border-fitness-accent bg-fitness-accent/10' : ''
                    }`}
                    style={!isSelected ? { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border } : { borderWidth: 1 }}
                  >
                    <View className="w-10 h-10 items-center justify-center mr-3">
                      {device.id === 'apple_watch' ? (
                        <Image
                          source={require('../../../assets/apple-health-icon.png')}
                          style={{ width: 32, height: 32 }}
                          resizeMode="contain"
                        />
                      ) : device.id === 'fitbit' ? (
                        <Image
                          source={require('../../../assets/fitbit-icon.png')}
                          style={{ width: 32, height: 32 }}
                          resizeMode="contain"
                        />
                      ) : device.id === 'whoop' ? (
                        <Image
                          source={require('../../../assets/whoop-icon.png')}
                          style={{ width: 32, height: 32 }}
                          resizeMode="contain"
                        />
                      ) : device.id === 'oura' ? (
                        <Image
                          source={require('../../../assets/oura-icon.png')}
                          style={{ width: 32, height: 32 }}
                          resizeMode="contain"
                        />
                      ) : (
                        <DeviceIcon size={26} color={isSelected ? '#FA114F' : theme.textSecondary} />
                      )}
                    </View>
                    <Text className={`text-xl flex-1 ${isSelected ? 'font-semibold' : ''}`} style={{ color: theme.text }}>
                      {device.label}
                    </Text>
                    {isSelected && (
                      <View className="w-6 h-6 rounded-full bg-fitness-accent items-center justify-center ml-2">
                        <Check size={14} color="white" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-sm text-center mt-6 px-4" style={{ color: theme.textSecondary }}>
              More devices coming soon. We're working on adding additional fitness trackers.
            </Text>
          </ScrollView>
        );
      },
    },
    // Step 5: Health Connection (conditional based on device selection)
    {
      id: 5,
      title: selectedDevice === 'apple_watch'
        ? 'Connect Apple Health'
        : `Connect ${selectedDevice === 'fitbit' ? 'Fitbit' : selectedDevice === 'whoop' ? 'Whoop' : selectedDevice === 'oura' ? 'Oura' : 'Your Device'}`,
      subtitle: selectedDevice === 'apple_watch'
        ? ''
        : 'Sign in to sync your fitness data',
      render: () => {
        // Apple Watch - show Apple Health connection
        if (selectedDevice === 'apple_watch') {
          return (
            <View className="px-6">
              <View className="mb-8 pt-8">
                <Text className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                  How it works
                </Text>
                <Text className="text-sm mb-4 leading-6" style={{ color: theme.textSecondary }}>
                  When you connect MoveTogether with Apple Health, you'll be asked which data you'd like to share. We use Apple Health to automatically sync your activity data.
                </Text>
                <Text className="text-sm mb-6 leading-6" style={{ color: theme.textSecondary }}>
                  Based on your selection, we'll automatically sync the relevant data you track in MoveTogether. Only data you track from today onwards will be shared.
                </Text>

                <Text className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                  About data privacy
                </Text>
                <Text className="text-sm leading-6" style={{ color: theme.textSecondary }}>
                  What data you want to share is always in your hands.{'\n'}
                  You can change your preferences at any time in Apple Health settings.
                </Text>
              </View>

            </View>
          );
        }

        // Fitbit, Whoop, Oura - show OAuth connection option
        const getProviderInfo = () => {
          switch (selectedDevice) {
            case 'fitbit':
              return {
                name: 'Fitbit',
                description: 'Connect your Fitbit account to automatically sync your activity, sleep, and heart rate data.',
                color: '#00B0B9',
              };
            case 'garmin':
              return {
                name: 'Garmin',
                description: 'Connect your Garmin account to automatically sync your workouts, steps, and health metrics.',
                color: '#007CC3',
              };
            case 'whoop':
              return {
                name: 'WHOOP',
                description: 'Connect your WHOOP account to automatically sync your strain, recovery, and sleep data.',
                color: '#FF0000',
              };
            case 'oura':
              return {
                name: 'Oura',
                description: 'Connect your Oura account to automatically sync your readiness, sleep, and activity data.',
                color: '#D4AF37',
              };
            default:
              return {
                name: 'Device',
                description: 'Connect your device to sync fitness data.',
                color: '#FA114F',
              };
          }
        };

        const providerInfo = getProviderInfo();
        
        // Get OAuth state for the selected provider
        const getOAuthState = () => {
          switch (selectedDevice) {
            case 'fitbit': return fitbitOAuth;
            case 'garmin': return garminOAuth;
            case 'whoop': return whoopOAuth;
            case 'oura': return ouraOAuth;
            default: return null;
          }
        };
        const oauthState = getOAuthState();
        const isOAuthConnecting = oauthState?.isConnecting || false;

        return (
          <View className="px-6">
            <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: theme.card }}>
              <View className="items-center mb-6">
                <View
                  className="w-20 h-20 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: (selectedDevice === 'fitbit' || selectedDevice === 'whoop' || selectedDevice === 'oura') ? 'transparent' : providerInfo.color + '20' }}
                >
                  {isOAuthConnecting ? (
                    <ActivityIndicator size="large" color={providerInfo.color} />
                  ) : oauthConnected ? (
                    <Check size={40} color="#10B981" />
                  ) : selectedDevice === 'fitbit' ? (
                    <Image
                      source={require('../../../assets/fitbit-icon.png')}
                      style={{ width: 70, height: 70 }}
                      resizeMode="contain"
                    />
                  ) : selectedDevice === 'whoop' ? (
                    <Image
                      source={require('../../../assets/whoop-icon.png')}
                      style={{ width: 70, height: 70 }}
                      resizeMode="contain"
                    />
                  ) : selectedDevice === 'oura' ? (
                    <Image
                      source={require('../../../assets/oura-icon.png')}
                      style={{ width: 70, height: 70 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Activity size={40} color={providerInfo.color} />
                  )}
                </View>
                <Text className="text-xl font-bold mb-2" style={{ color: theme.text }}>{providerInfo.name}</Text>
                <Text className="text-sm text-center leading-6" style={{ color: theme.textSecondary }}>
                  {isOAuthConnecting
                    ? 'Connecting...'
                    : oauthConnected
                      ? 'Connected successfully!'
                      : providerInfo.description}
                </Text>
              </View>

              {oauthConnected ? (
                <View className="bg-green-500/20 rounded-xl p-4 flex-row items-center justify-center">
                  <Check size={20} color="#10B981" />
                  <Text className="text-green-400 ml-2 font-semibold">{providerInfo.name} Connected</Text>
                </View>
              ) : (
                <View className="rounded-xl p-4" style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}>
                  <Text className="text-sm mb-2 font-medium" style={{ color: theme.textSecondary }}>What we'll sync:</Text>
                  <View className="flex-row items-center py-2">
                    <Check size={16} color="#10B981" />
                    <Text className="text-sm ml-3" style={{ color: theme.text }}>Daily activity & steps</Text>
                  </View>
                  <View className="flex-row items-center py-2">
                    <Check size={16} color="#10B981" />
                    <Text className="text-sm ml-3" style={{ color: theme.text }}>Workouts & exercise</Text>
                  </View>
                  <View className="flex-row items-center py-2">
                    <Check size={16} color="#10B981" />
                    <Text className="text-sm ml-3" style={{ color: theme.text }}>Heart rate & calories</Text>
                  </View>
                </View>
              )}
            </View>

            {!oauthConnected && (
              <View className="rounded-2xl p-4" style={{ backgroundColor: theme.isDark ? 'rgba(28, 28, 30, 0.5)' : 'rgba(0, 0, 0, 0.05)' }}>
                <Text className="text-sm" style={{ color: theme.textSecondary }}>
                  You'll be redirected to {providerInfo.name} to sign in securely. We never see your password.
                </Text>
              </View>
            )}
          </View>
        );
      },
    },
    // Step 6: Enable Notifications
    {
      id: 6,
      title: 'Stay in the Loop',
      subtitle: 'Get notified about competitions, achievements, and more',
      render: () => {
        const notificationBenefits = [
          { icon: '🏆', text: 'Competition updates and reminders' },
          { icon: '🎯', text: 'Daily goal progress alerts' },
          { icon: '🏅', text: 'Achievement unlocks' },
          { icon: '👥', text: 'Friend activity and challenges' },
        ];

        return (
          <View className="px-6">
            {/* Benefits Card */}
            <View
              style={{
                borderRadius: 20,
                padding: 20,
                borderWidth: 1.5,
                borderColor: theme.isDark ? '#4a4a4a40' : theme.border,
                backgroundColor: theme.card,
              }}
            >
              <Text className="text-sm mb-4 font-medium" style={{ color: theme.textSecondary }}>
                We'll notify you about:
              </Text>
              {notificationBenefits.map((benefit, index) => (
                <View
                  key={index}
                  className="flex-row items-center py-3"
                  style={{
                    borderTopWidth: index > 0 ? 1 : 0,
                    borderTopColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  }}
                >
                  <Text className="text-xl mr-3">{benefit.icon}</Text>
                  <Text className="text-base flex-1" style={{ color: theme.text }}>
                    {benefit.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Privacy Note */}
            <View className="mt-6 px-4">
              <Text className="text-xs text-center" style={{ color: theme.textSecondary }}>
                You can change notification preferences anytime in Settings.
              </Text>
            </View>
          </View>
        );
      },
    },
    // Step 7: Goal Setting
    {
      id: 7,
      title: 'Set Your Goals',
      subtitle: goalsSyncedFromWatch
        ? 'Synced from your Apple Watch'
        : isSyncingGoals
          ? 'Syncing with Apple Watch...'
          : 'Customize your daily activity goals',
      render: () => (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView className="px-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="space-y-6">
            {/* Sync Status Banner */}
            {(goalsSyncedFromWatch || isSyncingGoals) && (
              <View
                className="flex-row items-center rounded-2xl px-4 py-3"
                style={{
                  backgroundColor: goalsSyncedFromWatch
                    ? (theme.isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                    : (theme.isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'),
                  borderWidth: 1,
                  borderColor: goalsSyncedFromWatch
                    ? (theme.isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)')
                    : (theme.isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'),
                }}
              >
                {isSyncingGoals ? (
                  <>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text className="text-sm ml-3" style={{ color: '#3B82F6' }}>
                      Syncing goals from Apple Watch...
                    </Text>
                  </>
                ) : (
                  <>
                    <Check size={18} color="#22C55E" />
                    <Text className="text-sm ml-2" style={{ color: '#22C55E' }}>
                      Synced with Apple Watch
                    </Text>
                  </>
                )}
              </View>
            )}

            {/* Move Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center mr-3">
                  <Flame size={20} color="#FA114F" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="font-semibold text-lg" style={{ color: theme.text }}>Move Goal</Text>
                    {goalsSyncedFromWatch && (
                      <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)' }}>
                        <Text className="text-xs" style={{ color: '#22C55E' }}>synced</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-sm" style={{ color: theme.textSecondary }}>Calories burned</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={moveGoal}
                  onChangeText={setMoveGoal}
                  keyboardType="numeric"
                  className="rounded-2xl px-4 py-3 text-lg"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, color: theme.text }}
                  placeholder="400"
                  placeholderTextColor={theme.textSecondary}
                />
              </Pressable>
            </View>

            {/* Exercise Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-green-500/20 items-center justify-center mr-3">
                  <Timer size={20} color="#92E82A" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="font-semibold text-lg" style={{ color: theme.text }}>Exercise Goal</Text>
                    {goalsSyncedFromWatch && (
                      <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)' }}>
                        <Text className="text-xs" style={{ color: '#22C55E' }}>synced</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-sm" style={{ color: theme.textSecondary }}>Minutes per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={exerciseGoal}
                  onChangeText={setExerciseGoal}
                  keyboardType="numeric"
                  className="rounded-2xl px-4 py-3 text-lg"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, color: theme.text }}
                  placeholder="30"
                  placeholderTextColor={theme.textSecondary}
                />
              </Pressable>
            </View>

            {/* Stand Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                  <Activity size={20} color="#00D4FF" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="font-semibold text-lg" style={{ color: theme.text }}>Stand Goal</Text>
                    {goalsSyncedFromWatch && (
                      <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)' }}>
                        <Text className="text-xs" style={{ color: '#22C55E' }}>synced</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-sm" style={{ color: theme.textSecondary }}>Hours per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={standGoal}
                  onChangeText={setStandGoal}
                  keyboardType="numeric"
                  className="rounded-2xl px-4 py-3 text-lg"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, color: theme.text }}
                  placeholder="12"
                  placeholderTextColor={theme.textSecondary}
                />
              </Pressable>
            </View>

            {/* Steps Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                  <Target size={20} color="#A855F7" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-lg" style={{ color: theme.text }}>Steps Goal</Text>
                  <Text className="text-sm" style={{ color: theme.textSecondary }}>Steps per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={formatNumberWithCommas(stepsGoal)}
                  onChangeText={(text) => setStepsGoal(parseFormattedNumber(text))}
                  keyboardType="numeric"
                  className="rounded-2xl px-4 py-3 text-lg"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, color: theme.text }}
                  placeholder="10,000"
                  placeholderTextColor={theme.textSecondary}
                />
              </Pressable>
            </View>
          </View>
        </ScrollView>
        </TouchableWithoutFeedback>
      ),
    },
    // Step 8: Subscription Selection
    {
      id: 8,
      title: 'Level up your fitness',
      subtitle: 'Start free, upgrade anytime',
      render: () => {
        const TIERS = [
          {
            id: 'mover',
            name: 'Mover',
            price: {
              monthly: packages.mover_monthly?.product.priceString || '$4.99',
              annual: packages.mover_annual?.product.priceString || '$49.99',
            },
            welcomeOfferPrice: '$29.99',
            description: 'Everything you need to stay on track',
            features: [
              { text: 'Unlimited competitions' },
              { text: 'Advanced analytics' },
              { text: 'Competition group chat' },
              { text: 'Unlimited friends & activity feed' },
              { text: 'Earn achievements' },
            ],
            highlight: true,
          },
          {
            id: 'crusher',
            name: 'Crusher',
            price: {
              monthly: packages.crusher_monthly?.product.priceString || '$9.99',
              annual: packages.crusher_annual?.product.priceString || '$99.99',
            },
            welcomeOfferPrice: '$49.99',
            description: 'Your personal AI training partner',
            features: [
              { text: 'Everything in Mover' },
              { text: 'AI Coach with personalized guidance' },
              { text: 'Priority support' },
            ],
          },
        ];

        const selectedTierData = TIERS.find(tier => tier.id === selectedSubscriptionTier) || TIERS[0] as typeof TIERS[0] & { welcomeOfferPrice?: string };

        const tierConfig = {
          mover: {
            bg: '#3b82f6',
            gradient: theme.isDark ? ['#1a2a3a', '#1C1C1E', '#0D0D0D'] : ['#EFF6FF', '#DBEAFE', '#BFDBFE'],
            borderColor: theme.isDark ? '#3b82f640' : '#3b82f680',
          },
          crusher: {
            bg: '#8b5cf6',
            gradient: theme.isDark ? ['#2a1a2e', '#1C1C1E', '#0D0D0D'] : ['#F5F3FF', '#EDE9FE', '#DDD6FE'],
            borderColor: theme.isDark ? '#8b5cf640' : '#8b5cf680',
          },
        };
        const selectedConfig = tierConfig[selectedSubscriptionTier];

        return (
          <View style={{ flex: 1 }}>
            {/* Tab Switcher */}
            <View className="px-6 mb-3">
              <LinearGradient
                colors={selectedConfig.gradient as any}
                style={{
                  borderRadius: 20,
                  padding: 4,
                  borderWidth: 1.5,
                  borderColor: selectedConfig.borderColor,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <View
                  className="flex-row relative"
                  onLayout={(e) => setTabContainerWidth(e.nativeEvent.layout.width)}
                >
                  {/* Animated sliding indicator */}
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        top: 4,
                        bottom: 4,
                        left: 0,
                        borderRadius: 16,
                      },
                      animatedTabIndicatorStyle as any,
                    ]}
                  >
                    <LinearGradient
                      colors={[selectedConfig.bg + '60', selectedConfig.bg + '30']}
                      style={{
                        flex: 1,
                        borderRadius: 16,
                      }}
                    />
                  </Animated.View>

                  {TIERS.map((tier) => {
                    const isSelected = selectedSubscriptionTier === tier.id;
                    return (
                      <Pressable
                        key={tier.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedSubscriptionTier(tier.id as 'mover' | 'crusher');
                        }}
                        className="flex-1 relative z-10"
                      >
                        <View
                          style={{
                            borderRadius: 16,
                            paddingVertical: 12,
                            alignItems: 'center',
                          }}
                        >
                          <Text className={`text-center font-semibold text-base ${isSelected ? '' : ''}`} style={{ color: isSelected ? (theme.isDark ? '#FFFFFF' : '#000000') : theme.textSecondary }}>
                            {tier.name}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </LinearGradient>
            </View>

            {/* Card Container - Stays in place */}
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }}
              style={{ overflow: 'visible' }}
            >
              <View style={{ overflow: 'visible' }}>
                <SubscriptionTierCard
                  tier={selectedTierData}
                  packages={packages}
                  purchasePackage={purchasePackage}
                  isPurchasing={isPurchasing}
                  setIsPurchasing={setIsPurchasing}
                />
              </View>
            </ScrollView>
            
            {/* Skip Offer Button */}
            <View className="px-6 pb-6" style={{ marginTop: -32 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentStep(9);
                }}
                className="active:opacity-70"
              >
                <Text className="text-center text-base" style={{ color: theme.textSecondary }}>
                  Skip offer
                </Text>
              </Pressable>
            </View>
          </View>
        );
      },
    },
    // Step 9: Skip Confirmation
    {
      id: 9,
      title: 'Are you sure?',
      subtitle: 'Staying on the free plan has limits.',
      render: () => {
        const freePlanLimits = [
          'Limited to 2 active competitions',
          'No advanced analytics',
          'No competition group chat',
          'No friends & activity feed',
          'No achievements',
        ];

        return (
          <View className="px-6">
            <View
              style={{
                borderRadius: 20,
                padding: 20,
                borderWidth: 1.5,
                borderColor: theme.isDark ? '#4a4a4a40' : theme.border,
                backgroundColor: theme.card,
              }}
            >
              {/* Header */}
              <View className="mb-4">
                <Text className="text-xl font-bold" style={{ color: theme.text }}>Free Plan</Text>
              </View>

              {/* Limits */}
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}>
                <Text className="text-sm mb-3 font-medium" style={{ color: theme.textSecondary }}>Limits</Text>
                {freePlanLimits.map((limit, index) => (
                  <View
                    key={index}
                    className="flex-row items-center py-3"
                    style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                  >
                    <View className="w-8 items-center">
                      <X size={18} color={theme.textSecondary} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-base" style={{ color: theme.text }}>{limit}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Continue with Free Plan Button */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsLoading(true);
                  try {
                    // Sync tier to Supabase if available
                    const subscriptionStore = useSubscriptionStore.getState();
                    if (subscriptionStore.syncTierToSupabase) {
                      await subscriptionStore.syncTierToSupabase();
                    }
                    await completeOnboarding();
                    router.replace('/(tabs)');
                  } catch (e) {
                    console.error('Error completing onboarding:', e);
                    await completeOnboarding();
                    router.replace('/(tabs)');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="active:opacity-90"
                style={{
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  borderWidth: 1.5,
                  borderColor: 'rgba(107, 114, 128, 0.5)',
                  opacity: isLoading ? 0.5 : 1,
                  marginBottom: 12,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <Text className="font-bold text-base" style={{ color: theme.text }}>Continue with free plan</Text>
                )}
              </Pressable>

              {/* Go Back Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentStep(8);
                }}
                className="active:opacity-90"
                style={{
                  shadowColor: '#ef4444',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.8,
                  shadowRadius: 12,
                  elevation: 8,
                }}
              >
                <View
                  style={{
                    paddingVertical: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                    borderWidth: 1.5,
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    shadowColor: '#ef4444',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.6,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Text className="font-bold text-base" style={{ color: theme.text }}>Go back to offers</Text>
                </View>
              </Pressable>
            </View>

            {/* Upgrade Notice */}
            <View className="px-6 mt-4">
              <Text className="text-sm text-center" style={{ color: theme.textSecondary }}>
                You can upgrade your plan anytime in Settings.
              </Text>
            </View>
          </View>
        );
      },
    },
  ];

  // Tier Card Component for Subscription Step
  const SubscriptionTierCard = ({ tier, packages, purchasePackage, isPurchasing, setIsPurchasing }: {
    tier: { id: string; name: string; price: { monthly: string; annual: string }; welcomeOfferPrice?: string; description: string; features: { text: string }[]; highlight?: boolean };
    packages: any;
    purchasePackage: any;
    isPurchasing: boolean;
    setIsPurchasing: (value: boolean) => void;
  }) => {
    // Welcome offer - annual only
    const selectedPeriod: 'annual' = 'annual';

    const getPackage = () => {
      const packageId = `${tier.id}_${selectedPeriod}` as 'mover_annual' | 'crusher_annual';
      return packages[packageId];
    };

    const packageToPurchase = getPackage();
    // Welcome offer price takes priority
    const price = tier.welcomeOfferPrice || packageToPurchase?.product.priceString || tier.price[selectedPeriod];

    const tierConfig = {
      mover: {
        bg: '#3b82f6',
        text: 'Popular',
        gradient: theme.isDark ? ['#1a2a3a', '#1C1C1E', '#0D0D0D'] : ['#EFF6FF', '#DBEAFE', '#BFDBFE'],
        borderColor: theme.isDark ? '#3b82f640' : '#3b82f680',
        glowColor: '#3b82f660',
      },
      crusher: {
        bg: '#8b5cf6',
        text: 'Premium',
        gradient: theme.isDark ? ['#2a1a2e', '#1C1C1E', '#0D0D0D'] : ['#F5F3FF', '#EDE9FE', '#DDD6FE'],
        borderColor: theme.isDark ? '#8b5cf640' : '#8b5cf680',
        glowColor: '#8b5cf660',
      },
    };
    const config = tierConfig[tier.id as keyof typeof tierConfig];

    return (
      <View
        style={{
          shadowColor: config.glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: theme.isDark ? 1 : 0.5,
          shadowRadius: 20,
          elevation: 10,
        }}
      >
        <LinearGradient
          colors={config.gradient as any}
          style={{
            borderRadius: 20,
            padding: 20,
            borderWidth: 1.5,
            borderColor: config.borderColor,
          }}
        >
            {/* Header */}
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-1 mr-3">
                <View className="flex-row items-center mb-2">
                  <View
                    className="px-2 py-1 rounded-full mr-2"
                    style={{ backgroundColor: config.bg + '30' }}
                  >
                    <Text style={{ color: config.bg }} className="text-xs font-medium">
                      {config.text}
                    </Text>
                  </View>
                </View>
                <Text className="text-xl font-bold" style={{ color: theme.text }}>{tier.name}</Text>
                <Text className="text-sm mt-1" style={{ color: theme.textSecondary }}>{tier.description}</Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-baseline">
                  {tier.welcomeOfferPrice && (
                    <Text className="text-base line-through mr-2" style={{ color: theme.textSecondary }}>
                      {tier.price.annual}
                    </Text>
                  )}
                  <Text className="text-2xl font-bold" style={{ color: theme.text }}>{price}</Text>
                </View>
                <Text className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  /year
                </Text>
              </View>
            </View>

            {/* Features */}
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}>
              <Text className="text-sm mb-3 font-medium" style={{ color: theme.textSecondary }}>Features</Text>
              {tier.features.map((feature, index) => (
                <View
                  key={index}
                  className="flex-row items-center py-2"
                  style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                >
                  <View className="w-8 items-center">
                    <Check size={18} color={config.bg} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-sm" style={{ color: theme.text }}>{feature.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* CTA Button */}
            <Pressable
              onPress={async () => {
                setIsPurchasing(true);
                try {
                  const packageId = `${tier.id}_${selectedPeriod}` as 'mover_annual' | 'crusher_annual';
                  const result = await purchasePackage(packageId);
                  if (result === true) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } else if (result === 'cancelled') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  }
                } catch (e) {
                  console.error('Purchase error:', e);
                  Alert.alert('Purchase Failed', 'Unable to complete purchase. Please try again.');
                } finally {
                  setIsPurchasing(false);
                }
              }}
              disabled={isPurchasing || !packageToPurchase}
              className="active:opacity-90"
              style={{
                shadowColor: !packageToPurchase ? 'transparent' : tier.id === 'mover' ? '#2563eb' : '#7c3aed',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.8,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <View
                style={{
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  borderWidth: 1.5,
                  borderColor: tier.id === 'mover' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(139, 92, 246, 0.5)',
                  shadowColor: tier.id === 'mover' ? '#3b82f6' : '#8b5cf6',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <Text className="font-bold text-base" style={{ color: theme.text }}>
                    {`Upgrade to ${tier.name}`}
                  </Text>
                )}
              </View>
            </Pressable>
          </LinearGradient>
      </View>
    );
  };

  const handleContinue = async () => {
    if (currentStep === 0) {
      // Username step
      if (!username || username.length < 3 || !isUsernameAvailable) {
        return;
      }

      setIsLoading(true);
      try {
        const success = await updateUsername(username);
        if (success) {
          setCurrentStep(1);
        }
        setIsLoading(false);
      } catch (e) {
        console.error('Username save error:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 1) {
      // Profile step - save name to Supabase
      if (!firstName.trim()) {
        return;
      }

      setIsLoading(true);
      try {
        // Save to Supabase using updateProfile
        // Calculate age from birthday if provided
        const ageNum = birthday ? calculateAge(birthday) : undefined;
        const success = await updateProfile(firstName.trim(), lastName.trim(), ageNum, pronouns || undefined, birthday || undefined);
        if (success) {
          setCurrentStep(2);
        }
        setIsLoading(false);
      } catch (e) {
        console.error('Profile save error:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 2) {
      // Photo upload step - optional, can skip
      // If image is selected, review with AI then upload
      if (selectedImage && user?.id) {
        console.log('[Onboarding] Starting image upload:', {
          uri: selectedImage?.substring(0, 80),
          userId: user.id,
          mimeType: selectedImageMimeType,
        });
        setIsUploadingImage(true);
        setUploadError(null);
        try {
          // =====================================================
          // STEP 1: AI Photo Review (before upload)
          // =====================================================
          console.log('[Onboarding] Reviewing photo with AI...');
          const reviewResult = await reviewPhotoWithAI(selectedImage, user.id);
          
          if (!reviewResult.approved) {
            setUploadError(reviewResult.reason || 'This photo violates our community guidelines. Please choose a different photo.');
            setIsUploadingImage(false);
            return;
          }
          console.log('[Onboarding] Photo approved by AI');

          // =====================================================
          // STEP 2: Upload to Supabase (only if approved)
          // =====================================================
          // Check if the function is available
          if (!ImageUploadService || !ImageUploadService.uploadImageToSupabase) {
            throw new Error('Image upload service not available. Please restart the app.');
          }

          const uploadResult = await ImageUploadService.uploadImageToSupabase(selectedImage, user.id, selectedImageMimeType);
          console.log('[Onboarding] Upload result:', uploadResult);

          if (uploadResult.success && uploadResult.url) {
            // Save avatar URL to profile
            const success = await updateAvatar(uploadResult.url);

            if (success) {
              setCurrentStep(3);
            } else {
              setUploadError('Failed to save photo. You can try again later.');
            }
          } else {
            setUploadError(uploadResult.error || 'Failed to upload photo. You can skip and add one later.');
          }
        } catch (e) {
          console.error('Error uploading image:', e);
          const errorMessage = e instanceof Error ? e.message : 'Failed to upload photo';
          setUploadError(`${errorMessage}. You can skip and add one later.`);
        } finally {
          setIsUploadingImage(false);
        }
      } else {
        // No image selected, skip this step
        setCurrentStep(3);
      }
    } else if (currentStep === 3) {
      // Phone verification step
      if (!codeSent) {
        // Send verification code
        if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
          setPhoneError('Please enter a valid phone number');
          return;
        }

        // Optimistically show verification screen immediately
        setCodeSent(true);
        setPhoneError(null);
        
        // Send code in background (don't block UI)
        setIsVerifying(true);
        (async () => {
          try {
            const { sendPhoneVerificationCode } = await import('@/lib/phone-verification-service');
            const result = await sendPhoneVerificationCode(phoneNumber);
            
            if (!result.success) {
              // Revert if sending failed
              setCodeSent(false);
              setPhoneError(result.error || 'Failed to send code');
            }
          } catch (e) {
            console.error('Error sending verification code:', e);
            // Revert if sending failed
            setCodeSent(false);
            setPhoneError('Failed to send verification code');
          } finally {
            setIsVerifying(false);
          }
        })();
      } else {
        // Verify code
        if (!verificationCode || verificationCode.length !== 6) {
          setPhoneError('Please enter the 6-digit code');
          return;
        }

        setIsVerifying(true);
        setPhoneError(null);
        try {
          const { verifyPhoneCode, savePhoneNumberToProfile } = await import('@/lib/phone-verification-service');
          const verifyResult = await verifyPhoneCode(phoneNumber, verificationCode);
          
          if (verifyResult.success && user?.id) {
            // Save phone number to profile
            const saveResult = await savePhoneNumberToProfile(user.id, phoneNumber);
            if (saveResult.success) {
              await updatePhoneNumber(phoneNumber);
              setPhoneVerified(true);
              setIsVerifying(false); // Reset verifying state before advancing
              // Automatically proceed to next step after successful verification
              setCurrentStep(4);
            } else {
              setPhoneError(saveResult.error || 'Failed to save phone number');
              setIsVerifying(false);
            }
          } else {
            setPhoneError(verifyResult.error || 'Invalid verification code');
            setIsVerifying(false);
          }
        } catch (e) {
          console.error('Error verifying code:', e);
          setPhoneError('Failed to verify code');
          setIsVerifying(false);
        }
      }
    } else if (currentStep === 4) {
      // Device selection step (MOVED UP - now before health connection)
      if (!selectedDevice) {
        Alert.alert('Please Select a Device', 'Please select your primary fitness device to continue.');
        return;
      }
      
      setIsLoading(true);
      try {
        // Save device to Supabase
        if (user?.id) {
          await updatePrimaryDevice(selectedDevice);
        }
        setIsLoading(false);
        
        // Go to health connection step (step 5)
        // The health connection step handles different flows based on device type
        setCurrentStep(5);
      } catch (e) {
        console.error('Error saving device:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 5) {
      // Health connection step - conditional based on device
      setIsLoading(true);
      
      try {
        if (selectedDevice === 'apple_watch') {
          // Apple Watch - connect to Apple Health
          if (!appleHealthConnected) {
            const connected = await connectProvider('apple_health');
            if (connected) {
              setAppleHealthConnected(true);
              console.log('[Onboarding] Apple Health connected successfully');
              // Goals will be fetched when entering step 7 (goals step)
              // This gives HealthKit authorization time to settle during the notifications step
              setIsLoading(false);
              setCurrentStep(6); // Go to notifications step
            } else {
              setIsLoading(false);
              Alert.alert(
                'Connection Failed',
                'Unable to connect to Apple Health. Please make sure HealthKit permissions are enabled in Settings.',
                [{ text: 'OK' }]
              );
            }
          } else {
            // Already connected
            setIsLoading(false);
            setCurrentStep(6);
          }
        } else if (['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice || '')) {
          // Third-party device - trigger OAuth flow
          setIsLoading(false);
          
          // Get the appropriate OAuth handler
          const getOAuthHandler = () => {
            switch (selectedDevice) {
              case 'fitbit': return fitbitOAuth;
              case 'garmin': return garminOAuth;
              case 'whoop': return whoopOAuth;
              case 'oura': return ouraOAuth;
              default: return null;
            }
          };
          
          const oauthHandler = getOAuthHandler();
          if (oauthHandler) {
            // Start the OAuth flow
            await oauthHandler.startOAuthFlow();
            // Note: The OAuth flow will show success/failure alerts
            // and the user will manually proceed after connection
          } else {
            // Fallback if OAuth not available
            setCurrentStep(6);
          }
        } else {
          // Other device - just proceed to goal setting
          setIsLoading(false);
          setCurrentStep(6);
        }
      } catch (e) {
        console.error('Health connection error:', e);
        setIsLoading(false);
        Alert.alert(
          'Connection Error',
          'An error occurred. You can connect your device later in Settings.',
          [{ text: 'Continue', onPress: () => setCurrentStep(6) }]
        );
      }
    } else if (currentStep === 6) {
      // Notifications step - request permission when Continue is pressed
      setIsLoading(true);
      try {
        // Use OneSignal's permission request (this is the push notification service we use)
        const granted = await requestNotificationPermission();

        if (granted) {
          setNotificationsEnabled(true);
          console.log('[Onboarding] Push notifications enabled via OneSignal');
        } else {
          console.log('[Onboarding] Push notifications not granted');
        }

        setIsLoading(false);
        setCurrentStep(7);
      } catch (e) {
        console.error('Error requesting notifications:', e);
        setIsLoading(false);
        setCurrentStep(7); // Continue anyway
      }
    } else if (currentStep === 7) {
      // Goal setting step - save goals and go to subscription step
      setIsLoading(true);
      try {
        if (user?.id) {
          await updateGoals({
            moveCalories: parseInt(moveGoal) || 400,
            exerciseMinutes: parseInt(exerciseGoal) || 30,
            standHours: parseInt(standGoal) || 12,
            steps: parseInt(stepsGoal) || 10000,
          }, user.id);
        }
        // Load offerings for subscription step
        loadOfferings();
        setCurrentStep(8);
        setIsLoading(false);
      } catch (e) {
        console.error('Error saving goals:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 8) {
      // Subscription step - complete onboarding (user can skip or purchase)
      // If user hasn't purchased, they're on Starter (free) tier
      setIsLoading(true);
      try {
        // Sync tier to Supabase if available
        const subscriptionStore = useSubscriptionStore.getState();
        if (subscriptionStore.syncTierToSupabase) {
          await subscriptionStore.syncTierToSupabase();
        }
        completeOnboarding();
        router.replace('/(tabs)');
      } catch (e) {
        console.error('Error syncing tier:', e);
        // Continue anyway
        completeOnboarding();
        router.replace('/(tabs)');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const canContinue = () => {
    if (currentStep === 0) {
      return username.length >= 3 && isUsernameAvailable === true && !isCheckingUsername;
    }
    if (currentStep === 1) {
      return firstName.trim().length > 0;
    }
    if (currentStep === 2) {
      // Photo upload step is optional - can always continue
      // But disable during upload
      return !isUploadingImage;
    }
    if (currentStep === 3) {
      // Phone verification is mandatory - must complete verification
      if (!codeSent) {
        // Can send code if phone number is valid
        return phoneNumber.replace(/\D/g, '').length >= 10 && !isVerifying;
      } else {
        // After code is sent, require 6-digit code to continue
        // Only allow continue if phone is verified (code entered and verified)
        return phoneVerified || (verificationCode.length === 6 && !isVerifying);
      }
    }
    if (currentStep === 4) {
      // Device selection - must select a device
      return selectedDevice !== null;
    }
    if (currentStep === 5) {
      // Health connection - can continue unless OAuth is in progress
      const isOAuthConnecting = fitbitOAuth.isConnecting || garminOAuth.isConnecting || whoopOAuth.isConnecting || ouraOAuth.isConnecting;
      return !isLoading && !isOAuthConnecting;
    }
    if (currentStep === 6) {
      // Notifications step - can always continue
      return true;
    }
    if (currentStep === 7) {
      // Goal setting - can always continue (goals have defaults)
      return true;
    }
    if (currentStep === 8) {
      // Subscription step - can always continue (can skip)
      return !isPurchasing;
    }
    return true;
  };

  const currentStepData = steps[currentStep];

  // Exclude subscription step (index 8) from progress calculation
  const effectiveSteps = steps.length - 2; // Subtract 2 to exclude subscription step (8) and skip confirmation (9)
  const progress = (currentStep === 8 || currentStep === 9)
    ? 100 // Full progress on subscription screen and skip confirmation
    : ((currentStep + 1) / effectiveSteps) * 100;

  // Animate progress bar smoothly
  useEffect(() => {
    progressValue.value = withTiming(progress, {
      duration: 400,
    });
  }, [progress, progressValue]);

  const animatedProgressStyle = useAnimatedStyle(() => {
    return {
      width: `${progressValue.value}%`,
    };
  });

  return (
    <View className="flex-1" style={{ backgroundColor: theme.bg }}>
      <LinearGradient
        colors={currentStep === 9
          ? (theme.isDark ? ['#2e1a1a', '#1a0a0a', '#000000'] : ['#fff5f5', '#ffe8e8', '#fff5f5'])
          : (theme.isDark ? ['#1a1a2e', '#0a0a0a', '#000000'] : [theme.bg, theme.bgSecondary, theme.bg])}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View
          className="flex-row justify-between items-center px-6"
          style={{ paddingTop: insets.top + (currentStep === 8 ? 8 : 16), paddingBottom: currentStep === 8 ? 4 : 16 }}
        >
          {(currentStep !== 8 && currentStep !== 9) && (
            <Pressable
              onPress={() => {
                if (currentStep > 0) {
                  // Don't allow going back from phone verification step if code was sent
                  // User must complete verification
                  if (currentStep === 3 && codeSent && !phoneVerified) {
                    return; // Prevent going back until verified
                  }
                  // Clear selected image when going back from photo step
                  if (currentStep === 2) {
                    setSelectedImage(null);
                    setSelectedImageMimeType(null);
                    setUploadError(null);
                  }
                  setCurrentStep(currentStep - 1);
                }
              }}
              disabled={currentStep === 0 || (currentStep === 3 && codeSent && !phoneVerified) || isUploadingImage}
            >
              <Text className="text-xl" style={{ color: theme.text }}>
                {currentStep > 0 ? '←' : ' '}
              </Text>
            </Pressable>
          )}
          {(currentStep === 8 || currentStep === 9) && <View />}
          <Text className="text-lg" style={{ color: theme.textSecondary }}>
            {currentStep === 8 || currentStep === 9 ? '' : `${currentStep + 1} of ${steps.length - 2}`}
          </Text>
        </View>

        {/* Progress Bar */}
        {currentStep !== 8 && currentStep !== 9 && (
          <View className="px-6 mb-4">
            <View className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.isDark ? '#1f2937' : '#E5E7EB' }}>
              <Animated.View
                className="h-full bg-gradient-to-r"
                style={[
                  animatedProgressStyle,
                  {
                    backgroundColor: '#FA114F',
                  }
                ]}
              />
            </View>
          </View>
        )}

        {/* Title and Subtitle */}
        <View className="px-6 mb-6" style={{ marginTop: currentStep === 8 ? -12 : 16 }}>
          {currentStep === 5 && (selectedDevice === 'apple_watch') && (
            <View className="items-center mb-4 pt-10">
              <Image 
                source={require('../../../assets/apple-health-icon.png')}
                style={{ width: 60, height: 60 }}
                resizeMode="contain"
              />
            </View>
          )}
          {currentStep === 8 && (
            <View className="items-center mb-6">
              <LinearGradient
                colors={theme.isDark
                  ? ['rgba(255, 215, 0, 0.25)', 'rgba(255, 193, 7, 0.25)', 'rgba(255, 215, 0, 0.25)']
                  : ['#FEF3C7', '#FDE68A', '#FEF3C7']}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: theme.isDark ? 'rgba(255, 215, 0, 0.6)' : '#F59E0B',
                  shadowColor: '#FFD700',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: theme.isDark ? 0.5 : 0.3,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{
                    color: theme.isDark ? '#FDE047' : '#92400E',
                    textShadowColor: theme.isDark ? 'rgba(255, 215, 0, 0.5)' : 'transparent',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: theme.isDark ? 2 : 0,
                  }}
                >
                  Welcome Offer  |  50% off annual plans
                </Text>
              </LinearGradient>
            </View>
          )}
          <Text className={`text-4xl font-bold mb-2 ${(currentStep === 5 && (selectedDevice === 'apple_watch')) || currentStep === 8 || currentStep === 9 ? 'text-center' : ''}`} style={{ color: theme.text, lineHeight: 42 }}>
            {currentStepData.title}
          </Text>
          {currentStep === 8 && (
            <Text className="text-lg text-center mt-1" style={{ color: theme.textSecondary }}>
              Unlock all features with a subscription
            </Text>
          )}
          {currentStepData.subtitle && currentStep !== 8 && currentStep !== 9 ? (
            <Text className="text-lg" style={{ color: theme.textSecondary }}>
              {currentStepData.subtitle}
            </Text>
          ) : null}
          {currentStep === 9 && (
            <Text className="text-base text-center mt-2" style={{ color: theme.textSecondary }}>
              (This offer won't come again)
            </Text>
          )}
        </View>

          {/* Content */}
          <Pressable 
            onPress={Keyboard.dismiss}
            style={{ flex: 1, paddingBottom: (currentStep === 8 || currentStep === 9) ? 0 : 100 }}
          >
            <View style={{ flex: 1 }}>
              {currentStepData.render()}
            </View>
          </Pressable>

          {/* Continue Button - Fixed at bottom, never moves */}
          {currentStep !== 8 && currentStep !== 9 && (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                paddingBottom: insets.bottom + 24,
                paddingHorizontal: 24,
                backgroundColor: theme.bg
              }}
              className="gap-4"
            >
            <Animated.View entering={FadeIn.duration(300)} className="items-center">
              <Pressable
                onPress={handleContinue}
                disabled={isLoading || isUploadingImage || !canContinue()}
                className="active:scale-95 w-full"
                style={{ opacity: canContinue() ? 1 : 0.5 }}
              >
                <LinearGradient
                  colors={canContinue() ? ['#FA114F', '#FF6B5A'] : (theme.isDark ? ['#333', '#222'] : ['#D1D5DB', '#9CA3AF'])}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 50,
                    paddingVertical: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text className="text-white text-lg font-bold">
                    {isLoading || isVerifying || isUploadingImage || (currentStep === 5 && (fitbitOAuth.isConnecting || garminOAuth.isConnecting || whoopOAuth.isConnecting || ouraOAuth.isConnecting))
                      ? 'Please wait...' 
                      : currentStep === steps.length - 1 
                        ? 'Get Started' 
                        : currentStep === 3 && !codeSent
                          ? 'Send Code'
                          : currentStep === 3 && codeSent
                            ? 'Verify'
                            : currentStep === 5 && (selectedDevice === 'apple_watch') && !appleHealthConnected
                              ? 'Sync with Apple Health'
                              : currentStep === 5 && ['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice || '') && !oauthConnected
                                ? `Connect ${selectedDevice === 'fitbit' ? 'Fitbit' : selectedDevice === 'garmin' ? 'Garmin' : selectedDevice === 'whoop' ? 'WHOOP' : 'Oura'}`
                                : currentStep === 6
                                  ? 'Enable Notifications'
                                  : 'Continue'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
            
            {/* Skip option for OAuth providers */}
            {currentStep === 5 && ['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice || '') && !oauthConnected && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentStep(6);
                }}
                className="mt-4"
              >
                <Text className="text-center text-base" style={{ color: theme.textSecondary }}>
                  Skip for now
                </Text>
              </Pressable>
            )}

            {/* Skip option for notifications */}
            {currentStep === 6 && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentStep(7);
                }}
                className="mt-4"
              >
                <Text className="text-center text-base" style={{ color: theme.textSecondary }}>
                  Skip for now
                </Text>
              </Pressable>
            )}
            </View>
          )}
      </LinearGradient>
    </View>
  );
}