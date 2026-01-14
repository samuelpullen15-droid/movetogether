import { View, Text, ScrollView, Pressable, Image, Alert, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { TripleActivityRings } from '@/components/ActivityRing';
import {
  Settings,
  ChevronRight,
  Flame,
  Trophy,
  Target,
  User,
  Scale,
  Mail,
  Dumbbell,
  Footprints,
  Camera,
  X,
  Users,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { getAvatarUrl } from '@/lib/avatar-utils';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageUploadService from '@/lib/image-upload-service';
import { FriendWithProfile } from '@/lib/friends-service';

// Apple Logo Component
const AppleLogo = ({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </Svg>
);

// Google Logo Component
const GoogleLogo = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Auth store - real user data
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  
  // Health store - real HealthKit data
  const currentMetrics = useHealthStore((s) => s.currentMetrics);
  const goals = useHealthStore((s) => s.goals);
  const activityStreak = useHealthStore((s) => s.activityStreak);
  const weight = useHealthStore((s) => s.weight);
  const syncHealthData = useHealthStore((s) => s.syncHealthData);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  const updateGoals = useHealthStore((s) => s.updateGoals);
  
  // State for image upload
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [avatarCacheKey, setAvatarCacheKey] = useState(0);
  
  // State for goal edit modal
  const [editModal, setEditModal] = useState<{
    visible: boolean;
    title: string;
    value: string;
    field: string;
    keyboardType?: 'default' | 'numeric';
    suffix?: string;
  }>({ visible: false, title: '', value: '', field: '' });

  // Refresh profile data in background (non-blocking) to ensure we have latest data
  // Don't block UI rendering - use existing user data from auth store immediately
  // The profile picture and other data will display immediately from auth store
  useEffect(() => {
    if (!user?.id) return;
    
    // Refresh in background - don't block UI rendering
    // UI will show existing data from auth store immediately
    refreshProfile().then(() => {
      // Update avatar cache key to force re-render if avatar changed
      setAvatarCacheKey(Date.now());
    }).catch(() => {
      // Silently fail - we already have user data from auth store
    });
  }, [refreshProfile, user?.id]);

  // Sync health data on mount
  useEffect(() => {
    if (activeProvider) {
      syncHealthData(user?.id);
    }
  }, [activeProvider, user?.id]);

  // Debug logging
  useEffect(() => {
    console.log('=== Profile Debug ===');
    console.log('activeProvider:', activeProvider);
    console.log('currentMetrics:', currentMetrics);
    console.log('goals:', goals);
  }, [activeProvider, currentMetrics, goals]);

  // Calculate ring progress from real data
  const moveProgress = currentMetrics 
    ? Math.min(currentMetrics.activeCalories / goals.moveCalories, 1.5)
    : 0;
  const exerciseProgress = currentMetrics 
    ? Math.min(currentMetrics.exerciseMinutes / goals.exerciseMinutes, 1.5)
    : 0;
  const standProgress = currentMetrics 
    ? Math.min(currentMetrics.standHours / goals.standHours, 1.5)
    : 0;

  // TODO: These will come from Supabase later
  const earnedMedals = 0;
  const competitionsWon = 0;
  const totalPoints = 0;

  // Handle sign out

  // Get display name from auth user
  const displayName = user?.fullName || user?.firstName || user?.username || 'User';
  const username = user?.username ? `@${user.username}` : null;
  const email = user?.email;
  // Use getAvatarUrl to ensure we have a valid avatar (fallback to initials if needed)
  const avatarUrl = getAvatarUrl(user?.avatarUrl, displayName, user?.username || 'User');
  
  // Get friends from store
  const friendsFromStore = useAuthStore((s) => s.friends);
  
  // Format member since date
  const memberSince = user?.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Recently';

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Profile */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Settings button */}
            <View className="flex-row justify-end mb-4">
              <Pressable
                onPress={() => router.push('/settings')}
                className="w-10 h-10 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
              >
                <Settings size={20} color="white" />
              </Pressable>
            </View>

            {/* Profile Info */}
            <View className="items-center">
              <Pressable
                onPress={async () => {
                  if (isUploadingImage) return;
                  
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
                      mediaTypes: ['images'],
                      allowsEditing: true,
                      aspect: [1, 1],
                      quality: 0.8,
                    });

                    if (!result.canceled && result.assets[0] && user?.id) {
                      setIsUploadingImage(true);
                      
                      try {
                        // Upload image to Supabase
                        const uploadResult = await ImageUploadService.uploadImageToSupabase(
                          result.assets[0].uri,
                          user.id
                        );

                        if (uploadResult.success && uploadResult.url) {
                          // Update avatar in auth store
                          const success = await updateAvatar(uploadResult.url);
                          
                          if (success) {
                            // Refresh profile to get updated avatar
                            await refreshProfile();
                            
                            // Force Image component to reload by updating cache key
                            setAvatarCacheKey(Date.now());
                            setIsUploadingImage(false);
                            
                            Alert.alert('Success', 'Profile photo updated!');
                          } else {
                            Alert.alert('Error', 'Failed to update profile photo. Please try again.');
                          }
                        } else {
                          Alert.alert(
                            'Upload Failed',
                            uploadResult.error || 'Failed to upload image. Please try again.'
                          );
                        }
                      } catch (error) {
                        console.error('Error uploading image:', error);
                        Alert.alert('Error', 'Failed to upload image. Please try again.');
                      } finally {
                        setIsUploadingImage(false);
                      }
                    }
                  } catch (error) {
                    console.error('Error picking image:', error);
                    Alert.alert('Error', 'Failed to pick image. Please try again.');
                    setIsUploadingImage(false);
                  }
                }}
                onLongPress={() => {
                  // Long press to view your own public profile
                  if (user?.id) {
                    router.push(`/friend-profile?id=${user.id}`);
                  }
                }}
                className="active:opacity-80"
                disabled={isUploadingImage}
              >
                {avatarUrl && !avatarUrl.includes('ui-avatars.com') ? (
                  <View className="relative">
                    <Image
                      key={`avatar-${avatarUrl}-${avatarCacheKey}`}
                      source={{ 
                        uri: `${avatarUrl}?t=${avatarCacheKey}`
                      }}
                      className="w-24 h-24 rounded-full border-4 border-fitness-accent"
                      resizeMode="cover"
                    />
                    {isUploadingImage && (
                      <View className="absolute inset-0 w-24 h-24 rounded-full bg-black/50 items-center justify-center">
                        <ActivityIndicator size="small" color="#FA114F" />
                      </View>
                    )}
                    {!isUploadingImage && (
                      <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-fitness-accent items-center justify-center border-2 border-black">
                        <Camera size={14} color="white" />
                      </View>
                    )}
                  </View>
                ) : (
                  <View className="w-24 h-24 rounded-full border-4 border-fitness-accent bg-fitness-accent/20 items-center justify-center overflow-hidden">
                    {isUploadingImage ? (
                      <ActivityIndicator size="small" color="#FA114F" />
                    ) : avatarUrl ? (
                      <Image
                        key={`avatar-fallback-${avatarUrl}-${avatarCacheKey}`}
                        source={{ uri: avatarUrl }}
                        className="w-24 h-24 rounded-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <User size={40} color="#FA114F" />
                    )}
                  </View>
                )}
              </Pressable>
              <Text className="text-white text-2xl font-bold mt-4">{displayName}</Text>
              {username && (
                <Text className="text-fitness-accent mt-1">{username}</Text>
              )}
              {user?.id && (
                <Pressable
                  onPress={() => router.push(`/friend-profile?id=${user.id}`)}
                  className="mt-3 px-4 py-2 bg-white/10 rounded-full active:bg-white/20"
                >
                  <Text className="text-white text-sm font-medium">View Public Profile</Text>
                </Pressable>
              )}
              <Text className="text-gray-400 mt-1">Member since {memberSince}</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Friends Section */}
        <FriendsSection userId={user?.id} />

        {/* Achievements Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100)}
          className="px-5 mt-6"
        >
          <Text className="text-white text-xl font-semibold mb-4">Achievements</Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <View className="p-6 items-center">
              <Text className="text-gray-400 text-base">Achievements coming soon!</Text>
            </View>
          </View>
        </Animated.View>

        {/* Goals Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(150)}
          className="px-5 mt-6"
        >
          <Text className="text-white text-xl font-semibold mb-4">Daily Goals</Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <Pressable
              onPress={() =>
                setEditModal({
                  visible: true,
                  title: 'Edit Move Goal',
                  value: goals.moveCalories.toString(),
                  field: 'moveGoal',
                  keyboardType: 'numeric',
                  suffix: 'cal',
                })
              }
              className="p-4 border-b border-white/5 active:bg-white/5"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-ring-move/20 items-center justify-center">
                    <Flame size={16} color="#FA114F" />
                  </View>
                  <Text className="text-white ml-3">Move Goal</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-ring-move font-bold">{goals.moveCalories} CAL</Text>
                  <View className="ml-2">
                    <ChevronRight size={16} color="#4a4a4a" />
                  </View>
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={() =>
                setEditModal({
                  visible: true,
                  title: 'Edit Exercise Goal',
                  value: goals.exerciseMinutes.toString(),
                  field: 'exerciseGoal',
                  keyboardType: 'numeric',
                  suffix: 'min',
                })
              }
              className="p-4 border-b border-white/5 active:bg-white/5"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-ring-exercise/20 items-center justify-center">
                    <Dumbbell size={16} color="#92E82A" />
                  </View>
                  <Text className="text-white ml-3">Exercise Goal</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-ring-exercise font-bold">{goals.exerciseMinutes} MIN</Text>
                  <View className="ml-2">
                    <ChevronRight size={16} color="#4a4a4a" />
                  </View>
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={() =>
                setEditModal({
                  visible: true,
                  title: 'Edit Stand Goal',
                  value: goals.standHours.toString(),
                  field: 'standGoal',
                  keyboardType: 'numeric',
                  suffix: 'hrs',
                })
              }
              className="p-4 active:bg-white/5"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-ring-stand/20 items-center justify-center">
                    <Footprints size={16} color="#00D4FF" />
                  </View>
                  <Text className="text-white ml-3">Stand Goal</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-ring-stand font-bold">{goals.standHours} HRS</Text>
                  <View className="ml-2">
                    <ChevronRight size={16} color="#4a4a4a" />
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Account Info Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(400)}
          className="px-5 mt-6"
        >
          <Text className="text-white text-xl font-semibold mb-4">Account</Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {email && (
              <>
                <View className="flex-row items-center py-4 px-4">
                  <View className="w-10 h-10 rounded-full items-center justify-center bg-white/10">
                    {user?.provider === 'apple' ? (
                      <AppleLogo size={20} color="#FFFFFF" />
                    ) : user?.provider === 'google' ? (
                      <GoogleLogo size={20} />
                    ) : (
                      <Mail size={20} color="white" />
                    )}
                  </View>
                  <View className="flex-1 ml-4">
                    <Text className="text-white text-base font-medium">Email</Text>
                    <Text className="text-gray-500 text-sm mt-0.5">{email}</Text>
                  </View>
                </View>
                <View className="h-px bg-white/5 mx-4" />
              </>
            )}
            <View className="flex-row items-center py-4 px-4">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-white/10 overflow-hidden">
                {user?.avatarUrl && user.avatarUrl.trim() && user.avatarUrl !== 'null' ? (
                  <Image
                    key={`username-avatar-${user.avatarUrl}-${avatarCacheKey}`}
                    source={{ uri: `${user.avatarUrl}?t=${avatarCacheKey}` }}
                    className="w-10 h-10 rounded-full"
                    resizeMode="cover"
                  />
                ) : (
                  <User size={20} color="white" />
                )}
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white text-base font-medium">Username</Text>
                <Text className="text-gray-500 text-sm mt-0.5">{user?.username || 'Not set'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Version */}
        <View className="items-center mt-8">
          <Text className="text-gray-600 text-sm">MoveTogether v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Edit Goal Modal */}
      <EditGoalModal
        visible={editModal.visible}
        title={editModal.title}
        value={editModal.value}
        keyboardType={editModal.keyboardType}
        suffix={editModal.suffix}
        onSave={(value) => {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue) && numValue > 0) {
            switch (editModal.field) {
              case 'moveGoal':
                updateGoals({ moveCalories: numValue }, user?.id);
                break;
              case 'exerciseGoal':
                updateGoals({ exerciseMinutes: numValue }, user?.id);
                break;
              case 'standGoal':
                updateGoals({ standHours: numValue }, user?.id);
                break;
            }
          }
          setEditModal({ ...editModal, visible: false });
        }}
        onClose={() => setEditModal({ ...editModal, visible: false })}
      />
    </View>
  );
}

