// achievements.tsx - Main achievements screen

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Trophy,
  Calendar,
  Flag,
  Users,
  Star,
  ChevronLeft,
  LayoutGrid,
  Unlock,
} from 'lucide-react-native';

import { useAuthStore } from '@/lib/auth-store';
import { useSubscription } from '@/lib/useSubscription';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useCelebration } from '@/lib/celebration-context';
import { AchievementCard } from '@/components/AchievementCard';
import { AchievementDetailSheet } from '@/components/AchievementDetailSheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet';
import {
  AchievementWithProgress,
  AchievementCategory,
  TIER_CONFIG,
} from '@/lib/achievements-types';
import {
  fetchUserAchievements,
  calculateStats,
  AchievementStats,
} from '@/lib/achievements-service';

const CATEGORIES: { 
  key: AchievementCategory | 'all'; 
  label: string; 
  icon: React.ComponentType<{ size: number; color: string }> 
}[] = [
  { key: 'all', label: 'All', icon: LayoutGrid },
  { key: 'competition', label: 'Competition', icon: Trophy },
  { key: 'consistency', label: 'Consistency', icon: Calendar },
  { key: 'milestone', label: 'Milestones', icon: Flag },
  { key: 'social', label: 'Social', icon: Users },
];

export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuthStore();
  const { tier: subscriptionTier } = useSubscription();
  const { showCelebration } = useCelebration();
  const checkTier = useSubscriptionStore((s) => s.checkTier);

  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [stats, setStats] = useState<AchievementStats>({
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    achievementScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all');
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithProgress | null>(null);
  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  const canAccessAchievements = subscriptionTier === 'mover' || subscriptionTier === 'crusher';

  const loadAchievements = useCallback(async () => {
    if (!user?.id) return;

    try {
      const data = await fetchUserAchievements(user.id, canAccessAchievements);
      setAchievements(data);
      setStats(calculateStats(data));
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, canAccessAchievements]);

  // Refresh subscription tier and user profile when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkTier();
      if (user?.id) {
        refreshProfile();
      }
    }, [checkTier, refreshProfile, user?.id])
  );

  useEffect(() => {
    loadAchievements();
  }, [loadAchievements]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadAchievements();
    setRefreshing(false);
  }, [loadAchievements]);

  const handleAchievementPress = useCallback((achievement: AchievementWithProgress) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedAchievement(achievement);
    bottomSheetRef.current?.expand();
  }, []);

  const handleUpgradePress = useCallback(() => {
    router.push('/upgrade');
  }, [router]);

  const handleSheetUpgradePress = useCallback(() => {
    bottomSheetRef.current?.close();
    router.push('/upgrade');
  }, [router]);

  const filteredAchievements =
    selectedCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === selectedCategory);

  const sortedAchievements = [...filteredAchievements].sort((a, b) => {
    const aTier = a.currentTier;
    const bTier = b.currentTier;

    if (aTier && !bTier) return -1;
    if (!aTier && bTier) return 1;

    const tierOrder = ['platinum', 'gold', 'silver', 'bronze'];
    if (aTier && bTier) {
      const aIndex = tierOrder.indexOf(aTier);
      const bIndex = tierOrder.indexOf(bTier);
      if (aIndex !== bIndex) return aIndex - bIndex;
    }

    return b.progressToNextTier - a.progressToNextTier;
  });

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bounces={true}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" />
        }
      >
        {/* Pull-down background gradient */}
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#1a1a2e', zIndex: -1 }} />
        
        {/* Header with Gradient */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: 0, paddingLeft: 16, paddingRight: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)} style={{ paddingTop: insets.top + 16 }}>
            {/* Back Button */}
            <Pressable
              onPress={() => router.back()}
              className="mb-4 w-10 h-10 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
            >
              <ChevronLeft size={24} color="white" />
            </Pressable>

            <View className="flex-row items-center mb-4" style={{ gap: 12 }}>
              <Text className="text-white text-3xl font-bold">Achievements</Text>
              <View className="flex-row items-center space-x-1 bg-yellow-500/15 px-3 py-1.5 rounded-xl">
                <Star size={14} color="#FFD700" />
                <Text className="text-yellow-500 text-base font-bold">{stats.achievementScore}</Text>
              </View>
            </View>

            {/* Stats Row */}
            <View className="flex-row items-center space-x-4" style={{ paddingLeft: 0, paddingRight: 0 }}>
              {/* Platinum with gradient shimmer effect */}
              <View 
                className="rounded-lg px-3 py-2 overflow-hidden"
                style={{ width: 70, alignItems: 'center' }}
              >
                <LinearGradient
                  colors={['#FFFFFF', '#B8E0FF', '#FFFFFF', '#E0F4FF', '#FFFFFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View className="items-center">
                  <Text className="text-black text-xs font-medium">Platinum</Text>
                  <Text className="text-black text-base font-bold">{stats.platinumCount}</Text>
                </View>
              </View>
              {/* Gold */}
              <View 
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: '#FFD700', width: 70, alignItems: 'center' }}
              >
                <View className="items-center">
                  <Text className="text-black text-xs font-medium">Gold</Text>
                  <Text className="text-black text-base font-bold">{stats.goldCount}</Text>
                </View>
              </View>
              {/* Silver */}
              <View 
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: '#C0C0C0', width: 70, alignItems: 'center' }}
              >
                <View className="items-center">
                  <Text className="text-black text-xs font-medium">Silver</Text>
                  <Text className="text-black text-base font-bold">{stats.silverCount}</Text>
                </View>
              </View>
              {/* Bronze */}
              <View 
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: '#CD7F32', width: 70, alignItems: 'center' }}
              >
                <View className="items-center">
                  <Text className="text-white text-xs font-medium">Bronze</Text>
                  <Text className="text-white text-base font-bold">{stats.bronzeCount}</Text>
                </View>
              </View>
            </View>

          </Animated.View>
        </LinearGradient>

        {/* Category Tabs */}
        <Animated.View 
          entering={FadeInDown.duration(600).delay(50)}
          className="border-b border-white/10"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
            nestedScrollEnabled={true}
            bounces={false}
            scrollEventThrottle={16}
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategory === category.key;
              const count =
                category.key === 'all'
                  ? achievements.length
                  : achievements.filter((a) => a.category === category.key).length;

              return (
                <Pressable
                  key={category.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCategory(category.key);
                  }}
                  className={`flex-row items-center space-x-1.5 px-3.5 py-2 rounded-full border ${
                    isSelected 
                      ? 'bg-white border-white' 
                      : 'bg-fitness-card border-white/10'
                  } active:opacity-80`}
                >
                  <Icon 
                    size={16} 
                    color={isSelected ? '#000000' : '#8E8E93'} 
                  />
                  <Text 
                    className={`text-sm font-medium ${
                      isSelected ? 'text-black' : 'text-gray-500'
                    }`}
                  >
                    {category.label}
                  </Text>
                  <View 
                    className={`px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-black/10' : 'bg-white/10'
                    }`}
                  >
                    <Text 
                      className={`text-xs font-semibold ${
                        isSelected ? 'text-black' : 'text-gray-500'
                      }`}
                    >
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Upgrade Banner for Starter users */}
        {!canAccessAchievements && (
          <Animated.View 
            entering={FadeInDown.duration(600).delay(100)}
            className="mt-6 mb-4"
            style={{ paddingLeft: 16, paddingRight: 20 }}
          >
            <LinearGradient
              colors={['#FFD700', '#FFA500', '#FF8C00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="rounded-2xl overflow-hidden"
            >
              <View className="flex-row items-center justify-between p-4">
                <View className="flex-row items-center space-x-2.5 flex-1">
                  <Unlock size={20} color="#000000" />
                  <Text className="text-black text-sm font-medium flex-1">
                    Upgrade to Mover to unlock achievements
                  </Text>
                </View>
                <Pressable
                  onPress={handleUpgradePress}
                  className="bg-black px-4 py-2 rounded-xl active:opacity-80"
                >
                  <Text className="text-white text-sm font-semibold">Upgrade</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Achievements Grid */}
        <View 
          className="mt-4" 
          style={{ 
            paddingLeft: 16, 
            paddingRight: 20,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          {sortedAchievements.map((achievement, index) => {
            const screenWidth = Dimensions.get('window').width;
            const paddingHorizontal = 16 + 20; // left + right padding
            const gap = 12;
            const cardWidth = (screenWidth - paddingHorizontal - gap) / 2;
            
            return (
              <View 
                key={achievement.id}
                style={{ 
                  width: cardWidth,
                  marginBottom: 12,
                }}
              >
                <AchievementCard
                  achievement={achievement}
                  onPress={handleAchievementPress}
                  index={index}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Achievement Detail Sheet */}
      <AchievementDetailSheet
        sheetRef={bottomSheetRef}
        achievement={selectedAchievement}
        onUpgradePress={handleSheetUpgradePress}
      />
    </View>
  );
}