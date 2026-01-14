import { View, Text, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Trophy,
  Flame,
  Target,
  Calendar,
  Award,
  Users,
  Dumbbell,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { TripleActivityRings } from '@/components/ActivityRing';
import { FriendProfile } from '@/lib/social-types';
import { getUserProfile } from '@/lib/user-profile-service';
import { useState, useEffect } from 'react';

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: string | number; label: string; color: string }) {
  return (
    <View className="flex-1 bg-white/5 rounded-xl p-3 items-center">
      <View
        className="w-10 h-10 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: color + '20' }}
      >
        {icon}
      </View>
      <Text className="text-white text-lg font-bold">{value}</Text>
      <Text className="text-gray-500 text-xs text-center">{label}</Text>
    </View>
  );
}

export default function FriendProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#FA114F" />
        <Text className="text-gray-400 mt-4">Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-gray-400">{error || 'Profile not found'}</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-fitness-accent">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Calculate progress with defensive checks for division by zero
  const moveProgress = profile.currentRings.moveGoal > 0 
    ? Math.max(0, Math.min(1, profile.currentRings.move / profile.currentRings.moveGoal)) 
    : 0;
  const exerciseProgress = profile.currentRings.exerciseGoal > 0 
    ? Math.max(0, Math.min(1, profile.currentRings.exercise / profile.currentRings.exerciseGoal)) 
    : 0;
  const standProgress = profile.currentRings.standGoal > 0 
    ? Math.max(0, Math.min(1, profile.currentRings.stand / profile.currentRings.standGoal)) 
    : 0;

  const medalColors = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  };

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center mb-6"
            >
              <ChevronLeft size={24} color="white" />
              <Text className="text-white text-base ml-1">Back</Text>
            </Pressable>

            {/* Profile Header */}
            <View className="items-center">
              <Image
                source={{ uri: profile.avatar }}
                className="w-28 h-28 rounded-full border-4 border-fitness-accent"
              />
              <Text className="text-white text-2xl font-bold mt-4">{profile.name}</Text>
              <Text className="text-gray-400 mt-1">{profile.username}</Text>
              {profile.bio && (
                <Text className="text-gray-300 text-center mt-3 px-4">{profile.bio}</Text>
              )}
              <View className="flex-row items-center mt-3">
                <Calendar size={14} color="#6b7280" />
                <Text className="text-gray-500 text-sm ml-1">
                  Member since {new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Today's Activity */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-5 -mt-4 mb-6"
        >
          <LinearGradient
            colors={['#1C1C1E', '#0D0D0D']}
            style={{ borderRadius: 20, padding: 20 }}
          >
            <Text className="text-white text-lg font-semibold mb-4">Today's Activity</Text>
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
                    <Text className="text-gray-400">Move</Text>
                  </View>
                  <Text className="text-white font-medium">
                    {profile.currentRings.move}/{profile.currentRings.moveGoal} CAL
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-exercise mr-2" />
                    <Text className="text-gray-400">Exercise</Text>
                  </View>
                  <Text className="text-white font-medium">
                    {profile.currentRings.exercise}/{profile.currentRings.exerciseGoal} MIN
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-ring-stand mr-2" />
                    <Text className="text-gray-400">Stand</Text>
                  </View>
                  <Text className="text-white font-medium">
                    {profile.currentRings.stand}/{profile.currentRings.standGoal} HRS
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
          <Text className="text-white text-lg font-semibold mb-4">Stats</Text>
          <View className="flex-row space-x-3 mb-3">
            <StatCard
              icon={<Flame size={20} color="#FF6B35" />}
              value={profile.stats.currentStreak}
              label="Current Streak"
              color="#FF6B35"
            />
            <StatCard
              icon={<Flame size={20} color="#FA114F" />}
              value={profile.stats.longestStreak}
              label="Longest Streak"
              color="#FA114F"
            />
            <StatCard
              icon={<Target size={20} color="#92E82A" />}
              value={profile.stats.totalPoints.toLocaleString()}
              label="Total Points"
              color="#92E82A"
            />
          </View>
          <View className="flex-row space-x-3">
            <StatCard
              icon={<Trophy size={20} color="#FFD700" />}
              value={profile.stats.competitionsWon}
              label="Wins"
              color="#FFD700"
            />
            <StatCard
              icon={<Users size={20} color="#00D4FF" />}
              value={profile.stats.competitionsJoined}
              label="Competitions"
              color="#00D4FF"
            />
            <StatCard
              icon={<Dumbbell size={20} color="#9B59B6" />}
              value={profile.stats.workoutsThisMonth}
              label="This Month"
              color="#9B59B6"
            />
          </View>
        </Animated.View>

        {/* Medals */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-lg font-semibold mb-4">Medals</Text>
          <View className="bg-fitness-card rounded-2xl p-5">
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
                <Text className="text-gray-500 text-sm">Gold</Text>
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
                <Text className="text-gray-500 text-sm">Silver</Text>
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
                <Text className="text-gray-500 text-sm">Bronze</Text>
              </View>
            </View>

            {/* Total */}
            <View className="mt-4 pt-4 border-t border-white/10 flex-row justify-between items-center">
              <Text className="text-gray-400">Total Medals</Text>
              <Text className="text-white font-bold text-lg">
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
          <Text className="text-white text-lg font-semibold mb-4">Recent Achievements</Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {profile.recentAchievements.map((achievement, index) => (
              <View
                key={achievement.id}
                className="flex-row items-center p-4"
                style={{
                  borderBottomWidth: index < profile.recentAchievements.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(255,255,255,0.05)',
                }}
              >
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: medalColors[achievement.type] + '20' }}
                >
                  <Award size={24} color={medalColors[achievement.type]} />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-white font-medium">{achievement.name}</Text>
                  <Text className="text-gray-500 text-sm mt-0.5">
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
            ))}
          </View>
        </Animated.View>

        {/* Challenge Button */}
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
      </ScrollView>
    </View>
  );
}
