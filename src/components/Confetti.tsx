import React, { useEffect, useMemo } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#EAB308', // Yellow/Gold
  '#22C55E', // Green
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#F97316', // Orange
  '#A855F7', // Purple
  '#EF4444', // Red
  '#06B6D4', // Cyan
];

interface ConfettiPieceProps {
  index: number;
  delay: number;
}

function ConfettiPiece({ index, delay }: ConfettiPieceProps) {
  const progress = useSharedValue(0);

  // Random properties for this piece
  const startX = useMemo(() => Math.random() * SCREEN_WIDTH, []);
  const endXOffset = useMemo(() => (Math.random() - 0.5) * 200, []);
  const size = useMemo(() => 8 + Math.random() * 8, []);
  const color = useMemo(() => CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)], []);
  const rotationSpeed = useMemo(() => 360 + Math.random() * 720, []);
  const duration = useMemo(() => 3000 + Math.random() * 2000, []);
  const isSquare = useMemo(() => Math.random() > 0.5, []);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [-50, SCREEN_HEIGHT + 100]);
    const translateX = interpolate(progress.value, [0, 0.5, 1], [startX, startX + endXOffset, startX + endXOffset * 0.5]);
    const rotate = interpolate(progress.value, [0, 1], [0, rotationSpeed]);
    const scale = interpolate(progress.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0.5]);
    const opacity = interpolate(progress.value, [0, 0.1, 0.8, 1], [0, 1, 1, 0]);

    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${rotate}deg` },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: isSquare ? size : size * 0.6,
          backgroundColor: color,
          borderRadius: isSquare ? 2 : size / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

interface ConfettiProps {
  count?: number;
  duration?: number;
}

export function Confetti({ count = 50 }: ConfettiProps) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      delay: Math.random() * 2000, // Stagger the start times
    }));
  }, [count]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.id} index={piece.id} delay={piece.delay} />
      ))}
    </View>
  );
}

export default Confetti;
