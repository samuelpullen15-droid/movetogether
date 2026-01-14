import React from 'react';
import { requireNativeComponent, Platform, View, StyleSheet } from 'react-native';

// Import the native component (iOS only)
// Temporarily disabled - native module not registered in development
// TODO: Register ActivityRingViewManager native module
const NativeActivityRingView = null;

interface ActivityRingViewProps {
  style?: any;
  moveProgress: number;
  moveGoal: number;
  exerciseProgress: number;
  exerciseGoal: number;
  standProgress: number;
  standGoal: number;
}

export function ActivityRingView({
  style,
  moveProgress,
  moveGoal,
  exerciseProgress,
  exerciseGoal,
  standProgress,
  standGoal,
}: ActivityRingViewProps) {
  if (Platform.OS !== 'ios' || !NativeActivityRingView) {
    // Fallback for Android or if native component not available
    return <View style={[styles.placeholder, style]} />;
  }

  return (
    <NativeActivityRingView
      style={style}
      moveProgress={moveProgress}
      moveGoal={moveGoal}
      exerciseProgress={exerciseProgress}
      exerciseGoal={exerciseGoal}
      standProgress={standProgress}
      standGoal={standGoal}
    />
  );
}

// Triple ring wrapper that matches our existing API
interface TripleRingProps {
  size: number;
  moveProgress: number;
  exerciseProgress: number;
  standProgress: number;
  moveGoal?: number;
  exerciseGoal?: number;
  standGoal?: number;
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
  // Convert progress ratios to actual values
  const moveValue = moveProgress * moveGoal;
  const exerciseValue = exerciseProgress * exerciseGoal;
  const standValue = standProgress * standGoal;

  return (
    <ActivityRingView
      style={{ width: size, height: size }}
      moveProgress={moveValue}
      moveGoal={moveGoal}
      exerciseProgress={exerciseValue}
      exerciseGoal={exerciseGoal}
      standProgress={standValue}
      standGoal={standGoal}
    />
  );
}

// Also export a version that takes raw values (not ratios)
export function NativeActivityRings({
  size,
  moveCalories,
  moveGoal,
  exerciseMinutes,
  exerciseGoal,
  standHours,
  standGoal,
}: {
  size: number;
  moveCalories: number;
  moveGoal: number;
  exerciseMinutes: number;
  exerciseGoal: number;
  standHours: number;
  standGoal: number;
}) {
  return (
    <ActivityRingView
      style={{ width: size, height: size }}
      moveProgress={moveCalories}
      moveGoal={moveGoal}
      exerciseProgress={exerciseMinutes}
      exerciseGoal={exerciseGoal}
      standProgress={standHours}
      standGoal={standGoal}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
  },
});

// Keep the old export for backwards compatibility
export { ActivityRingView as ActivityRing };
