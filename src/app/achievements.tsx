// achievements.tsx - Main achievements screen

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';
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
  LayoutGrid,
  Unlock,
} from 'lucide-react-native';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';

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
  const colors = useThemeColors();
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />
        }
      >
        {/* Pull-down background gradient */}
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: colors.isDark ? '#1a1a2e' : '#f8f9fa', zIndex: -1 }} />

        {/* Header with Gradient */}
        <LinearGradient
          colors={colors.isDark ? ['#1a1a2e', '#000000'] : ['#f8f9fa', '#f0f0f5']}
          style={{ paddingTop: 0, paddingLeft: 16, paddingRight: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)} style={{ paddingTop: insets.top + 16 }}>
            {/* Back Button */}
            <View className="mb-4">
              <LiquidGlassBackButton onPress={() => router.back()} />
            </View>

            <View className="flex-row items-center mb-4" style={{ gap: 12 }}>
              <Text className="text-3xl font-bold" style={{ color: colors.text }}>Achievements</Text>
              <View className="flex-row items-center space-x-1 px-3 py-1.5 rounded-xl" style={{ backgroundColor: colors.isDark ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.2)' }}>
                <Star size={14} color="#FFD700" />
                <Text className="text-base font-bold" style={{ color: colors.isDark ? '#eab308' : '#b45309' }}>{stats.achievementScore}</Text>
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
          style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }}
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
                  className="flex-row items-center space-x-1.5 px-3.5 py-2 rounded-full active:opacity-80"
                  style={{
                    backgroundColor: isSelected
                      ? (colors.isDark ? '#FFFFFF' : '#000000')
                      : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? (colors.isDark ? '#FFFFFF' : '#000000')
                      : (colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
                  }}
                >
                  <Icon
                    size={16}
                    color={isSelected ? (colors.isDark ? '#000000' : '#FFFFFF') : colors.textSecondary}
                  />
                  <Text
                    className="text-sm font-medium"
                    style={{ color: isSelected ? (colors.isDark ? '#000000' : '#FFFFFF') : colors.textSecondary }}
                  >
                    {category.label}
                  </Text>
                  <View
                    className="px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: isSelected ? (colors.isDark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)') : (colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)') }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: isSelected ? (colors.isDark ? '#000000' : '#FFFFFF') : colors.textSecondary }}
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
                  colors={colors}
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
        colors={colors}
      />
    </View>
  );
}