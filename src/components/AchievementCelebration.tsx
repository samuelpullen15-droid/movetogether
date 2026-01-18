import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  FadeIn,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { AchievementMedal } from './AchievementMedal';
import { AchievementTier, TIER_CONFIG } from '@/lib/achievements-types';
import { getAchievementById } from '@/lib/achievement-definitions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Confetti piece component
function ConfettiPiece({ 
  color, 
  startX, 
  delay,
  duration,
}: { 
  color: string; 
  startX: number; 
  delay: number;
  duration: number;
}) {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(startX);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    const randomXDrift = (Math.random() - 0.5) * 100;
    const randomRotation = Math.random() * 720 - 360;
    
    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 50, {
        duration: duration,
        easing: Easing.linear,
      })
    );
    
    translateX.value = withDelay(
      delay,
      withTiming(startX + randomXDrift, {
        duration: duration,
        easing: Easing.out(Easing.quad),
      })
    );
    
    rotate.value = withDelay(
      delay,
      withTiming(randomRotation, {
        duration: duration,
        easing: Easing.linear,
      })
    );
    
    opacity.value = withDelay(
      delay + duration * 0.7,
      withTiming(0, { duration: duration * 0.3 })
    );
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

  const size = Math.random() * 8 + 6;
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
          top: 0,
        },
        animatedStyle,
      ]}
    />
  );
}

// Confetti container
function ConfettiExplosion({ 
  colors, 
  count = 100,
  trigger,
}: { 
  colors: string[]; 
  count?: number;
  trigger: boolean;
}) {
  const [pieces, setPieces] = useState<Array<{ id: number; color: string; startX: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    if (trigger) {
      const newPieces = Array.from({ length: count }, (_, i) => ({
        id: i,
        color: colors[Math.floor(Math.random() * colors.length)],
        startX: Math.random() * SCREEN_WIDTH,
        delay: Math.random() * 500,
        duration: 2500 + Math.random() * 1500,
      }));
      setPieces(newPieces);
    } else {
      setPieces([]);
    }
  }, [trigger, count, colors]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPiece
          key={piece.id}
          color={piece.color}
          startX={piece.startX}
          delay={piece.delay}
          duration={piece.duration}
        />
      ))}
    </View>
  );
}

interface AchievementCelebrationProps {
  visible: boolean;
  achievementId: string;
  tier: AchievementTier;
  onClose: () => void;
}

export function AchievementCelebration({
  visible,
  achievementId,
  tier,
  onClose,
}: AchievementCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0);

  const achievement = getAchievementById(achievementId);
  const tierConfig = TIER_CONFIG[tier];

  const triggerHaptics = useCallback(() => {
    if (tier === 'platinum') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 300);
    } else if (tier === 'gold') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 300);
    } else if (tier === 'silver') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 150);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [tier]);

  useEffect(() => {
    if (visible) {
      scale.value = 0;
      rotation.value = 0;
      opacity.value = 0;
      setShowConfetti(false);

      triggerHaptics();

      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 100 }),
        withSpring(1, { damping: 12, stiffness: 100 })
      );
      rotation.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-5, { duration: 100 }),
        withTiming(5, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );

      // Fire confetti for gold and platinum
      if (tier === 'gold' || tier === 'platinum') {
        setTimeout(() => {
          setShowConfetti(true);
        }, 400);
      }
    } else {
      setShowConfetti(false);
    }
  }, [visible, tier, triggerHaptics]);

  const medalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!achievement) {
    return null;
  }

  const confettiColors = tier === 'platinum'
    ? ['#FFFFFF', '#B8E0FF', '#E0F4FF', '#87CEEB', '#ADD8E6']
    : ['#FFD700', '#FFC125', '#DAA520', '#FFFFFF', '#FFF8DC'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.container, containerAnimatedStyle]}>
        <BlurView intensity={80} style={StyleSheet.absoluteFill} tint="dark" />
        
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={styles.content}>
          <View style={[styles.glow, { backgroundColor: tierConfig.colors.primary }]} />

          <Animated.View style={[styles.medalContainer, medalAnimatedStyle]}>
            <AchievementMedal
              tier={tier}
              icon={achievement.icon}
              size="large"
            />
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(300).duration(400)}
            style={styles.tierBadge}
          >
            <LinearGradient
              colors={tierConfig.colors.gradient as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierBadgeGradient}
            >
              <Text style={styles.tierText}>{tierConfig.label.toUpperCase()}</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.Text
            entering={FadeIn.delay(400).duration(400)}
            style={styles.achievementName}
          >
            {achievement.name}
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(500).duration(400)}
            style={styles.achievementDescription}
          >
            {achievement.description}
          </Animated.Text>

          <Animated.View
            entering={FadeIn.delay(600).duration(400)}
            style={styles.pointsContainer}
          >
            <Text style={styles.pointsLabel}>Points Earned</Text>
            <Text style={[styles.pointsValue, { color: tierConfig.colors.primary }]}>
              +{tierConfig.points}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(800).duration(400)}>
            <Pressable
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
            >
              <Text style={styles.closeButtonText}>Awesome!</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* Confetti overlay */}
        {(tier === 'gold' || tier === 'platinum') && (
          <ConfettiExplosion
            colors={confettiColors}
            count={tier === 'platinum' ? 150 : 100}
            trigger={showConfetti}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.3,
    top: -40,
  },
  medalContainer: {
    marginBottom: 24,
  },
  tierBadge: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  tierBadgeGradient: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  achievementName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  achievementDescription: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  pointsContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  pointsLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  pointsValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  closeButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
});

export default AchievementCelebration;