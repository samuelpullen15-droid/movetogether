/**
 * TrialBadge
 *
 * Displays a badge indicating trial status with countdown timer.
 * Used throughout the app to show when features are available via trial.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Zap, Sparkles, Crown } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/useThemeColors';
import type { TrialRewardType } from '@/lib/trial-rewards';

// ============================================================================
// TYPES
// ============================================================================

interface TrialBadgeProps {
  trialType: TrialRewardType;
  timeRemaining: string | null;
  variant?: 'compact' | 'full';
  onPress?: () => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const TRIAL_CONFIG: Record<
  TrialRewardType,
  {
    icon: React.ComponentType<any>;
    label: string;
    shortLabel: string;
    gradient: [string, string];
    iconColor: string;
  }
> = {
  trial_mover: {
    icon: Zap,
    label: 'Mover Trial',
    shortLabel: 'Mover',
    gradient: ['#FF6B35', '#FF8F5C'],
    iconColor: '#FFFFFF',
  },
  trial_coach: {
    icon: Sparkles,
    label: 'Coach Spark Trial',
    shortLabel: 'Coach',
    gradient: ['#9B59B6', '#B07CC6'],
    iconColor: '#FFFFFF',
  },
  trial_crusher: {
    icon: Crown,
    label: 'Crusher Trial',
    shortLabel: 'Crusher',
    gradient: ['#E74C3C', '#EC7063'],
    iconColor: '#FFFFFF',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function TrialBadge({
  trialType,
  timeRemaining,
  variant = 'compact',
  onPress,
}: TrialBadgeProps) {
  const colors = useThemeColors();
  const config = TRIAL_CONFIG[trialType];
  const IconComponent = config.icon;

  // Pulse animation for urgency when time is running low
  const pulse = useSharedValue(1);
  const isUrgent = timeRemaining && !timeRemaining.includes('d') && parseInt(timeRemaining) <= 2;

  useEffect(() => {
    if (isUrgent) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      pulse.value = 1;
    }
  }, [isUrgent]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  if (variant === 'compact') {
    return (
      <Pressable onPress={handlePress} disabled={!onPress}>
        <Animated.View style={animatedStyle}>
          <LinearGradient
            colors={config.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.compactBadge}
          >
            <IconComponent size={12} color={config.iconColor} />
            <Text style={styles.compactText} className="font-semibold">
              {timeRemaining || config.shortLabel}
            </Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  }

  // Full variant
  return (
    <Pressable onPress={handlePress} disabled={!onPress}>
      <Animated.View style={animatedStyle}>
        <LinearGradient
          colors={config.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fullBadge}
        >
          <View style={styles.fullContent}>
            <View style={styles.iconContainer}>
              <IconComponent size={20} color={config.iconColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.fullLabel} className="font-semibold">
                {config.label}
              </Text>
              {timeRemaining && (
                <View style={styles.timeRow}>
                  <Clock size={12} color="rgba(255, 255, 255, 0.8)" />
                  <Text style={styles.timeText}>{timeRemaining} remaining</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// TRIAL COUNTDOWN BANNER
// ============================================================================

interface TrialCountdownBannerProps {
  trialType: TrialRewardType;
  timeRemaining: string;
  onUpgradePress: () => void;
}

export function TrialCountdownBanner({
  trialType,
  timeRemaining,
  onUpgradePress,
}: TrialCountdownBannerProps) {
  const config = TRIAL_CONFIG[trialType];
  const IconComponent = config.icon;

  return (
    <View style={styles.bannerContainer}>
      <LinearGradient
        colors={[...config.gradient, config.gradient[1]] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.banner}
      >
        <View style={styles.bannerLeft}>
          <IconComponent size={20} color="#FFFFFF" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle} className="font-semibold">
              {config.label} Active
            </Text>
            <View style={styles.bannerTimeRow}>
              <Clock size={12} color="rgba(255, 255, 255, 0.8)" />
              <Text style={styles.bannerTime}>{timeRemaining} remaining</Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onUpgradePress();
          }}
          style={styles.upgradeButton}
        >
          <Text style={styles.upgradeButtonText} className="font-semibold">
            Upgrade
          </Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// FEATURE TRIAL INDICATOR
// ============================================================================

interface FeatureTrialIndicatorProps {
  isTrialAccess: boolean;
  featureName?: string;
}

/**
 * Small indicator to show when a feature is being accessed via trial
 * Use this next to feature titles/buttons to indicate trial status
 */
export function FeatureTrialIndicator({
  isTrialAccess,
  featureName,
}: FeatureTrialIndicatorProps) {
  if (!isTrialAccess) return null;

  return (
    <View style={styles.featureIndicator}>
      <Text style={styles.featureIndicatorText} className="font-medium">
        TRIAL
      </Text>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Compact badge
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  compactText: {
    fontSize: 11,
    color: '#FFFFFF',
  },

  // Full badge
  fullBadge: {
    borderRadius: 12,
    padding: 12,
  },
  fullContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  fullLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Banner
  bannerContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  banner: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bannerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  bannerTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  bannerTime: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  upgradeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
  },

  // Feature indicator
  featureIndicator: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  featureIndicatorText: {
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

export default TrialBadge;
