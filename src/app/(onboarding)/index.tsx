import { View, Text, Pressable, TextInput, ActivityIndicator, Image, Alert, Platform, TouchableWithoutFeedback, Keyboard, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { useHealthStore } from '@/lib/health-service';
import Animated, { FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useState, useCallback, useEffect } from 'react';
import { ArrowRight, Apple, Check, X, AtSign, User, Phone, Camera, Image as ImageIcon, Watch, Activity, Flame, Timer, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSubscriptionStore } from '@/lib/subscription-store';
import * as ImagePicker from 'expo-image-picker';
import debounce from 'lodash/debounce';
import { getAvatarUrl } from '@/lib/avatar-utils';
import * as ImageUploadService from '@/lib/image-upload-service';

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
  
  // Subscription state
  const { packages, purchasePackage, loadOfferings } = useSubscriptionStore();
  const [isPurchasing, setIsPurchasing] = useState(false);
  
  // Device selection state
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  
  // Goal setting state
  const [moveGoal, setMoveGoal] = useState('400');
  const [exerciseGoal, setExerciseGoal] = useState('30');
  const [standGoal, setStandGoal] = useState('12');
  const [stepsGoal, setStepsGoal] = useState('10000');
  const [hasAppleWatchGoals, setHasAppleWatchGoals] = useState(false);

  // Form state for profile step
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  
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
          <View className="mb-8">
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
            <Pressable onPress={(e) => e.stopPropagation()}>
              <TextInput
                placeholder="Enter your first name"
                placeholderTextColor="#888"
                value={firstName}
                onChangeText={setFirstName}
                className="border border-gray-600 rounded-2xl px-4 py-3 text-white bg-gray-900"
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Last Name */}
          <View className="mb-6">
            <Text className="text-white text-lg font-semibold mb-3">Last Name</Text>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <TextInput
                placeholder="Enter your last name"
                placeholderTextColor="#888"
                value={lastName}
                onChangeText={setLastName}
                className="border border-gray-600 rounded-2xl px-4 py-3 text-white bg-gray-900"
                editable={!isLoading}
              />
            </Pressable>
          </View>

          {/* Username Preview */}
          <View className="bg-fitness-card rounded-2xl p-4 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-fitness-accent/20 items-center justify-center">
              <User size={24} color="#FA114F" />
            </View>
            <View className="ml-4">
              <Text className="text-white font-semibold">
                {firstName || 'Your'} {lastName || 'Name'}
              </Text>
              <Text className="text-gray-400">@{username}</Text>
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
                  // Request permissions
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
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      subtitle: 'Track your activity, workouts, and health metrics',
      render: () => (
        <View className="px-6">
          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-red-500/20 items-center justify-center mb-6">
              <Apple size={40} color="#EF4444" />
            </View>
            <Text className="text-white text-center text-lg font-semibold mb-2">
              Connect Apple Health
            </Text>
            <Text className="text-gray-400 text-center text-base mb-4">
              Apple Health collects data from your iPhone, Apple Watch, and other fitness apps
            </Text>
          </View>

          <View className="space-y-3 mt-6">
            <View className="flex-row items-start space-x-3">
              <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center mt-0.5">
                <Text className="text-green-500 text-sm font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold">Active Energy Burned</Text>
                <Text className="text-gray-400 text-sm">Track calories burned</Text>
              </View>
            </View>

            <View className="flex-row items-start space-x-3">
              <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center mt-0.5">
                <Text className="text-green-500 text-sm font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold">Exercise Time</Text>
                <Text className="text-gray-400 text-sm">Monitor workout minutes</Text>
              </View>
            </View>

            <View className="flex-row items-start space-x-3">
              <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center mt-0.5">
                <Text className="text-green-500 text-sm font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold">Stand Hours</Text>
                <Text className="text-gray-400 text-sm">Track standing time</Text>
              </View>
            </View>
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
                const Icon = device.icon;
                const isSelected = selectedDevice === device.id;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => setSelectedDevice(device.id)}
                    className={`flex-row items-center p-4 rounded-2xl border-2 ${
                      isSelected ? 'border-fitness-accent bg-fitness-accent/10' : 'border-gray-700 bg-gray-900'
                    }`}
                  >
                    <View className={`w-12 h-12 rounded-full items-center justify-center ${
                      isSelected ? 'bg-fitness-accent/20' : 'bg-gray-800'
                    }`}>
                      <Icon size={24} color={isSelected ? '#FA114F' : '#6b7280'} />
                    </View>
                    <Text className={`text-lg ml-4 flex-1 ${isSelected ? 'text-white font-semibold' : 'text-gray-400'}`}>
                      {device.label}
                    </Text>
                    {isSelected && (
                      <View className="w-6 h-6 rounded-full bg-fitness-accent items-center justify-center">
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
      title: `Sync ${selectedDevice === 'fitbit' ? 'Fitbit' : selectedDevice === 'garmin' ? 'Garmin' : selectedDevice === 'whoop' ? 'Whoop' : selectedDevice === 'oura' ? 'Oura Ring' : ''} with Apple Health`,
      subtitle: 'Enable Apple Health sync in your device app',
      render: () => {
        const getInstructions = () => {
          switch (selectedDevice) {
            case 'fitbit':
              return [
                '1. Open the Fitbit app on your iPhone',
                '2. Tap your profile picture → Settings',
                '3. Tap "Apps and Devices"',
                '4. Find "Apple Health" and tap it',
                '5. Toggle on the data you want to share',
                '6. Tap "Allow" to enable sync',
              ];
            case 'garmin':
              return [
                '1. Open the Garmin Connect app',
                '2. Tap the menu (☰) → Settings',
                '3. Tap "Connected Apps"',
                '4. Find "Apple Health" and tap it',
                '5. Toggle on the data you want to share',
                '6. Tap "Allow" to enable sync',
              ];
            case 'whoop':
              return [
                '1. Open the WHOOP app',
                '2. Tap "Profile" → Settings',
                '3. Tap "Integrations"',
                '4. Find "Apple Health" and tap it',
                '5. Toggle on the data you want to share',
                '6. Tap "Allow" to enable sync',
              ];
            case 'oura':
              return [
                '1. Open the Oura app',
                '2. Tap "Profile" → Settings',
                '3. Tap "Integrations"',
                '4. Find "Apple Health" and tap it',
                '5. Toggle on the data you want to share',
                '6. Tap "Allow" to enable sync',
              ];
            default:
              return [];
          }
        };

        const instructions = getInstructions();

        return (
          <View className="px-6">
            <View className="bg-gray-900 rounded-2xl p-6 mb-6">
              <Text className="text-white text-base mb-4 font-semibold">Follow these steps:</Text>
              {instructions.map((instruction, index) => (
                <View key={index} className="flex-row items-start mb-3">
                  <Text className="text-fitness-accent font-bold mr-3">{instruction.split('.')[0]}.</Text>
                  <Text className="text-gray-300 flex-1">{instruction.substring(instruction.indexOf(' ') + 1)}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => {
                // Skip device sync instructions - go to goal setting
                setCurrentStep(7);
              }}
              className="mb-4"
            >
              <Text className="text-fitness-accent text-center">Skip for now</Text>
            </Pressable>
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
  ];

  const handleContinue = async () => {
    if (currentStep === 0) {
      // Username step
      if (!username || username.length < 3 || !isUsernameAvailable) {
        return;
      }

      setIsLoading(true);
      try {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:348',message:'Saving username in onboarding',data:{username,currentStep},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const success = await updateUsername(username);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:351',message:'Username save result',data:{success,nextStep:1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
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
        const success = await updateProfile(firstName.trim(), lastName.trim());
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
      // If image is selected, upload it before continuing
      if (selectedImage && user?.id) {
        setIsUploadingImage(true);
        setUploadError(null);
        try {
          // Check if the function is available
          if (!ImageUploadService || !ImageUploadService.uploadImageToSupabase) {
            throw new Error('Image upload service not available. Please restart the app.');
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:512',message:'Starting image upload',data:{userId:user.id,hasSelectedImage:!!selectedImage},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          const uploadResult = await ImageUploadService.uploadImageToSupabase(selectedImage, user.id);
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:518',message:'Image upload result',data:{success:uploadResult.success,hasUrl:!!uploadResult.url,error:uploadResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          if (uploadResult.success && uploadResult.url) {
            // Save avatar URL to profile
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:522',message:'Calling updateAvatar',data:{avatarUrl:uploadResult.url,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            const success = await updateAvatar(uploadResult.url);
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:526',message:'updateAvatar result',data:{success},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
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
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'onboarding/index.tsx:536',message:'Image upload exception',data:{error:errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
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
      completeOnboarding();
      router.replace('/(tabs)');
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
      // Apple Health - can continue if connected
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
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <View className="flex-1 bg-black">
      <LinearGradient
        colors={['#1a1a2e', '#0a0a0a', '#000000']}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View
          className="flex-row justify-between items-center px-6"
          style={{ paddingTop: insets.top + 16, paddingBottom: 16 }}
        >
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
          <Text className="text-gray-400 text-lg">
            {currentStep + 1} of {steps.length}
          </Text>
        </View>

        {/* Progress Bar */}
        <View className="px-6 mb-4">
          <View className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <Animated.View
              className="h-full bg-gradient-to-r"
              style={{
                width: `${progress}%`,
                backgroundColor: '#FA114F',
              }}
            />
          </View>
        </View>

        {/* Title and Subtitle */}
        <Animated.View entering={FadeInUp.duration(400)} className="px-6 mb-6">
          <Text className="text-white text-4xl font-bold mb-2">
            {currentStepData.title}
          </Text>
          <Text className="text-gray-400 text-lg">
            {currentStepData.subtitle}
          </Text>
        </Animated.View>

          {/* Content */}
          <Pressable 
            onPress={Keyboard.dismiss}
            style={{ flex: 1, paddingBottom: 100 }}
          >
            <Animated.View entering={FadeInUp.duration(500).delay(100)} style={{ flex: 1 }}>
              {currentStepData.render()}
            </Animated.View>
          </Pressable>

          {/* Continue Button - Fixed at bottom, never moves */}
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
          <Animated.View entering={FadeInDown.duration(500)} className="items-center">
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
                            ? 'Connect Apple Health'
                            : currentStep === 6
                              ? "I've connected it"
                              : 'Continue'}
                </Text>
                {!isLoading && canContinue() && (
                  <ArrowRight size={20} color="#fff" style={{ marginLeft: 8 }} />
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
}
