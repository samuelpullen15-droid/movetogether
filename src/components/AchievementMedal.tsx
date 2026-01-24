// AchievementMedal.tsx - 3D-style medal component with tier variants

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { AchievementTier, TIER_CONFIG } from '@/lib/achievements-types';
import { useThemeColors } from '@/lib/useThemeColors';

interface AchievementMedalProps {
  tier: AchievementTier | null;
  icon: string;
  size?: 'small' | 'medium' | 'large';
  locked?: boolean;
  onPress?: () => void;
  colors?: ReturnType<typeof useThemeColors>;
}

const SIZES = {
  small: { medal: 48, icon: 20, ring: 4 },
  medium: { medal: 80, icon: 32, ring: 6 },
  large: { medal: 120, icon: 48, ring: 8 },
};

const getIconComponent = (iconName: string, size: number, color: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    trophy: <Ionicons name="trophy" size={size} color={color} />,
    flame: <Ionicons name="flame" size={size} color={color} />,
    swords: <MaterialCommunityIcons name="sword-cross" size={size} color={color} />,
    'trending-up': <Feather name="trending-up" size={size} color={color} />,
    camera: <Ionicons name="camera" size={size} color={color} />,
    crown: <MaterialCommunityIcons name="crown" size={size} color={color} />,
    'calendar-check': <MaterialCommunityIcons name="calendar-check" size={size} color={color} />,
    sunrise: <Feather name="sunrise" size={size} color={color} />,
    moon: <Ionicons name="moon" size={size} color={color} />,
    calendar: <Ionicons name="calendar" size={size} color={color} />,
    footprints: <MaterialCommunityIcons name="shoe-print" size={size} color={color} />,
    clock: <Ionicons name="time" size={size} color={color} />,
    zap: <Ionicons name="flash" size={size} color={color} />,
    users: <Ionicons name="people" size={size} color={color} />,
    'plus-circle': <Feather name="plus-circle" size={size} color={color} />,
    send: <Ionicons name="send" size={size} color={color} />,
  };
  return iconMap[iconName] || <Ionicons name="ribbon" size={size} color={color} />;
};

export function AchievementMedal({
  tier,
  icon,
  size = 'medium',
  locked = false,
  onPress,
  colors: propColors,
}: AchievementMedalProps) {
  const defaultColors = useThemeColors();
  const themeColors = propColors || defaultColors;
  const dimensions = SIZES[size];
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // Locked colors adapt to theme
  const lockedColors = themeColors.isDark
    ? {
        primary: '#3A3A3C',
        secondary: '#2C2C2E',
        accent: '#48484A',
        gradient: ['#3A3A3C', '#2C2C2E', '#1C1C1E'],
      }
    : {
        primary: '#C7C7CC',
        secondary: '#D1D1D6',
        accent: '#AEAEB2',
        gradient: ['#D1D1D6', '#E5E5EA', '#F2F2F7'],
      };

  const medalColors = tier && !locked
    ? TIER_CONFIG[tier].colors
    : lockedColors;

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1.05);
    })
    .onUpdate((event) => {
      rotateY.value = interpolate(event.translationX, [-100, 100], [-15, 15]);
      rotateX.value = interpolate(event.translationY, [-100, 100], [15, -15]);
    })
    .onEnd(() => {
      rotateX.value = withSpring(0);
      rotateY.value = withSpring(0);
      scale.value = withSpring(1);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  });

  const combinedGesture = Gesture.Simultaneous(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const isPlatinum = tier === 'platinum' && !locked;

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View
          style={[
            styles.outerRing,
            {
              width: dimensions.medal,
              height: dimensions.medal,
              borderRadius: dimensions.medal / 2,
              borderWidth: dimensions.ring,
              borderColor: medalColors.accent,
            },
          ]}
        >
          <LinearGradient
            colors={medalColors.gradient as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.medalBody,
              {
                width: dimensions.medal - dimensions.ring * 2,
                height: dimensions.medal - dimensions.ring * 2,
                borderRadius: (dimensions.medal - dimensions.ring * 2) / 2,
              },
            ]}
          >
            <View
              style={[
                styles.innerRing,
                {
                  width: dimensions.medal - dimensions.ring * 4,
                  height: dimensions.medal - dimensions.ring * 4,
                  borderRadius: (dimensions.medal - dimensions.ring * 4) / 2,
                  borderColor: medalColors.secondary,
                },
              ]}
            >
              <View style={styles.iconContainer}>
                {getIconComponent(icon, dimensions.icon, locked ? (themeColors.isDark ? '#636366' : '#8E8E93') : '#FFFFFF')}
              </View>
            </View>

            {locked && (
              <View style={[StyleSheet.absoluteFill, styles.lockedOverlay, { backgroundColor: themeColors.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)' }]}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={themeColors.isDark ? 'dark' : 'light'} />
                <Ionicons name="lock-closed" size={dimensions.icon * 0.6} color={themeColors.isDark ? '#8E8E93' : '#636366'} />
              </View>
            )}

            {isPlatinum && (
              <Animated.View style={[StyleSheet.absoluteFill, styles.shimmerOverlay]}>
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.3)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}
          </LinearGradient>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  medalBody: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  innerRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  shimmerOverlay: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});

export default AchievementMedal;