import React, { useEffect, useRef, ReactNode } from 'react';
import { Animated, useColorScheme } from 'react-native';

interface ThemeTransitionProps {
  children: ReactNode;
}

/**
 * Wrapper component that adds a smooth fade transition when theme changes
 * This prevents the jarring text color flash when switching between light/dark mode
 */
export function ThemeTransition({ children }: ThemeTransitionProps) {
  const colorScheme = useColorScheme();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousScheme = useRef(colorScheme);

  useEffect(() => {
    // Only animate if scheme actually changed
    if (previousScheme.current !== colorScheme) {
      previousScheme.current = colorScheme;

      // Quick fade out and in
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 75,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 75,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [colorScheme, fadeAnim]);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      {children}
    </Animated.View>
  );
}
