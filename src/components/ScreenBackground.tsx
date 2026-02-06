import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/lib/useThemeColors';

interface ScreenBackgroundProps {
  /** Accent color for the atmospheric tint (will be applied at ~6% opacity) */
  accent?: string;
}

/**
 * Absolutely-positioned atmospheric gradient that sits behind screen content.
 * Adds a subtle radial-like color wash from the top to create visual warmth.
 */
export function ScreenBackground({ accent = '#FA114F' }: ScreenBackgroundProps) {
  const colors = useThemeColors();

  // Convert hex to rgba at low opacity for the atmospheric tint
  const tintColor = hexToRgba(accent, colors.isDark ? 0.06 : 0.04);

  return (
    <LinearGradient
      colors={[tintColor, 'transparent', 'transparent']}
      locations={[0, 0.4, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default ScreenBackground;
