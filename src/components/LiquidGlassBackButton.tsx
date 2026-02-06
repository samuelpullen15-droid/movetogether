import { Platform, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import { LiquidGlassIconButton } from './LiquidGlassIconButton';

interface LiquidGlassBackButtonProps {
  onPress: () => void;
  size?: number;
  iconSize?: number;
}

/**
 * Liquid glass back button
 * - iOS: Uses LiquidGlassIconButton with chevron.left SF Symbol
 * - Android/Web: Uses BlurView for frosted glass effect
 */
export function LiquidGlassBackButton({
  onPress,
  size = 30,
  iconSize = 20
}: LiquidGlassBackButtonProps) {
  const colors = useThemeColors();

  // On iOS, delegate to LiquidGlassIconButton so both render identically
  if (Platform.OS === 'ios') {
    return (
      <LiquidGlassIconButton
        onPress={onPress}
        iconName="chevron.left"
        icon={<ChevronLeft size={iconSize} color={colors.text} strokeWidth={2} />}
        size={size}
        iconSize={iconSize}
      />
    );
  }

  // Fallback to BlurView on Android/Web
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
