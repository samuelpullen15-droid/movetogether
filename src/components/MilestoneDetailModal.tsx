/**
 * MilestoneDetailModal
 *
 * Shows detailed information about a streak milestone including
 * reward preview, claim status, and celebration animations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Modal,
  Pressable,
  Image,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  X,
  Check,
  Lock,
  Gift,
  Award,
  Zap,
  Sparkles,
  Crown,
  Star,
  Flag,
  Mountain,
  Trophy,
  Clock,
  Calendar,
  User,
  MessageCircle,
  Smartphone,
  Frame,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import type { Milestone, MilestoneProgress, StreakRewardType } from '@/hooks/useStreak';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

interface MilestoneDetailModalProps {
  visible: boolean;
  milestone: Milestone | null;
  progress: MilestoneProgress | null;
  onClose: () => void;
  onClaimReward: (progressId: string) => void;
  currentStreak?: number;
}

// Reward type configurations
const REWARD_CONFIG: Record<
  StreakRewardType,
  {
    icon: React.ComponentType<any>;
    color: string;
    label: string;
  }
> = {
  badge: { icon: Award, color: '#FFD700', label: 'Exclusive Badge' },
  trial_mover: { icon: Zap, color: '#FF6B35', label: 'Mover Trial' },
  trial_coach: { icon: Sparkles, color: '#9B59B6', label: 'Coach Spark Trial' },
  trial_crusher: { icon: Crown, color: '#E74C3C', label: 'Crusher Trial' },
  profile_frame: { icon: Frame, color: '#3498DB', label: 'Profile Frame' },
  leaderboard_flair: { icon: Flag, color: '#2ECC71', label: 'Leaderboard Flair' },
  app_icon: { icon: Smartphone, color: '#1ABC9C', label: 'Exclusive App Icon' },
  points_multiplier: { icon: Trophy, color: '#F39C12', label: 'Points Multiplier' },
  custom: { icon: Gift, color: '#E91E63', label: 'Special Reward' },
};

// ============================================================================
// CONFETTI COMPONENT
// ============================================================================

function ConfettiPiece({
  color,
  startX,
  startY,
  delay,
}: {
  color: string;
  startX: number;
  startY: number;
  delay: number;
}) {
  const translateY = useSharedValue(startY);
  const translateX = useSharedValue(startX);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0);

  useEffect(() => {
    const randomXDrift = (Math.random() - 0.5) * 200;
    const randomYDrift = -Math.random() * 300 - 100;
    const randomRotation = Math.random() * 720 - 360;

    scale.value = withDelay(delay, withSpring(1, { damping: 8 }));

    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(startY + randomYDrift, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withTiming(startY + 400, { duration: 1200, easing: Easing.in(Easing.quad) })
      )
    );

    translateX.value = withDelay(
      delay,
      withTiming(startX + randomXDrift, { duration: 1800, easing: Easing.out(Easing.quad) })
    );

    rotate.value = withDelay(
      delay,
      withTiming(randomRotation, { duration: 1800, easing: Easing.linear })
    );

    opacity.value = withDelay(delay + 1400, withTiming(0, { duration: 400 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const size = Math.random() * 10 + 6;
  const isCircle = Math.random() > 0.5;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: isCircle ? size : size * 1.5,
          backgroundColor: color,
          borderRadius: isCircle ? size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
}

function CelebrationConfetti({ trigger, centerX, centerY }: { trigger: boolean; centerX: number; centerY: number }) {
  const [pieces, setPieces] = useState<
    Array<{ id: number; color: string; startX: number; startY: number; delay: number }>
  >([]);

  const colors = ['#FA114F', '#FFD700', '#00D4FF', '#92E82A', '#FF6B35', '#9B59B6', '#FFFFFF'];

  useEffect(() => {
    if (trigger) {
      const newPieces = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        color: colors[Math.floor(Math.random() * colors.length)],
        startX: centerX + (Math.random() - 0.5) * 40,
        startY: centerY,
        delay: Math.random() * 200,
      }));
      setPieces(newPieces);

      // Clear after animation
      const timer = setTimeout(() => setPieces([]), 2500);
      return () => clearTimeout(timer);
    } else {
      setPieces([]);
    }
  }, [trigger, centerX, centerY]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPiece
          key={piece.id}
          color={piece.color}
          startX={piece.startX}
          startY={piece.startY}
          delay={piece.delay}
        />
      ))}
    </View>
  );
}

// ============================================================================
// REWARD PREVIEW COMPONENTS
// ============================================================================

interface RewardPreviewProps {
  milestone: Milestone;
  colors: ReturnType<typeof useThemeColors>;
}

function BadgePreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;
  const badgeName = rewardValue?.badge_name || 'Achievement Badge';
  const badgeTier = rewardValue?.badge_tier || 'gold';

  const tierColors: Record<string, { bg: string; border: string }> = {
    bronze: { bg: '#CD7F32', border: '#8B4513' },
    silver: { bg: '#C0C0C0', border: '#808080' },
    gold: { bg: '#FFD700', border: '#DAA520' },
    platinum: { bg: '#E5E4E2', border: '#A0A0A0' },
  };

  const tier = tierColors[badgeTier] || tierColors.gold;

  return (
    <View style={styles.previewContainer}>
      <View style={[styles.badgePreview, { backgroundColor: tier.bg, borderColor: tier.border }]}>
        <Award size={32} color="#FFFFFF" />
      </View>
      <Text className="font-semibold" style={[styles.previewLabel, { color: colors.text }]}>
        {badgeName}
      </Text>
      <Text style={[styles.previewSubLabel, { color: colors.textSecondary }]}>
        {badgeTier.charAt(0).toUpperCase() + badgeTier.slice(1)} tier badge
      </Text>
    </View>
  );
}

function TrialPreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;
  const trialDays = rewardValue?.trial_days || 1;
  const trialHours = trialDays * 24;

  const getTrialDescription = () => {
    switch (milestone.reward_type) {
      case 'trial_mover':
        return {
          title: `${trialHours}-Hour Mover Access`,
          features: ['Unlimited competitions', 'Detailed analytics', 'Priority support'],
          icon: Zap,
          gradient: ['#FF6B35', '#FF8F5C'],
        };
      case 'trial_coach':
        return {
          title: `${trialHours}-Hour Coach Spark`,
          features: ['AI-powered coaching', 'Personalized advice', 'Workout suggestions'],
          icon: Sparkles,
          gradient: ['#9B59B6', '#B07CC6'],
        };
      case 'trial_crusher':
        return {
          title: `${trialHours}-Hour Crusher Access`,
          features: ['All Mover features', 'Unlimited AI coaching', 'Exclusive content'],
          icon: Crown,
          gradient: ['#E74C3C', '#EC7063'],
        };
      default:
        return {
          title: 'Trial Access',
          features: ['Premium features'],
          icon: Gift,
          gradient: ['#3498DB', '#5DADE2'],
        };
    }
  };

  const trial = getTrialDescription();
  const TrialIcon = trial.icon;

  return (
    <View style={styles.previewContainer}>
      <LinearGradient
        colors={trial.gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.trialPreviewCard}
      >
        <TrialIcon size={28} color="#FFFFFF" />
        <Text className="font-bold" style={styles.trialTitle}>
          {trial.title}
        </Text>
      </LinearGradient>

      <View style={styles.trialFeatures}>
        {trial.features.map((feature, index) => (
          <View key={index} style={styles.trialFeatureRow}>
            <Check size={14} color="#22C55E" strokeWidth={3} />
            <Text style={[styles.trialFeatureText, { color: colors.textSecondary }]}>
              {feature}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProfileFramePreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;
  const frameName = rewardValue?.frame_name || 'Exclusive Frame';
  const frameRarity = rewardValue?.frame_rarity || 'rare';

  const rarityColors: Record<string, string> = {
    common: '#9CA3AF',
    uncommon: '#22C55E',
    rare: '#3B82F6',
    epic: '#9B59B6',
    legendary: '#FFD700',
  };

  return (
    <View style={styles.previewContainer}>
      <View style={styles.framePreviewContainer}>
        {/* Sample avatar with frame */}
        <View
          style={[
            styles.framePreview,
            {
              borderColor: rarityColors[frameRarity] || rarityColors.rare,
              borderWidth: 4,
            },
          ]}
        >
          <View style={[styles.sampleAvatar, { backgroundColor: colors.accent }]}>
            <User size={24} color="#FFFFFF" />
          </View>
        </View>
        {/* Frame glow effect */}
        <View
          style={[
            styles.frameGlow,
            { backgroundColor: rarityColors[frameRarity] || rarityColors.rare },
          ]}
        />
      </View>
      <Text className="font-semibold" style={[styles.previewLabel, { color: colors.text }]}>
        {frameName}
      </Text>
      <Text
        style={[
          styles.previewSubLabel,
          { color: rarityColors[frameRarity] || colors.textSecondary },
        ]}
      >
        {frameRarity.charAt(0).toUpperCase() + frameRarity.slice(1)} frame
      </Text>
    </View>
  );
}

function LeaderboardFlairPreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;
  const flairName = rewardValue?.flair_name || 'Special Flair';
  const flairColor = rewardValue?.flair_color || '#FFD700';
  const isPermanent = rewardValue?.flair_permanent || false;

  return (
    <View style={styles.previewContainer}>
      <View style={[styles.flairPreviewCard, { backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }]}>
        {/* Simulated leaderboard row */}
        <View style={styles.flairLeaderboardRow}>
          <Text className="font-bold" style={[styles.flairRank, { color: colors.text }]}>
            #1
          </Text>
          <View style={[styles.flairAvatar, { backgroundColor: colors.accent }]}>
            <User size={14} color="#FFFFFF" />
          </View>
          <Text className="font-semibold" style={[styles.flairUsername, { color: colors.text }]}>
            YourName
          </Text>
          {/* The flair */}
          <View style={[styles.flairBadge, { backgroundColor: flairColor }]}>
            <Flag size={10} color="#FFFFFF" />
          </View>
        </View>
      </View>
      <Text className="font-semibold" style={[styles.previewLabel, { color: colors.text }]}>
        {flairName}
      </Text>
      <Text style={[styles.previewSubLabel, { color: colors.textSecondary }]}>
        {isPermanent ? 'Permanent flair' : 'Limited time flair'}
      </Text>
    </View>
  );
}

function AppIconPreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;
  const iconName = rewardValue?.icon_name || 'Exclusive Icon';
  const iconRarity = rewardValue?.icon_rarity || 'rare';

  const rarityGradients: Record<string, [string, string]> = {
    rare: ['#3B82F6', '#1D4ED8'],
    epic: ['#9B59B6', '#7D3C98'],
    legendary: ['#FFD700', '#F59E0B'],
  };

  return (
    <View style={styles.previewContainer}>
      <LinearGradient
        colors={rarityGradients[iconRarity] || rarityGradients.rare}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.appIconPreview}
      >
        <Mountain size={36} color="#FFFFFF" />
      </LinearGradient>
      <Text className="font-semibold" style={[styles.previewLabel, { color: colors.text }]}>
        {iconName}
      </Text>
      <Text style={[styles.previewSubLabel, { color: colors.textSecondary }]}>
        {iconRarity.charAt(0).toUpperCase() + iconRarity.slice(1)} app icon
      </Text>
    </View>
  );
}

function CustomRewardPreview({ milestone, colors }: RewardPreviewProps) {
  const rewardValue = milestone.reward_value as Record<string, any>;

  // Custom rewards can have multiple components
  const hasBadge = rewardValue?.badge_id;
  const hasTrial = rewardValue?.trial_days;
  const hasFlair = rewardValue?.flair_id;
  const hasFrame = rewardValue?.frame_id;

  const components = [];
  if (hasBadge) components.push('Badge');
  if (hasTrial) components.push(`${rewardValue.trial_days * 24}h Trial`);
  if (hasFlair) components.push('Flair');
  if (hasFrame) components.push('Frame');

  return (
    <View style={styles.previewContainer}>
      <View style={[styles.customRewardCard, { backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }]}>
        <View style={styles.customRewardIcons}>
          {hasBadge && <Award size={24} color="#FFD700" />}
          {hasTrial && <Zap size={24} color="#FF6B35" />}
          {hasFlair && <Flag size={24} color="#22C55E" />}
          {hasFrame && <Frame size={24} color="#3B82F6" />}
        </View>
      </View>
      <Text className="font-semibold" style={[styles.previewLabel, { color: colors.text }]}>
        Multi-Reward Package
      </Text>
      <Text style={[styles.previewSubLabel, { color: colors.textSecondary }]}>
        {components.join(' + ')}
      </Text>
    </View>
  );
}

// Reward preview selector
function RewardPreview({ milestone, colors }: RewardPreviewProps) {
  switch (milestone.reward_type) {
    case 'badge':
      return <BadgePreview milestone={milestone} colors={colors} />;
    case 'trial_mover':
    case 'trial_coach':
    case 'trial_crusher':
      return <TrialPreview milestone={milestone} colors={colors} />;
    case 'profile_frame':
      return <ProfileFramePreview milestone={milestone} colors={colors} />;
    case 'leaderboard_flair':
      return <LeaderboardFlairPreview milestone={milestone} colors={colors} />;
    case 'app_icon':
      return <AppIconPreview milestone={milestone} colors={colors} />;
    case 'custom':
      return <CustomRewardPreview milestone={milestone} colors={colors} />;
    default:
      return <BadgePreview milestone={milestone} colors={colors} />;
  }
}

