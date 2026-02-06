// ChallengeCard.tsx - Card component for weekly challenge display

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CircleDot,
  Footprints,
  Flame,
  Dumbbell,
  Sunrise,
  Trophy,
  Check,
  Gift,
  LucideIcon,
} from 'lucide-react-native';
import { ChallengeWithProgress } from '@/lib/edge-functions';
import { useThemeColors } from '@/lib/useThemeColors';

// Map icon names to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  'circle-dot': CircleDot,
  footprints: Footprints,
  flame: Flame,
  dumbbell: Dumbbell,
  sunrise: Sunrise,
  trophy: Trophy,
};

interface ChallengeCardProps {
  challenge: ChallengeWithProgress;
  onPress: (challenge: ChallengeWithProgress) => void;
  onClaimReward?: (challengeId: string) => void;
  index?: number;
}

export function ChallengeCard({
  challenge,
  onPress,
  onClaimReward,
  index = 0,
}: ChallengeCardProps) {
  const colors = useThemeColors();

  const {
    id,
    title,
    description,
    target_value,
    icon,
    accent_color,
    reward_type,
    progress,
  } = challenge;

  // Format numbers in title with commas (e.g., "50000" -> "50,000")
  const formattedTitle = title.replace(/\d{4,}/g, (match) =>
    parseInt(match, 10).toLocaleString()
  );

  // Calculate progress
  const currentValue = progress?.current_value ?? 0;
  const progressPercent = Math.min(currentValue / target_value, 1);
  const isCompleted = progress?.completed_at !== null && progress?.completed_at !== undefined;
  const isRewardClaimed = progress?.reward_claimed ?? false;
  const canClaimReward = isCompleted && !isRewardClaimed;

  // Get the icon component
  const IconComponent = ICON_MAP[icon] || Trophy;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(challenge);
  };

  const handleClaimReward = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClaimReward?.(id);
  };

  // Get background color based on completion state
  const getBackgroundColor = () => {
    if (isRewardClaimed) {
      return colors.isDark ? 'rgba(146, 232, 42, 0.1)' : 'rgba(146, 232, 42, 0.05)';
    }
    if (canClaimReward) {
      return colors.isDark ? 'rgba(250, 17, 79, 0.12)' : 'rgba(250, 17, 79, 0.05)';
    }
    // Neutral background - no colored tints
    return colors.isDark ? '#1F1F23' : '#FFFFFF';
  };

  // Get border color
  const getBorderColor = () => {
    if (isRewardClaimed) return '#92E82A';
    if (canClaimReward) return '#FA114F';
    // Subtle border for regular cards
    return colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
  };

  // Get reward display text
  const getRewardText = () => {
    if (!reward_type) return null;
    const value = challenge.reward_value || {};

    switch (reward_type) {
      case 'trial_mover':
        return `${value.trial_days || 3}-day Mover trial`;
      case 'trial_crusher':
        return `${value.trial_days || 1}-day Crusher trial`;
      case 'badge':
        const badgeId = (value.badge_id as string) || '';
        return formatBadgeName(badgeId);
      case 'cosmetic':
        const cosmeticId = (value.cosmetic_id as string) || '';
        return formatCosmeticName(cosmeticId);
      case 'achievement_boost':
        const bonus = (value.bonus as number) || 0;
        return `+${bonus.toLocaleString()} bonus`;
      default:
        return 'Reward';
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={styles.wrapper}
    >
      <View
        style={[
          styles.card,
          {
            borderColor: getBorderColor(),
            backgroundColor: getBackgroundColor(),
            ...(colors.isDark ? {} : {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 2,
            }),
          },
        ]}
      >
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.pressable,
            pressed && styles.pressed,
          ]}
        >
          {/* Icon and Progress Section */}
          <View style={styles.topRow}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: `${accent_color}25` },
              ]}
            >
              <IconComponent
                size={24}
                color={accent_color}
                strokeWidth={2}
              />
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text
                  style={[styles.progressText, { color: colors.textSecondary }]}
                >
                  {currentValue.toLocaleString()} / {target_value.toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.percentText,
                    { color: isCompleted ? '#92E82A' : accent_color },
                  ]}
                >
                  {Math.round(progressPercent * 100)}%
                </Text>
              </View>

              {/* Progress Bar */}
              <View
                style={[
                  styles.progressBarBackground,
                  { backgroundColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${progressPercent * 100}%`,
                      backgroundColor: isCompleted ? '#92E82A' : accent_color,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Title and Description */}
          <View style={styles.content}>
            <DisplayText
              className="font-semibold"
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
            >
              {formattedTitle}
            </DisplayText>
            {description && (
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {description}
              </Text>
            )}
          </View>

          {/* Status Area */}
          <View style={styles.statusArea}>
            {isRewardClaimed ? (
              <View style={[styles.statusBadge, { backgroundColor: 'rgba(146, 232, 42, 0.15)' }]}>
                <Check size={12} color="#92E82A" strokeWidth={3} />
                <Text style={[styles.statusText, { color: '#92E82A' }]}>
                  COMPLETED
                </Text>
              </View>
            ) : canClaimReward ? (
              <Pressable
                onPress={handleClaimReward}
                style={({ pressed }) => [
                  styles.claimButton,
                  pressed && styles.claimButtonPressed,
                ]}
              >
                <Gift size={14} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.claimButtonText}>Claim Reward</Text>
              </Pressable>
            ) : (
              <View style={styles.rewardPreview}>
                <Gift size={12} color={colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.rewardText, { color: colors.textSecondary }]}>
                  {getRewardText()}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Helper functions for formatting reward names
function formatBadgeName(badgeId: string): string {
  return badgeId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCosmeticName(cosmeticId: string): string {
  return cosmeticId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    width: '100%',
    padding: 16,
  },
  pressable: {
    // Pressable wraps content, card has padding
  },
  pressed: {
    opacity: 0.8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  progressSection: {
    flex: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  content: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FA114F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  claimButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  rewardPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ChallengeCard;
