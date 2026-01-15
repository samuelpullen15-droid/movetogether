import React from 'react';
import { View, Platform, requireNativeComponent, ViewStyle, Text } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

// Native iOS component using Apple's HKActivityRingView from HealthKitUI
// See: https://developer.apple.com/documentation/HealthKitUI/HKActivityRingView
interface NativeActivityRingProps {
  style?: ViewStyle;
  moveProgress: number;
  moveGoal: number;
  exerciseProgress: number;
  exerciseGoal: number;
  standProgress: number;
  standGoal: number;
}

// Native iOS component - requires rebuild after adding Swift files to Xcode project
// Must add ActivityRingViewManager.swift and .m files to Xcode target
const NativeActivityRingView = Platform.OS === 'ios'
  ? requireNativeComponent<NativeActivityRingProps>('ActivityRingView')
  : null;

// Apple Fitness ring colors for Android fallback
const RING_COLORS = {
  move: {
    primary: '#FA114F',
    secondary: '#FF6B5A',
    background: 'rgba(250, 17, 79, 0.3)',
  },
  exercise: {
    primary: '#92E82A',
    secondary: '#B8FF4A',
    background: 'rgba(146, 232, 42, 0.3)',
  },
  stand: {
    primary: '#00D4FF',
    secondary: '#00F5FF',
    background: 'rgba(0, 212, 255, 0.3)',
  },
};

interface TripleRingProps {
  size: number;
  moveProgress: number;      // ratio (e.g., 0.5 = 50%)
  exerciseProgress: number;  // ratio
  standProgress: number;     // ratio
  moveGoal?: number;         // actual goal in calories
  exerciseGoal?: number;     // actual goal in minutes
  standGoal?: number;        // actual goal in hours
  showPercentage?: boolean;  // show average percentage in center
}

/**
 * Triple Activity Rings Component
 * 
 * On iOS: Uses Apple's native HKActivityRingView for authentic Apple Fitness rings
 * On Android: Falls back to SVG-based rings that match Apple's design
 */
export function TripleActivityRings({
  size,
  moveProgress,
  exerciseProgress,
  standProgress,
  moveGoal = 500,
  exerciseGoal = 30,
  standGoal = 12,
  showPercentage = false,
}: TripleRingProps) {
  // Validate and clamp progress values to prevent NaN/Infinity
  const safeMoveProgress = isNaN(moveProgress) || !isFinite(moveProgress) ? 0 : Math.max(0, moveProgress);
  const safeExerciseProgress = isNaN(exerciseProgress) || !isFinite(exerciseProgress) ? 0 : Math.max(0, exerciseProgress);
  const safeStandProgress = isNaN(standProgress) || !isFinite(standProgress) ? 0 : Math.max(0, standProgress);

  // Validate goals to prevent division by zero
  const safeMoveGoal = moveGoal > 0 ? moveGoal : 500;
  const safeExerciseGoal = exerciseGoal > 0 ? exerciseGoal : 30;
  const safeStandGoal = standGoal > 0 ? standGoal : 12;

  // Convert progress ratios to actual values for the native component
  const moveValue = safeMoveProgress * safeMoveGoal;
  const exerciseValue = safeExerciseProgress * safeExerciseGoal;
  const standValue = safeStandProgress * safeStandGoal;

  // Calculate average percentage for center display
  const avgProgress = Math.round(((safeMoveProgress + safeExerciseProgress + safeStandProgress) / 3) * 100);
  
  // Calculate font size based on ring size
  const percentageFontSize = size * 0.15;
  const labelFontSize = size * 0.06;

  // Percentage overlay component
  const PercentageOverlay = () => (
    <View 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        alignItems: 'center', 
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Text style={{ 
        color: 'white', 
        fontSize: percentageFontSize, 
        fontWeight: 'bold',
        textAlign: 'center',
      }}>
        {avgProgress}%
      </Text>
      <Text style={{ 
        color: 'rgba(255,255,255,0.6)', 
        fontSize: labelFontSize,
        fontWeight: '500',
        marginTop: 2,
      }}>
        AVG
      </Text>
    </View>
  );

  // Use native iOS HKActivityRingView (required on iOS)
  if (Platform.OS === 'ios') {
    if (!NativeActivityRingView) {
      // This should not happen - native module must be compiled
      console.error('[ActivityRing] Native HKActivityRingView not available. Did you add ActivityRingViewManager.swift to Xcode project?');
      return (
        <View style={{ width: size, height: size, backgroundColor: 'rgba(255,0,0,0.3)', borderRadius: size/2, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ padding: 8 }}>
            {/* Error indicator - native module not loaded */}
          </View>
        </View>
      );
    }
    
    return (
      <View style={{ width: size, height: size }}>
        <NativeActivityRingView
          style={{ width: size, height: size }}
          moveProgress={moveValue}
          moveGoal={safeMoveGoal}
          exerciseProgress={exerciseValue}
          exerciseGoal={safeExerciseGoal}
          standProgress={standValue}
          standGoal={safeStandGoal}
        />
        {showPercentage && <PercentageOverlay />}
      </View>
    );
  }

  // Android only - uses SVG rings
  return (
    <View style={{ width: size, height: size }}>
      <SVGActivityRings 
        size={size}
        moveProgress={safeMoveProgress}
        exerciseProgress={safeExerciseProgress}
        standProgress={safeStandProgress}
      />
      {showPercentage && <PercentageOverlay />}
    </View>
  );
}

