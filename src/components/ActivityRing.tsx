import React from 'react';
import { View, Platform, requireNativeComponent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Import the native component (iOS only)
// Temporarily disabled - native module not registered in development
// TODO: Register ActivityRingViewManager native module
const NativeActivityRingView = null;

interface TripleRingProps {
  size: number;
  moveProgress: number;      // ratio (e.g., 0.5 = 50%)
  exerciseProgress: number;  // ratio
  standProgress: number;     // ratio
  moveGoal?: number;         // actual goal in calories
  exerciseGoal?: number;     // actual goal in minutes
  standGoal?: number;        // actual goal in hours
}

export function TripleActivityRings({
  size,
  moveProgress,
  exerciseProgress,
  standProgress,
  moveGoal = 500,
  exerciseGoal = 30,
  standGoal = 12,
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

  if (Platform.OS === 'ios' && NativeActivityRingView) {
    return (
      // @ts-ignore - native component props
      <NativeActivityRingView
        style={{ width: size, height: size }}
        moveProgress={moveValue}
        moveGoal={safeMoveGoal}
        exerciseProgress={exerciseValue}
        exerciseGoal={safeExerciseGoal}
        standProgress={standValue}
        standGoal={safeStandGoal}
      />
    );
  }

  // Fallback for Android or if native component not available
  return (
    <View 
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: size / 2,
      }} 
    />
  );
}

// Single ring component - keeping for backwards compatibility
// This still uses JS implementation since HKActivityRingView only does triple rings
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
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
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
