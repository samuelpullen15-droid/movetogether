import { View, ScrollView, Pressable, Image, ActivityIndicator, Dimensions } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Trophy,
  Flame,
  Target,
  Calendar,
  Award,
  Users,
  Dumbbell,
  MoreHorizontal,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { TripleActivityRings } from '@/components/ActivityRing';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { FriendProfile } from '@/lib/social-types';
import { getUserProfile } from '@/lib/user-profile-service';
import { useAuthStore } from '@/lib/auth-store';
import { useHealthStore } from '@/lib/health-service';
import { useThemeColors } from '@/lib/useThemeColors';
import { useState, useEffect, useMemo } from 'react';
// Trust & Safety imports
import { ReportUserModal } from '@/components/moderation/ReportUserModal';

const { width } = Dimensions.get('window');

// Background images for each tier (same as profile.tsx)
const TIER_BACKGROUNDS = {
  starter: require('../../assets/AppProfileScreen-Starter.png'),
  mover: require('../../assets/AppProfileScreen-Mover.png'),
  crusher: require('../../assets/AppProfileScreen-Crusher.png'),
} as const;

function StatCard({ icon, value, label, color, isDark }: { icon: React.ReactNode; value: string | number; label: string; color: string; isDark: boolean }) {
  return (
    <View
      className="flex-1 rounded-xl p-3 items-center"
      style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF' }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: color + '20' }}
      >
        {icon}
      </View>
      <Text style={{ color: isDark ? '#FFFFFF' : '#000000' }} className="text-lg font-bold">{value}</Text>
      <Text style={{ color: isDark ? '#6b7280' : '#9ca3af' }} className="text-xs text-center">{label}</Text>
    </View>
  );
}