// SVG fallback for Android
function SVGActivityRings({
  size,
  moveProgress,
  exerciseProgress,
  standProgress,
}: {
  size: number;
  moveProgress: number;
  exerciseProgress: number;
  standProgress: number;
}) {
  // Ring dimensions - Apple-style proportions
  const strokeWidth = size * 0.12;
  const gap = size * 0.02;
  const center = size / 2;
  
  // Calculate radii for each ring (outer to inner: Move, Exercise, Stand)
  const moveRadius = (size - strokeWidth) / 2;
  const exerciseRadius = moveRadius - strokeWidth - gap;
  const standRadius = exerciseRadius - strokeWidth - gap;

  // Calculate circumferences
  const moveCircumference = 2 * Math.PI * moveRadius;
  const exerciseCircumference = 2 * Math.PI * exerciseRadius;
  const standCircumference = 2 * Math.PI * standRadius;

  // Calculate stroke dash offsets
  const moveOffset = moveCircumference * (1 - Math.min(moveProgress, 1));
  const exerciseOffset = exerciseCircumference * (1 - Math.min(exerciseProgress, 1));
  const standOffset = standCircumference * (1 - Math.min(standProgress, 1));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="moveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={RING_COLORS.move.primary} />
            <Stop offset="100%" stopColor={RING_COLORS.move.secondary} />
          </LinearGradient>
          <LinearGradient id="exerciseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={RING_COLORS.exercise.primary} />
            <Stop offset="100%" stopColor={RING_COLORS.exercise.secondary} />
          </LinearGradient>
          <LinearGradient id="standGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={RING_COLORS.stand.primary} />
            <Stop offset="100%" stopColor={RING_COLORS.stand.secondary} />
          </LinearGradient>
        </Defs>

        {/* Move Ring (outer) */}
        <Circle cx={center} cy={center} r={moveRadius} stroke={RING_COLORS.move.background} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={center} cy={center} r={moveRadius} stroke="url(#moveGradient)" strokeWidth={strokeWidth} fill="none" strokeDasharray={moveCircumference} strokeDashoffset={moveOffset} strokeLinecap="round" transform={`rotate(-90 ${center} ${center})`} />

        {/* Exercise Ring (middle) */}
        <Circle cx={center} cy={center} r={exerciseRadius} stroke={RING_COLORS.exercise.background} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={center} cy={center} r={exerciseRadius} stroke="url(#exerciseGradient)" strokeWidth={strokeWidth} fill="none" strokeDasharray={exerciseCircumference} strokeDashoffset={exerciseOffset} strokeLinecap="round" transform={`rotate(-90 ${center} ${center})`} />

        {/* Stand Ring (inner) */}
        <Circle cx={center} cy={center} r={standRadius} stroke={RING_COLORS.stand.background} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={center} cy={center} r={standRadius} stroke="url(#standGradient)" strokeWidth={strokeWidth} fill="none" strokeDasharray={standCircumference} strokeDashoffset={standOffset} strokeLinecap="round" transform={`rotate(-90 ${center} ${center})`} />
      </Svg>
    </View>
  );
}

// Single ring component - keeping for backwards compatibility
interface ActivityRingProps {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  backgroundColor?: string;
  delay?: number;
}

export function ActivityRing({
  size,
  strokeWidth,
  progress,
  color,
  backgroundColor = 'rgba(255,255,255,0.1)',
}: ActivityRingProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
    </View>
  );
}