// Friends Section Component
function FriendsSection({ userId }: { userId?: string }) {
  const router = useRouter();
  // Get friends from auth store (pre-loaded during sign-in)
  const friendsFromStore = useAuthStore((s) => s.friends);
  const setFriends = useAuthStore((s) => s.setFriends);
  // Show only first 6 friends in preview
  const friends = friendsFromStore.slice(0, 6);

  useEffect(() => {
    // Don't load friends here - they should be pre-loaded during sign-in
    // Only load as a fallback if we've waited 2 seconds and still have no friends
    if (userId && friendsFromStore.length === 0) {
      const timeoutId = setTimeout(() => {
        // Only load if still no friends after 2 seconds (pre-loading might be slow)
        if (friendsFromStore.length === 0) {
          import('@/lib/friends-service').then(({ getUserFriends }) => {
            getUserFriends(userId).then((userFriends) => {
              setFriends(userFriends);
            }).catch((error) => {
              console.error('Error loading friends:', error);
            });
          });
        }
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [userId, friendsFromStore.length, setFriends]);

  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(50)}
      className="px-5 mt-6"
    >
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-white text-xl font-semibold">Friends</Text>
        <Pressable
          onPress={() => router.push('/friends')}
          className="flex-row items-center active:opacity-70"
        >
          <Text className="text-fitness-accent text-sm font-medium mr-1">See all</Text>
          <ChevronRight size={16} color="#FA114F" />
        </Pressable>
      </View>
      <View className="bg-fitness-card rounded-2xl overflow-hidden">
        {friends.length === 0 ? (
          <View className="p-6 items-center">
            <Users size={32} color="#6b7280" />
            <Text className="text-gray-400 text-base mt-3">No friends yet</Text>
            <Text className="text-gray-500 text-sm mt-1 text-center">Add friends by username or phone number</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, gap: 16 }}
          >
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => router.push(`/friend-profile?id=${friend.id}`)}
                className="items-center active:opacity-70"
                style={{ width: 80 }}
              >
                <Image
                  source={{ uri: friend.avatar }}
                  className="w-16 h-16 rounded-full border-2 border-fitness-accent/30"
                />
                <Text
                  className="text-white text-xs mt-2 text-center"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {friend.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

interface EditGoalModalProps {
  visible: boolean;
  title: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
  keyboardType?: 'default' | 'numeric';
  suffix?: string;
}

function EditGoalModal({ visible, title, value, onSave, onClose, keyboardType = 'default', suffix }: EditGoalModalProps) {
  const [inputValue, setInputValue] = useState(value);
  const insets = useSafeAreaInsets();

  // Reset input value when modal opens
  useEffect(() => {
    if (visible) {
      setInputValue(value);
    }
  }, [visible, value]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable className="flex-1 bg-black/80 justify-end" onPress={onClose}>
          <Pressable
            className="bg-fitness-card rounded-t-3xl"
            style={{ paddingBottom: insets.bottom + 20 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">{title}</Text>
                <Pressable
                  onPress={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                >
                  <X size={18} color="white" />
                </Pressable>
              </View>
              <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 mb-6">
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  keyboardType={keyboardType}
                  autoFocus
                  className="flex-1 text-white text-lg"
                  placeholderTextColor="#6b7280"
                  selectionColor="#FA114F"
                />
                {suffix && <Text className="text-gray-400 text-lg ml-2">{suffix}</Text>}
              </View>
              <View className="flex-row space-x-3">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-4 rounded-xl bg-white/10 items-center active:bg-white/20"
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onSave(inputValue);
                  }}
                  className="flex-1 py-4 rounded-xl bg-fitness-accent items-center active:opacity-80"
                >
                  <Text className="text-white font-semibold">Save</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
