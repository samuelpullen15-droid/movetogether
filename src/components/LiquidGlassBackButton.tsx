import { Platform, Pressable, View, requireNativeComponent } from 'react-native';
import { BlurView } from 'expo-blur';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';

interface LiquidGlassBackButtonProps {
  onPress: () => void;
  size?: number;
  iconSize?: number;
}

// Native component for iOS (true liquid glass effect)
const NativeLiquidGlassButton = Platform.OS === 'ios'
  ? requireNativeComponent<{
      onButtonPress: () => void;
      size: number;
      iconSize: number;
      style?: any;
    }>('LiquidGlassButton')
  : null;

/**
 * Liquid glass back button
 * - iOS: Uses native SwiftUI .glass button style
 * - Android/Web: Uses BlurView for frosted glass effect
 */
export function LiquidGlassBackButton({
  onPress,
  size = 40,
  iconSize = 24
}: LiquidGlassBackButtonProps) {
  // Use native implementation on iOS for true liquid glass effect
  if (Platform.OS === 'ios' && NativeLiquidGlassButton) {
    return (
      <NativeLiquidGlassButton
        onButtonPress={onPress}
        size={size}
        iconSize={iconSize}
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback to BlurView on Android/Web
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
      }}
    >
      <BlurView
        intensity={colors.isDark ? 40 : 30}
        tint={colors.isDark ? 'dark' : 'light'}
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.6)' : 'rgba(245, 245, 247, 0.8)',
          borderWidth: 1,
          borderColor: colors.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
        }}
      >
        <ChevronLeft size={iconSize} color={colors.text} strokeWidth={2} />
      </BlurView>
    </Pressable>
  );
}
