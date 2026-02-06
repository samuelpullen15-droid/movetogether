/**
 * StreakWidget
 *
 * Home screen widget displaying the user's Movement Trail streak status.
 * Features animated flame icon, progress bar to next milestone, and at-risk warnings.
 */

import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Flame, AlertTriangle, MapPin } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import { useStreak } from '@/hooks/useStreak';
import { useThemeColors } from '@/lib/useThemeColors';

const AnimatedView = Animated.createAnimatedComponent(View);

// ============================================================================
// ANIMATED FLAME ICON
// ============================================================================

interface AnimatedFlameProps {
  size: number;
  streakCount: number;
  isAtRisk: boolean;
  colors: ReturnType<typeof useThemeColors>;
}

function AnimatedFlame({ size, streakCount, isAtRisk, colors }: AnimatedFlameProps) {
  const glowPulse = useSharedValue(0);
  const flameScale = useSharedValue(1);

  useEffect(() => {
    // Glow pulse animation
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Flame breathing animation
    flameScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.7]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.2]) }],
  }));

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }],
  }));

  // Determine flame color based on status
  const flameColor = isAtRisk ? '#F59E0B' : '#FA114F';
  const glowColor = isAtRisk ? 'rgba(245, 158, 11, 0.4)' : 'rgba(250, 17, 79, 0.4)';

  return (
    <View style={styles.flameContainer}>
      {/* Glow effect */}
      <AnimatedView
        style={[
          styles.flameGlow,
          {
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: size,
            backgroundColor: glowColor,
          },
          glowStyle,
        ]}
      />

      {/* Flame icon */}
      <AnimatedView style={flameStyle}>
        <Flame size={size} color={flameColor} fill={flameColor} strokeWidth={1.5} />
      </AnimatedView>

      {/* Streak count badge */}
      <View
        style={[
          styles.streakBadge,
          {
            backgroundColor: colors.isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.9)',
            borderColor: flameColor,
          },
        ]}
      >
        <Text
          style={[styles.streakBadgeText, { color: flameColor }]}
          className="font-bold"
        >
          {streakCount}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

interface ProgressBarProps {
  progress: number;
  nextMilestoneName: string;
  daysAway: number;
}

function ProgressBar({ progress, nextMilestoneName, daysAway }: ProgressBarProps) {
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withSpring(progress, {
      damping: 15,
      stiffness: 100,
    });
  }, [progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(animatedWidth.value * 100, 100)}%`,
  }));

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressLabelRow}>
        <Text className="text-gray-600 dark:text-gray-400 text-xs">
          Next: {nextMilestoneName}
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-xs">
          {daysAway} day{daysAway !== 1 ? 's' : ''} away
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <AnimatedView style={[styles.progressFillContainer, progressStyle]}>
          <LinearGradient
            colors={['#FA114F', '#FF6B9D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressFill}
          />
        </AnimatedView>
      </View>
    </View>
  );
}

// ============================================================================
// AT RISK BANNER
// ============================================================================

interface AtRiskBannerProps {
  shieldsAvailable: number;
}

function AtRiskBanner({ shieldsAvailable }: AtRiskBannerProps) {
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <AnimatedView style={[styles.atRiskBanner, bannerStyle]}>
      <LinearGradient
        colors={['rgba(245, 158, 11, 0.2)', 'rgba(234, 88, 12, 0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.atRiskGradient}
      >
        <AlertTriangle size={16} color="#F59E0B" />
        <Text className="text-orange-600 dark:text-orange-400 text-xs font-semibold ml-2 flex-1">
          Streak at risk! Complete activity today
        </Text>
        {shieldsAvailable > 0 && (
          <View style={styles.shieldBadge}>
            <Text className="text-orange-700 dark:text-orange-300 text-xs font-medium">
              {shieldsAvailable} shield{shieldsAvailable !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </LinearGradient>
    </AnimatedView>
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
        <MapPin size={24} color="#FA114F" />
      </View>
      <Text className="text-black dark:text-white text-base font-semibold mt-3">
        Start Your Journey
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-1">
        Complete activities to build your streak
      </Text>
    </View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StreakWidget() {
  const router = useRouter();
  const colors = useThemeColors();
  const {
    currentStreak,
    nextMilestone,
    streakAtRisk,
    streakShieldsAvailable,
    isLoading,
  } = useStreak();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/movement-trail');
  };

  // Calculate progress to next milestone
  const progress = nextMilestone
    ? (nextMilestone.day_number - nextMilestone.days_away) / nextMilestone.day_number
    : 0;

  // Empty state for new users (no streak and no activity)
  const showEmptyState = !isLoading && currentStreak === 0 && !streakAtRisk;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
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
            <Text className="text-black dark:text-white text-lg font-semibold">
              Movement Trail
            </Text>
            <ChevronRight size={20} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
          </View>

          {showEmptyState ? (
            <EmptyState colors={colors} />
          ) : (
            <>
              {/* Main content */}
              <View style={styles.content}>
                {/* Animated flame with streak count */}
                <AnimatedFlame
                  size={40}
                  streakCount={currentStreak}
                  isAtRisk={streakAtRisk}
                  colors={colors}
                />

                {/* Streak info */}
                <View style={styles.streakInfo}>
                  <Text className="text-black dark:text-white text-2xl font-bold">
                    {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
                  </Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-sm">
                    {streakAtRisk ? 'Keep it going!' : 'Current streak'}
                  </Text>
                </View>
              </View>

              {/* Progress bar to next milestone */}
              {nextMilestone && (
                <ProgressBar
                  progress={progress}
                  nextMilestoneName={nextMilestone.name}
                  daysAway={nextMilestone.days_away}
                />
              )}

              {/* At risk banner */}
              {streakAtRisk && <AtRiskBanner shieldsAvailable={streakShieldsAvailable} />}
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  flameContainer: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flameGlow: {
    position: 'absolute',
  },
  streakBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    minWidth: 28,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  streakBadgeText: {
    fontSize: 12,
  },
  streakInfo: {
    flex: 1,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    overflow: 'hidden',
  },
  progressFillContainer: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    flex: 1,
    borderRadius: 3,
  },
  atRiskBanner: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  atRiskGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  shieldBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default StreakWidget;
