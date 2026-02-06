// ChallengeDetailSheet.tsx - Bottom sheet modal for challenge details

import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetMethods,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
  CircleDot,
  Footprints,
  Flame,
  Dumbbell,
  Sunrise,
  Trophy,
  Gift,
  Clock,
  Check,
  Sparkles,
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

// Reward type display configuration
const REWARD_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  trial_mover: { icon: Sparkles, label: 'Mover Trial' },
  trial_crusher: { icon: Sparkles, label: 'Crusher Trial' },
  badge: { icon: Trophy, label: 'Badge' },
  cosmetic: { icon: Gift, label: 'Cosmetic' },
  achievement_boost: { icon: Sparkles, label: 'Achievement Boost' },
};

interface ChallengeDetailSheetProps {
  sheetRef: React.RefObject<BottomSheetMethods>;
  challenge: ChallengeWithProgress | null;
  onClaimReward: (challengeId: string) => void;
  onClose?: () => void;
}

export function ChallengeDetailSheet({
  sheetRef,
  challenge,
  onClaimReward,
  onClose,
}: ChallengeDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const snapPoints = useMemo(() => ['75%'], []);

  // Expand sheet when challenge changes
  useEffect(() => {
    if (challenge && sheetRef.current) {
      sheetRef.current.expand();
    }
  }, [challenge, sheetRef]);

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.5}
    />
  );

  if (!challenge) return null;

  const {
    id,
    title,
    description,
    target_value,
    icon,
    accent_color,
    reward_type,
    reward_value,
    ends_at,
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

  // Calculate time remaining
  const getTimeRemaining = () => {
    const now = new Date();
    const endDate = new Date(ends_at);
    const diffMs = endDate.getTime() - now.getTime();

    if (diffMs <= 0) return 'Ended';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Less than 1h remaining';
  };

  // Get reward display
  const getRewardDisplay = () => {
    if (!reward_type) return { text: 'Complete for reward', description: '' };
    const value = reward_value || {};

    switch (reward_type) {
      case 'trial_mover':
        return {
          text: `${value.trial_days || 3}-Day Mover Trial`,
          description: 'Unlock Mover features including unlimited competitions and chat',
        };
      case 'trial_crusher':
        return {
          text: `${value.trial_days || 1}-Day Crusher Trial`,
          description: 'Experience premium Crusher features including AI coaching',
        };
      case 'badge':
        const badgeId = (value.badge_id as string) || '';
        return {
          text: formatBadgeName(badgeId),
          description: 'Display this badge on your profile',
        };
      case 'cosmetic':
        const cosmeticId = (value.cosmetic_id as string) || '';
        return {
          text: formatCosmeticName(cosmeticId),
          description: 'Customize your profile with this item',
        };
      case 'achievement_boost':
        const bonus = (value.bonus as number) || 0;
        const achievementId = (value.achievement_id as string) || '';
        return {
          text: `+${bonus.toLocaleString()} Bonus`,
          description: `Progress boost toward ${formatAchievementName(achievementId)}`,
        };
      default:
        return { text: 'Special Reward', description: '' };
    }
  };

  const rewardDisplay = getRewardDisplay();
  const RewardIcon = REWARD_CONFIG[reward_type || '']?.icon || Gift;

  const handleClaimReward = () => {
    onClaimReward(id);
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF' }}
      handleIndicatorStyle={{ backgroundColor: colors.isDark ? '#48484A' : '#D1D1D6' }}
      backdropComponent={renderBackdrop}
      onChange={(index) => {
        if (index === -1) {
          onClose?.();
        }
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      >
        {/* Header with Icon */}
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: `${accent_color}20` },
            ]}
          >
            <IconComponent size={48} color={accent_color} strokeWidth={2} />
          </View>
          <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
            {formattedTitle}
          </Text>
          {description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {description}
            </Text>
          )}

          {/* Time Remaining Badge */}
          <View style={[styles.timeBadge, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F2F2F7' }]}>
            <Clock size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
              {getTimeRemaining()}
            </Text>
          </View>
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <Text className="font-semibold" style={[styles.sectionTitle, { color: colors.text }]}>
            Progress
          </Text>

          {/* Circular Progress Indicator */}
          <View style={styles.progressCircleContainer}>
            <View style={styles.progressCircle}>
              {/* SVG Progress Ring */}
              <Svg width={140} height={140} style={{ position: 'absolute' }}>
                {/* Background track */}
                <Circle
                  cx={70}
                  cy={70}
                  r={58}
                  stroke={colors.isDark ? '#2C2C2E' : '#E5E5EA'}
                  strokeWidth={12}
                  fill="none"
                />
                {/* Progress arc */}
                <Circle
                  cx={70}
                  cy={70}
                  r={58}
                  stroke={isCompleted ? '#92E82A' : accent_color}
                  strokeWidth={12}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 58}`}
                  strokeDashoffset={`${2 * Math.PI * 58 * (1 - progressPercent)}`}
                  transform="rotate(-90 70 70)"
                />
              </Svg>
              {/* Center content */}
              <View
                style={[
                  styles.progressCircleInner,
                  { backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF' },
                ]}
              >
                <Text style={[styles.progressPercentage, { color: isCompleted ? '#92E82A' : accent_color }]}>
                  {Math.round(progressPercent * 100)}%
                </Text>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                  {currentValue.toLocaleString()} / {target_value.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Linear Progress Bar */}
          <View style={styles.linearProgressContainer}>
            <View
              style={[
                styles.linearProgressBg,
                { backgroundColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' },
              ]}
            >
              <LinearGradient
                colors={isCompleted ? ['#92E82A', '#7BD41B'] : [accent_color, lightenColor(accent_color, 20)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.linearProgressFill, { width: `${progressPercent * 100}%` }]}
              />
            </View>
          </View>
        </View>

        {/* Reward Section */}
        <View style={[styles.rewardSection, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F2F2F7' }]}>
          <View style={styles.rewardHeader}>
            <View style={[styles.rewardIconCircle, { backgroundColor: `${accent_color}20` }]}>
              <RewardIcon size={24} color={accent_color} strokeWidth={2} />
            </View>
            <View style={styles.rewardTextContainer}>
              <Text style={[styles.rewardLabel, { color: colors.textSecondary }]}>
                Reward
              </Text>
              <Text className="font-semibold" style={[styles.rewardText, { color: colors.text }]}>
                {rewardDisplay.text}
              </Text>
            </View>
          </View>
          {rewardDisplay.description && (
            <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
              {rewardDisplay.description}
            </Text>
          )}
        </View>

        {/* Action Button */}
        <View style={styles.actionSection}>
          {isRewardClaimed ? (
            <View style={[styles.completedBadge, { backgroundColor: 'rgba(146, 232, 42, 0.15)' }]}>
              <Check size={20} color="#92E82A" strokeWidth={2.5} />
              <Text style={styles.completedText}>Reward Claimed</Text>
            </View>
          ) : canClaimReward ? (
            <Pressable
              onPress={handleClaimReward}
              style={({ pressed }) => [
                styles.claimButton,
                pressed && styles.claimButtonPressed,
              ]}
            >
              <LinearGradient
                colors={['#FA114F', '#E80D47']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.claimButtonGradient}
              >
                <Gift size={20} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.claimButtonText}>Claim Your Reward</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={[styles.inProgressBadge, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F2F2F7' }]}>
              <Text style={[styles.inProgressText, { color: colors.textSecondary }]}>
                Complete the challenge to claim your reward
              </Text>
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// Helper functions
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

function formatAchievementName(achievementId: string): string {
  return achievementId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function lightenColor(hex: string, percent: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const lighten = (value: number) => Math.min(255, value + (255 - value) * (percent / 100));

  const newR = Math.round(lighten(r)).toString(16).padStart(2, '0');
  const newG = Math.round(lighten(g)).toString(16).padStart(2, '0');
  const newB = Math.round(lighten(b)).toString(16).padStart(2, '0');

  return `#${newR}${newG}${newB}`;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
    lineHeight: 22,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  progressCircleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressCircle: {
    width: 140,
    height: 140,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercentage: {
    fontSize: 32,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  linearProgressContainer: {
    marginTop: 8,
  },
  linearProgressBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  linearProgressFill: {
    height: '100%',
    borderRadius: 5,
  },
  rewardSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rewardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rewardTextContainer: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rewardText: {
    fontSize: 17,
    fontWeight: '600',
  },
  rewardDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  actionSection: {
    marginTop: 8,
  },
  claimButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  claimButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  claimButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  completedText: {
    color: '#92E82A',
    fontSize: 17,
    fontWeight: '600',
  },
  inProgressBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  inProgressText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ChallengeDetailSheet;
