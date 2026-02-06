/**
 * RewardClaimCelebrationModal
 *
 * A celebratory full-screen modal that displays when user claims a challenge reward.
 * Features confetti, glow animations, and haptic feedback.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Gift,
  Award,
  Zap,
  Sparkles,
  Crown,
  Trophy,
  Star,
  Check,
  LucideIcon,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import { Confetti } from './Confetti';

// ============================================================================
// TYPES
// ============================================================================

interface RewardClaimCelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  rewardType: string | null;
  rewardValue: Record<string, unknown>;
  challengeTitle: string;
}

// Reward type configurations
const REWARD_CONFIG: Record<
  string,
  {
    icon: LucideIcon;
    color: string;
    gradient: [string, string];
    label: string;
  }
> = {
  badge: { icon: Award, color: '#FFD700', gradient: ['#FFD700', '#FFA500'], label: 'Badge Unlocked' },
  trial_mover: { icon: Zap, color: '#FF6B35', gradient: ['#FF6B35', '#FF8F5C'], label: 'Mover Trial' },
  trial_crusher: { icon: Crown, color: '#E74C3C', gradient: ['#E74C3C', '#EC7063'], label: 'Crusher Trial' },
  cosmetic: { icon: Star, color: '#9B59B6', gradient: ['#9B59B6', '#B07CC6'], label: 'Cosmetic Unlocked' },
  achievement_boost: { icon: Sparkles, color: '#3498DB', gradient: ['#3498DB', '#5DADE2'], label: 'Achievement Boost' },
  default: { icon: Gift, color: '#FA114F', gradient: ['#FA114F', '#FF5C8D'], label: 'Reward Claimed' },
};

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
// MAIN COMPONENT
// ============================================================================

export function RewardClaimCelebrationModal({
  visible,
  onClose,
  rewardType,
  rewardValue,
  challengeTitle,
}: RewardClaimCelebrationModalProps) {
  const colors = useThemeColors();
  const [showConfetti, setShowConfetti] = useState(false);
  const hasTriggeredHaptics = useRef(false);

  // Icon animation values
  const iconScale = useSharedValue(0);
  const iconRotation = useSharedValue(0);

  // Get reward configuration
  const config = REWARD_CONFIG[rewardType || ''] || REWARD_CONFIG.default;
  const RewardIcon = config.icon;

  // Get reward description
  const getRewardDescription = () => {
    if (!rewardType) return 'Your reward has been claimed!';

    switch (rewardType) {
      case 'trial_mover':
        const moverDays = (rewardValue?.trial_days as number) || 3;
        return `You've unlocked ${moverDays} days of Mover features!`;
      case 'trial_crusher':
        const crusherDays = (rewardValue?.trial_days as number) || 1;
        return `You've unlocked ${crusherDays} day${crusherDays > 1 ? 's' : ''} of Crusher features!`;
      case 'badge':
        const badgeId = (rewardValue?.badge_id as string) || '';
        return `You've earned the ${formatName(badgeId)} badge!`;
      case 'cosmetic':
        const cosmeticId = (rewardValue?.cosmetic_id as string) || '';
        return `You've unlocked ${formatName(cosmeticId)}!`;
      case 'achievement_boost':
        const bonus = (rewardValue?.bonus as number) || 0;
        return `+${bonus.toLocaleString()} progress added to your achievement!`;
      default:
        return 'Your reward has been claimed!';
    }
  };

  // Trigger animations and haptics when modal becomes visible
  useEffect(() => {
    if (visible) {
      hasTriggeredHaptics.current = false;

      // Trigger haptics
      setTimeout(() => {
        if (!hasTriggeredHaptics.current) {
          hasTriggeredHaptics.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
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
  }, [visible]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconRotation.value}deg` }],
  }));

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
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
        {showConfetti && <Confetti count={80} />}

        {/* Content */}
        <View style={styles.content}>
          {/* Tap to dismiss area */}
          <Pressable onPress={handleDismiss} style={styles.closeArea} />

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Text style={styles.celebrationEmoji}>🎊</Text>
            <Text className="font-bold" style={[styles.headerText, { color: colors.text }]}>
              Challenge Complete!
            </Text>
          </Animated.View>

          {/* Challenge title */}
          <Animated.View entering={FadeIn.delay(200)}>
            <Text style={[styles.challengeTitle, { color: colors.textSecondary }]}>
              {challengeTitle}
            </Text>
          </Animated.View>

          {/* Main icon with glow */}
          <View style={styles.iconSection}>
            <GlowRings color={config.color} />

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
                colors={config.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainIcon}
              >
                <RewardIcon size={56} color="#FFFFFF" />
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Reward label */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <Text className="font-bold" style={[styles.rewardLabel, { color: config.color }]}>
              {config.label}
            </Text>
          </Animated.View>

          {/* Reward description */}
          <Animated.View entering={FadeInUp.delay(500).springify()}>
            <Text style={[styles.rewardDescription, { color: colors.text }]}>
              {getRewardDescription()}
            </Text>
          </Animated.View>

          {/* Dismiss button */}
          <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.buttonContainer}>
            <Pressable
              onPress={handleDismiss}
              style={({ pressed }) => [
                styles.dismissButton,
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <LinearGradient
                colors={config.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.dismissButtonGradient}
              >
                <Check size={22} color="#FFFFFF" strokeWidth={3} />
                <Text className="font-bold" style={styles.dismissButtonText}>
                  Awesome!
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

// Helper function
function formatName(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
    marginBottom: 8,
  },
  celebrationEmoji: {
    fontSize: 32,
  },
  headerText: {
    fontSize: 24,
  },
  challengeTitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
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

  // Reward info
  rewardLabel: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rewardDescription: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 10,
  },

  // Button
  buttonContainer: {
    width: '100%',
  },
  dismissButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  dismissButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  dismissButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
});

export default RewardClaimCelebrationModal;