export default function FriendProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Trust & Safety: Report modal state
  const [showReportModal, setShowReportModal] = useState(false);

  // Active status tooltip state
  const [showActiveTooltip, setShowActiveTooltip] = useState(false);

  // Calculate active status based on lastActiveDate
  const activeStatus = useMemo(() => {
    if (!profile?.lastActiveDate) {
      return { isActive: false, message: 'No recent activity' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    if (profile.lastActiveDate === todayStr) {
      return { isActive: true, message: 'This user was active today' };
    } else if (profile.lastActiveDate === yesterdayStr) {
      return { isActive: false, message: 'This user was last active yesterday' };
    } else {
      // Calculate days ago
      const lastActive = new Date(profile.lastActiveDate);
      const today = new Date();
      const diffTime = today.getTime() - lastActive.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return { isActive: false, message: `Last active ${diffDays} days ago` };
    }
  }, [profile?.lastActiveDate]);
  
  // Check if viewing own profile - if so, use health store data instead of database
  const currentUser = useAuthStore((s) => s.user);
  const isOwnProfile = id === currentUser?.id;
  
  // Health store data (for own profile)
  const currentMetrics = useHealthStore((s) => s.currentMetrics);
  const goals = useHealthStore((s) => s.goals);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  const hasConnectedProvider = activeProvider !== null;

  // For own profile: use health store data (matching home screen logic)
  // For friend profiles: use database data from getUserProfile
  // Must be called before conditional returns (Rules of Hooks)
  const displayRings = useMemo(() => {
    if (isOwnProfile && hasConnectedProvider) {
      // Use health store data when viewing own profile with connected provider
      const rawMoveCalories = currentMetrics?.activeCalories ?? 0;
      const rawExerciseMinutes = currentMetrics?.exerciseMinutes ?? 0;
      const rawStandHours = currentMetrics?.standHours ?? 0;

      const moveCalories = (typeof rawMoveCalories === 'number' && isFinite(rawMoveCalories) && rawMoveCalories >= 0) ? rawMoveCalories : 0;
      const exerciseMinutes = (typeof rawExerciseMinutes === 'number' && isFinite(rawExerciseMinutes) && rawExerciseMinutes >= 0) ? rawExerciseMinutes : 0;
      const standHours = (typeof rawStandHours === 'number' && isFinite(rawStandHours) && rawStandHours >= 0) ? rawStandHours : 0;

      const moveGoal = (typeof goals.moveCalories === 'number' && goals.moveCalories > 0) ? goals.moveCalories : 500;
      const exerciseGoal = (typeof goals.exerciseMinutes === 'number' && goals.exerciseMinutes > 0) ? goals.exerciseMinutes : 30;
      const standGoal = (typeof goals.standHours === 'number' && goals.standHours > 0) ? goals.standHours : 12;

      return {
        move: moveCalories,
        moveGoal,
        exercise: exerciseMinutes,
        exerciseGoal,
        stand: standHours,
        standGoal,
      };
    } else if (profile?.currentRings) {
      // Use database data for friend profiles or own profile without connected provider
      return profile.currentRings;
    } else {
      // Fallback when profile is still loading
      return {
        move: 0,
        moveGoal: 500,
        exercise: 0,
        exerciseGoal: 30,
        stand: 0,
        standGoal: 12,
      };
    }
  }, [isOwnProfile, hasConnectedProvider, currentMetrics, goals, profile]);

  useEffect(() => {
    if (!id) {
      setError('No user ID provided');
      setIsLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const friendProfile = await getUserProfile(id);

        if (friendProfile) {
          setProfile(friendProfile);
        } else {
          setError('Profile not found');
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [id]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color="#FA114F" />
        <Text style={{ color: colors.textSecondary }} className="mt-4">Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Text style={{ color: colors.textSecondary }}>{error || 'Profile not found'}</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-fitness-accent">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Calculate progress with defensive checks for division by zero
  const moveProgress = displayRings.moveGoal > 0 
    ? Math.max(0, Math.min(1.5, displayRings.move / displayRings.moveGoal)) 
    : 0;
  const exerciseProgress = displayRings.exerciseGoal > 0 
    ? Math.max(0, Math.min(1.5, displayRings.exercise / displayRings.exerciseGoal)) 
    : 0;
  const standProgress = displayRings.standGoal > 0 
    ? Math.max(0, Math.min(1.5, displayRings.stand / displayRings.standGoal)) 
    : 0;

  const medalColors = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Background Layer - changes based on friend's subscription tier */}
      <Image
        source={TIER_BACKGROUNDS[profile.subscriptionTier || 'starter']}
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
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <View className="flex-row items-center justify-between mb-6">
              <LiquidGlassBackButton onPress={() => router.back()} />
              
              {/* More Options Button - Only show for friend profiles */}
              {!isOwnProfile && (
                <Pressable
                  onPress={() => setShowReportModal(true)}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  style={{
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                  }}
                >
                  <MoreHorizontal size={20} color={colors.isDark ? '#FFFFFF' : '#000000'} />
                </Pressable>
              )}
            </View>

            {/* Profile Header */}
            <View className="items-center">
              <View style={{ position: 'relative', alignItems: 'center' }}>
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 56,
                    padding: 4,
                    backgroundColor:
                      profile.subscriptionTier === 'crusher'
                        ? '#8B5CF6' // Purple for crusher
                        : profile.subscriptionTier === 'mover'
                        ? '#3B82F6' // Blue for mover
                        : '#FA114F', // Default accent color for starter
                    shadowColor:
                      profile.subscriptionTier === 'crusher'
                        ? '#8B5CF6'
                        : profile.subscriptionTier === 'mover'
                        ? '#3B82F6'
                        : '#FA114F',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                >
                  <Image
                    source={{ uri: profile.avatar }}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 52,
                    }}
                  />
                </View>
                {/* Subscription Tier Badge - Positioned at bottom of photo */}
                <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center' }}>
                  {profile.subscriptionTier && profile.subscriptionTier !== 'starter' ? (
                    <LinearGradient
                      colors={
                        profile.subscriptionTier === 'crusher'
                          ? ['#8B5CF6', '#7C3AED']
                          : ['#3B82F6', '#2563EB']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}
                    >
                      <Text className="text-white text-xs font-bold uppercase">
                        {profile.subscriptionTier === 'crusher' ? 'CRUSHER' : 'MOVER'}
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
              {/* Name with Active Status Indicator */}
              <View className="flex-row items-center mt-4">
                <View style={{ position: 'relative' }}>
                  <Pressable
                    onPress={() => setShowActiveTooltip(!showActiveTooltip)}
                    className="mr-2"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: activeStatus.isActive ? '#22C55E' : '#9CA3AF',
                        shadowColor: activeStatus.isActive ? '#22C55E' : '#9CA3AF',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: activeStatus.isActive ? 0.6 : 0,
                        shadowRadius: 4,
                      }}
                    />
                  </Pressable>
                  {/* Active Status Popup Tooltip */}
                  {showActiveTooltip && (
                    <>
                      {/* Full-screen dismiss overlay */}
                      <Pressable
                        onPress={() => setShowActiveTooltip(false)}
                        style={{
                          position: 'absolute',
                          top: -1000,
                          left: -1000,
                          right: -1000,
                          bottom: -1000,
                          width: 3000,
                          height: 3000,
                          zIndex: 99,
                        }}
                      />
                      {/* Tooltip with fade animation */}
                      <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(150)}
                        style={{
                          position: 'absolute',
                          top: -45,
                          left: -10,
                          backgroundColor: colors.isDark ? '#374151' : '#1F2937',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.25,
                          shadowRadius: 4,
                          elevation: 5,
                          zIndex: 100,
                          minWidth: 180,
                        }}
                      >
                        <Text className="text-white text-xs text-center">
                          {activeStatus.message}
                        </Text>
                        {/* Tooltip Arrow */}
                        <View
                          style={{
                            position: 'absolute',
                            bottom: -6,
                            left: 14,
                            width: 0,
                            height: 0,
                            borderLeftWidth: 6,
                            borderRightWidth: 6,
                            borderTopWidth: 6,
                            borderLeftColor: 'transparent',
                            borderRightColor: 'transparent',
                            borderTopColor: colors.isDark ? '#374151' : '#1F2937',
                          }}
                        />
                      </Animated.View>
                    </>
                  )}
                </View>
                <Text style={{ color: colors.text }} className="text-2xl font-bold">{profile.name}</Text>
              </View>
              <Text style={{ color: colors.textSecondary }} className="mt-1">{profile.username}</Text>

              {profile.bio && (
                <Text style={{ color: colors.isDark ? '#D1D5DB' : '#4B5563' }} className="text-center mt-3 px-4">{profile.bio}</Text>
              )}
              <View className="flex-row items-center mt-3">
                <Calendar size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }} className="text-sm ml-1">
                  Member since {new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Today's Activity */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-5 -mt-4 mb-6"
        >
          <LinearGradient
            colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#FFFFFF', colors.bg]}
            style={{ borderRadius: 20, padding: 20, borderWidth: colors.isDark ? 0 : 1, borderColor: 'rgba(0,0,0,0.05)' }}
          >
            <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Today's Activity</Text>
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
                    {Math.round(displayRings.move)}/{Math.round(displayRings.moveGoal)} CAL
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-exercise mr-2" />
                    <Text style={{ color: colors.textSecondary }}>Exercise</Text>
                  </View>
                  <Text style={{ color: colors.text }} className="font-medium">
                    {Math.round(displayRings.exercise)}/{Math.round(displayRings.exerciseGoal)} MIN
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-stand mr-2" />
                    <Text style={{ color: colors.textSecondary }}>Stand</Text>
                  </View>
                  <Text style={{ color: colors.text }} className="font-medium">
                    {Math.round(displayRings.stand)}/{Math.round(displayRings.standGoal)} HRS
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Stats Grid */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(150)}
          className="px-5 mb-6"
        >
          <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Stats</Text>
          <View className="flex-row space-x-3 mb-3">
            <StatCard
              icon={<Flame size={20} color="#FF6B35" />}
              value={profile.stats.currentStreak}
              label="Current Streak"
              color="#FF6B35"
              isDark={colors.isDark}
            />
            <StatCard
              icon={<Flame size={20} color="#FA114F" />}
              value={profile.stats.longestStreak}
              label="Longest Streak"
              color="#FA114F"
              isDark={colors.isDark}
            />
            <StatCard
              icon={<Target size={20} color="#92E82A" />}
              value={profile.stats.totalPoints.toLocaleString()}
              label="Total Points"
              color="#92E82A"
              isDark={colors.isDark}
            />
          </View>
          <View className="flex-row space-x-3">
            <StatCard
              icon={<Trophy size={20} color="#FFD700" />}
              value={profile.stats.competitionsWon}
              label="Wins"
              color="#FFD700"
              isDark={colors.isDark}
            />
            <StatCard
              icon={<Users size={20} color="#00D4FF" />}
              value={profile.stats.competitionsJoined}
              label="Competitions"
              color="#00D4FF"
              isDark={colors.isDark}
            />
            <StatCard
              icon={<Dumbbell size={20} color="#9B59B6" />}
              value={profile.stats.workoutsThisMonth}
              label="This Month"
              color="#9B59B6"
              isDark={colors.isDark}
            />
          </View>
        </Animated.View>

        {/* Medals */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mb-6"
        >
          <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Medals</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-5">
            <View className="flex-row justify-around">
              {/* Gold */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)' }}
                >
                  <Trophy size={32} color="#FFD700" />
                </View>
                <Text className="text-medal-gold text-2xl font-bold">{profile.medals.gold}</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">Gold</Text>
              </View>

              {/* Silver */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(192, 192, 192, 0.2)' }}
                >
                  <Award size={32} color="#C0C0C0" />
                </View>
                <Text className="text-medal-silver text-2xl font-bold">{profile.medals.silver}</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">Silver</Text>
              </View>

              {/* Bronze */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(205, 127, 50, 0.2)' }}
                >
                  <Award size={32} color="#CD7F32" />
                </View>
                <Text className="text-medal-bronze text-2xl font-bold">{profile.medals.bronze}</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">Bronze</Text>
              </View>
            </View>

            {/* Total */}
            <View
              className="mt-4 pt-4 flex-row justify-between items-center"
              style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
            >
              <Text style={{ color: colors.textSecondary }}>Total Medals</Text>
              <Text style={{ color: colors.text }} className="font-bold text-lg">
                {profile.medals.gold + profile.medals.silver + profile.medals.bronze}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Recent Achievements */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(250)}
          className="px-5 mb-6"
        >
          <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Recent Achievements</Text>
          <View style={{ backgroundColor: colors.card }} className="rounded-2xl overflow-hidden">
            {profile.recentAchievements.length > 0 ? (
              profile.recentAchievements.map((achievement, index) => (
                <View
                  key={achievement.id}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < profile.recentAchievements.length - 1 ? 1 : 0,
                    borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  }}
                >
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: medalColors[achievement.type] + '20' }}
                  >
                    <Award size={24} color={medalColors[achievement.type]} />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text style={{ color: colors.text }} className="font-medium">{achievement.name}</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                      {new Date(achievement.earnedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View
                    className="px-2 py-1 rounded-full"
                    style={{ backgroundColor: medalColors[achievement.type] + '20' }}
                  >
                    <Text
                      className="text-xs font-medium capitalize"
                      style={{ color: medalColors[achievement.type] }}
                    >
                      {achievement.type}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View className="p-6 items-center">
                <Award size={32} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }} className="text-base mt-3">No achievements earned yet!</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Challenge Button - Only show for friend profiles, not own profile */}
        {!isOwnProfile && (
          <Animated.View
            entering={FadeIn.duration(500).delay(300)}
            className="px-5"
          >
            <Pressable className="active:opacity-80">
              <LinearGradient
                colors={['#FA114F', '#D10040']}
                style={{ borderRadius: 16, padding: 16, alignItems: 'center' }}
              >
                <Text className="text-white text-lg font-semibold">Challenge {profile.name}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
      
      {/* Report User Modal */}
      <ReportUserModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUserId={id || ''}
        reportedUserName={profile.name}
      />
    </View>
  );
}