import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView, Modal, Dimensions } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
  Medal,
  Lock,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getAvatarUrl } from '@/lib/avatar-utils';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageUploadService from '@/lib/image-upload-service';
import { FriendWithProfile } from '@/lib/friends-service';
import { useThemeColors } from '@/lib/useThemeColors';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useSubscription } from '@/lib/useSubscription';
import { AchievementWithProgress } from '@/lib/achievements-types';
import { fetchUserAchievements, calculateStats, AchievementStats } from '@/lib/achievements-service';
import { AchievementMedal } from '@/components/AchievementMedal';
import { LiquidGlassIconButton } from '@/components/LiquidGlassIconButton';
import { PhotoGuidelinesReminder } from '@/components/PhotoGuidelinesReminder';
import { useModeration } from '@/lib/moderation-context';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

const { width } = Dimensions.get('window');

// Get Supabase URL for AI moderation
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

// Background images for each tier
const TIER_BACKGROUNDS = {
  starter: require('../../../assets/AppProfileScreen-Starter.png'),
  mover: require('../../../assets/AppProfileScreen-Mover.png'),
  crusher: require('../../../assets/AppProfileScreen-Crusher.png'),
} as const;

// Border colors for each tier
const TIER_COLORS = {
  starter: '#FA114F', // Pink (default accent)
  mover: '#3B82F6',   // Blue
  crusher: '#8B5CF6', // Purple
} as const;

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

