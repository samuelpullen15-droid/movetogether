/**
 * StreakCelebrationModal
 *
 * A celebratory full-screen modal that displays when user earns a new milestone.
 * Features confetti, animations, and haptic feedback for maximum excitement!
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Gift,
  Award,
  Zap,
  Sparkles,
  Crown,
  Star,
  Flag,
  Mountain,
  Trophy,
  Flame,
  ChevronRight,
  PartyPopper,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import type { Milestone, NextMilestone } from '@/hooks/useStreak';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

interface StreakCelebrationModalProps {
  visible: boolean;
  milestone: Milestone | null;
  currentStreak: number;
  nextMilestone?: NextMilestone | null;
  onClose: () => void;
  onClaimReward: () => void;
}

// Reward type configurations
const REWARD_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<any>;
    color: string;
    gradient: [string, string];
    label: string;
  }
> = {
  badge: { icon: Award, color: '#FFD700', gradient: ['#FFD700', '#FFA500'], label: 'Exclusive Badge' },
  trial_mover: { icon: Zap, color: '#FF6B35', gradient: ['#FF6B35', '#FF8F5C'], label: 'Mover Trial' },
  trial_coach: { icon: Sparkles, color: '#9B59B6', gradient: ['#9B59B6', '#B07CC6'], label: 'Coach Spark Trial' },
  trial_crusher: { icon: Crown, color: '#E74C3C', gradient: ['#E74C3C', '#EC7063'], label: 'Crusher Trial' },
  profile_frame: { icon: Star, color: '#3498DB', gradient: ['#3498DB', '#5DADE2'], label: 'Profile Frame' },
  leaderboard_flair: { icon: Flag, color: '#2ECC71', gradient: ['#2ECC71', '#58D68D'], label: 'Leaderboard Flair' },
  app_icon: { icon: Mountain, color: '#1ABC9C', gradient: ['#1ABC9C', '#48C9B0'], label: 'Exclusive App Icon' },
  points_multiplier: { icon: Trophy, color: '#F39C12', gradient: ['#F39C12', '#F5B041'], label: 'Points Multiplier' },
  custom: { icon: Gift, color: '#E91E63', gradient: ['#E91E63', '#F48FB1'], label: 'Special Reward' },
};

// ============================================================================
// CONFETTI SYSTEM
// ============================================================================

interface ConfettiPieceProps {
  id: number;
  color: string;
  startX: number;
  delay: number;
  size: number;
  isCircle: boolean;
}

function ConfettiPiece({ color, startX, delay, size, isCircle }: ConfettiPieceProps) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(startX);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const randomXDrift = (Math.random() - 0.5) * 150;
    const randomRotation = Math.random() * 1080 - 540;
    const duration = 3000 + Math.random() * 1500;

    opacity.value = withDelay(delay, withTiming(1, { duration: 100 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 8 }));

    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: duration,
        easing: Easing.out(Easing.quad),
      })
    );

    translateX.value = withDelay(
      delay,
      withTiming(startX + randomXDrift, {
        duration: duration,
        easing: Easing.inOut(Easing.sin),
      })
    );

    rotate.value = withDelay(
      delay,
      withTiming(randomRotation, {
        duration: duration,
        easing: Easing.linear,
      })
    );

    opacity.value = withDelay(delay + duration * 0.7, withTiming(0, { duration: duration * 0.3 }));
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

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: isCircle ? size : size * 2,
          backgroundColor: color,
          borderRadius: isCircle ? size / 2 : 3,
        },
        animatedStyle,
      ]}
    />
  );
}

function CelebrationConfetti({ trigger }: { trigger: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPieceProps[]>([]);

  const colors = [
    '#FA114F', '#FFD700', '#00D4FF', '#92E82A', '#FF6B35',
    '#9B59B6', '#FFFFFF', '#F39C12', '#E74C3C', '#3498DB',
  ];

  useEffect(() => {
    if (trigger) {
      // Create multiple waves of confetti
      const allPieces: ConfettiPieceProps[] = [];

      // Wave 1 - burst from center
      for (let i = 0; i < 60; i++) {
        allPieces.push({
          id: i,
          color: colors[Math.floor(Math.random() * colors.length)],
          startX: SCREEN_WIDTH / 2 + (Math.random() - 0.5) * 100,
          delay: Math.random() * 300,
          size: Math.random() * 10 + 6,
          isCircle: Math.random() > 0.5,
        });
      }

      // Wave 2 - rain from top
      for (let i = 60; i < 120; i++) {
        allPieces.push({
          id: i,
          color: colors[Math.floor(Math.random() * colors.length)],
          startX: Math.random() * SCREEN_WIDTH,
          delay: 500 + Math.random() * 500,
          size: Math.random() * 8 + 4,
          isCircle: Math.random() > 0.5,
        });
      }

      // Wave 3 - more rain
      for (let i = 120; i < 180; i++) {
        allPieces.push({
          id: i,
          color: colors[Math.floor(Math.random() * colors.length)],
          startX: Math.random() * SCREEN_WIDTH,
          delay: 1000 + Math.random() * 500,
          size: Math.random() * 8 + 4,
          isCircle: Math.random() > 0.5,
        });
      }

      setPieces(allPieces);
    } else {
      setPieces([]);
    }
  }, [trigger]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.id} {...piece} />
      ))}
    </View>
  );
}

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  delay?: number;
  style?: any;
}

function AnimatedCounter({ value, duration = 1500, delay = 0, style }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withDelay(
      delay,
      withTiming(value, {
        duration,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Update display value periodically
    const interval = setInterval(() => {
      const currentVal = Math.round(animatedValue.value);
      setDisplayValue(currentVal);
    }, 16);

    const timeout = setTimeout(() => {
      setDisplayValue(value);
      clearInterval(interval);
    }, delay + duration + 100);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [value, delay, duration]);

  return (
    <Text className="font-bold" style={style}>
      {displayValue}
    </Text>
  );
}

// ============================================================================
// SPARKLE EFFECTS
// ============================================================================

function SparkleEffect({ delay = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const rotation = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        true
      )
    );

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600 }),
          withTiming(0.8, { duration: 600 })
        ),
        -1,
        true
      )
    );

    rotation.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 4000, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.sparkle, animatedStyle]}>
      <Sparkles size={16} color="#FFD700" />
    </Animated.View>
  );
}

// ============================================================================
// GLOW RING ANIMATION
// ============================================================================

function GlowRings({ color }: { color: string }) {
  const ring1Scale = useSharedValue(1);
  const ring2Scale = useSharedValue(1);
  const ring3Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.6);
  const ring2Opacity = useSharedValue(0.4);
  const ring3Opacity = useSharedValue(0.2);

  useEffect(() => {
    // Ring 1
    ring1Scale.value = withRepeat(
      withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    ring1Opacity.value = withRepeat(
      withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );

    // Ring 2 (delayed)
    ring2Scale.value = withDelay(
      666,
      withRepeat(
        withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );
    ring2Opacity.value = withDelay(
      666,
      withRepeat(
        withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );

    // Ring 3 (more delayed)
    ring3Scale.value = withDelay(
      1333,
      withRepeat(
        withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );
    ring3Opacity.value = withDelay(
      1333,
      withRepeat(
        withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );
  }, []);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: ring3Opacity.value,
  }));

  return (
    <>
      <Animated.View style={[styles.glowRing, { borderColor: color }, ring1Style]} />
      <Animated.View style={[styles.glowRing, { borderColor: color }, ring2Style]} />
      <Animated.View style={[styles.glowRing, { borderColor: color }, ring3Style]} />
    </>
  );
}

// ============================================================================
// REWARD PREVIEW
// ============================================================================

interface RewardPreviewProps {
  milestone: Milestone;
  colors: ReturnType<typeof useThemeColors>;
}

function RewardPreview({ milestone, colors }: RewardPreviewProps) {
  const rewardConfig = REWARD_CONFIG[milestone.reward_type] || REWARD_CONFIG.custom;
  const RewardIcon = rewardConfig.icon;
  const rewardValue = milestone.reward_value as Record<string, any>;

  const getRewardDescription = () => {
    switch (milestone.reward_type) {
      case 'trial_mover':
        return `${(rewardValue?.trial_days || 1) * 24} hours of Mover features`;
      case 'trial_coach':
        return `${(rewardValue?.trial_days || 1) * 24} hours of AI coaching`;
      case 'trial_crusher':
        return `${(rewardValue?.trial_days || 1) * 24} hours of all premium features`;
      case 'badge':
        return rewardValue?.badge_name || 'Achievement badge';
      case 'profile_frame':
        return rewardValue?.frame_name || 'Exclusive profile frame';
      case 'leaderboard_flair':
        return rewardValue?.flair_permanent ? 'Permanent leaderboard flair' : 'Special leaderboard flair';
      case 'app_icon':
        return rewardValue?.icon_name || 'Exclusive app icon';
      case 'custom':
        const parts = [];
        if (rewardValue?.badge_id) parts.push('Badge');
        if (rewardValue?.trial_days) parts.push(`${rewardValue.trial_days * 24}h trial`);
        if (rewardValue?.flair_id) parts.push('Flair');
        return parts.join(' + ') || 'Special reward package';
      default:
        return 'Special reward';
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.rewardPreview}>
      <LinearGradient
        colors={[`${rewardConfig.color}20`, `${rewardConfig.color}05`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.rewardCard, { borderColor: `${rewardConfig.color}40` }]}
      >
        <View style={[styles.rewardIconContainer, { backgroundColor: rewardConfig.color }]}>
          <RewardIcon size={24} color="#FFFFFF" />
        </View>
        <View style={styles.rewardTextContainer}>
          <Text className="font-bold" style={[styles.rewardLabel, { color: rewardConfig.color }]}>
            {rewardConfig.label}
          </Text>
          <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
            {getRewardDescription()}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StreakCelebrationModal({
  visible,
  milestone,
  currentStreak,
  nextMilestone,
  onClose,
  onClaimReward,
}: StreakCelebrationModalProps) {
  const colors = useThemeColors();
  const [showConfetti, setShowConfetti] = useState(false);
  const hasTriggeredHaptics = useRef(false);

  // Icon animation values
  const iconScale = useSharedValue(0);
  const iconRotation = useSharedValue(0);

  // Trigger animations and haptics when modal becomes visible
  useEffect(() => {
    if (visible && milestone) {
      hasTriggeredHaptics.current = false;

      // Trigger haptics
      setTimeout(() => {
        if (!hasTriggeredHaptics.current) {
          hasTriggeredHaptics.current = true;
          // Heavy celebration haptics
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
          setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 350);
        }
      }, 200);

      // Confetti
      setShowConfetti(true);

      // Icon animation
      iconScale.value = 0;
      iconRotation.value = -15;

      iconScale.value = withDelay(
        300,
        withSequence(
          withSpring(1.3, { damping: 6, stiffness: 100 }),
          withSpring(1, { damping: 10, stiffness: 100 })
        )
      );

      iconRotation.value = withDelay(
        300,
        withSequence(
          withTiming(15, { duration: 100 }),
          withTiming(-10, { duration: 100 }),
          withTiming(8, { duration: 100 }),
          withTiming(-5, { duration: 100 }),
          withTiming(0, { duration: 100 })
        )
      );
    } else {
      setShowConfetti(false);
      iconScale.value = 0;
    }
  }, [visible, milestone]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconRotation.value}deg` }],
  }));

  if (!milestone) return null;

  const rewardConfig = REWARD_CONFIG[milestone.reward_type] || REWARD_CONFIG.custom;
  const RewardIcon = rewardConfig.icon;

  const handleClaimPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClaimReward();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Background */}
      <View style={styles.container}>
        <BlurView
          intensity={90}
          tint={colors.isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={
            colors.isDark
              ? ['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']
              : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.95)']
          }
          style={StyleSheet.absoluteFill}
        />

        {/* Confetti */}
        <CelebrationConfetti trigger={showConfetti} />

        {/* Content */}
        <View style={styles.content}>
          {/* Close button (subtle) */}
          <Pressable onPress={onClose} style={styles.closeArea} />

          {/* Party header */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Text style={styles.partyEmoji}>🎉</Text>
            <Text className="font-bold" style={[styles.headerText, { color: colors.text }]}>
              Milestone Reached!
            </Text>
          </Animated.View>

          {/* Main icon with glow */}
          <View style={styles.iconSection}>
            <GlowRings color={rewardConfig.color} />

            {/* Sparkles */}
            <View style={[styles.sparkleContainer, { top: -20, left: 20 }]}>
              <SparkleEffect delay={0} />
            </View>
            <View style={[styles.sparkleContainer, { top: 10, right: 10 }]}>
              <SparkleEffect delay={200} />
            </View>
            <View style={[styles.sparkleContainer, { bottom: 0, left: -10 }]}>
              <SparkleEffect delay={400} />
            </View>
            <View style={[styles.sparkleContainer, { bottom: -15, right: 20 }]}>
              <SparkleEffect delay={600} />
            </View>

            <Animated.View style={iconAnimatedStyle}>
              <LinearGradient
                colors={rewardConfig.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainIcon}
              >
                <RewardIcon size={56} color="#FFFFFF" />
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Milestone name */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <Text className="font-bold" style={[styles.milestoneName, { color: colors.text }]}>
              {milestone.name}
            </Text>
          </Animated.View>

          {/* Streak count */}
          <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.streakContainer}>
            <Flame size={32} color="#FF6B35" fill="#FF6B35" />
            <View style={styles.streakTextContainer}>
              <AnimatedCounter value={currentStreak} delay={600} style={[styles.streakNumber, { color: colors.text }]} />
              <Text className="font-semibold" style={[styles.streakLabel, { color: colors.textSecondary }]}>
                Day Streak!
              </Text>
            </View>
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeIn.delay(550)}>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {milestone.description}
            </Text>
          </Animated.View>

          {/* Reward preview */}
          <RewardPreview milestone={milestone} colors={colors} />

          {/* Claim button */}
          <Animated.View entering={FadeInUp.delay(700).springify()} style={styles.buttonContainer}>
            <Pressable
              onPress={handleClaimPress}
              style={({ pressed }) => [
                styles.claimButton,
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <LinearGradient
                colors={[rewardConfig.color, rewardConfig.gradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.claimButtonGradient}
              >
                <Gift size={22} color="#FFFFFF" />
                <Text className="font-bold" style={styles.claimButtonText}>
                  Claim Reward
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Next milestone hint */}
          {nextMilestone && (
            <Animated.View entering={FadeIn.delay(900)} style={styles.nextMilestoneContainer}>
              <Text style={[styles.nextMilestoneText, { color: colors.textSecondary }]}>
                Next: <Text className="font-semibold" style={{ color: colors.text }}>{nextMilestone.name}</Text> in{' '}
                <Text className="font-semibold" style={{ color: colors.accent }}>{nextMilestone.days_away} days</Text>
              </Text>
              <ChevronRight size={16} color={colors.textSecondary} />
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 400,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  partyEmoji: {
    fontSize: 32,
  },
  headerText: {
    fontSize: 24,
  },

  // Icon section
  iconSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 160,
    marginBottom: 24,
  },
  mainIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  glowRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
  },
  sparkleContainer: {
    position: 'absolute',
  },
  sparkle: {
    width: 24,
    height: 24,
  },

  // Milestone name
  milestoneName: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Streak
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  streakTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  streakNumber: {
    fontSize: 48,
    lineHeight: 52,
  },
  streakLabel: {
    fontSize: 20,
  },

  // Description
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },

  // Reward preview
  rewardPreview: {
    width: '100%',
    marginBottom: 24,
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  rewardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  rewardLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  rewardDescription: {
    fontSize: 15,
  },

  // Button
  buttonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  claimButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  claimButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  claimButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
  },

  // Next milestone
  nextMilestoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nextMilestoneText: {
    fontSize: 14,
  },
});

export default StreakCelebrationModal;
