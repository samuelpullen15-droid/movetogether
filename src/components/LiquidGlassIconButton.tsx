import React from 'react';
import { Platform, requireNativeComponent, View, Pressable, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColors } from '@/lib/useThemeColors';

interface LiquidGlassIconButtonProps {
  onPress: () => void;
  iconName: string; // SF Symbol name (e.g., 'message', 'square.and.arrow.up', 'ellipsis')
  size?: number;
  iconSize?: number;
  padding?: number; // Inner padding (increases button size while keeping icon size)
  children?: React.ReactNode; // For badges or overlays
  icon?: React.ReactNode; // Lucide icon for Android/Web fallback
  style?: ViewStyle;
}

// Native component interface for iOS
interface NativeLiquidGlassIconButtonProps {
  onButtonPress: () => void;
  iconName: string;
  size: number;
  iconSize: number;
  style?: ViewStyle;
}

// Safely try to load the native component
// React Native strips "Manager" from the module name, so LiquidGlassIconButtonManager becomes LiquidGlassIconButton
let NativeLiquidGlassIconButton: any = null;
if (Platform.OS === 'ios') {
  try {
    NativeLiquidGlassIconButton = requireNativeComponent<NativeLiquidGlassIconButtonProps>('LiquidGlassIconButton');
  } catch (e) {
    // Native component not available yet - will use BlurView fallback
    console.log('LiquidGlassIconButton: Native component not available, using fallback');
  }
}

/**
 * Liquid Glass Icon Button
 *
 * Uses native SwiftUI .glass button style on iOS 26+,
 * .bordered with material on iOS 17-25,
 * and BlurView fallback on Android/Web and older iOS
 *
 * @param iconName - SF Symbol name (iOS) - must be a valid SF Symbol
 * @param icon - Lucide icon component for Android/Web fallback
 * @param size - Button size (default: 40)
 * @param iconSize - Icon size (default: 18)
 * @param padding - Inner padding to increase button size while keeping icon size (default: 0)
 * @param onPress - Press handler
 * @param children - Optional badges or overlays (positioned absolutely over the button)
 */
export function LiquidGlassIconButton({
  onPress,
  iconName,
  icon,
  size = 40,
  iconSize = 18,
  padding = 0,
  children,
  style,
}: LiquidGlassIconButtonProps) {
  const colors = useThemeColors();

  // Calculate actual button size with padding
  const buttonSize = size + (padding * 2);

  // iOS native implementation
  if (Platform.OS === 'ios' && NativeLiquidGlassIconButton) {
    return (
      <View style={[{ width: buttonSize, height: buttonSize }, style]}>
        <NativeLiquidGlassIconButton
          onButtonPress={onPress}
          iconName={iconName}
          size={buttonSize}
          iconSize={iconSize}
          style={{ width: buttonSize, height: buttonSize }}
        />
        {children}
      </View>
    );
  }

  // Android/Web fallback with BlurView
  return (
    <Pressable
      onPress={onPress}
      style={[{ width: buttonSize, height: buttonSize }, style]}
      className="overflow-hidden rounded-full"
    >
      <BlurView
        intensity={colors.isDark ? 30 : 80}
        tint={colors.isDark ? 'dark' : 'light'}
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          overflow: 'hidden',
          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon || <View style={{ width: iconSize, height: iconSize }} />}
        {children}
      </BlurView>
    </Pressable>
  );
}
