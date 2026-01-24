import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, TextProps } from 'react-native';
import { useColorScheme } from 'react-native';

interface AnimatedTextProps extends TextProps {
  lightColor?: string;
  darkColor?: string;
  duration?: number;
}

/**
 * Text component that smoothly animates color changes when switching between light and dark mode
 */
export function AnimatedText({
  lightColor = '#000000',
  darkColor = '#FFFFFF',
  duration = 150,
  style,
  ...props
}: AnimatedTextProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Initialize with current color scheme to prevent flash
  const animatedColor = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  const previousSchemeRef = useRef(isDark);

  useEffect(() => {
    // Only animate if the scheme actually changed
    if (previousSchemeRef.current !== isDark) {
      previousSchemeRef.current = isDark;

      Animated.timing(animatedColor, {
        toValue: isDark ? 1 : 0,
        duration,
        useNativeDriver: false,
      }).start();
    }
  }, [isDark, duration, animatedColor]);

  const interpolatedColor = useMemo(() => {
    return animatedColor.interpolate({
      inputRange: [0, 1],
      outputRange: [lightColor, darkColor],
    });
  }, [animatedColor, lightColor, darkColor]);

  const flattenedStyle = style ? (Array.isArray(style) ? Object.assign({}, ...style) : style) : {};

  return (
    <Animated.Text
      {...props}
      style={[
        flattenedStyle,
        { color: interpolatedColor },
      ]}
    />
  );
}
