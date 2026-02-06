/**
 * WeeklyChallengesWidget
 *
 * Home screen widget displaying weekly challenges progress.
 * Shows top challenges with progress bars and a "See All" link.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronRight,
  Trophy,
  Gift,
  CircleDot,
  Footprints,
  Flame,
  Dumbbell,
  Sunrise,
  LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useThemeColors } from '@/lib/useThemeColors';
import { challengesApi, ChallengeWithProgress } from '@/lib/edge-functions';
import { useAuthStore } from '@/lib/auth-store';

// Map icon names to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  'circle-dot': CircleDot,
  footprints: Footprints,
  flame: Flame,
  dumbbell: Dumbbell,
  sunrise: Sunrise,
  trophy: Trophy,
};

// ============================================================================
// MINI CHALLENGE ITEM
// ============================================================================

interface MiniChallengeItemProps {
  challenge: ChallengeWithProgress;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
}

function MiniChallengeItem({ challenge, index, colors }: MiniChallengeItemProps) {
  const progressWidth = useSharedValue(0);
  const { title, target_value, icon, accent_color, progress } = challenge;

  const currentValue = progress?.current_value ?? 0;
  const progressPercent = Math.min(currentValue / target_value, 1);
  const isCompleted = progress?.completed_at !== null && progress?.completed_at !== undefined;
  const canClaimReward = isCompleted && !progress?.reward_claimed;

  const IconComponent = ICON_MAP[icon] || Trophy;

  useEffect(() => {
    progressWidth.value = withSpring(progressPercent, { damping: 15, stiffness: 100 });
  }, [progressPercent]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 50 + 100).springify()}
      style={styles.miniItem}
    >
      {/* Icon */}
      <View
        style={[
          styles.miniIcon,
          { backgroundColor: `${accent_color}20` },
        ]}
      >
        <IconComponent size={16} color={accent_color} strokeWidth={2.5} />
      </View>

      {/* Content */}
      <View style={styles.miniContent}>
        <View style={styles.miniHeader}>
          <Text
            className="font-medium"
            style={[styles.miniTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {canClaimReward ? (
            <View style={[styles.claimBadge, { backgroundColor: 'rgba(250, 17, 79, 0.15)' }]}>
              <Gift size={10} color="#FA114F" />
            </View>
          ) : (
            <Text
              style={[
                styles.miniPercent,
                { color: isCompleted ? '#92E82A' : accent_color },
              ]}
            >
              {Math.round(progressPercent * 100)}%
            </Text>
          )}
        </View>

        {/* Progress Bar */}
        <View
          style={[
            styles.miniProgressTrack,
            { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)' },
          ]}
        >
          <Animated.View
            style={[
              styles.miniProgressFill,
              { backgroundColor: isCompleted ? '#92E82A' : accent_color },
              progressStyle,
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

interface EmptyStateProps {
  colors: ReturnType<typeof useThemeColors>;
}

function EmptyState({ colors }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View
        style={[
          styles.emptyIconContainer,
          { backgroundColor: colors.isDark ? 'rgba(250, 17, 79, 0.15)' : 'rgba(250, 17, 79, 0.1)' },
        ]}
      >
        <Trophy size={24} color="#FA114F" />
      </View>
      <Text className="font-semibold" style={[styles.emptyTitle, { color: colors.text }]}>
        No Challenges Yet
      </Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        Check back Monday for new challenges
      </Text>
    </View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WeeklyChallengesWidget() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  const [challenges, setChallenges] = useState<ChallengeWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load challenges
  const loadChallenges = useCallback(async () => {
    if (!user?.id) return;

    try {
      const result = await challengesApi.getActiveChallenges();
      if (result.data) {
        setChallenges(result.data);
      }
    } catch (error) {
      console.error('[WeeklyChallengesWidget] Failed to load challenges:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/challenges');
  };

  // Calculate stats
  const stats = {
    total: challenges.length,
    completed: challenges.filter((c) => c.progress?.completed_at).length,
    unclaimed: challenges.filter(
      (c) => c.progress?.completed_at && !c.progress?.reward_claimed
    ).length,
  };

  // Get top 3 challenges (prioritize unclaimed, then in-progress, then completed)
  const displayChallenges = [...challenges]
    .sort((a, b) => {
      const aUnclaimed = a.progress?.completed_at && !a.progress?.reward_claimed;
      const bUnclaimed = b.progress?.completed_at && !b.progress?.reward_claimed;
      if (aUnclaimed && !bUnclaimed) return -1;
      if (!aUnclaimed && bUnclaimed) return 1;

      const aCompleted = !!a.progress?.completed_at;
      const bCompleted = !!b.progress?.completed_at;
      if (!aCompleted && bCompleted) return -1;
      if (aCompleted && !bCompleted) return 1;

      // Sort by progress percentage
      const aProgress = (a.progress?.current_value ?? 0) / a.target_value;
      const bProgress = (b.progress?.current_value ?? 0) / b.target_value;
      return bProgress - aProgress;
    })
    .slice(0, 3);

  // Don't render if loading and no user
  if (!user?.id) return null;

  return (
    <Animated.View entering={FadeIn.delay(400).duration(400)}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <BlurView
          intensity={colors.isDark ? 30 : 80}
          tint={colors.isDark ? 'dark' : 'light'}
          style={[
            styles.container,
            {
              backgroundColor: colors.isDark
                ? 'rgba(28, 28, 30, 0.7)'
                : 'rgba(255, 255, 255, 0.3)',
              borderWidth: colors.isDark ? 0 : 1,
              borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text className="font-semibold" style={[styles.headerTitle, { color: colors.text }]}>
                Weekly Challenges
              </Text>
              {stats.unclaimed > 0 && (
                <View style={[styles.unclaimedBadge, { backgroundColor: 'rgba(250, 17, 79, 0.15)' }]}>
                  <Gift size={12} color="#FA114F" />
                  <Text style={styles.unclaimedText}>{stats.unclaimed}</Text>
                </View>
              )}
            </View>
            <ChevronRight size={20} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
          </View>

          {isLoading ? (
            // Loading skeleton
            <View style={styles.loadingContainer}>
              <View style={[styles.loadingSkeleton, { backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
              <View style={[styles.loadingSkeleton, { backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
            </View>
          ) : challenges.length === 0 ? (
            <EmptyState colors={colors} />
          ) : (
            <>
              {/* Challenge Items */}
              <View style={styles.challengesList}>
                {displayChallenges.map((challenge, index) => (
                  <MiniChallengeItem
                    key={challenge.id}
                    challenge={challenge}
                    index={index}
                    colors={colors}
                  />
                ))}
              </View>

              {/* Footer Stats */}
              <View style={styles.footer}>
                <View style={styles.footerStat}>
                  <Trophy size={14} color="#FFD700" />
                  <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                    {stats.completed}/{stats.total} completed
                  </Text>
                </View>
                {challenges.length > 3 && (
                  <Text style={[styles.seeMoreText, { color: '#FA114F' }]}>
                    +{challenges.length - 3} more
                  </Text>
                )}
              </View>
            </>
          )}
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
  },
  unclaimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  unclaimedText: {
    color: '#FA114F',
    fontSize: 12,
    fontWeight: '700',
  },
  challengesList: {
    gap: 12,
  },
  miniItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniContent: {
    flex: 1,
  },
  miniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  miniTitle: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  miniPercent: {
    fontSize: 12,
    fontWeight: '700',
  },
  claimBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.15)',
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  loadingSkeleton: {
    height: 44,
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    marginTop: 12,
  },
  emptyDescription: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default WeeklyChallengesWidget;
