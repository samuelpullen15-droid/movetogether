import { View, Text, Pressable, TextInput, ActivityIndicator, Image, Alert, Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Modal, Dimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useHealthStore } from '@/lib/health-service';
import Animated, { FadeIn, FadeOut, Layout, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowRight, Apple, Check, X, AtSign, User, Phone, Camera, Image as ImageIcon, Watch, Activity, Flame, Timer, Target, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSubscriptionStore } from '@/lib/subscription-store';
import * as ImagePicker from 'expo-image-picker';
import debounce from 'lodash/debounce';
import { getAvatarUrl } from '@/lib/avatar-utils';
import * as ImageUploadService from '@/lib/image-upload-service';

async function checkRateLimit(
  supabase: any,
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

  // Get or create rate limit record
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("window_start", windowStart.toISOString())
    .single();

  if (existing) {
    if (existing.request_count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    // Increment count
    await supabase
      .from("rate_limits")
      .update({ request_count: existing.request_count + 1 })
      .eq("id", existing.id);

    return { allowed: true, remaining: limit - existing.request_count - 1 };
  }

  // Create new rate limit record
  await supabase
    .from("rate_limits")
    .insert({
      user_id: userId,
      endpoint,
      request_count: 1,
      window_start: new Date().toISOString(),
    });

  return { allowed: true, remaining: limit - 1 };
}

interface OnboardingStep {
  id: number;
  title: string;
  subtitle: string;
  render: () => React.ReactNode;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUsername = useAuthStore((s) => s.updateUsername);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updatePhoneNumber = useAuthStore((s) => s.updatePhoneNumber);
  const updatePrimaryDevice = useAuthStore((s) => s.updatePrimaryDevice);
  const checkUsernameAvailable = useAuthStore((s) => s.checkUsernameAvailable);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const connectProvider = useHealthStore((s) => s.connectProvider);
  const syncHealthData = useHealthStore((s) => s.syncHealthData);
  const goals = useHealthStore((s) => s.goals);
  const updateGoals = useHealthStore((s) => s.updateGoals);
  const activeProvider = useHealthStore((s) => s.activeProvider);
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
  
  // Device selection state
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [otherDeviceName, setOtherDeviceName] = useState('');
  
  // Goal setting state
  const [moveGoal, setMoveGoal] = useState('400');
  const [exerciseGoal, setExerciseGoal] = useState('30');
  const [standGoal, setStandGoal] = useState('12');
  const [stepsGoal, setStepsGoal] = useState('10000');
  const [hasAppleWatchGoals, setHasAppleWatchGoals] = useState(false);

  // Form state for profile step
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pronouns, setPronouns] = useState<string>('');
  
  // Photo upload state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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

  // Debounced username check
  const checkUsername = useCallback(
    debounce(async (value: string) => {
      if (value.length < 3) {
        setIsUsernameAvailable(null);
        setUsernameError('Username must be at least 3 characters');
        setIsCheckingUsername(false);
        return;
      }

      // Validate username format (alphanumeric and underscores only)
      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(value)) {
        setIsUsernameAvailable(false);
        setUsernameError('Only letters, numbers, and underscores allowed');
        setIsCheckingUsername(false);
        return;
      }

      setIsCheckingUsername(true);
      setUsernameError(null);

      const available = await checkUsernameAvailable(value);
      setIsUsernameAvailable(available);
      setUsernameError(available ? null : 'Username is already taken');
      setIsCheckingUsername(false);
    }, 500),
    [checkUsernameAvailable]
  );

  const handleUsernameChange = (value: string) => {
    // Remove spaces and special characters as they type
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setIsUsernameAvailable(null);
    setUsernameError(null);

    if (cleaned.length >= 3) {
      setIsCheckingUsername(true);
      checkUsername(cleaned);
    }
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
              className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4"
            >
              <AtSign size={24} color="#6b7280" />
              <TextInput
                placeholder="username"
                placeholderTextColor="#666"
                value={username}
                onChangeText={handleUsernameChange}
                className="flex-1 text-white text-xl ml-3"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!isLoading}
                maxLength={20}
              />
              {isCheckingUsername && (
                <ActivityIndicator size="small" color="#6b7280" />
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

          <View className="bg-gray-900/50 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm">
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
            <Text className="text-white text-lg font-semibold mb-3">First Name</Text>
            <Pressable 
              onPress={(e) => e.stopPropagation()}
              className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4"
            >
              <TextInput
                placeholder="Enter your first name"
                placeholderTextColor="#666"
                value={firstName}
                onChangeText={setFirstName}
                className="flex-1 text-white text-xl"
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Last Name */}
          <View className="mb-6">
            <Text className="text-white text-lg font-semibold mb-3">Last Name</Text>
            <Pressable 
              onPress={(e) => e.stopPropagation()}
              className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4"
            >
              <TextInput
                placeholder="Enter your last name"
                placeholderTextColor="#666"
                value={lastName}
                onChangeText={setLastName}
                className="flex-1 text-white text-xl"
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Birthday */}
          <View className="mb-6">
            <Text className="text-white text-lg font-semibold mb-3">Birthday</Text>
            <Pressable 
              onPress={() => {
                setShowDatePicker(true);
              }}
              className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4"
            >
              <Calendar size={24} color="#6b7280" />
              <View className="flex-1 ml-3">
                <Text className={`text-xl ${birthday ? 'text-white' : 'text-gray-500'}`}>
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
                  <Text className="text-gray-400 text-sm mt-1">
                    {calculateAge(birthday)} years old
                  </Text>
                )}
              </View>
            </Pressable>
            
            <Modal
              visible={showDatePicker}
              transparent
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <Pressable
                className="flex-1 bg-black/50 justify-end"
                onPress={() => setShowDatePicker(false)}
              >
                <Pressable 
                  onPress={(e) => e.stopPropagation()}
                  className="bg-fitness-card rounded-t-3xl"
                >
                  <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text className="text-gray-400 font-medium">Cancel</Text>
                    </Pressable>
                    <Text className="text-white font-semibold text-lg">Select Birthday</Text>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text className="text-fitness-accent font-semibold">Done</Text>
                    </Pressable>
                  </View>
                  <View className="items-center justify-center py-4">
                    <DateTimePicker
                      value={birthday || new Date(2000, 0, 1)}
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
                      themeVariant="dark"
                      style={Platform.OS === 'ios' ? { height: 200, width: '100%' } : undefined}
                    />
                  </View>
                  <View style={{ height: insets.bottom }} />
                </Pressable>
              </Pressable>
            </Modal>
          </View>

          {/* Pronouns */}
          <View className="mb-6">
            <Text className="text-white text-lg font-semibold mb-3">Pronouns</Text>
            <View className="flex-row flex-wrap gap-3">
              {['he/him', 'she/her', 'they/them', 'other', 'prefer not to say'].map((option) => {
                const isSelected = pronouns === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPronouns(isSelected ? '' : option)}
                    className={`px-4 py-3 rounded-2xl border-2 ${
                      isSelected ? 'border-fitness-accent bg-fitness-accent/10' : 'border-gray-700 bg-gray-900'
                    }`}
                  >
                    <Text className={`text-base ${isSelected ? 'text-white font-semibold' : 'text-gray-400'}`}>
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
                  // Launch image picker - it will handle permissions automatically
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                  });

                  if (!result.canceled && result.assets[0]) {
                    setSelectedImage(result.assets[0].uri);
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
                <View className="w-32 h-32 rounded-full border-4 border-fitness-accent bg-gray-900 items-center justify-center">
                  <View className="w-24 h-24 rounded-full bg-gray-800 items-center justify-center border-2 border-dashed border-gray-600">
                    <Camera size={32} color="#6b7280" />
                  </View>
                </View>
              )}
              {selectedImage && (
                <View className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-fitness-accent items-center justify-center border-4 border-black">
                  <Camera size={16} color="white" />
                </View>
              )}
            </Pressable>

            <Text className="text-white text-lg font-semibold mt-4">
              {firstName || 'Your'} {lastName || 'Name'}
            </Text>
            <Text className="text-gray-400 mt-1">@{username}</Text>

            {uploadError && (
              <Text className="text-red-400 text-sm mt-4">{uploadError}</Text>
            )}

            {isUploadingImage && (
              <View className="mt-4 flex-row items-center">
                <ActivityIndicator size="small" color="#FA114F" />
                <Text className="text-gray-400 text-sm ml-2">Uploading...</Text>
              </View>
            )}
          </View>

          <View className="bg-gray-900/50 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm">
              • Tap the circle above to add a photo{'\n'}
              • You can skip this and add one later{'\n'}
              • Square photos work best
            </Text>
          </View>
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
                <Text className="text-white text-lg font-semibold mb-3">Phone Number</Text>
                <View className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4">
                  <Phone size={24} color="#6b7280" />
                  <TextInput
                    placeholder="(555) 123-4567"
                    placeholderTextColor="#666"
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
                    className="flex-1 text-white text-xl ml-3"
                    keyboardType="phone-pad"
                    autoFocus
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

              <View className="bg-gray-900/50 rounded-2xl p-4 mb-8">
                <Text className="text-gray-400 text-sm">
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
                <Text className="text-white text-lg font-semibold mb-2">Enter Verification Code</Text>
                <Text className="text-gray-400 text-sm mb-4">
                  We sent a code to {phoneNumber}
                </Text>
                <Pressable 
                  onPress={(e) => e.stopPropagation()}
                  className="flex-row items-center bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4"
                >
                  <TextInput
                    placeholder="123456"
                    placeholderTextColor="#666"
                    value={verificationCode}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/\D/g, '').slice(0, 6);
                      setVerificationCode(cleaned);
                      setPhoneError(null);
                    }}
                    className="flex-1 text-white text-xl text-center"
                    keyboardType="number-pad"
                    autoFocus
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
    // Step 4: Connect Apple Health (REQUIRED)
    {
      id: 4,
      title: 'Connect Apple Health',
      subtitle: '',
      render: () => (
        <View className="px-6">
          <View className="mb-8 pt-8">
            <Text className="text-white text-lg font-semibold mb-2">
              How it works
            </Text>
            <Text className="text-gray-400 text-sm mb-4 leading-6">
              When you connect MoveTogether with Apple Health, you'll be asked which data you'd like to share. We use Apple Health to also connect with your wearable devices, allowing us to automatically sync the relevant data you track.
            </Text>
            <Text className="text-gray-400 text-sm mb-6 leading-6">
              Based on your selection, we'll automatically sync the relevant data you track in MoveTogether. Only data you track from today onwards will be shared with Apple Health.
            </Text>
            
            <Text className="text-white text-lg font-semibold mb-2">
              About data privacy
            </Text>
            <Text className="text-gray-400 text-sm leading-6">
              What data you want to share is always in your hands.{'\n'}
              You can change your preferences at any time in Apple Health settings.
            </Text>
          </View>

          {appleHealthConnected && (
            <View className="mt-6 bg-green-500/20 rounded-2xl p-4 flex-row items-center">
              <Check size={20} color="#10B981" />
              <Text className="text-green-400 ml-2 font-semibold">Apple Health Connected</Text>
            </View>
          )}
        </View>
      ),
    },
    // Step 5: Device Selection
    {
      id: 5,
      title: 'What do you use to track fitness?',
      subtitle: 'Select your primary fitness device',
      render: () => {
        const devices = [
          { id: 'apple_watch', label: 'Apple Watch', icon: Watch },
          { id: 'fitbit', label: 'Fitbit', icon: Activity },
          { id: 'garmin', label: 'Garmin', icon: Activity },
          { id: 'whoop', label: 'Whoop', icon: Activity },
          { id: 'oura', label: 'Oura Ring', icon: Activity },
          { id: 'iphone', label: 'Just my iPhone', icon: Apple },
          { id: 'other', label: 'Other', icon: Activity },
        ];

        return (
          <ScrollView className="px-6" showsVerticalScrollIndicator={false}>
            <View className="space-y-3">
              {devices.map((device) => {
                const isSelected = selectedDevice === device.id;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => setSelectedDevice(device.id)}
                    className={`flex-row items-center bg-gray-900 border rounded-2xl px-4 py-4 ${
                      isSelected ? 'border-fitness-accent bg-fitness-accent/10' : 'border-gray-700'
                    }`}
                  >
                    <Text className={`text-xl flex-1 ${isSelected ? 'text-white font-semibold' : 'text-white'}`}>
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
          </ScrollView>
        );
      },
    },
    // Step 6: Device Sync Instructions (conditional - only for 3rd party devices)
    {
      id: 6,
      title: selectedDevice === 'other' 
        ? 'Tell Us About Your Device' 
        : `Sync ${selectedDevice === 'fitbit' ? 'Fitbit' : selectedDevice === 'garmin' ? 'Garmin' : selectedDevice === 'whoop' ? 'Whoop' : selectedDevice === 'oura' ? 'Oura Ring' : ''} with Apple Health`,
      subtitle: selectedDevice === 'other' 
        ? 'Help us add support for your device' 
        : 'Enable Apple Health sync in your device app',
      render: () => {
        const getInstructions = () => {
          switch (selectedDevice) {
            case 'fitbit':
              return [
                '1. Fitbit does not have native Apple Health integration',
                '2. Download a third-party app like "Fitbit to Apple Health Sync" from the App Store',
                '3. Open the app and sign in with your Fitbit account',
                '4. Grant the app permission to access your Fitbit data',
                '5. Select the data types you want to sync',
                '6. Tap "Sync Now" and allow access to Apple Health when prompted',
              ];
            case 'garmin':
              return [
                '1. Open the Garmin Connect app',
                '2. Tap the menu icon (☰) in the top-left corner',
                '3. Go to Settings → Connected Apps',
                '4. Select "Apple Health"',
                '5. Tap "Connect to Apple Health"',
                '6. Enable the data categories you want to share',
              ];
            case 'whoop':
              return [
                '1. Open the WHOOP app',
                '2. Tap "More" at the bottom-right corner',
                '3. Select "App Settings"',
                '4. Tap "Integrations"',
                '5. Select "Apple Health" and tap "Connect"',
                '6. Enable the data categories and tap "Allow"',
              ];
            case 'oura':
              return [
                '1. Open the Oura app',
                '2. Tap the menu icon (☰) in the upper-left corner',
                '3. Select "Settings"',
                '4. Under "Data Sharing," tap "Apple Health"',
                '5. Toggle on "Connect to Health"',
                '6. Optionally enable "Save Mindful Minutes to Health"',
              ];
            default:
              return [];
          }
        };

        const instructions = getInstructions();

        return (
          <View className="px-6">
            {selectedDevice === 'other' ? (
              <View className="mb-6">
                <Text className="text-gray-300 text-sm mb-4 leading-6">
                  We're always adding support for more third-party devices. Please let us know which device you use, and we'll work on adding integration instructions for it.
                </Text>
                <View className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-4">
                  <TextInput
                    placeholder="Device name (e.g., Polar, Suunto, etc.)"
                    placeholderTextColor="#666"
                    value={otherDeviceName}
                    onChangeText={setOtherDeviceName}
                    className="text-white text-xl"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : (
              <View className="bg-gray-900 rounded-2xl p-6 mb-6">
                <Text className="text-white text-base mb-4 font-semibold">Follow these steps:</Text>
                {instructions.map((instruction, index) => (
                  <View key={index} className="flex-row items-start mb-3">
                    <Text className="text-fitness-accent font-bold mr-3">{instruction.split('.')[0]}.</Text>
                    <Text className="text-gray-300 flex-1">{instruction.substring(instruction.indexOf(' ') + 1)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      },
    },
    // Step 7: Goal Setting (conditional)
    {
      id: 7,
      title: 'Set Your Goals',
      subtitle: hasAppleWatchGoals ? 'Synced from Apple Watch' : 'Customize your daily activity goals',
      render: () => (
        <ScrollView className="px-6" showsVerticalScrollIndicator={false}>
          <View className="space-y-6">
            {/* Move Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center mr-3">
                  <Flame size={20} color="#FA114F" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-lg">Move Goal</Text>
                  <Text className="text-gray-400 text-sm">Calories burned</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={moveGoal}
                  onChangeText={setMoveGoal}
                  keyboardType="numeric"
                  className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white text-lg"
                  placeholder="400"
                  placeholderTextColor="#666"
                />
              </Pressable>
              {hasAppleWatchGoals && (
                <Text className="text-green-400 text-xs mt-1">Synced from Apple Watch</Text>
              )}
            </View>

            {/* Exercise Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-green-500/20 items-center justify-center mr-3">
                  <Timer size={20} color="#92E82A" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-lg">Exercise Goal</Text>
                  <Text className="text-gray-400 text-sm">Minutes per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={exerciseGoal}
                  onChangeText={setExerciseGoal}
                  keyboardType="numeric"
                  className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white text-lg"
                  placeholder="30"
                  placeholderTextColor="#666"
                />
              </Pressable>
              {hasAppleWatchGoals && (
                <Text className="text-green-400 text-xs mt-1">Synced from Apple Watch</Text>
              )}
            </View>

            {/* Stand Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                  <Activity size={20} color="#00D4FF" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-lg">Stand Goal</Text>
                  <Text className="text-gray-400 text-sm">Hours per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={standGoal}
                  onChangeText={setStandGoal}
                  keyboardType="numeric"
                  className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white text-lg"
                  placeholder="12"
                  placeholderTextColor="#666"
                />
              </Pressable>
              {hasAppleWatchGoals && (
                <Text className="text-green-400 text-xs mt-1">Synced from Apple Watch</Text>
              )}
            </View>

            {/* Steps Goal */}
            <View>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                  <Target size={20} color="#A855F7" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-lg">Steps Goal</Text>
                  <Text className="text-gray-400 text-sm">Steps per day</Text>
                </View>
              </View>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <TextInput
                  value={stepsGoal}
                  onChangeText={setStepsGoal}
                  keyboardType="numeric"
                  className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white text-lg"
                  placeholder="10000"
                  placeholderTextColor="#666"
                />
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
            gradient: ['#1a2a3a', '#1C1C1E', '#0D0D0D'],
            borderColor: '#3b82f640',
          },
          crusher: { 
            bg: '#8b5cf6', 
            gradient: ['#2a1a2e', '#1C1C1E', '#0D0D0D'],
            borderColor: '#8b5cf640',
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
                          <Text className={`text-center font-semibold text-base ${isSelected ? 'text-white' : 'text-gray-400'}`}>
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
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 25, paddingBottom: 40 }}
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
                <Text className="text-gray-400 text-center text-base">
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
                borderColor: '#4a4a4a40',
                backgroundColor: '#1C1C1E',
              }}
            >
              {/* Header */}
              <View className="mb-4">
                <Text className="text-white text-xl font-bold">Free Plan</Text>
              </View>

              {/* Limits */}
              <View className="bg-black/30 rounded-xl p-4 mb-4">
                <Text className="text-gray-400 text-sm mb-3 font-medium">Limits</Text>
                {freePlanLimits.map((limit, index) => (
                  <View
                    key={index}
                    className="flex-row items-center py-3"
                    style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <View className="w-8 items-center">
                      <X size={18} color="#6b7280" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-white text-base">{limit}</Text>
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
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderWidth: 1.5,
                  borderColor: 'rgba(107, 114, 128, 0.5)',
                  opacity: isLoading ? 0.5 : 1,
                  marginBottom: 12,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">Continue with free plan</Text>
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
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderWidth: 1.5,
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    shadowColor: '#ef4444',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.6,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Text className="text-white font-bold text-base">Go back to offers</Text>
                </View>
              </Pressable>
            </View>

            {/* Upgrade Notice */}
            <View className="px-6 mt-4">
              <Text className="text-gray-400 text-sm text-center">
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
        gradient: ['#1a2a3a', '#1C1C1E', '#0D0D0D'],
        borderColor: '#3b82f640',
        glowColor: '#3b82f660',
      },
      crusher: { 
        bg: '#8b5cf6', 
        text: 'Premium',
        gradient: ['#2a1a2e', '#1C1C1E', '#0D0D0D'],
        borderColor: '#8b5cf640',
        glowColor: '#8b5cf660',
      },
    };
    const config = tierConfig[tier.id as keyof typeof tierConfig];

    return (
      <View
        style={{
          shadowColor: config.glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
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
                <Text className="text-white text-xl font-bold">{tier.name}</Text>
                <Text className="text-gray-400 text-sm mt-1">{tier.description}</Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-baseline">
                  {tier.welcomeOfferPrice && (
                    <Text className="text-gray-500 text-base line-through mr-2">
                      {tier.price.annual}
                    </Text>
                  )}
                  <Text className="text-white text-2xl font-bold">{price}</Text>
                </View>
                <Text className="text-gray-500 text-xs mt-1">
                  /year
                </Text>
              </View>
            </View>

            {/* Features */}
            <View className="bg-black/30 rounded-xl p-4 mb-4">
              <Text className="text-gray-400 text-sm mb-3 font-medium">Features</Text>
              {tier.features.map((feature, index) => (
                <View
                  key={index}
                  className="flex-row items-center py-2"
                  style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}
                >
                  <View className="w-8 items-center">
                    <Check size={18} color={config.bg} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-white text-sm">{feature.text}</Text>
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
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">
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
    // Development mode: Skip all validations and just advance steps
    if (__DEV__) {
      // Special handling for step 5 (device selection) even in dev mode
      if (currentStep === 5) {
        if (!selectedDevice) {
          Alert.alert('Please Select a Device', 'Please select your primary fitness device to continue.');
          return;
        }
        
        // In dev mode, still respect device selection logic
        if (['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice)) {
          setCurrentStep(6);
        } else {
          setCurrentStep(7);
        }
        return;
      }
      
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        // Last step - complete onboarding
        completeOnboarding();
        router.replace('/(tabs)');
      }
      return;
    }

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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:1391',message:'handleContinue step 1 start',data:{firstName:firstName.trim(),hasLastName:!!lastName.trim(),hasBirthday:!!birthday,hasPronouns:!!pronouns},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Save to Supabase using updateProfile
        // Calculate age from birthday if provided
        const ageNum = birthday ? calculateAge(birthday) : undefined;
        const success = await updateProfile(firstName.trim(), lastName.trim(), ageNum, pronouns || undefined, birthday || undefined);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:1396',message:'updateProfile result',data:{success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (success) {
          setCurrentStep(2);
        }
        setIsLoading(false);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:1401',message:'profile save exception',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.error('Profile save error:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 2) {
      // Photo upload step - optional, can skip
      // If image is selected, upload it before continuing
      if (selectedImage && user?.id) {
        setIsUploadingImage(true);
        setUploadError(null);
        try {
          // Check if the function is available
          if (!ImageUploadService || !ImageUploadService.uploadImageToSupabase) {
            throw new Error('Image upload service not available. Please restart the app.');
          }
          
          
          const uploadResult = await ImageUploadService.uploadImageToSupabase(selectedImage, user.id);
          
          
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
      // Connect Apple Health step - REQUIRED
      if (!appleHealthConnected) {
        setIsLoading(true);
        try {
          const connected = await connectProvider('apple_health');
          if (connected) {
            setAppleHealthConnected(true);
            // Sync data to get goals if available
            if (user?.id) {
              await syncHealthData(user.id);
            }
            // Check if goals exist (indicates Apple Watch)
            const currentGoals = goals;
            if (currentGoals.moveCalories > 0 || currentGoals.exerciseMinutes > 0 || currentGoals.standHours > 0) {
              setHasAppleWatchGoals(true);
              setMoveGoal(currentGoals.moveCalories.toString());
              setExerciseGoal(currentGoals.exerciseMinutes.toString());
              setStandGoal(currentGoals.standHours.toString());
            }
            setIsLoading(false);
            // Auto-advance to device selection
            setCurrentStep(5);
          } else {
            setIsLoading(false);
            Alert.alert(
              'Connection Failed',
              'Unable to connect to Apple Health. Please make sure HealthKit permissions are enabled in Settings.',
              [{ text: 'OK' }]
            );
          }
        } catch (e) {
          console.error('Health connection error:', e);
          setIsLoading(false);
          Alert.alert(
            'Connection Error',
            'An error occurred while connecting to Apple Health. Please try again.',
            [{ text: 'OK' }]
          );
        }
      } else {
        // Already connected, proceed to device selection
        setCurrentStep(5);
      }
    } else if (currentStep === 5) {
      // Device selection step
      if (!selectedDevice) {
        Alert.alert('Please Select a Device', 'Please select your primary fitness device to continue.');
        return;
      }
      
      setIsLoading(true);
      try {
        // If Apple Watch is selected, ensure Apple Health is connected (it should be, but verify)
        if (selectedDevice === 'apple_watch' && !appleHealthConnected) {
          try {
            const connected = await connectProvider('apple_health');
            if (connected) {
              setAppleHealthConnected(true);
              // Sync data to get goals if available
              if (user?.id) {
                await syncHealthData(user.id);
              }
              // Check if goals exist
              const currentGoals = goals;
              if (currentGoals.moveCalories > 0 || currentGoals.exerciseMinutes > 0 || currentGoals.standHours > 0) {
                setHasAppleWatchGoals(true);
                setMoveGoal(currentGoals.moveCalories.toString());
                setExerciseGoal(currentGoals.exerciseMinutes.toString());
                setStandGoal(currentGoals.standHours.toString());
              }
            }
          } catch (e) {
            console.error('Error connecting Apple Health for Apple Watch:', e);
            // Continue anyway - Apple Watch requires Apple Health but we'll let them proceed
          }
        }
        
        // Save device to Supabase
        if (user?.id) {
          await updatePrimaryDevice(selectedDevice);
        }
        setIsLoading(false);
        
        // If 3rd party device, show sync instructions, otherwise go to goal setting
        if (['fitbit', 'garmin', 'whoop', 'oura'].includes(selectedDevice)) {
          setCurrentStep(6);
        } else {
          // For Apple Watch, iPhone, or Other, go directly to goal setting
          // If Apple Watch and we have goals, skip goal setting
          if (selectedDevice === 'apple_watch' && hasAppleWatchGoals) {
            // Save goals and complete onboarding
            if (user?.id) {
              await updateGoals({
                moveCalories: parseInt(moveGoal) || 400,
                exerciseMinutes: parseInt(exerciseGoal) || 30,
                standHours: parseInt(standGoal) || 12,
                steps: parseInt(stepsGoal) || 10000,
              }, user.id);
            }
            completeOnboarding();
            router.replace('/(tabs)');
          } else {
            setCurrentStep(7);
          }
        }
      } catch (e) {
        console.error('Error saving device:', e);
        setIsLoading(false);
      }
    } else if (currentStep === 6) {
      // Device sync instructions step - user clicked "I've connected it"
      setCurrentStep(7);
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
    // Development mode: Always allow continuing
    if (__DEV__) {
      return true;
    }

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
      // Apple Health - can continue if connected
      // Skip this step if Apple Watch will be selected (but we can't know that yet, so keep the check)
      return appleHealthConnected || !isLoading;
    }
    if (currentStep === 5) {
      // Device selection - must select a device
      return selectedDevice !== null;
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
    <View className="flex-1 bg-black">
      <LinearGradient
        colors={currentStep === 9 ? ['#2e1a1a', '#1a0a0a', '#000000'] : ['#1a1a2e', '#0a0a0a', '#000000']}
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
                    setUploadError(null);
                  }
                  setCurrentStep(currentStep - 1);
                }
              }}
              disabled={currentStep === 0 || (currentStep === 3 && codeSent && !phoneVerified) || isUploadingImage}
            >
              <Text className="text-white text-xl">
                {currentStep > 0 ? '←' : ' '}
              </Text>
            </Pressable>
          )}
          {(currentStep === 8 || currentStep === 9) && <View />}
          <Text className="text-gray-400 text-lg">
            {currentStep === 8 || currentStep === 9 ? '' : `${currentStep + 1} of ${steps.length - 2}`}
          </Text>
        </View>

        {/* Progress Bar */}
        {currentStep !== 8 && currentStep !== 9 && (
          <View className="px-6 mb-4">
            <View className="h-1 bg-gray-800 rounded-full overflow-hidden">
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
        <View className="px-6 mb-6">
          {currentStep === 4 && (
            <View className="items-center mb-4 pt-10">
              <Image 
                source={require('../../../assets/apple-health-icon.png')}
                style={{ width: 60, height: 60 }}
                resizeMode="contain"
              />
            </View>
          )}
          {currentStep === 8 && (
            <View className="items-center mb-3">
              <LinearGradient
                colors={['rgba(255, 215, 0, 0.25)', 'rgba(255, 193, 7, 0.25)', 'rgba(255, 215, 0, 0.25)']}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255, 215, 0, 0.6)',
                  shadowColor: '#FFD700',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.5,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text className="text-yellow-300 text-sm font-bold" style={{ textShadowColor: 'rgba(255, 215, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
                  Welcome Offer  |  50% off annual plans
                </Text>
              </LinearGradient>
            </View>
          )}
          <Text className={`text-white text-4xl font-bold mb-2 ${currentStep === 4 || currentStep === 8 || currentStep === 9 ? 'text-center' : ''}`}>
            {currentStepData.title}
          </Text>
          {currentStep === 8 && (
            <Text className="text-gray-400 text-lg text-center mt-1">
              Unlock all features with a subscription
            </Text>
          )}
          {currentStepData.subtitle && currentStep !== 8 && currentStep !== 9 ? (
            <Text className="text-gray-400 text-lg">
              {currentStepData.subtitle}
            </Text>
          ) : null}
          {currentStep === 9 && (
            <Text className="text-gray-500 text-base text-center mt-2">
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
                backgroundColor: '#000000'
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
                  colors={canContinue() ? ['#FA114F', '#FF6B5A'] : ['#333', '#222']}
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
                    {isLoading || isVerifying || isUploadingImage
                      ? 'Please wait...' 
                      : currentStep === steps.length - 1 
                        ? 'Get Started' 
                        : currentStep === 3 && !codeSent
                          ? 'Send Code'
                          : currentStep === 3 && codeSent
                            ? 'Verify'
                            : currentStep === 4 && !appleHealthConnected
                              ? 'Sync with Apple Health'
                              : currentStep === 6 && selectedDevice !== 'other'
                                ? "I've connected it"
                                : 'Continue'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
            </View>
          )}
      </LinearGradient>
    </View>
  );
}