// ============================================================================
// PROGRESS INDICATOR
// ============================================================================

interface ProgressIndicatorProps {
  currentStreak: number;
  targetDay: number;
  colors: ReturnType<typeof useThemeColors>;
}

function ProgressIndicator({ currentStreak, targetDay, colors }: ProgressIndicatorProps) {
  const progress = Math.min(currentStreak / targetDay, 1);
  const daysRemaining = Math.max(targetDay - currentStreak, 0);

  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withDelay(300, withSpring(progress, { damping: 15 }));
  }, [progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Progress to unlock</Text>
        <Text className="font-bold" style={[styles.progressValue, { color: colors.text }]}>
          {currentStreak} / {targetDay} days
        </Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: colors.accent }, progressStyle]} />
      </View>

      <View style={styles.progressFooter}>
        <Clock size={14} color={colors.textSecondary} />
        <Text style={[styles.progressDaysText, { color: colors.textSecondary }]}>
          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// CLAIM STATUS SECTION
// ============================================================================

interface ClaimStatusProps {
  progress: MilestoneProgress;
  onClaim: () => void;
  colors: ReturnType<typeof useThemeColors>;
}

function ClaimStatus({ progress, onClaim, colors }: ClaimStatusProps) {
  const pulseScale = useSharedValue(1);

  // Pulse animation for claimable rewards
  useEffect(() => {
    if (!progress.reward_claimed) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [progress.reward_claimed]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Check if trial is active
  const isTrialActive =
    progress.reward_expires_at && new Date(progress.reward_expires_at) > new Date();
  const trialExpiresAt = progress.reward_expires_at
    ? new Date(progress.reward_expires_at)
    : null;

  if (!progress.reward_claimed) {
    // Claimable
    return (
      <Animated.View style={[styles.claimContainer, pulseStyle]}>
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onClaim();
          }}
          style={({ pressed }) => [
            styles.claimButton,
            { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Gift size={22} color="#FFFFFF" />
          <Text className="font-bold" style={styles.claimButtonText}>
            Claim Your Reward
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  // Already claimed
  return (
    <View style={styles.claimedContainer}>
      <View style={[styles.claimedBadge, { backgroundColor: '#22C55E' }]}>
        <Check size={18} color="#FFFFFF" strokeWidth={3} />
        <Text className="font-bold" style={styles.claimedText}>
          Claimed
        </Text>
      </View>

      {progress.reward_claimed_at && (
        <Text style={[styles.claimedDate, { color: colors.textSecondary }]}>
          on {new Date(progress.reward_claimed_at).toLocaleDateString()}
        </Text>
      )}

      {/* Show trial status if applicable */}
      {isTrialActive && trialExpiresAt && (
        <View style={[styles.trialActiveBox, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
          <Zap size={16} color="#22C55E" />
          <Text style={[styles.trialActiveText, { color: '#22C55E' }]}>
            Active until {trialExpiresAt.toLocaleString()}
          </Text>
        </View>
      )}

      {trialExpiresAt && !isTrialActive && progress.reward_expires_at && (
        <View style={[styles.trialExpiredBox, { backgroundColor: 'rgba(156, 163, 175, 0.1)' }]}>
          <Clock size={16} color={colors.textSecondary} />
          <Text style={[styles.trialExpiredText, { color: colors.textSecondary }]}>
            Trial expired
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MilestoneDetailModal({
  visible,
  milestone,
  progress,
  onClose,
  onClaimReward,
  currentStreak = 0,
}: MilestoneDetailModalProps) {
  const colors = useThemeColors();
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiCenter, setConfettiCenter] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });

  // Reset confetti when modal closes
  useEffect(() => {
    if (!visible) {
      setShowConfetti(false);
    }
  }, [visible]);

  if (!milestone) return null;

  const isEarned = progress !== null || currentStreak >= milestone.day_number;
  const rewardConfig = REWARD_CONFIG[milestone.reward_type] || REWARD_CONFIG.custom;
  const RewardIcon = rewardConfig.icon;

  // Icon glow animation for earned milestones
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isEarned && visible) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [isEarned, visible]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleClaim = () => {
    if (progress) {
      setShowConfetti(true);
      onClaimReward(progress.id);

      // Hide confetti after animation
      setTimeout(() => setShowConfetti(false), 2500);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
          <BlurView
            intensity={80}
            tint={colors.isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Pressable>

      {/* Content */}
      <View style={styles.modalContainer} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(15)}
          exiting={SlideOutDown.duration(200)}
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.card,
              borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          {/* Close button */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={[styles.closeButton, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F5F5F7' }]}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Main icon with glow */}
          <View style={styles.iconSection}>
            {isEarned && (
              <Animated.View
                style={[
                  styles.iconGlow,
                  { backgroundColor: rewardConfig.color },
                  glowStyle,
                ]}
              />
            )}
            <View
              style={[
                styles.mainIcon,
                {
                  backgroundColor: isEarned
                    ? rewardConfig.color
                    : colors.isDark
                      ? '#2C2C2E'
                      : '#E5E5EA',
                },
              ]}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                setConfettiCenter({ x: SCREEN_WIDTH / 2, y: y + height / 2 + 100 });
              }}
            >
              {isEarned ? (
                <RewardIcon size={44} color="#FFFFFF" />
              ) : (
                <Lock size={40} color={colors.textSecondary} />
              )}
            </View>
          </View>

          {/* Day badge */}
          <View style={[styles.dayBadge, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F5F5F7' }]}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text className="font-bold" style={[styles.dayBadgeText, { color: colors.text }]}>
              Day {milestone.day_number}
            </Text>
          </View>

          {/* Title */}
          <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
            {milestone.name}
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {milestone.description}
          </Text>

          {/* Reward preview */}
          <View style={styles.rewardSection}>
            <View style={styles.rewardHeader}>
              <Gift size={16} color={rewardConfig.color} />
              <Text className="font-semibold" style={[styles.rewardHeaderText, { color: rewardConfig.color }]}>
                {rewardConfig.label}
              </Text>
            </View>
            <RewardPreview milestone={milestone} colors={colors} />
          </View>

          {/* Status section */}
          {isEarned && progress ? (
            <ClaimStatus progress={progress} onClaim={handleClaim} colors={colors} />
          ) : (
            <ProgressIndicator
              currentStreak={currentStreak}
              targetDay={milestone.day_number}
              colors={colors}
            />
          )}

          {/* Repeatable indicator */}
          {milestone.is_repeatable && (
            <View style={[styles.repeatableNote, { backgroundColor: colors.isDark ? '#2C2C2E' : '#F5F5F7' }]}>
              <Text style={[styles.repeatableText, { color: colors.textSecondary }]}>
                This milestone repeats every {milestone.repeat_interval} days
              </Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Celebration confetti */}
      <CelebrationConfetti trigger={showConfetti} centerX={confettiCenter.x} centerY={confettiCenter.y} />
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Icon section
  iconSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  mainIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Day badge
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  dayBadgeText: {
    fontSize: 14,
  },

  // Title & description
  title: {
    fontSize: 26,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },

  // Reward section
  rewardSection: {
    width: '100%',
    marginBottom: 20,
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  rewardHeaderText: {
    fontSize: 14,
  },

  // Preview containers
  previewContainer: {
    alignItems: 'center',
  },

  // Badge preview
  badgePreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 2,
  },
  previewSubLabel: {
    fontSize: 12,
    textAlign: 'center',
  },

  // Trial preview
  trialPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  trialTitle: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  trialFeatures: {
    gap: 4,
  },
  trialFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trialFeatureText: {
    fontSize: 13,
  },

  // Frame preview
  framePreviewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  framePreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  sampleAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.2,
  },

  // Flair preview
  flairPreviewCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    width: '100%',
  },
  flairLeaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flairRank: {
    fontSize: 16,
    width: 28,
  },
  flairAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flairUsername: {
    fontSize: 14,
    flex: 1,
  },
  flairBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },

  // App icon preview
  appIconPreview: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  // Custom reward
  customRewardCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  customRewardIcons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },

  // Progress indicator
  progressContainer: {
    width: '100%',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
  },
  progressValue: {
    fontSize: 14,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  progressDaysText: {
    fontSize: 13,
  },

  // Claim section
  claimContainer: {
    width: '100%',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
  },
  claimButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
  },

  // Claimed section
  claimedContainer: {
    alignItems: 'center',
    width: '100%',
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
  },
  claimedText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  claimedDate: {
    fontSize: 12,
    marginTop: 6,
  },
  trialActiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  trialActiveText: {
    fontSize: 12,
  },
  trialExpiredBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  trialExpiredText: {
    fontSize: 12,
  },

  // Repeatable note
  repeatableNote: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  repeatableText: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default MilestoneDetailModal;