// AI Photo Review function
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const checkTier = useSubscriptionStore((s) => s.checkTier);
  const { canAccessFriends, tier: subscriptionTierFromHook } = useSubscription();
  const canAccessAchievements = subscriptionTierFromHook === 'mover' || subscriptionTierFromHook === 'crusher';

  // Achievements state
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [achievementStats, setAchievementStats] = useState<AchievementStats>({
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    achievementScore: 0,
  });

  // Moderation status for warning banner
  const { moderationStatus, hasSeenWarning } = useModeration();

  // Check subscription tier from RevenueCat when screen focuses
  useFocusEffect(
    useCallback(() => {
      checkTier();
    }, [checkTier])
  );

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
  const providers = useHealthStore((s) => s.providers);
  const updateGoals = useHealthStore((s) => s.updateGoals);
  const calculateStreak = useHealthStore((s) => s.calculateStreak);

  const hasConnectedProvider = activeProvider !== null;
  
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

  // Load achievements for paid users
  useEffect(() => {
    if (!user?.id || !canAccessAchievements) return;

    const loadAchievements = async () => {
      try {
        const data = await fetchUserAchievements(user.id, canAccessAchievements);
        setAchievements(data);
        setAchievementStats(calculateStats(data));
      } catch (error) {
        console.error('Failed to load achievements:', error);
      }
    };

    loadAchievements();
  }, [user?.id, canAccessAchievements]);

  // Sync health data when tab comes into focus (on mount, tab switch, or return from background)
  // Use ref to prevent repeated calls if already syncing
  const isSyncingRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasConnectedProvider && user?.id && !isSyncingRef.current) {
        isSyncingRef.current = true;
        syncHealthData(user.id).finally(() => {
          isSyncingRef.current = false;
        });
        calculateStreak();
      }
    }, [hasConnectedProvider, user?.id, syncHealthData, calculateStreak])
  );

  // Use health service data ONLY when provider is connected
  // Don't fall back to stale data - show 0 until fresh data loads
  const rawMoveCalories = hasConnectedProvider 
    ? (currentMetrics?.activeCalories ?? 0)
    : 0;
  const rawExerciseMinutes = hasConnectedProvider 
    ? (currentMetrics?.exerciseMinutes ?? 0)
    : 0;
  const rawStandHours = hasConnectedProvider 
    ? (currentMetrics?.standHours ?? 0)
    : 0;

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

  // Memoize progress calculations (matching home screen logic)
  const moveProgress = useMemo(() => moveGoal > 0 ? Math.max(0, Math.min(1.5, moveCalories / moveGoal)) : 0, [moveCalories, moveGoal]);
  const exerciseProgress = useMemo(() => exerciseGoal > 0 ? Math.max(0, Math.min(1.5, exerciseMinutes / exerciseGoal)) : 0, [exerciseMinutes, exerciseGoal]);
  const standProgress = useMemo(() => standGoal > 0 ? Math.max(0, Math.min(1.5, standHours / standGoal)) : 0, [standHours, standGoal]);

  // Debug logging
  useEffect(() => {
    console.log('=== Profile Debug ===');
    console.log('hasConnectedProvider:', hasConnectedProvider);
    console.log('activeProvider:', activeProvider);
    console.log('currentMetrics:', currentMetrics);
    console.log('goals:', goals);
    console.log('moveCalories:', moveCalories, 'moveGoal:', moveGoal);
    console.log('exerciseMinutes:', exerciseMinutes, 'exerciseGoal:', exerciseGoal);
    console.log('standHours:', standHours, 'standGoal:', standGoal);
  }, [hasConnectedProvider, activeProvider, currentMetrics, goals, moveCalories, moveGoal, exerciseMinutes, exerciseGoal, standHours, standGoal]);

  // Get display values
  const displayName = user?.fullName || user?.username || 'User';
  const displayUsername = user?.username ? `@${user.username}` : '';
  const displayEmail = user?.email || '';

  // Get avatar URL with proper handling (matching home screen logic)
  const avatarUrl = useMemo(() => {
    if (user?.avatarUrl) {
      // If it's already a full URL, use it
      if (user.avatarUrl.startsWith('http')) {
        return user.avatarUrl;
      }
      // Otherwise, it's a relative path - construct full URL
      return `${supabase.supabaseUrl}/storage/v1/object/public/avatars/${user.avatarUrl}`;
    }
    // Fallback to generated avatar
    return getAvatarUrl(null, displayName);
  }, [user?.avatarUrl, displayName]);

  // Get tier-specific styling
  const tierColor = TIER_COLORS[subscriptionTier] || TIER_COLORS.starter;
  const tierBackground = TIER_BACKGROUNDS[subscriptionTier] || TIER_BACKGROUNDS.starter;

  // Handler for avatar upload with AI moderation
  const handleAvatarUpload = async () => {
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
          // =====================================================
          // STEP 1: AI Photo Review (before upload)
          // =====================================================
          console.log('[Profile] Reviewing photo with AI...');
          const reviewResult = await reviewPhotoWithAI(result.assets[0].uri, user.id);
          
          if (!reviewResult.approved) {
            Alert.alert(
              'Photo Not Allowed',
              reviewResult.reason || 'This photo violates our community guidelines. Please choose a different photo.',
              [{ text: 'OK' }]
            );
            setIsUploadingImage(false);
            return;
          }
          console.log('[Profile] Photo approved by AI');

          // =====================================================
          // STEP 2: Upload to Supabase (only if approved)
          // =====================================================
          const uploadResult = await ImageUploadService.uploadImageToSupabase(
            result.assets[0].uri,
            user.id,
            result.assets[0].mimeType
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
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Background Layer - changes based on subscription tier */}
      <Image
        source={tierBackground}
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
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>Profile</Text>
            <LiquidGlassIconButton
              iconName="gearshape.fill"
              icon={<Settings size={22} color={colors.text} />}
              onPress={() => router.push('/settings')}
              size={40}
              iconSize={22}
            />
          </View>

          {/* Profile Card */}
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Avatar */}
            <View className="items-center">
              <View style={{ position: 'relative', alignItems: 'center' }}>
                <Pressable
                  onPress={handleAvatarUpload}
                  className="active:opacity-80"
                  disabled={isUploadingImage}
                >
                  <View
                    style={{
                      width: 112,
                      height: 112,
                      borderRadius: 56,
                      padding: 4,
                      backgroundColor: tierColor,
                      shadowColor: tierColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: 12,
                      elevation: 8,
                    }}
                  >
                    {avatarUrl ? (
                      <Image
                        key={`avatar-${avatarUrl}-${avatarCacheKey}`}
                        source={{
                          uri: avatarUrl.includes('ui-avatars.com')
                            ? avatarUrl
                            : `${avatarUrl}?t=${avatarCacheKey}`,
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 52,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 52,
                          backgroundColor: colors.card,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={48} color={colors.textSecondary} />
                      </View>
                    )}
                  </View>

                  {/* Camera Icon Overlay */}
                  <View
                    className="absolute w-9 h-9 rounded-full items-center justify-center"
                    style={{
                      bottom: 20,
                      right: -6,
                      backgroundColor: tierColor,
                      borderWidth: 3,
                      borderColor: colors.bg,
                    }}
                  >
                    {isUploadingImage ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Camera size={16} color="white" />
                    )}
                  </View>
                </Pressable>

                {/* Subscription Badge - Positioned at bottom of photo */}
                <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center' }}>
                  {subscriptionTier !== 'starter' ? (
                    <LinearGradient
                      colors={
                        subscriptionTier === 'crusher'
                          ? ['#8B5CF6', '#7C3AED']
                          : ['#3B82F6', '#2563EB']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}
                    >
                      <Text className="text-white text-xs font-bold uppercase">
                        {subscriptionTier === 'crusher' ? 'CRUSHER' : 'MOVER'}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View
                      className="px-3 py-1.5 rounded-full border"
                      style={{
                        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        borderColor: colors.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      <Text style={{ color: colors.isDark ? '#D1D5DB' : '#6B7280' }} className="text-xs font-medium">FREE</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Name & Username */}
              <Text className="text-2xl font-bold mt-4" style={{ color: colors.text }}>
                {displayName}
              </Text>
              {displayUsername && (
                <Text className="text-base mt-1" style={{ color: colors.textSecondary }}>
                  {displayUsername}
                </Text>
              )}

              {/* View Public Profile Button */}
              <Pressable
                onPress={() => {
                  if (user?.id) {
                    router.push(`/friend-profile?id=${user.id}`);
                  }
                }}
                className="mt-3 active:opacity-70"
              >
                <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                  View Public Profile
                </Text>
              </Pressable>

              {/* Photo Guidelines Reminder */}
              <PhotoGuidelinesReminder className="mt-4 mx-4" />
            </View>
          </Animated.View>
        </View>

        {/* Activity Rings Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(50)}
          className="px-5 mt-2"
        >
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#FFFFFF', colors.bg]}
            style={{
              borderRadius: 20,
              padding: 20,
              borderWidth: colors.isDark ? 0 : 1,
              borderColor: 'rgba(0,0,0,0.05)',
            }}
          >
            <Text className="text-lg font-semibold mb-4" style={{ color: colors.text }}>Today's Activity</Text>
            <View className="flex-row items-center">
              <TripleActivityRings
                size={100}
                moveProgress={moveProgress}
                exerciseProgress={exerciseProgress}
                standProgress={standProgress}
              />
              <View className="flex-1 ml-6 space-y-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-move mr-2" />
                    <Text style={{ color: colors.textSecondary }}>Move</Text>
                  </View>
                  <Text style={{ color: colors.text }} className="font-medium">
                    {Math.round(moveCalories)}/{Math.round(moveGoal)} CAL
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-exercise mr-2" />
                    <Text style={{ color: colors.textSecondary }}>Exercise</Text>
                  </View>
                  <Text style={{ color: colors.text }} className="font-medium">
                    {Math.round(exerciseMinutes)}/{Math.round(exerciseGoal)} MIN
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-stand mr-2" />
                    <Text style={{ color: colors.textSecondary }}>Stand</Text>
                  </View>
                  <Text style={{ color: colors.text }} className="font-medium">
                    {Math.round(standHours)}/{Math.round(standGoal)} HRS
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Friends Section - Mover tier and above */}
        {canAccessFriends() && (
          <FriendsSection userId={user?.id} colors={colors} />
        )}

        {/* Achievements Section */}
        <AchievementsSection
          achievements={achievements}
          stats={achievementStats}
          canAccess={canAccessAchievements}
          colors={colors}
        />

        {/* Stats Grid */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100)}
          className="px-5 mt-6"
        >
          <Text className="text-xl font-semibold mb-4" style={{ color: colors.text }}>Your Stats</Text>
          <View className="flex-row flex-wrap gap-3">
            <StatCard
              icon={<Flame size={24} color="#FF6B35" />}
              value={activityStreak || 0}
              label="Day Streak"
              colors={colors}
            />
            <StatCard
              icon={<Trophy size={24} color="#FFD700" />}
              value={0}
              label="Competitions Won"
              colors={colors}
            />
            <StatCard
              icon={<Footprints size={24} color="#00D4FF" />}
              value={currentMetrics?.steps?.toLocaleString() || '0'}
              label="Steps Today"
              colors={colors}
            />
            <StatCard
              icon={<Dumbbell size={24} color="#92E82A" />}
              value={currentMetrics?.workoutsCompleted || 0}
              label="Workouts Today"
              colors={colors}
            />
          </View>
        </Animated.View>

        {/* Goals Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(150)}
          className="px-5 mt-6"
        >
          <Text className="text-xl font-semibold mb-4" style={{ color: colors.text }}>Daily Goals</Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <Pressable
              onPress={() => setEditModal({
                visible: true,
                title: 'Move Goal',
                value: String(moveGoal),
                field: 'moveGoal',
                keyboardType: 'numeric',
                suffix: 'CAL',
              })}
              className="flex-row items-center justify-between p-4 active:opacity-70"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-ring-move/20 items-center justify-center mr-3">
                  <Flame size={20} color="#FA114F" />
                </View>
                <Text style={{ color: colors.text }} className="font-medium">Move Goal</Text>
              </View>
              <View className="flex-row items-center">
                <Text style={{ color: colors.textSecondary }}>{moveGoal} CAL</Text>
                <ChevronRight size={20} color={colors.textSecondary} className="ml-2" />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setEditModal({
                visible: true,
                title: 'Exercise Goal',
                value: String(exerciseGoal),
                field: 'exerciseGoal',
                keyboardType: 'numeric',
                suffix: 'MIN',
              })}
              className="flex-row items-center justify-between p-4 active:opacity-70"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-ring-exercise/20 items-center justify-center mr-3">
                  <Target size={20} color="#92E82A" />
                </View>
                <Text style={{ color: colors.text }} className="font-medium">Exercise Goal</Text>
              </View>
              <View className="flex-row items-center">
                <Text style={{ color: colors.textSecondary }}>{exerciseGoal} MIN</Text>
                <ChevronRight size={20} color={colors.textSecondary} className="ml-2" />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setEditModal({
                visible: true,
                title: 'Stand Goal',
                value: String(standGoal),
                field: 'standGoal',
                keyboardType: 'numeric',
                suffix: 'HRS',
              })}
              className="flex-row items-center justify-between p-4 active:opacity-70"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-ring-stand/20 items-center justify-center mr-3">
                  <User size={20} color="#00D4FF" />
                </View>
                <Text style={{ color: colors.text }} className="font-medium">Stand Goal</Text>
              </View>
              <View className="flex-row items-center">
                <Text style={{ color: colors.textSecondary }}>{standGoal} HRS</Text>
                <ChevronRight size={20} color={colors.textSecondary} className="ml-2" />
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Account Info */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          className="px-5 mt-6"
        >
          <Text className="text-xl font-semibold mb-4" style={{ color: colors.text }}>Account</Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <View
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                <Mail size={20} color={colors.textSecondary} />
              </View>
              <View className="flex-1">
                <Text className="text-sm" style={{ color: colors.textSecondary }}>Email</Text>
                <Text style={{ color: colors.text }}>{displayEmail}</Text>
              </View>
            </View>
            {user?.phoneNumber && (
              <View className="flex-row items-center p-4">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                  <User size={20} color={colors.textSecondary} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>Phone</Text>
                  <Text style={{ color: colors.text }}>{user.phoneNumber}</Text>
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Edit Goal Modal */}
      <EditGoalModal
        visible={editModal.visible}
        title={editModal.title}
        value={editModal.value}
        keyboardType={editModal.keyboardType}
        suffix={editModal.suffix}
        colors={colors}
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

// Stat Card Component
function StatCard({ icon, value, label, colors }: { icon: React.ReactNode; value: string | number; label: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      className="rounded-xl p-4 items-center"
      style={{
        backgroundColor: colors.card,
        width: (width - 40 - 12) / 2,
      }}
    >
      <View className="w-12 h-12 rounded-full items-center justify-center mb-2" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
        {icon}
      </View>
      <Text className="text-2xl font-bold" style={{ color: colors.text }}>{value}</Text>
      <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

// Friends Section Component
function FriendsSection({ userId, colors }: { userId?: string; colors: ReturnType<typeof useThemeColors> }) {
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
        <Text className="text-xl font-semibold" style={{ color: colors.text }}>Friends</Text>
        <Pressable
          onPress={() => router.push('/friends')}
          className="flex-row items-center active:opacity-70"
        >
          <Text className="text-fitness-accent text-sm font-medium mr-1">See all</Text>
          <ChevronRight size={16} color="#FA114F" />
        </Pressable>
      </View>
      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
        {friends.length === 0 ? (
          <View className="p-6 items-center">
            <Users size={32} color={colors.textSecondary} />
            <Text className="text-base mt-3" style={{ color: colors.textSecondary }}>No friends yet</Text>
            <Text className="text-sm mt-1 text-center" style={{ color: colors.textSecondary, opacity: 0.7 }}>Add friends by username or phone number</Text>
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
                  className="text-xs mt-2 text-center"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: colors.text }}
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

// Achievements Section Component
function AchievementsSection({
  achievements,
  stats,
  canAccess,
  colors,
}: {
  achievements: AchievementWithProgress[];
  stats: AchievementStats;
  canAccess: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const router = useRouter();

  // Get top 4 achievements (highest tier first, then by progress)
  const topAchievements = [...achievements]
    .filter((a) => a.currentTier !== null)
    .sort((a, b) => {
      const tierOrder = ['platinum', 'gold', 'silver', 'bronze'];
      const aTierIndex = a.currentTier ? tierOrder.indexOf(a.currentTier) : 999;
      const bTierIndex = b.currentTier ? tierOrder.indexOf(b.currentTier) : 999;
      if (aTierIndex !== bTierIndex) return aTierIndex - bTierIndex;
      return b.progressToNextTier - a.progressToNextTier;
    })
    .slice(0, 4);

  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(75)}
      className="px-5 mt-6"
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="text-xl font-semibold" style={{ color: colors.text }}>
            Achievements
          </Text>
          {canAccess && stats.achievementScore > 0 && (
            <View
              className="px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: colors.isDark ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.2)' }}
            >
              <Text className="text-xs font-bold" style={{ color: colors.isDark ? '#eab308' : '#b45309' }}>
                {stats.achievementScore} pts
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/achievements')}
          className="flex-row items-center active:opacity-70"
        >
          <Text className="text-fitness-accent text-sm font-medium mr-1">See all</Text>
          <ChevronRight size={16} color="#FA114F" />
        </Pressable>
      </View>

      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
        {!canAccess ? (
          // Locked state for starter users
          <Pressable
            onPress={() => router.push('/upgrade')}
            className="p-6 items-center active:opacity-80"
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
              <Lock size={28} color={colors.textSecondary} />
            </View>
            <Text className="text-base font-medium" style={{ color: colors.text }}>
              Unlock Achievements
            </Text>
            <Text className="text-sm mt-1 text-center" style={{ color: colors.textSecondary }}>
              Upgrade to Mover to track and earn achievements
            </Text>
            <View className="mt-3 px-4 py-2 rounded-xl bg-fitness-accent">
              <Text className="text-white text-sm font-semibold">Upgrade Now</Text>
            </View>
          </Pressable>
        ) : topAchievements.length === 0 ? (
          // No achievements yet
          <View className="p-6 items-center">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
              <Medal size={28} color={colors.textSecondary} />
            </View>
            <Text className="text-base font-medium" style={{ color: colors.text }}>
              No Achievements Yet
            </Text>
            <Text className="text-sm mt-1 text-center" style={{ color: colors.textSecondary }}>
              Complete activities and competitions to earn medals
            </Text>
          </View>
        ) : (
          // Show top achievements
          <View className="p-4">
            {/* Medal counts row */}
            <View className="flex-row items-center justify-around mb-4">
              <View className="items-center">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#CD7F32' }}>
                  <Text className="text-white text-xs font-bold">{stats.bronzeCount}</Text>
                </View>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>Bronze</Text>
              </View>
              <View className="items-center">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#C0C0C0' }}>
                  <Text className="text-black text-xs font-bold">{stats.silverCount}</Text>
                </View>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>Silver</Text>
              </View>
              <View className="items-center">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#FFD700' }}>
                  <Text className="text-black text-xs font-bold">{stats.goldCount}</Text>
                </View>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>Gold</Text>
              </View>
              <View className="items-center">
                <LinearGradient
                  colors={['#FFFFFF', '#B8E0FF', '#E0F4FF']}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  <Text className="text-black text-xs font-bold">{stats.platinumCount}</Text>
                </LinearGradient>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>Platinum</Text>
              </View>
            </View>

            {/* Top achievements grid */}
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {topAchievements.map((achievement) => (
                <Pressable
                  key={achievement.id}
                  onPress={() => router.push('/achievements')}
                  className="items-center p-2 rounded-xl active:opacity-70"
                  style={{
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    width: '23%',
                  }}
                >
                  <AchievementMedal
                    tier={achievement.currentTier}
                    icon={achievement.icon}
                    size="small"
                    colors={colors}
                  />
                  <Text
                    className="text-xs mt-1 text-center"
                    numberOfLines={1}
                    style={{ color: colors.textSecondary }}
                  >
                    {achievement.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
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
  colors: ReturnType<typeof useThemeColors>;
}

function EditGoalModal({ visible, title, value, onSave, onClose, keyboardType = 'default', suffix, colors }: EditGoalModalProps) {
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
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>{title}</Text>
                <Pressable
                  onPress={onClose}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                >
                  <X size={18} color={colors.text} />
                </Pressable>
              </View>
              <View
                className="flex-row items-center rounded-xl px-4 py-3 mb-6"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  keyboardType={keyboardType}
                  autoFocus
                  className="flex-1 text-lg"
                  style={{ color: colors.text }}
                  placeholderTextColor={colors.textSecondary}
                  selectionColor="#FA114F"
                />
                {suffix && <Text className="text-lg ml-2" style={{ color: colors.textSecondary }}>{suffix}</Text>}
              </View>
              <View className="flex-row space-x-3">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-4 rounded-xl items-center"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                >
                  <Text className="font-semibold" style={{ color: colors.text }}>Cancel</Text>
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